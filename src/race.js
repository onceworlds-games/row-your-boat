// One race on one page: the course and song, the boats this page simulates (its player's, and the bots when it is the
// host or alone) and the ones it only draws (other players from presence, bots from the host). No DOM, no three.js.

import { buildCourse } from './sim/course.js';
import { makeSong } from './sim/song.js';
import { createRacer, qualityCode, QUALITY_CODES } from './sim/racer.js';
import { createBrain, botParams, habitOf } from './sim/bot.js';
import { startSlot, order } from './sim/race.js';
import { streamByN } from './sim/streams.js';
import { twistDef } from './sim/tonight.js';

const courses = new Map();
/** Courses are pure data: build each stream (and each twist of it) once. */
export function courseOf(stream, twist = null) {
  const key = `${stream.id}|${twist ?? ''}`;
  if (!courses.has(key)) courses.set(key, buildCourse(twistDef(stream, twist)));
  return courses.get(key);
}
const songs = new Map();
export function songOf(stream, twist = null) {
  const key = `${stream.id}|${twist ?? ''}`;
  if (!songs.has(key)) {
    const def = twistDef(stream, twist);
    songs.set(key, makeSong(def.bpm, { golden: !!def.golden }));
  }
  return songs.get(key);
}

const NEAR = 14;

/**
 * seats: [{ id, name, bot, skill, slot }]. me: this page's seat id (null for a watcher). key: the round's id (seeds the
 * bots' choices). ease/calib: the player's judging windows and calibration. pilot: a skill for the player's own boat to
 * row itself (the trailer, attract mode), or null.
 */
export function createRaceSim({ n = 1, seats, me = null, key = 'race', ease = 1, calib = 0, pilot = null, botEase = null, twist = null }) {
  const stream = streamByN(n);
  const course = courseOf(stream, twist);
  const song = songOf(stream, twist);
  const racers = new Map();
  const views = new Map();
  const seatOf = new Map(seats.map((s) => [s.id, s]));
  const slots = new Map(seats.map((s, i) => [s.id, Number.isInteger(s.slot) ? s.slot : i]));

  function spawn(id, brain) {
    const seat = seatOf.get(id);
    const slot = startSlot(course, slots.get(id) ?? 0);
    const r = createRacer({ course, song, ease: id === me ? ease : 1, offset: id === me ? calib : 0, s: slot.s, d: slot.d, brain, id });
    racers.set(id, r);
    views.delete(id);
    void seat;
    return r;
  }
  function brainFor(id, skill, name) {
    return createBrain(course, botParams(skill, habitOf(name)), `${key}:${id}`, song);
  }

  if (me && seatOf.has(me)) spawn(me, pilot !== null ? brainFor(me, pilot, '') : null);

  // others start as views at their start slots
  for (const s of seats) {
    if (racers.has(s.id)) continue;
    const slot = startSlot(course, slots.get(s.id) ?? 0);
    const p = course.point(slot.s, slot.d);
    views.set(s.id, { s: slot.s, x: p.x, z: p.z, h: p.h, v: 0, c: 0, k: 0, ls: 0, lq: 0, f: 0, ft: 0, y: 0 });
  }

  const others = (id, b) => {
    const out = [];
    for (const [oid, r] of racers) {
      if (oid === id) continue;
      if (Math.abs(r.boat.s - b.s) < NEAR) out.push(r.boat);
    }
    for (const [oid, v] of views) {
      if (oid === id || v.away || v.left) continue;
      if (Math.abs(v.s - b.s) < NEAR) out.push(v);
    }
    return out;
  };

  const sim = {
    stream,
    course,
    song,
    seats,
    racers,
    views,
    key,
    get me() {
      return me ? racers.get(me) ?? null : null;
    },
    meId: me,
    /** Simulate a bot here (the host, or alone), carrying on from a snapshot at song time t when there is one. */
    simulate(id, snap = null, t = null) {
      if (racers.has(id)) return racers.get(id);
      const seat = seatOf.get(id);
      if (!seat) return null;
      const skill = botEase !== null ? Math.min(seat.skill ?? 0.5, botEase) : seat.skill ?? 0.5;
      const r = spawn(id, brainFor(id, skill, seat.name));
      if (snap && t !== null) r.restore(snap, t);
      return r;
    },
    /** Stop simulating a bot (another page is the host now): draw it from views. */
    release(id) {
      const r = racers.get(id);
      if (!r || id === me) return;
      racers.delete(id);
      views.set(id, { ...r.snapshot() });
    },
    /** Another boat's latest state (validated by the caller). */
    setView(id, st) {
      if (racers.has(id)) return;
      const v = views.get(id) ?? {};
      views.set(id, Object.assign(v, st));
    },
    /** Step every simulated boat to song time t. Returns [{ id, ev }]. */
    step(t) {
      const out = [];
      for (const [id, r] of racers) {
        const evs = r.update(t, others(id, r.boat));
        for (const ev of evs) out.push({ id, ev });
      }
      return out;
    },
    /** The player's stroke at song time t. */
    input(side, t) {
      const r = sim.me;
      if (!r || r.brain) return null;
      return r.input(side, t);
    },
    /** Every boat's drawable state: { id, x, z, h, s, v, c (0-3), k, ls, lq, f, ft, sim (simulated here) }. */
    boats() {
      const out = [];
      for (const [id, r] of racers) {
        const b = r.boat;
        out.push({ id, x: b.x, z: b.z, h: b.h, s: b.s, d: b.d, v: b.v, c: r.judge.state.level - 1, k: r.strokes, ls: r.last?.side ?? 0, lq: qualityCode(r.last?.kind), f: b.finished ? 1 : 0, ft: b.ft, sim: true, slip: b.slip, rapids: b.rapids, whirl: b.whirl });
      }
      for (const [id, v] of views) out.push({ id, ...v, sim: false });
      return out;
    },
    /** Places now, best first: finishers by time, then by distance. fin: known finish times by id. */
    places(fin = {}, left = new Set()) {
      const list = sim.boats().map((b) => ({ id: b.id, s: b.s, ft: Number.isFinite(fin[b.id]) ? fin[b.id] : b.f && Number.isFinite(b.ft) && b.ft > 0 ? b.ft : null, left: left.has(b.id) }));
      return order(list).map((b) => b.id);
    },
  };
  return sim;
}

export { QUALITY_CODES };
