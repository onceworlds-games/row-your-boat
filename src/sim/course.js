// A stream's river: the centreline sampled every metre, its width and current, islands and obstacles. Pure.
//
// Coordinates: the river plane is (x, z) (three.js's ground plane). Heading h: forward is (sin h, -cos h), right is
// (cos h, sin h), so a larger h turns right. Along the river: s (metres from the source), d (metres right of the centre).

import { rng } from './rng.js';

export const START = 14;
export const BEAM = 0.65;
export const DEG = Math.PI / 180;
export const CURRENT = 0.6;
export const POOL_CURRENT = 0.2;
export const RAPID_CURRENT = 2.2;
export const WAVE_EVERY = 7;
export const WHIRL_R = 5;

const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
export const wrap = (a) => {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x < -Math.PI) x += 2 * Math.PI;
  return x;
};

function lerpKeys(keys, s) {
  if (!keys || keys.length === 0) return 16;
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (s <= keys[i][0]) {
      const [s0, v0] = keys[i - 1];
      const [s1, v1] = keys[i];
      return v0 + (v1 - v0) * smooth(s0, s1, s);
    }
  }
  return keys[keys.length - 1][1];
}

/** Build the course of a stream definition (streams.js). */
export function buildCourse(def) {
  // ---- centreline: integrate the segments finely, keep a sample every metre
  const X = [0];
  const Z = [0];
  const H = [0];
  const K = [0];
  let x = 0;
  let z = 0;
  let h = 0;
  let along = 0;
  let next = 1;
  const sub = 0.05;
  for (const seg of def.segs) {
    const bend = seg.length === 2;
    const len = bend ? seg[1] * Math.abs(seg[0]) * DEG : seg[0];
    const kappa = bend ? Math.sign(seg[0]) / seg[1] : 0;
    for (let u = 0; u < len - 1e-9; u += sub) {
      const step = Math.min(sub, len - u);
      const px = x;
      const pz = z;
      const ph = h;
      const hm = h + kappa * step * 0.5;
      x += Math.sin(hm) * step;
      z -= Math.cos(hm) * step;
      h += kappa * step;
      along += step;
      // Every whole metre crossed by this step: a sample, in between the two ends.
      while (along >= next - 1e-9) {
        const f = 1 - (along - next) / step;
        X.push(px + (x - px) * f);
        Z.push(pz + (z - pz) * f);
        H.push(ph + (h - ph) * f);
        K.push(kappa);
        next++;
      }
    }
  }
  const N = X.length;
  const total = N - 1;
  const start = START;
  const finish = START + def.length;

  // ---- islands and widths
  const islands = (def.islands ?? []).map((is) => ({ ...is, sm: (is.s0 + is.s1) / 2, a: (is.s1 - is.s0) / 2, b: is.w / 2 }));
  const HW = new Float32Array(N);
  const BASE = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const base = lerpKeys(def.widths, i) / 2;
    let widen = 0;
    for (const is of islands) widen += (smooth(is.s0 - 24, is.s0 - 2, i) - smooth(is.s1 + 2, is.s1 + 24, i)) * is.b;
    BASE[i] = base;
    HW[i] = base + widen;
  }

  const zones = (def.rapids ?? []).map(([s0, s1, side]) => ({ s0, s1, side: side ?? 0 }));

  // ---- interpolation along the river
  function at(s) {
    const c = Math.max(0, Math.min(total, s));
    const i = Math.min(N - 2, Math.floor(c));
    const f = c - i;
    const hh = H[i] + wrap(H[i + 1] - H[i]) * f;
    return { x: X[i] + (X[i + 1] - X[i]) * f, z: Z[i] + (Z[i + 1] - Z[i]) * f, h: hh, hw: HW[i] + (HW[i + 1] - HW[i]) * f, base: BASE[i] + (BASE[i + 1] - BASE[i]) * f, k: K[i] };
  }
  function point(s, d) {
    const a = at(s);
    return { x: a.x + Math.cos(a.h) * d, z: a.z + Math.sin(a.h) * d, h: a.h };
  }
  /** (s, d) of a point, searching near sample `hint` (or everywhere without one). */
  function locate(px, pz, hint) {
    let best = 0;
    let bestD = Infinity;
    if (hint === undefined || hint === null || !Number.isFinite(hint)) {
      for (let i = 0; i < N; i += 3) {
        const dd = (X[i] - px) ** 2 + (Z[i] - pz) ** 2;
        if (dd < bestD) (bestD = dd), (best = i);
      }
      hint = best;
    }
    const h0 = Math.max(0, Math.min(N - 1, Math.round(hint)));
    bestD = Infinity;
    for (let i = Math.max(0, h0 - 10); i <= Math.min(N - 1, h0 + 10); i++) {
      const dd = (X[i] - px) ** 2 + (Z[i] - pz) ** 2;
      if (dd < bestD) (bestD = dd), (best = i);
    }
    const fx = Math.sin(H[best]);
    const fz = -Math.cos(H[best]);
    let s = best + (px - X[best]) * fx + (pz - Z[best]) * fz;
    s = Math.max(0, Math.min(total, s));
    const a = at(s);
    const d = (px - a.x) * Math.cos(a.h) + (pz - a.z) * Math.sin(a.h);
    return { s, d, h: a.h, hw: a.hw, i: Math.round(s) };
  }

  function rapidsAt(s, d) {
    for (const zn of zones) {
      if (s < zn.s0 - 4 || s > zn.s1 + 4) continue;
      if (zn.side !== 0 && Math.sign(d) !== zn.side) continue;
      return smooth(zn.s0 - 4, zn.s0 + 4, s) - smooth(zn.s1 - 4, zn.s1 + 4, s);
    }
    return 0;
  }
  function currentAt(s, d) {
    const r = rapidsAt(s, d);
    return CURRENT + (RAPID_CURRENT - CURRENT) * r;
  }

  /** The island ellipse at s, or null: { c: centre d, half: half its width there }. */
  function islandAt(s) {
    for (const is of islands) {
      if (s < is.s0 || s > is.s1) continue;
      const u = (s - is.sm) / is.a;
      return { c: 0, half: is.b * Math.sqrt(Math.max(0, 1 - u * u)), island: is };
    }
    return null;
  }

  // ---- obstacles
  const R = rng(`course:${def.id}`);
  const rocks = [];
  const logs = [];
  const pads = [];
  const whirls = (def.whirls ?? []).map(([s, d]) => ({ s, d, r: WHIRL_R, ...point(s, d) }));
  const pendulums = (def.pendulums ?? []).map((s) => ({ s, amp: Math.max(2, at(s).hw - 3.2), r: 1.2 }));

  /** Solid spans across the river near s: [dLo, dHi] (with the boat's beam added). */
  function spans(s, extra = []) {
    const out = [];
    const isl = islandAt(s);
    if (isl && isl.half > 0.2) out.push([-isl.half - BEAM, isl.half + BEAM]);
    for (const o of [...rocks, ...extra]) {
      if (Math.abs(o.s - s) > (o.r ?? 1) + 2.5) continue;
      out.push([o.d - o.r - BEAM, o.d + o.r + BEAM]);
    }
    for (const l of logs) {
      if (Math.abs(l.s - s) > l.len / 2 + 2.5) continue;
      const half = Math.abs(Math.sin(l.ang)) * (l.len / 2) + 0.45 + l.amp;
      out.push([l.d0 - half - BEAM, l.d0 + half + BEAM]);
    }
    return out;
  }
  /** The widest gap a boat's centre can use at s: { width, d (its middle) }. */
  function gapAt(s, extra) {
    const hw = at(s).hw - BEAM - 0.3;
    const list = spans(s, extra).sort((a, b) => a[0] - b[0]);
    let cur = -hw;
    let best = 0;
    let mid = 0;
    for (const [lo, hi] of list) {
      const top = Math.min(lo, hw);
      if (top - cur > best) (best = top - cur), (mid = (top + cur) / 2);
      cur = Math.max(cur, hi);
    }
    if (hw - cur > best) (best = hw - cur), (mid = (hw + cur) / 2);
    return { width: Math.max(0, best), d: mid };
  }
  const widestGap = (s, extra) => gapAt(s, extra).width;
  const near = (s, d, r) =>
    rocks.some((o) => Math.hypot(o.s - s, o.d - d) < o.r + r + 5) ||
    logs.some((l) => Math.abs(l.s - s) < l.len / 2 + r + 5) ||
    whirls.some((w) => Math.hypot(w.s - s, w.d - d) < w.r + r + 4) ||
    pendulums.some((p) => Math.abs(p.s - s) < 8);

  function channelD(s, side) {
    const isl = islandAt(s);
    const hw = at(s).hw;
    if (!isl) return side * hw * 0.5;
    return side * ((isl.half + hw) / 2);
  }

  // Rocks on the short lines first: the price of the short way, one off the island's shore, one off the bank.
  for (const is of islands) {
    const side = is.short ?? 1;
    for (const [k, frac] of [[0, 0.32], [1, 0.7]]) {
      const s = is.s0 + (is.s1 - is.s0) * frac;
      const isl = islandAt(s);
      const hw = at(s).hw;
      const r = 0.9;
      // touching the shore, so there's no pocket a boat can wedge into
      const d = k === 0 ? side * (isl.half + r * 0.6) : side * (hw - BEAM - r * 0.6);
      const o = { s, d, r, ...point(s, d) };
      if (widestGap(s, [o]) >= 2.6) rocks.push(o);
    }
  }

  const span = finish - 25 - (start + 45);
  function scatter(count, make) {
    for (let k = 0; k < count; k++) {
      for (let tries = 0; tries < 30; tries++) {
        const s = start + 45 + R.next() * span;
        // Splits stay clean (their short lines have their own rocks).
        if (islands.some((is) => s > is.s0 - 12 && s < is.s1 + 12)) {
          R.next();
          continue;
        }
        const hw = at(s).hw;
        const d = (R.next() * 2 - 1) * (hw - 1.8);
        if (make(s, d)) break;
      }
    }
  }
  const per = (n) => Math.round((n ?? 0) * (def.length - 70) / 100);
  scatter(per(def.rocks), (s, d) => {
    const r = 0.8 + R.next() * 0.8;
    if (near(s, d, r)) return false;
    // No pockets against a bank: either touching room for a boat or none.
    const hw = at(s).hw;
    if (hw - Math.abs(d) - r < 3.2 && hw - Math.abs(d) - r > 0) return false;
    const o = { s, d, r, ...point(s, d) };
    if (widestGap(s, [o]) < 2.6) return false;
    rocks.push(o);
    return true;
  });
  scatter(per(def.logs), (s, d) => {
    const len = 4 + R.next() * 2;
    if (near(s, d, len / 2)) return false;
    // Floating logs lie roughly along the current and drift slowly from side to side.
    const l = { s, d0: d * 0.6, amp: 0.6 + R.next() * 0.9, period: 7 + R.next() * 4, ph: R.next() * Math.PI * 2, len, ang: (R.next() * 2 - 1) * 0.6 };
    logs.push(l);
    if (widestGap(s) < 2.6) {
      logs.pop();
      return false;
    }
    return true;
  });
  scatter(per(def.pads), (s, d) => {
    const r = 1.5 + R.next() * 1.5;
    if (pads.some((p) => Math.hypot(p.s - s, p.d - d) < p.r + r + 2)) return false;
    pads.push({ s, d, r, ...point(s, d) });
    return true;
  });

  /** A log's capsule at song time t: centre, direction, half length. */
  function logAt(l, t) {
    const d = l.d0 + l.amp * Math.sin((2 * Math.PI * t) / l.period + l.ph);
    const p = point(l.s, d);
    const a = p.h + l.ang;
    return { x: p.x, z: p.z, ux: Math.sin(a), uz: -Math.cos(a), half: l.len / 2, r: 0.45, d, a };
  }
  /** A pendulum bob's position at beat position B (beats since the start, continuous): one swing there and back every 8 beats. */
  function pendulumAt(p, B) {
    const d = p.amp * Math.sin((Math.PI * B) / 4);
    return { ...point(p.s, d), d, r: p.r };
  }

  return {
    def, N, total, start, finish, X, Z, H, K, HW, BASE, islands, zones, rocks, logs, pads, whirls, pendulums,
    at, point, locate, rapidsAt, currentAt, islandAt, logAt, pendulumAt, widestGap, gapAt, channelD,
  };
}
