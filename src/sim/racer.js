// One boat in a race: its physics, its judge and (for rowers the game plays) its brain, stepped to a song time. Pure.

import { createBoat, step, stroke, DT } from './boat.js';
import { createJudge } from './judge.js';

/** Continuous beat position at song time t (beats since beat 0, breaths included; negative in the count-in). */
export function beatPos(song, t) {
  if (t < 0) return t / song.base;
  const i = song.indexAt(t);
  const b = song.beats[i];
  return i + Math.min(1, (t - b.t) / b.dur);
}

/**
 * A racer. `brain` (bot.js) rows by itself; without one, `input(side, t)` rows. `others()` gives the other boats near it
 * ({ x, z, h }) for wakes and touches.
 */
export function createRacer({ course, song, ease = 1, offset = 0, s, d, h, brain = null, id = '' }) {
  const boat = createBoat(course, s, d, h);
  const judge = createJudge(song, { ease, offset });
  const queue = [];
  const plans = [];
  let simT = null;
  let planned = -1;
  let events = [];
  const racer = {
    id,
    boat,
    judge,
    brain,
    song,
    course,
    strokes: 0,
    last: null, // the last stroke's result
    get t() {
      return simT;
    },
  };

  function apply(res, t) {
    racer.strokes++;
    racer.last = res;
    stroke(boat, res);
    events.push({ type: 'stroke', res, t });
  }

  /** A player's stroke at song time t: judged now (for instant feedback), felt by the boat at its time. */
  racer.input = (side, t) => {
    const res = judge.stroke(side, t);
    for (const m of res.misses ?? []) events.push({ type: 'miss', res: m, t: m.beat.t });
    queue.push({ t, res });
    return res;
  };

  /** Step the boat to song time `t`. Returns what happened since the last call. */
  racer.update = (t, others = []) => {
    if (simT === null) simT = Math.min(t, 0);
    let guard = 0;
    while (simT + DT <= t + 1e-9 && guard++ < 120 * 30) {
      const tt = simT + DT;
      if (tt < 0) {
        // The count-in: boats wait at the start line.
        simT = tt;
        continue;
      }
      if (brain) {
        const beats = song.beats;
        while (planned + 1 < beats.length && beats[planned + 1].t - 0.3 <= tt) {
          planned++;
          const beat = beats[planned];
          const p = brain.plan(boat, beat, tt);
          if (p) plans.push(p);
        }
        for (let k = 0; k < plans.length; ) {
          const p = plans[k];
          if (p.t > tt) {
            k++;
            continue;
          }
          plans.splice(k, 1);
          if (p.side === 0) {
            apply(judge.stroke(-1, p.t), p.t);
            apply(judge.stroke(1, p.t + 0.012), p.t + 0.012);
          } else apply(judge.stroke(p.side, p.t), p.t);
        }
      }
      for (let k = 0; k < queue.length; ) {
        if (queue[k].t > tt) {
          k++;
          continue;
        }
        const q = queue.splice(k, 1)[0];
        apply(q.res, q.t);
      }
      for (const m of judge.advance(tt)) events.push({ type: 'miss', res: m, t: m.beat.t });
      const ph = song.phase(Math.max(0, tt));
      const env = { course, t: tt, beat: ph.dur, resting: song.resting(tt), B: beatPos(song, tt), others };
      const wasFinished = boat.finished;
      step(boat, DT, env, events);
      if (!wasFinished && boat.finished) judge.stop();
      simT = tt;
    }
    if (guard >= 120 * 30) simT = t; // a long jump (a hidden tab): don't spin forever
    const out = events;
    events = [];
    return out;
  };

  /** A compact state for the room (host:boats) or presence. */
  racer.snapshot = () => ({
    s: round(boat.s, 2), x: round(boat.x, 2), z: round(boat.z, 2), h: round(boat.h, 4), v: round(boat.v, 3),
    y: round(boat.yaw, 4), c: judge.state.level - 1, k: racer.strokes % 10000, ls: racer.last?.side ?? 0,
    lq: qualityCode(racer.last?.kind), f: boat.finished ? 1 : 0, ft: boat.ft === null ? 0 : round(boat.ft, 3),
  });

  /** Carry on from a snapshot taken at song time t (a new host, a reloaded page). */
  racer.restore = (snap, t) => {
    if (!snap) return;
    const num = (v, dflt) => (Number.isFinite(v) ? v : dflt);
    boat.x = num(snap.x, boat.x);
    boat.z = num(snap.z, boat.z);
    boat.h = num(snap.h, boat.h);
    boat.v = Math.max(0, Math.min(12, num(snap.v, 0)));
    boat.yaw = num(snap.y, 0);
    const loc = course.locate(boat.x, boat.z);
    boat.s = loc.s;
    boat.d = loc.d;
    boat.i = loc.i;
    boat.finished = snap.f === 1;
    boat.ft = boat.finished && Number.isFinite(snap.ft) ? snap.ft : null;
    racer.strokes = Math.max(0, Math.floor(num(snap.k, 0)));
    judge.restore(num(snap.c, 0) + 1);
    judge.skipTo(t);
    if (boat.finished) judge.stop();
    simT = t;
    planned = Math.max(planned, song.indexAt(t + 0.3));
  };

  return racer;
}

const round = (v, n) => {
  const m = 10 ** n;
  return Math.round(v * m) / m;
};
export const QUALITY_CODES = ['none', 'perfect', 'good', 'splash', 'both', 'free'];
export const qualityCode = (kind) => Math.max(0, QUALITY_CODES.indexOf(kind ?? 'none'));
