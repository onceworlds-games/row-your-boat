// Tonight's Dream: one stream a night with a twist, the same for everyone (the night number comes from the platform's
// clock). Pure.

import { STREAMS } from './streams.js';

export const DAY_MS = 86400000;
/** The night number of a platform time (ms): it turns over at midnight UTC. */
export const nightOf = (ms) => Math.floor(ms / DAY_MS);

export const TWISTS = ['mirror', 'swift', 'golden', 'blooming'];
export const TWIST_NAMES = { mirror: 'Mirrored', swift: 'Swift', golden: 'Golden night', blooming: 'In bloom' };
/** What each twist does, as a label for the card. */
export const TWIST_LINES = { mirror: 'Bends reversed', swift: 'Fast song', golden: 'Every beat gold', blooming: 'Double blooms' };
export const SWIFT = 1.12;

/**
 * Tonight's stream and twist. The streams come round in a fixed order (every stream once in eight nights) and the
 * twists shift each round, so a stream meets every twist in turn; never the same stream or twist two nights running.
 */
export function tonight(day) {
  const d = Math.floor(day);
  const n = 1 + (((d * 5) % STREAMS.length) + STREAMS.length) % STREAMS.length;
  const t = (((3 * d + 3 * Math.floor(d / STREAMS.length)) % TWISTS.length) + TWISTS.length) % TWISTS.length;
  return { day: d, n, twist: TWISTS[t] };
}

/** A stream's definition with a twist applied (a copy; the original stays as it is). */
export function twistDef(def, twist) {
  if (!twist) return def;
  const out = { ...def, twist };
  if (twist === 'mirror') {
    out.segs = def.segs.map((s) => (s.length === 2 ? [-s[0], s[1]] : [...s]));
    out.islands = def.islands.map((i) => ({ ...i, short: -i.short }));
    out.rapids = def.rapids.map(([a, b, side]) => [a, b, -side || 0]);
    out.whirls = def.whirls.map(([s, d]) => [s, -d]);
  }
  if (twist === 'swift') out.bpm = Math.round(def.bpm * SWIFT);
  if (twist === 'blooming') out.bloomGap = 13;
  if (twist === 'golden') out.golden = true;
  return out;
}
