// Judging strokes against the beat, and the combo ("merrily": the four bow lanterns). Pure.

export const PERFECT = 0.045;
export const GOOD = 0.11;
/** Both oars within this many seconds are one straight stroke. */
export const CHORD = 0.05;
/** Strokes this long before the first beat are ignored (no false starts). */
export const EARLY = 0.25;
export const STEP = 4;
export const MAX_LEVEL = 4;

/** Thrust by quality. */
export const QUALITY = { perfect: 1, good: 0.8, splash: 0.3, free: 0.35 };

const levelOf = (streak) => Math.min(MAX_LEVEL, 1 + Math.floor(streak / STEP));

/**
 * A judge for one boat on `song`. `ease` widens both windows (1.3 on a player's first race). `offset` (seconds) is
 * subtracted from stroke times (the player's calibration).
 */
export function createJudge(song, { ease = 1, offset = 0 } = {}) {
  const perfect = PERFECT * ease;
  const good = GOOD * ease;
  const s = {
    streak: 0,
    level: 1,
    taken: -1, // index of the last beat stroked
    last: null, // { beat, side, t, kind }
    checked: 0, // next beat index to check for a miss
    perfect: 0,
    good: 0,
    splash: 0,
    miss: 0,
    extra: 0,
    run: 0, // perfects in a row
    bestRun: 0,
    bestLevel: 1,
    strokes: 0,
    stopped: false,
  };

  function down() {
    s.streak = s.level >= 2 ? (s.level - 2) * STEP : 0;
    s.level = levelOf(s.streak);
  }

  /** Beats whose window closed with no stroke, up to `t`: each a miss. */
  function advance(t) {
    const out = [];
    if (s.stopped) return out;
    const beats = song.beats;
    while (s.checked < beats.length && beats[s.checked].t + good < t - offset) {
      const b = beats[s.checked];
      if (!b.rest && b.i > s.taken) {
        s.miss++;
        s.run = 0;
        const before = s.level;
        down();
        out.push({ kind: 'miss', beat: b, level: s.level, before });
      }
      s.checked++;
    }
    return out;
  }

  /** A stroke on `side` (-1 left, 1 right) at song time `t`. Returns what it was. */
  function stroke(side, t) {
    const time = t - offset;
    if (s.stopped) return { kind: 'free', side, turn: side, q: QUALITY.free, level: s.level, delta: 0 };
    if (time < -EARLY) return { kind: 'early', side, turn: 0, q: 0, level: s.level, delta: time };
    const misses = advance(t);
    const b = song.nearestRow(Math.max(0, time));
    const delta = b ? time - b.t : Infinity;
    // In a breath, away from any rowed beat: a free stroke (steers, a little push, combo untouched).
    if (!b || (Math.abs(delta) > good && song.resting(time))) {
      s.strokes++;
      return { kind: 'free', side, turn: side, q: QUALITY.free, level: s.level, delta, misses };
    }
    // The other oar right after an accepted stroke on this beat: both oars together.
    if (b.i === s.taken && s.last && s.last.beat === b.i && s.last.side !== 0 && side !== s.last.side && Math.abs(time - s.last.t) <= CHORD) {
      s.last.side = 0;
      return { kind: 'both', side: 0, turn: side, q: 0, level: s.level, delta, beat: b, misses };
    }
    s.strokes++;
    const before = s.level;
    if (b.i !== s.taken && Math.abs(delta) <= good) {
      const kind = Math.abs(delta) <= perfect ? 'perfect' : 'good';
      s.taken = b.i;
      s.streak++;
      s.level = levelOf(s.streak);
      s.bestLevel = Math.max(s.bestLevel, s.level);
      if (kind === 'perfect') {
        s.perfect++;
        s.run++;
        s.bestRun = Math.max(s.bestRun, s.run);
      } else {
        s.good++;
        s.run = 0;
      }
      s.last = { beat: b.i, side, t: time, kind };
      return { kind, side, turn: side, q: QUALITY[kind], level: s.level, before, delta, beat: b, misses };
    }
    // A mistimed stroke: the combo goes. It uses up the beat it was meant for (so that beat is not also a miss);
    // a tap with no beat left to claim (mashing, a late tap after the miss) is an extra.
    if (b.i > s.taken && b.i >= s.checked) {
      s.taken = b.i;
      s.splash++;
    } else s.extra++;
    s.run = 0;
    s.streak = 0;
    s.level = 1;
    s.last = { beat: -1, side, t: time, kind: 'splash' };
    return { kind: 'splash', side, turn: side, q: QUALITY.splash, level: 1, before, delta, beat: b, misses };
  }

  /** A bump: one lantern out. */
  function bump() {
    const before = s.level;
    down();
    return { level: s.level, before };
  }

  /** Rowed beats judged so far (hit or missed). */
  function judged() {
    return s.perfect + s.good + s.miss + s.splash;
  }

  /** (perfects + half the goods) / judged beats, 0-1. */
  function rhythm() {
    const n = s.perfect + s.good + s.miss + s.splash;
    return n > 0 ? (s.perfect + 0.5 * s.good) / n : 0;
  }

  /** Restore the combo (a reloaded page, a new host taking a bot over). */
  function restore(level, streak) {
    s.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
    s.streak = Number.isFinite(streak) ? Math.max((s.level - 1) * STEP, Math.min(s.level * STEP - 1, Math.floor(streak))) : (s.level - 1) * STEP;
  }

  /** Skip judging up to `t` without misses (a page that arrives mid-race). */
  function skipTo(t) {
    const beats = song.beats;
    while (s.checked < beats.length && beats[s.checked].t + good < t - offset) {
      s.taken = Math.max(s.taken, beats[s.checked].i);
      s.checked++;
    }
  }

  return { state: s, stroke, advance, bump, judged, rhythm, restore, skipTo, windows: { perfect, good }, stop: () => (s.stopped = true) };
}
