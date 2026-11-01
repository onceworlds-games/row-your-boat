// The song: "Row, Row, Row Your Boat" in 6/8 (two beats to a bar, sixteen to a verse), as a grid of beats in song seconds.
// Pure: every page builds the same grid from the stream's tempo.

/** Beats in a verse, beats rowed between breaths, beats in a breath, tempo step per breath and its cap. */
export const VERSE = 16;
export const ROW_BEATS = 48;
export const BREATH = 4;
export const TEMPO_STEP = 0.04;
export const TEMPO_STEPS = 3;
/** Count-in beats before beat 0 (the intro plays them). */
export const COUNT_IN = 4;
/** Gold beats (verse beats): the tune's long notes, "Row", "stream" and "dream". Both oars together there pull. */
export const GOLD_VB = [0, 6, 14];
/** The merrily bar (verse beats): its eighths between the beats come as droplets to tap. */
export const RUSH_VB = [8, 9, 10, 11];
/** Notes in a whole merrily rush: four beats and their eight droplets. */
export const RUSH_NOTES = 12;

/**
 * The melody of one verse: [eighth, length in eighths, semitones above the tonic]. A verse is 48 eighths; beat k is
 * eighths 3k to 3k+2.
 */
export const MELODY = [
  [0, 3, 0], [3, 3, 0], // Row, row,
  [6, 2, 0], [8, 1, 2], [9, 3, 4], // row your boat,
  [12, 2, 4], [14, 1, 2], [15, 2, 4], [17, 1, 5], // gent-ly down the
  [18, 6, 7], // stream.
  [24, 1, 12], [25, 1, 12], [26, 1, 12], [27, 1, 7], [28, 1, 7], [29, 1, 7], // Mer-ri-ly, mer-ri-ly,
  [30, 1, 4], [31, 1, 4], [32, 1, 4], [33, 1, 0], [34, 1, 0], [35, 1, 0], // mer-ri-ly, mer-ri-ly,
  [36, 2, 7], [38, 1, 5], [39, 2, 4], [41, 1, 2], // life is but a
  [42, 6, 0], // dream.
];

/** The melody's notes that start in verse beat `vb` (0-15): [offset in eighths from the beat, length, semitones]. */
export const BEAT_NOTES = Array.from({ length: VERSE }, (_, vb) =>
  MELODY.filter(([e]) => e >= vb * 3 && e < vb * 3 + 3).map(([e, len, semi]) => [e - vb * 3, len, semi]),
);

/**
 * The beat grid of a stream at `bpm` (dotted quarters a minute). Each beat: { i, t, dur, rest, row, vb, breath }:
 * `row` counts rowed beats before it (rests excluded), `vb` is its beat in the verse (0-15, -1 in a breath), `breath`
 * how many breaths came before it.
 */
export function makeSong(bpm, { seconds = 600 } = {}) {
  const base = 60 / Math.max(30, Math.min(240, bpm));
  const beats = [];
  let t = 0;
  let row = 0;
  let breaths = 0;
  let inRow = 0;
  while (t < seconds) {
    const dur = base / (1 + TEMPO_STEP * Math.min(TEMPO_STEPS, breaths));
    if (inRow < ROW_BEATS) {
      const vb = row % VERSE;
      beats.push({ i: beats.length, t, dur, rest: false, row, vb, breath: breaths, gold: GOLD_VB.includes(vb), rush: RUSH_VB.includes(vb) });
      row++;
      inRow++;
    } else {
      for (let k = 0; k < BREATH; k++) {
        beats.push({ i: beats.length, t, dur, rest: true, row, vb: -1, breath: breaths, k });
        t += dur;
      }
      breaths++;
      inRow = 0;
      continue;
    }
    t += dur;
  }
  const count = Array.from({ length: COUNT_IN }, (_, k) => -(COUNT_IN - k) * base);
  // The droplets: the second and third eighths of every merrily beat, in time order.
  const drops = [];
  for (const b of beats) {
    if (!b.rush) continue;
    for (const k of [1, 2]) drops.push({ n: drops.length, t: b.t + (b.dur * k) / 3, beat: b.i, vb: b.vb, k, verse: Math.floor(b.row / VERSE) });
  }

  /** The droplet nearest `time`, or null. */
  function nearestDrop(time) {
    let lo = 0;
    let hi = drops.length - 1;
    if (hi < 0) return null;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (drops[mid].t <= time) lo = mid;
      else hi = mid - 1;
    }
    const a = drops[lo];
    const b = drops[lo + 1];
    return b && Math.abs(b.t - time) < Math.abs(a.t - time) ? b : a;
  }

  /** Index of the last beat that starts at or before `time` (-1 before the first). */
  function indexAt(time) {
    let lo = 0;
    let hi = beats.length - 1;
    if (time < 0) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (beats[mid].t <= time) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** The rowed (not rest) beat nearest `time`, or null. */
  function nearestRow(time) {
    const i = Math.max(0, indexAt(time));
    let best = null;
    for (let k = Math.max(0, i - 2); k <= Math.min(beats.length - 1, i + 2); k++) {
      const b = beats[k];
      if (b.rest) continue;
      if (!best || Math.abs(b.t - time) < Math.abs(best.t - time)) best = b;
    }
    return best;
  }

  /** In a breath at `time`? */
  function resting(time) {
    const i = indexAt(time);
    return i >= 0 && beats[i].rest;
  }

  /** Beat phase at `time`: the beat it is in and how far through it (0-1). Before 0: the count-in. */
  function phase(time) {
    if (time < 0) {
      const p = (time / base) % 1;
      return { beat: null, f: p < 0 ? p + 1 : p, dur: base };
    }
    const i = indexAt(time);
    const b = beats[i];
    return { beat: b, f: Math.min(1, (time - b.t) / b.dur), dur: b.dur };
  }

  return { bpm, base, beats, drops, count, indexAt, nearestRow, nearestDrop, resting, phase };
}
