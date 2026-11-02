// The rowers' brain: which oar and when, beat by beat. It plays through the same judge and physics as a player. Pure.

import { rng } from './rng.js';
import { YAW } from './boat.js';
import { DEG, wrap } from './course.js';
import { ROWERS } from './streams.js';

function beatAt(song, t) {
  if (t < 0) return t / song.base;
  const i = song.indexAt(t);
  const b = song.beats[i];
  return i + Math.min(1, (t - b.t) / b.dur);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * How far a rower is from sharp, for its timing and its slips: flat through the middle (rowers from 0.3 up race within
 * a few seconds of each other), steep below it, and gentle again under 0 (newcomers' rivals).
 */
const loose = (k) => {
  const u = Math.max(0, 1 - k);
  return u <= 1 ? u * u * u : 1 + 0.4 * (u - 1);
};

/** A rower's numbers from a skill (0 clumsy - 1 sharp) and a habit (streams.js ROWERS). */
export function botParams(skill, habit = {}) {
  const k = clamp(Number(skill) || 0, -0.6, 1);
  return {
    skill: k,
    sigma: Math.max(0.01, 0.02 + 0.066 * loose(k) + (habit.sigma ?? 0)),
    bias: habit.bias ?? 0,
    slip: Math.max(0.003, 0.006 + 0.08 * loose(k) + (habit.slip ?? 0)),
    sight: 18 + 12 * k + (habit.sight ?? 0),
    lead: 6 + 8 * k,
    short: habit.short === 'always' || (habit.short !== 'never' && k >= 0.55),
    noise: Math.pow(Math.max(0, 1 - k), 1.5) * 6 * DEG,
    overcorrect: habit.overcorrect ?? 0,
    streaky: !!habit.streaky,
    line: 0.35 * k,
    // the new moves: how often a gold beat gets both oars, a droplet gets tapped, a bloom line gets chased
    pull: clamp(0.05 + 0.9 * k, 0, 0.95),
    drops: clamp((k - 0.2) * 1.1, 0, 0.9),
    bloom: clamp(0.05 + 0.6 * k, 0, 0.7),
  };
}

export const habitOf = (name) => ROWERS[String(name).split(' ')[0]] ?? {};

/** Racing in a pack: past `free` metres from the reference boat (the leading player), a bot rows looser ahead of it and
 * sharper behind it, a little more per metre, up to these limits. */
export const PACK = { free: 10, ahead: 40, behind: 40, loose: 0.35, sharp: 0.35 };
/** A bot's form (1 as it is; above 1 looser, below sharper) at `gap` metres ahead (+) or behind (-) the reference. */
export function packForm(gap) {
  if (!Number.isFinite(gap)) return 1;
  if (gap > PACK.free) return 1 + Math.min(PACK.loose, (gap - PACK.free) / PACK.ahead);
  if (gap < -PACK.free) return 1 - Math.min(PACK.sharp, (-gap - PACK.free) / PACK.behind);
  return 1;
}

/**
 * A brain for one boat. `key` seeds its choices (the same on any page that runs it: match, round, seat). `plan(boat,
 * beat, t)` is asked once per rowed beat, a moment before it: { t, side } (side -1, 1, or 0 for both oars), or null to
 * let the beat pass.
 */
export function createBrain(course, params, key, song = null) {
  let lastSide = 1;
  let hotUntil = -1;
  const P = params;

  /** Where to steer: a lateral plan along the river ahead (racing line, split channel, around solid things). */
  function aim(boat, t) {
    const look = Math.max(9, boat.v * 2.2) * (0.85 + 0.3 * P.skill);
    const STEP = 2;
    const n = Math.ceil(P.sight / STEP);
    const base = (s) => {
      const a = course.at(s);
      return clamp(Math.sign(a.k) * a.hw * P.line, -a.hw + 2.2, a.hw - 2.2);
    };
    const lineAt = (s) => {
      for (const is of course.islands) {
        if (s < is.s0 - 34 || s > is.s1 + 4) continue;
        if (is.s0 - P.sight - 24 > boat.s) continue;
        let side = P.short ? is.short || 1 : -(is.short || 1);
        // Already beside the island: stay on this side.
        const isl = course.islandAt(boat.s);
        if (isl && Math.abs(boat.d) > isl.half) side = Math.sign(boat.d) || side;
        const ch = course.channelD(Math.max(is.s0, Math.min(is.s1, s)), side);
        if (s >= is.s0 - 10) return ch;
        const f = (s - (is.s0 - 34)) / 24;
        return base(s) + (ch - base(s)) * f;
      }
      return base(s);
    };
    const prof = [];
    const blooms = course.blooms ?? [];
    for (let j = 0; j < n; j++) {
      const s = boat.s + 2 + j * STEP;
      let d = lineAt(s);
      // a line of moonblooms ahead: drift onto it
      for (let i = 0; i < blooms.length; i++) {
        const m = blooms[i];
        if (m.s < s - 2.5) continue;
        if (m.s > s + 2.5) break;
        if (boat.got?.[i] || (m.risky && P.skill < 0.8)) continue;
        d += (m.d - d) * P.bloom;
        break;
      }
      prof.push({ s, d, hard: false });
    }
    const avoid = (os, od, r) => {
      if (os < boat.s - r || os > boat.s + P.sight) return;
      for (const p of prof) {
        if (Math.abs(p.s - os) > r + 3.5) continue;
        if (Math.abs(od - p.d) > r + 1.9) continue;
        const hw = course.at(p.s).hw - 1.7;
        const left = od - r - 2.0;
        const right = od + r + 2.0;
        const okL = left > -hw && !insideIsland(p.s, left);
        const okR = right < hw && !insideIsland(p.s, right);
        if (okL && okR) p.d = Math.abs(left - boat.d) < Math.abs(right - boat.d) ? left : right;
        else if (okL) p.d = left;
        else if (okR) p.d = right;
        p.hard = true;
      }
    };
    for (const o of course.rocks) avoid(o.s, o.d, o.r);
    // Moving things: where they'll be when the boat gets there.
    const arrive = (os) => t + Math.max(0, os - boat.s) / Math.max(3, boat.v + boat.current);
    for (const l of course.logs) {
      if (l.s < boat.s - 3 || l.s > boat.s + P.sight) continue;
      avoid(l.s, course.logAt(l, arrive(l.s)).d, Math.abs(Math.sin(l.ang)) * l.len * 0.5 + 0.7);
    }
    for (const w of course.whirls) avoid(w.s, w.d, w.r * 0.85);
    for (const p of course.pendulums) {
      if (p.s < boat.s - 3 || p.s > boat.s + P.sight) continue;
      const ta = arrive(p.s);
      const B = song ? beatAt(song, ta) : ta * 1.8;
      avoid(p.s, course.pendulumAt(p, B).d, p.r + 0.6);
    }
    if (P.skill > 0.5) for (const p of course.pads) avoid(p.s, p.d, p.r * 0.7);
    for (const p of prof) {
      if (p.hard && Math.abs(p.d - boat.d) > 0.6) return { s: Math.max(p.s - 2, boat.s + Math.max(8, boat.v * 1.5)), d: p.d, hard: true };
      if (p.s >= boat.s + look) return p;
    }
    return prof[prof.length - 1] ?? { s: boat.s + look, d: 0 };
  }
  function insideIsland(s, d) {
    const isl = course.islandAt(s);
    return !!isl && Math.abs(d - isl.c) < isl.half + 1.2;
  }

  function plan(boat, beat, t) {
    const r = rng(`${key}:${beat.i}`);
    const form = Number.isFinite(api.form) ? clamp(api.form, 0.5, 2) : 1;
    let slip = P.slip * form;
    if (P.streaky && beat.i <= hotUntil) slip *= 3;
    if (boat.finished) slip = 0.5;
    let wrong = false;
    if (r.chance(slip)) {
      if (P.streaky) hotUntil = beat.i + 6;
      if (r.chance(0.5)) return null;
      wrong = true;
    } else r.next();
    const target = aim(boat, t);
    api._last = target;
    // Pure pursuit along the river: the bow toward the target's offset, never more than 35° off the river, and a
    // little ahead of a bend (the river turns while the stroke lands).
    const here = course.at(boat.s);
    const L = Math.max(8, target.s - boat.s);
    const want = clamp(Math.atan2(target.d - boat.d, L), -35 * DEG, 35 * DEG);
    const now = wrap(boat.h + boat.yaw - here.h);
    const ahead = here.k * (boat.v + boat.current) * (beat.dur ?? 0.6);
    let err = want - now + ahead + r.normal() * P.noise;
    if (P.overcorrect > 0 && Math.abs(err) > 6 * DEG && r.chance(P.overcorrect)) err *= 1.8;
    if (beat.rest) {
      // A breath: no beat to keep, only steering when it's needed.
      if (Math.abs(err) < 8 * DEG || boat.finished) return null;
      return { t: beat.t + 0.05 + r.next() * 0.1, side: Math.sign(err) };
    }
    let side;
    const cost = (sd) => Math.abs(err - sd * YAW);
    const options = [-1, 0, 1].sort((a, b) => cost(a) - cost(b));
    side = options[0];
    const pull = beat.gold && cost(0) - cost(side) < 4 * DEG && r.chance(P.pull);
    // Rowers alternate when straight is close enough: it looks and sounds like rowing.
    if (pull) side = 0;
    else if (side === 0) side = cost(-lastSide) - cost(0) < 4 * DEG ? -lastSide : 0;
    if (wrong) side = side === 0 ? lastSide : -side;
    if (side !== 0) lastSide = side;
    const offset = clamp(P.bias + r.normal() * P.sigma * form, -0.24, 0.24);
    const main = { t: beat.t + offset, side };
    if (!beat.rush || P.drops <= 0) return main;
    // The merrily droplets: both, on alternate oars (their small turns cancel), or neither
    if (!r.chance(P.drops)) return main;
    const ds = -(side || lastSide);
    return [main, ...[1, 2].map((k) => ({ t: beat.t + (beat.dur * k) / 3 + clamp(r.normal() * P.sigma * form * 0.6, -0.1, 0.1), side: k === 1 ? ds : -ds }))];
  }

  // form: set by the race each step (packForm), 1 when nobody sets it
  const api = { plan, params: P, form: 1, _last: null };
  return api;
}
