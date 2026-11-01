import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCourse, START, BEAM } from '../src/sim/course.js';
import { STREAMS, par, cap } from '../src/sim/streams.js';
import { startSlot, SEATS } from '../src/sim/race.js';

for (const def of STREAMS) {
  test(`${def.name}: builds, fits its length, every metre passable`, () => {
    const c = buildCourse(def);
    assert.equal(c.finish - c.start, def.length);
    assert.ok(c.total >= c.finish + 30, 'a finish pool after the line');
    assert.ok(def.length >= 440 && def.length <= 820);
    for (let s = 0; s < c.total; s++) assert.ok(c.at(s).base * 2 >= 8, 'at least 8 m wide');
    // The widest gap for a boat's centre, with logs anywhere in their drift.
    for (let s = c.start; s < c.finish; s += 0.5) assert.ok(c.widestGap(s) >= 1.4, `${def.id} blocked at ${s}: ${c.widestGap(s)}`);
    // Both channels of every split are open (the short one may be tight).
    for (const is of c.islands) {
      for (let s = is.s0 + 1; s < is.s1; s += 1) {
        const isl = c.islandAt(s);
        const hw = c.at(s).hw;
        assert.ok(hw - isl.half - 2 * BEAM > 3, `${def.id} channel at ${s}`);
      }
    }
    // Six boats abreast behind the start line, inside the banks, apart.
    const slots = Array.from({ length: SEATS }, (_, i) => startSlot(c, i));
    const hw = c.at(c.start - 4).hw;
    for (const sl of slots) assert.ok(Math.abs(sl.d) < hw - 1.2);
    for (let i = 1; i < SEATS; i++) assert.ok(slots[i].d - slots[i - 1].d >= 2.2);
    // Nothing solid in the start or finish zones.
    for (const o of c.rocks) assert.ok(o.s > c.start + 20 && o.s < c.finish, `${def.id} rock at ${o.s}`);
    assert.ok(par(def) > 60 && par(def) < 130);
    assert.ok(cap(def) > par(def) * 2);
    assert.equal(c.start, START);
  });
}

test('locate inverts point everywhere along the river', () => {
  const c = buildCourse(STREAMS[4]);
  for (let s = 5; s < c.total - 5; s += 7) {
    for (const d of [-5, 0, 4]) {
      const p = c.point(s, d);
      const l = c.locate(p.x, p.z, Math.round(s));
      assert.ok(Math.abs(l.s - s) < 0.3 && Math.abs(l.d - d) < 0.3, `s ${s} d ${d} -> ${l.s} ${l.d}`);
      const g = c.locate(p.x, p.z);
      assert.ok(Math.abs(g.s - s) < 0.3, 'a search with no hint finds it too');
    }
  }
});

test('courses are the same on every page (deterministic)', () => {
  const a = buildCourse(STREAMS[7]);
  const b = buildCourse(STREAMS[7]);
  assert.deepEqual(a.rocks.map((r) => [r.s, r.d, r.r]), b.rocks.map((r) => [r.s, r.d, r.r]));
  assert.deepEqual(a.logs, b.logs);
});
