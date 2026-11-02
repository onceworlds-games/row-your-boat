// The view of a race: what is drawn and heard. It is the race itself, except at the player's finish, when it slows down
// (the boats, the water, the song) and afterwards catches up a little faster than real time. Meanwhile the boats are
// drawn from a short record of the race. Pure.

import { wrap } from './sim/course.js';

/**
 * The finish in slow motion: the view runs at `rate` for the first `hold` of `win` seconds (a win; `place` otherwise),
 * eases back to real speed, then catches up with the race at up to 1 + catchMax. `record`: seconds of boats kept.
 */
export const SLOW = { rate: 0.22, hold: 0.6, win: 1.8, place: 0.9, catchK: 0.55, catchMax: 0.25, record: 4 };

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => (finite(a) && finite(b) ? a + (b - a) * k : a);
const smooth = (k) => {
  const u = clamp(k, 0, 1);
  return u * u * (3 - 2 * u);
};

/** Every boat as it was drawn at view time vt, between two recorded frames ([{ t, boats }], oldest first). */
export function replayAt(rec, vt) {
  if (!rec.length) return null;
  if (vt >= rec[rec.length - 1].t) return null;
  if (vt <= rec[0].t) return rec[0].boats;
  let i = rec.length - 2;
  while (i > 0 && rec[i].t > vt) i--;
  const a = rec[i];
  const b = rec[i + 1];
  const k = b.t > a.t ? clamp((vt - a.t) / (b.t - a.t), 0, 1) : 0;
  const later = new Map(b.boats.map((x) => [x.id, x]));
  return a.boats.map((p) => {
    const q = later.get(p.id);
    if (!q) return p;
    return { ...p, x: lerp(p.x, q.x, k), z: lerp(p.z, q.z, k), h: p.h + wrap(q.h - p.h) * k, s: lerp(p.s, q.s, k), d: lerp(p.d, q.d, k), v: lerp(p.v, q.v, k) };
  });
}

/**
 * One frame of the view. st (kept between frames): { rec, lag, slow: { at (ms), secs } | null }; set st.slow at the
 * finish. o: { perf (ms), dt (s), tv (the race's visual time), boats (as drawn now), paused }. Returns { rate, vt, boats }.
 */
export function stepView(st, { perf, dt, tv, boats, paused = false }) {
  const drawn = boats.map((b) => ({ ...b, hidden: !!b.hidden }));
  if (!Array.isArray(st.rec)) st.rec = [];
  if (!finite(st.lag)) st.lag = 0;
  const last = st.rec[st.rec.length - 1];
  // a jump back (a new race, a re-anchored clock): the record starts over
  if (last && tv < last.t - 0.5) st.rec.length = 0;
  st.rec.push({ t: tv, boats: drawn });
  while (st.rec.length > 2 && st.rec[1].t < tv - SLOW.record) st.rec.shift();
  let rate = 1;
  if (st.slow) {
    const u = (perf - st.slow.at) / 1000 / Math.max(0.05, st.slow.secs);
    if (!(u >= 0 && u < 1)) st.slow = null;
    else rate = u < SLOW.hold ? SLOW.rate : SLOW.rate + (1 - SLOW.rate) * smooth((u - SLOW.hold) / (1 - SLOW.hold));
  }
  if (!st.slow && st.lag > 0) rate = 1 + Math.min(SLOW.catchMax, st.lag * SLOW.catchK);
  if (paused) rate = 1;
  else st.lag = clamp(st.lag + Math.max(0, dt) * (1 - rate), 0, SLOW.record - 0.5);
  if (!st.slow && st.lag < 0.004) st.lag = 0;
  const vt = tv - st.lag;
  return { rate, vt, boats: st.lag > 0 ? replayAt(st.rec, vt) ?? drawn : drawn };
}
