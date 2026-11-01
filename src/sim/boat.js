// A rowing boat on the river: speed, heading, the current, bumps. A fixed-step simulation. Pure.

import { BEAM, DEG, wrap } from './course.js';

/** Target speed through the water by combo level (1-4). */
export const TARGET = [0, 4.0, 5.2, 6.4, 7.6];
export const YAW = 11 * DEG;
export const YAW_RATE = YAW / 0.3;
export const PULL_RATE = 7 * DEG;
export const PULL_WITHIN = 35 * DEG;
export const SURGE = 1.1;
export const SURGE_K = 0.6;
/** Drag: speed falls about this share per beat. */
export const DRAG_PER_BEAT = 0.09;
export const SPLASH_SLOW = 0.7;
export const BUMP_SLOW = 0.55;
export const BUMP_TURN = 15 * DEG;
export const ROCK_SPIN = 25 * DEG;
export const GRACE = 0.6;
export const SLIP_BOOST = 1.06;
export const SLIP_BEHIND = 7;
export const SLIP_SIDE = 1.6;
export const WAVE_KICK = 5 * DEG;
export const WHIRL_SPIN = 70 * DEG;
export const WHIRL_PULL = 1.2;
export const HULL_OFF = 1.0;
export const HULL_R = 0.7;
export const BOAT_R = 1.1;
export const DT = 1 / 120;
const SPIN_DECAY = 4;

export function createBoat(course, s, d, h) {
  const p = course.point(s, d);
  return {
    x: p.x, z: p.z, h: h ?? p.h, v: 0, yaw: 0, spin: 0, s, d, i: Math.round(s),
    grace: 0, wave: -1, finished: false, ft: null, bumps: 0, slip: false, pad: false, whirl: false, rapids: 0,
    contact: 0, current: 0, ground: 0, touches: 0, stuckSince: -1, stuckS: s,
  };
}

/** Apply a judged stroke (judge.js result) at combo `level`. */
export function stroke(b, res) {
  if (!res || res.kind === 'early') return;
  if (res.q > 0) {
    const target = TARGET[Math.max(1, Math.min(4, res.level))] * SURGE * res.q;
    b.v = Math.max(b.v, b.v + (target - b.v) * SURGE_K);
  }
  if (res.kind === 'splash') b.v *= SPLASH_SLOW;
  if (res.turn) b.yaw += res.turn * YAW;
}

function bumpHit(b, spin, events, kind) {
  b.touches++;
  if (b.grace <= 0) {
    b.v *= BUMP_SLOW;
    b.spin += spin * SPIN_DECAY;
    b.grace = GRACE;
    b.bumps++;
    events.push({ type: 'bump', kind });
  }
}

/** Wedged (touching things for a while without getting anywhere): the river lifts the boat into open water. */
function unstick(b, c, t, events) {
  if (b.touches === 0) {
    if (t - b.stuckSince > 0.5) (b.stuckSince = t), (b.stuckS = b.s);
    return;
  }
  b.touches = 0;
  if (b.stuckSince < 0) (b.stuckSince = t), (b.stuckS = b.s);
  if (t - b.stuckSince < 2.5) return;
  if (b.s - b.stuckS > 4) {
    b.stuckSince = t;
    b.stuckS = b.s;
    return;
  }
  const s = Math.min(c.total - 4, b.s + 1.5);
  const gap = c.gapAt(s);
  const p = c.point(s, gap.d);
  Object.assign(b, { x: p.x, z: p.z, h: p.h, yaw: 0, spin: 0, s, d: gap.d, i: Math.round(s), v: Math.max(b.v, 2), grace: GRACE });
  b.stuckSince = t;
  b.stuckS = s;
  events.push({ type: 'unstuck' });
}

/**
 * One fixed step. env: { course, t (song time at the end of the step), beat (seconds a beat lasts now), resting, B
 * (continuous beat position), others: [{ x, z, h }] }. Pushes events ({ type }) into `events`.
 */
export function step(b, dt, env, events) {
  const c = env.course;
  const before = b.s;

  // Heading: strokes' yaw eased in, the current's pull, spin from bumps and whirlpools.
  if (b.yaw !== 0) {
    const turn = Math.sign(b.yaw) * Math.min(Math.abs(b.yaw), YAW_RATE * dt);
    b.h += turn;
    b.yaw -= turn;
    if (Math.abs(b.yaw) < 1e-6) b.yaw = 0;
  }
  const here = c.at(b.s);
  const err = wrap(here.h - b.h);
  if (Math.abs(err) < PULL_WITHIN) b.h += Math.max(-PULL_RATE * dt, Math.min(PULL_RATE * dt, err));
  if (b.spin !== 0) {
    b.h += b.spin * dt;
    b.spin *= Math.exp(-SPIN_DECAY * dt);
    if (Math.abs(b.spin) < 1e-4) b.spin = 0;
  }

  // Speed: drag (less in a breath, more on pads).
  let tau = Math.max(0.2, env.beat) / DRAG_PER_BEAT;
  if (env.resting) tau *= 3;
  b.pad = false;
  for (const p of c.pads) {
    if (Math.abs(p.s - b.s) > p.r + 3) continue;
    if ((p.x - b.x) ** 2 + (p.z - b.z) ** 2 < (p.r + 0.6) ** 2) {
      b.pad = true;
      break;
    }
  }
  if (b.pad) tau /= 2;
  b.v *= Math.exp(-dt / tau);
  if (b.v > 12) b.v = 12;
  if (b.v < 0) b.v = 0;

  // Slipstream: in the wake of a boat ahead.
  b.slip = false;
  const fx = Math.sin(b.h);
  const fz = -Math.cos(b.h);
  for (const o of env.others ?? []) {
    const ofx = Math.sin(o.h);
    const ofz = -Math.cos(o.h);
    const qx = b.x - o.x;
    const qz = b.z - o.z;
    const along = qx * ofx + qz * ofz;
    const side = Math.abs(qx * Math.cos(o.h) + qz * Math.sin(o.h));
    if (along < -1.5 && along > -SLIP_BEHIND && side < SLIP_SIDE) {
      b.slip = true;
      break;
    }
  }

  // Move: the boat's own speed, the current along the river, whirlpools.
  const cur = c.currentAt(b.s, b.d);
  b.current = cur;
  const boost = b.slip ? SLIP_BOOST : 1;
  let vx = fx * b.v * boost + Math.sin(here.h) * cur;
  let vz = fz * b.v * boost - Math.cos(here.h) * cur;
  b.whirl = false;
  for (const w of c.whirls) {
    if (Math.abs(w.s - b.s) > w.r + 2) continue;
    const dx = w.x - b.x;
    const dz = w.z - b.z;
    const dist = Math.hypot(dx, dz);
    if (dist < w.r && dist > 1e-3) {
      const k = 1 - dist / w.r;
      b.whirl = true;
      b.h += WHIRL_SPIN * k * dt;
      vx += (dx / dist) * WHIRL_PULL * k;
      vz += (dz / dist) * WHIRL_PULL * k;
    }
  }
  b.x += vx * dt;
  b.z += vz * dt;
  b.ground = Math.hypot(vx, vz);

  // Solid things: rocks, logs, pendulum bobs (hull = two circles), then islands and banks.
  if (b.grace > 0) b.grace -= dt;
  const hfx = Math.sin(b.h);
  const hfz = -Math.cos(b.h);
  const rx = Math.cos(b.h);
  const rz = Math.sin(b.h);
  const hitCircle = (ox, oz, r, kind) => {
    for (const off of [HULL_OFF, -HULL_OFF]) {
      const cx = b.x + hfx * off;
      const cz = b.z + hfz * off;
      const dx = cx - ox;
      const dz = cz - oz;
      const dist = Math.hypot(dx, dz);
      const min = r + HULL_R;
      if (dist < min && dist > 1e-4) {
        const nx = dx / dist;
        const nz = dz / dist;
        b.x += nx * (min - dist);
        b.z += nz * (min - dist);
        const away = Math.sign(nx * rx + nz * rz) || 1;
        bumpHit(b, away * ROCK_SPIN, events, kind);
        return true;
      }
    }
    return false;
  };
  for (const o of c.rocks) {
    if (Math.abs(o.s - b.s) > o.r + 3) continue;
    hitCircle(o.x, o.z, o.r, 'rock');
  }
  for (const l of c.logs) {
    if (Math.abs(l.s - b.s) > l.len / 2 + 3) continue;
    const g = c.logAt(l, env.t);
    // nearest point on the log's segment to the boat
    const px = b.x - g.x;
    const pz = b.z - g.z;
    const u = Math.max(-g.half, Math.min(g.half, px * g.ux + pz * g.uz));
    hitCircle(g.x + g.ux * u, g.z + g.uz * u, g.r, 'log');
  }
  for (const p of c.pendulums) {
    if (Math.abs(p.s - b.s) > 4) continue;
    const g = c.pendulumAt(p, env.B ?? 0);
    hitCircle(g.x, g.z, g.r, 'pendulum');
  }

  let loc = c.locate(b.x, b.z, b.i);
  if (!Number.isFinite(loc.s) || !Number.isFinite(loc.d)) loc = c.locate(b.x, b.z);
  b.s = loc.s;
  b.d = loc.d;
  b.i = loc.i;

  const isl = c.islandAt(b.s);
  if (isl && isl.half > 0.1) {
    const gap = b.d - isl.c;
    const limit = isl.half + BEAM + 0.15;
    if (Math.abs(gap) < limit) {
      const side = gap === 0 ? isl.island.short || 1 : Math.sign(gap);
      b.d = isl.c + side * limit;
      const p = c.point(b.s, b.d);
      b.x = p.x;
      b.z = p.z;
      bumpHit(b, side * BUMP_TURN, events, 'island');
    }
  }
  const lim = loc.hw - BEAM - 0.25;
  if (Math.abs(b.d) > lim) {
    const side = Math.sign(b.d);
    b.d = side * lim;
    const p = c.point(b.s, b.d);
    b.x = p.x;
    b.z = p.z;
    bumpHit(b, -side * BUMP_TURN, events, 'bank');
  }

  unstick(b, c, env.t, events);

  // Other boats: each pushes itself away (the other page does the same).
  if (b.contact > 0) b.contact -= dt;
  for (const o of env.others ?? []) {
    const dx = b.x - o.x;
    const dz = b.z - o.z;
    const dist = Math.hypot(dx, dz);
    if (dist < BOAT_R * 2 && dist > 1e-4) {
      const push = (BOAT_R * 2 - dist) * 0.5;
      b.x += (dx / dist) * push;
      b.z += (dz / dist) * push;
      if (b.contact <= 0) {
        b.v *= 0.9;
        b.contact = 0.5;
        events.push({ type: 'touch' });
      }
    }
  }

  // Rapids: standing waves kick the bow.
  b.rapids = c.rapidsAt(b.s, b.d);
  if (b.rapids > 0.5) {
    const crest = Math.floor(b.s / 7);
    if (crest !== b.wave && b.wave >= 0) {
      b.h += (crest % 2 === 0 ? 1 : -1) * WAVE_KICK;
      events.push({ type: 'wave' });
    }
    b.wave = crest;
  } else b.wave = Math.floor(b.s / 7);

  // The end of the river: the finish pool holds the boats.
  if (b.s > c.total - 8) b.v *= Math.exp(-3 * dt);
  if (b.s > c.total - 3) {
    const p = c.point(c.total - 3, b.d);
    b.x = p.x;
    b.z = p.z;
    b.s = c.total - 3;
  }

  // Finish line, timed to within the step.
  if (!b.finished && before < c.finish && b.s >= c.finish) {
    const f = (c.finish - before) / Math.max(1e-6, b.s - before);
    b.finished = true;
    b.ft = env.t - dt + f * dt;
    events.push({ type: 'finish', t: b.ft });
  }

  // Never NaN: back to the centre of the river where it was.
  if (!Number.isFinite(b.x) || !Number.isFinite(b.z) || !Number.isFinite(b.h) || !Number.isFinite(b.v)) {
    const s = Number.isFinite(before) ? before : c.start;
    const p = c.point(s, 0);
    Object.assign(b, { x: p.x, z: p.z, h: p.h, v: 0, yaw: 0, spin: 0, s, d: 0, i: Math.round(s) });
  }
}
