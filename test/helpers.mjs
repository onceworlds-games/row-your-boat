// Shared by the tests: whole races through the pure modules.
import { buildCourse } from '../src/sim/course.js';
import { makeSong } from '../src/sim/song.js';
import { createRacer } from '../src/sim/racer.js';
import { createBrain, botParams, habitOf } from '../src/sim/bot.js';
import { startSlot, raceOver, outcome } from '../src/sim/race.js';

/** Race `entries` ([{ id, skill, name, cap }]) on a stream. Returns { course, racers, fin, ended, t, groups }. */
export function race(def, entries, seed = 'r') {
  const course = buildCourse(def);
  const song = makeSong(def.bpm);
  const racers = entries.map((e, i) => {
    const slot = startSlot(course, i);
    const brain = createBrain(course, botParams(e.skill, habitOf(e.name ?? '')), `${seed}:${e.id}`, song);
    const r = createRacer({ course, song, ease: def.ease ?? 1, s: slot.s, d: slot.d, brain, id: e.id });
    r.cap = e.cap;
    return r;
  });
  const fin = {};
  let t = -2;
  let ended = null;
  while (!ended && t < 1000) {
    t += 0.05;
    for (const r of racers) {
      const others = racers.filter((o) => o !== r).map((o) => o.boat);
      for (const ev of r.update(t, others)) if (ev.type === 'finish') fin[r.id] = ev.t;
      if (r.cap && r.judge.state.level > r.cap) r.judge.restore(r.cap);
    }
    ended = raceOver(def, fin, racers.map((r) => r.id), t);
  }
  const groups = outcome(racers.map((r) => ({ id: r.id, s: r.boat.s, ft: fin[r.id] ?? null })));
  return { course, racers, fin, ended, t, groups };
}
