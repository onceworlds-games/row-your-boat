import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCourse, DEG, wrap, CURRENT, RAPID_CURRENT } from '../src/sim/course.js';
import { createBoat, step, stroke, DT, TARGET, YAW, BUMP_SLOW, SLIP_BOOST } from '../src/sim/boat.js';
import { makeSong } from '../src/sim/song.js';
import { STREAMS } from '../src/sim/streams.js';
import { rng } from '../src/sim/rng.js';

// A straight, wide, empty river for clean measurements.
const flat = buildCourse({ id: 'flat', length: 900, segs: [[1000]], widths: [[0, 40]], islands: [], rapids: [], whirls: [], pendulums: [], rocks: 0, logs: 0, pads: 0 });

function row(course, { bpm = 100, level = 4, q = 1, beats = 200, alternate = true, s = 30, d = 0, others = [] } = {}) {
  const song = makeSong(bpm);
  const b = createBoat(course, s, d);
  const ev = [];
  let t = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < beats; i++) {
    const beat = song.beats[i];
    stroke(b, { kind: q === 1 ? 'perfect' : 'good', q, level, turn: alternate ? (i % 2 ? 1 : -1) : 1 });
    while (t < beat.t + beat.dur) {
      t += DT;
      step(b, DT, { course, t, beat: beat.dur, resting: false, B: i, others }, ev);
      if (i > 40) {
        sum += b.v;
        n++;
      }
    }
  }
  return { b, avg: sum / n, ev };
}

test('steady rowing averages the target speed at every tempo (±5%)', () => {
  for (const bpm of [84, 104, 132, 148]) {
    for (const level of [1, 4]) {
      const { avg } = row(flat, { bpm, level, beats: 120 });
      assert.ok(Math.abs(avg / TARGET[level] - 1) < 0.05, `${bpm} bpm ×${level}: ${avg.toFixed(2)} vs ${TARGET[level]}`);
    }
  }
});

test('good strokes are slower than perfect ones', () => {
  const p = row(flat, { level: 4, q: 1, beats: 100 }).avg;
  const g = row(flat, { level: 4, q: 0.8, beats: 100 }).avg;
  assert.ok(g < p * 0.85);
});

test('alternating keeps the heading; two on one side turn 22°', () => {
  const { b } = row(flat, { beats: 60, level: 2 });
  assert.ok(Math.abs(wrap(b.h - flat.at(b.s).h)) < 6 * DEG, 'still straight');
  const c = createBoat(flat, 30, 0);
  stroke(c, { kind: 'perfect', q: 1, level: 1, turn: 1 });
  stroke(c, { kind: 'perfect', q: 1, level: 1, turn: 1 });
  // no current's pull on this check: measure the yaw itself
  let left = c.yaw;
  assert.ok(Math.abs(left - 2 * YAW) < 1e-9);
  assert.ok(Math.abs(YAW - 11 * DEG) < 1e-12);
});

test('a splash costs 30% at once; a bump costs 45% and a lantern is the judge\'s', () => {
  const b = createBoat(flat, 30, 0);
  b.v = 6;
  stroke(b, { kind: 'splash', q: 0.3, level: 1, turn: 1 });
  assert.ok(Math.abs(b.v - 6 * 0.7) < 1e-9);
  // drive into the bank
  const c = createBoat(flat, 30, 18);
  c.v = 5;
  c.h = flat.at(30).h + 60 * DEG;
  const ev = [];
  for (let k = 0; k < 120 && !ev.some((e) => e.type === 'bump'); k++) step(c, DT, { course: flat, t: k * DT, beat: 0.6, B: 0 }, ev);
  const bump = ev.find((e) => e.type === 'bump');
  assert.ok(bump && bump.kind === 'bank');
  assert.ok(c.v < 5 * BUMP_SLOW + 0.1);
  assert.ok(Math.abs(c.d) < 20);
});

test('the current carries an idle boat; rapids carry it faster', () => {
  const b = createBoat(flat, 30, 0);
  const ev = [];
  for (let k = 0; k < 600; k++) step(b, DT, { course: flat, t: k * DT, beat: 0.6, B: 0 }, ev);
  assert.ok(Math.abs(b.s - 30 - CURRENT * 5) < 0.2, `drifted ${b.s - 30}`);
  const rapid = buildCourse({ id: 'rapid', length: 400, segs: [[600]], widths: [[0, 30]], islands: [], rapids: [[0, 600, 0]], whirls: [], pendulums: [], rocks: 0, logs: 0, pads: 0 });
  const r = createBoat(rapid, 100, 0);
  let waves = 0;
  for (let k = 0; k < 600; k++) {
    const e = [];
    step(r, DT, { course: rapid, t: k * DT, beat: 0.6, B: 0 }, e);
    waves += e.filter((x) => x.type === 'wave').length;
  }
  assert.ok(r.s - 100 > RAPID_CURRENT * 5 * 0.9);
  assert.ok(waves >= 1, 'standing waves kick the bow');
});

test('slipstream: +6% in the wake of a boat ahead', () => {
  const ahead = createBoat(flat, 40, 0);
  const behind = createBoat(flat, 35, 0);
  behind.v = 5;
  const ev = [];
  step(behind, DT, { course: flat, t: 0, beat: 0.6, B: 0, others: [ahead] }, ev);
  assert.equal(behind.slip, true);
  const aside = createBoat(flat, 35, 4);
  step(aside, DT, { course: flat, t: 0, beat: 0.6, B: 0, others: [ahead] }, ev);
  assert.equal(aside.slip, false);
  assert.equal(SLIP_BOOST, 1.06);
});

test('a whirlpool spins and pulls; pads drag', () => {
  const c = buildCourse({ id: 'w', length: 300, segs: [[400]], widths: [[0, 30]], islands: [], rapids: [], whirls: [[150, 0]], pendulums: [], rocks: 0, logs: 0, pads: 0 });
  const b = createBoat(c, 148.5, 1);
  const h0 = b.h;
  const ev = [];
  for (let k = 0; k < 120; k++) step(b, DT, { course: c, t: k * DT, beat: 0.6, B: 0 }, ev);
  assert.ok(b.whirl);
  assert.ok(Math.abs(wrap(b.h - h0)) > 15 * DEG, `spun ${wrap(b.h - h0) / DEG}`);
  // pads: speed falls faster on a pad than in open water
  const p = buildCourse({ id: 'p', length: 300, segs: [[400]], widths: [[0, 30]], islands: [], rapids: [], whirls: [], pendulums: [], rocks: 0, logs: 0, pads: 0 });
  p.pads.push({ s: 100, d: 0, r: 6, ...p.point(100, 0) });
  const on = createBoat(p, 100, 0);
  const off = createBoat(p, 200, 0);
  on.v = off.v = 6;
  for (let k = 0; k < 60; k++) {
    step(on, DT, { course: p, t: k * DT, beat: 0.6, B: 0 }, ev);
    step(off, DT, { course: p, t: k * DT, beat: 0.6, B: 0 }, ev);
  }
  assert.ok(on.pad && on.v < off.v * 0.97);
});

test('random rowing for minutes on every stream: never NaN, never off the river', () => {
  for (const def of STREAMS) {
    const c = buildCourse(def);
    const song = makeSong(def.bpm);
    const r = rng(`chaos:${def.id}`);
    const b = createBoat(c, c.start, 0);
    const ev = [];
    let t = 0;
    for (let k = 0; k < 120 * 150; k++) {
      t += DT;
      if (k % 50 === 0) stroke(b, { kind: 'good', q: r.next(), level: r.int(1, 4), turn: r.pick([-1, 0, 1]) });
      step(b, DT, { course: c, t, beat: 0.6, B: t * 1.6 }, ev);
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.z) && Number.isFinite(b.h) && Number.isFinite(b.v));
      assert.ok(Math.abs(b.d) <= c.at(b.s).hw + 0.01, `${def.id} off the river at s ${b.s}`);
    }
  }
});
