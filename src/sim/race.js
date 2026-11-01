// A race's rules: the start line, places, the finish order, cup points, plausible finish times, stars. Pure.

import { cap, par } from './streams.js';

export const SEATS = 6;
export const SLOT_GAP = 2.4;
/** Seconds the others get after the first boat finishes. */
export const FINISH_WINDOW = 30;
export const CUP_POINTS = [10, 7, 5, 3, 2, 1];
/** The fastest a boat can plausibly go over a whole race (m/s): top speed with surge, slipstream and rapids. */
export const MAX_AVG = 10.5;
export const RHYTHM_STAR = 0.85;

/** Where seat `i` starts: just behind the start line, six abreast. */
export function startSlot(course, i, seats = SEATS) {
  const s = course.start - 4;
  const hw = course.at(s).hw;
  const gap = Math.min(SLOT_GAP, (2 * hw - 3) / Math.max(1, seats - 1));
  const d = (i - (seats - 1) / 2) * gap;
  return { s, d: Math.max(-hw + 1.6, Math.min(hw - 1.6, d)) };
}

/**
 * Places, best first. boats: [{ id, s, ft (finish song time or null), left }]. Finishers by time, then the rest by
 * distance; boats that left go last.
 */
export function order(boats) {
  return [...boats].sort((a, b) => {
    const la = a.left ? 1 : 0;
    const lb = b.left ? 1 : 0;
    if (la !== lb) return la - lb;
    const fa = Number.isFinite(a.ft) && a.ft !== null;
    const fb = Number.isFinite(b.ft) && b.ft !== null;
    if (fa && fb) return a.ft - b.ft;
    if (fa !== fb) return fa ? -1 : 1;
    return (b.s ?? 0) - (a.s ?? 0);
  });
}

/** The finish order as groups (a dead heat to the millisecond shares a place). */
export function outcome(boats) {
  const sorted = order(boats);
  const groups = [];
  let prev = null;
  for (const b of sorted) {
    const key = Number.isFinite(b.ft) && b.ft !== null && !b.left ? Math.round(b.ft * 1000) : null;
    if (prev !== null && key !== null && key === prev) groups[groups.length - 1].push(b.id);
    else groups.push([b.id]);
    prev = key;
  }
  return groups;
}

/** Cup points for a finish order. */
export function points(groups) {
  const out = {};
  let place = 0;
  for (const g of groups) {
    for (const id of g) out[id] = CUP_POINTS[place] ?? 0;
    place += g.length;
  }
  return out;
}

/**
 * Is a reported finish believable? t: the race time it says (s), now: the race time on the host (s), s: the sender's last
 * distance along the river.
 */
export function plausibleFinish(stream, course, t, now, s) {
  if (!Number.isFinite(t) || t <= 0) return false;
  if (t < stream.length / MAX_AVG) return false;
  if (t > now + 0.5) return false;
  if (t < now - 20) return false;
  if (Number.isFinite(s) && s < course.finish - 25) return false;
  return true;
}

/** Is the race over? fin: finish times by id; racing: ids still taking part; t: race time. */
export function raceOver(stream, fin, racing, t) {
  const times = Object.values(fin).filter(Number.isFinite);
  if (t >= cap(stream)) return 'cap';
  if (times.length === 0) return null;
  if (racing.length > 0 && racing.every((id) => Number.isFinite(fin[id]))) return 'all';
  if (t >= Math.min(...times) + FINISH_WINDOW) return 'window';
  return null;
}

/** The three stars of a Dream run. */
export function stars({ finished, place, rhythm }) {
  return [!!finished, !!finished && place === 1, !!finished && rhythm >= RHYTHM_STAR];
}

export { par, cap };

/** "1:04.3" */
export function clock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.0';
  // round to tenths first, so 9.97 reads 0:10.0 (not 0:010.0) and 59.97 reads 1:00.0
  const tenths = Math.round(seconds * 10);
  const m = Math.floor(tenths / 600);
  const s = (tenths - m * 600) / 10;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

export const ordinal = (n) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
};
