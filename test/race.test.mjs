import { test } from 'node:test';
import assert from 'node:assert/strict';
import { order, outcome, points, plausibleFinish, raceOver, stars, clock, ordinal, CUP_POINTS, FINISH_WINDOW } from '../src/sim/race.js';
import { STREAMS, cap } from '../src/sim/streams.js';
import { buildCourse } from '../src/sim/course.js';
import { race } from './helpers.mjs';

test('places: finishers by time, then distance, leavers last; dead heats share', () => {
  const boats = [
    { id: 'a', s: 300, ft: null },
    { id: 'b', s: 460, ft: 61.234 },
    { id: 'c', s: 460, ft: 60.5 },
    { id: 'd', s: 320, ft: null, left: true },
    { id: 'e', s: 460, ft: 61.2341 },
    { id: 'f', s: 200, ft: null },
  ];
  assert.deepEqual(order(boats).map((b) => b.id), ['c', 'b', 'e', 'a', 'f', 'd']);
  const g = outcome(boats);
  assert.deepEqual(g, [['c'], ['b', 'e'], ['a'], ['f'], ['d']]);
  const p = points(g);
  assert.deepEqual(p, { c: 10, b: 7, e: 7, a: 3, f: 2, d: 1 });
  assert.equal(CUP_POINTS.length, 6);
});

test('finish times must be plausible', () => {
  const def = STREAMS[0];
  const c = buildCourse(def);
  assert.equal(plausibleFinish(def, c, 61, 61.2, c.finish + 2), true);
  assert.equal(plausibleFinish(def, c, 20, 20.1, c.finish), false, 'faster than any boat');
  assert.equal(plausibleFinish(def, c, 70, 60, c.finish), false, 'from the future');
  assert.equal(plausibleFinish(def, c, 61, 61, c.finish - 100), false, 'not near the line');
  assert.equal(plausibleFinish(def, c, NaN, 61, c.finish), false);
});

test('a race ends when all finish, 30 s after the first, or at the cap', () => {
  const def = STREAMS[1];
  assert.equal(raceOver(def, {}, ['a', 'b'], 50), null);
  assert.equal(raceOver(def, { a: 70 }, ['a', 'b'], 80), null);
  assert.equal(raceOver(def, { a: 70 }, ['a', 'b'], 70 + FINISH_WINDOW), 'window');
  assert.equal(raceOver(def, { a: 70, b: 75 }, ['a', 'b'], 75), 'all');
  assert.equal(raceOver(def, {}, ['a'], cap(def)), 'cap');
});

test('stars, clocks and ordinals', () => {
  assert.deepEqual(stars({ finished: true, place: 1, rhythm: 0.9 }), [true, true, true]);
  assert.deepEqual(stars({ finished: true, place: 2, rhythm: 0.84 }), [true, false, false]);
  assert.deepEqual(stars({ finished: false, place: 1, rhythm: 1 }), [false, false, false]);
  assert.equal(clock(64.34), '1:04.3');
  assert.equal(clock(9.97), '0:10.0');
  assert.equal(clock(59.97), '1:00.0');
  assert.equal(clock(-1), '0:00.0');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ['st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'st', 'nd']);
});

test('whole races of six on every stream: end in time, places and points add up, nothing NaN', () => {
  for (const def of STREAMS) {
    for (let seed = 0; seed < 3; seed++) {
      const entries = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, skill: 0.3 + 0.1 * i, name: ['Mabel', 'Otis', 'Wren', 'Barty', 'Juniper', 'Pell'][i] }));
      const r = race(def, entries, `full:${def.id}:${seed}`);
      assert.ok(r.ended, `${def.id} never ended`);
      assert.ok(r.t <= cap(def) + 0.1);
      assert.equal(r.groups.flat().length, 6);
      const total = Object.values(points(r.groups)).reduce((a, b) => a + b, 0);
      assert.equal(total, 28);
      for (const x of r.racers) {
        const b = x.boat;
        assert.ok([b.x, b.z, b.h, b.v, b.s].every(Number.isFinite));
        assert.ok(x.judge.rhythm() >= 0 && x.judge.rhythm() <= 1);
      }
      const times = Object.values(r.fin);
      assert.ok(times.length >= 3, `${def.id}: only ${times.length} finished`);
    }
  }
});
