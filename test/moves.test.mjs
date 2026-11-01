// The song as a chart: gold beats and pulls, the merrily droplets and rushes, moonblooms, close shaves, the score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSong, GOLD_VB, RUSH_VB, RUSH_NOTES, VERSE } from '../src/sim/song.js';
import { createJudge, CHORD, PULL, DROP } from '../src/sim/judge.js';
import { buildCourse } from '../src/sim/course.js';
import { createBoat, step, stroke, DT, BLOOM_R, BLOOM_PUSH, DROP_PUSH, RUSH_PUSH, SHAVE, SHAVE_PUSH, YAW, DROP_TURN } from '../src/sim/boat.js';
import { createScore, POINTS } from '../src/sim/score.js';
import { STREAMS } from '../src/sim/streams.js';

const song = makeSong(100);
const rowed = song.beats.filter((b) => !b.rest);

test('gold beats are the long notes (Row, stream, dream); the merrily bar has two droplets a beat', () => {
  for (const b of rowed.slice(0, VERSE * 3)) {
    assert.equal(b.gold, GOLD_VB.includes(b.vb));
    assert.equal(b.rush, RUSH_VB.includes(b.vb));
  }
  assert.equal(song.drops.length, rowed.filter((b) => b.rush).length * 2);
  const b = rowed.find((x) => x.rush);
  const [d1, d2] = song.drops.filter((d) => d.beat === b.i);
  assert.ok(Math.abs(d1.t - (b.t + b.dur / 3)) < 1e-9 && Math.abs(d2.t - (b.t + (2 * b.dur) / 3)) < 1e-9);
  assert.equal(song.nearestDrop(d2.t + 0.01).n, d2.n);
  assert.equal(RUSH_NOTES, RUSH_VB.length * 3);
});

test('both oars on a gold beat pull; on a plain beat they only row straight', () => {
  const gold = rowed.find((b) => b.gold);
  const plain = rowed.find((b) => !b.gold && !b.rush && b.i > 2);
  const j = createJudge(song);
  assert.equal(j.stroke(-1, gold.t).kind, 'perfect');
  const p = j.stroke(1, gold.t + CHORD * 0.5);
  assert.equal(p.kind, 'pull');
  assert.ok(Math.abs(p.q - PULL) < 1e-9);
  assert.equal(j.state.pulls, 1);
  j.stroke(-1, plain.t);
  assert.equal(j.stroke(1, plain.t + 0.01).kind, 'both');
  // too far apart: the second is just a stray stroke
  const gold2 = rowed.filter((b) => b.gold)[1];
  j.stroke(-1, gold2.t);
  assert.notEqual(j.stroke(1, gold2.t + CHORD + 0.02).kind, 'pull');
});

test('a pull surges harder than a stroke and cancels the turn', () => {
  const flat = buildCourse({ id: 'flat', length: 400, segs: [[500]], widths: [[0, 40]], islands: [], rapids: [], whirls: [], pendulums: [], rocks: 0, logs: 0, pads: 0 });
  const a = createBoat(flat, 30, 0);
  const b = createBoat(flat, 30, 0);
  a.v = b.v = 4;
  stroke(a, { kind: 'perfect', q: 1, level: 3, turn: -1 });
  stroke(b, { kind: 'perfect', q: 1, level: 3, turn: -1 });
  stroke(b, { kind: 'pull', q: PULL, level: 3, turn: 1 });
  assert.ok(b.v > a.v + 0.3, `${b.v} vs ${a.v}`);
  assert.ok(Math.abs(b.yaw) < 1e-9);
});

test('droplets: a narrow window between the beats, a small push and turn, the combo kept; twelve notes make a rush', () => {
  const j = createJudge(song);
  const first = rowed.findIndex((b) => b.rush);
  // row up to the merrily bar on the beat
  for (let i = 0; i < first; i++) j.stroke(i % 2 ? 1 : -1, rowed[i].t);
  const level = j.state.level;
  let rush = null;
  let side = 1;
  for (const b of rowed.slice(first, first + RUSH_VB.length)) {
    const r = j.stroke(side, b.t);
    assert.equal(r.kind, 'perfect');
    if (r.rush) rush = r;
    for (const d of song.drops.filter((x) => x.beat === b.i)) {
      side = -side;
      const r2 = j.stroke(side, d.t + DROP * 0.8);
      assert.equal(r2.kind, 'drop');
      if (r2.rush) rush = r2;
    }
    side = -side;
  }
  assert.ok(rush, 'all twelve: a rush');
  assert.equal(j.state.drops, 8);
  assert.equal(j.state.rushes, 1);
  assert.ok(j.state.level >= level, 'droplets never cost the combo');
  // outside its window a tap between the beats is a splash
  const j2 = createJudge(song);
  const b = rowed[first];
  j2.stroke(1, b.t);
  assert.equal(j2.stroke(-1, song.drops.find((d) => d.beat === b.i).t + DROP * 1.6).kind, 'splash');
  // a droplet can't be taken twice
  const j3 = createJudge(song);
  const d = song.drops[0];
  assert.equal(j3.stroke(1, d.t).kind, 'drop');
  assert.notEqual(j3.stroke(-1, d.t + 0.01).kind, 'drop');
  // the boat feels a droplet and a rush
  const flat = buildCourse({ id: 'flat', length: 400, segs: [[500]], widths: [[0, 40]], islands: [], rapids: [], whirls: [], pendulums: [], rocks: 0, logs: 0, pads: 0 });
  const boat = createBoat(flat, 30, 0);
  boat.v = 5;
  stroke(boat, { kind: 'drop', q: 0, turn: 1, level: 2 });
  assert.ok(Math.abs(boat.v - (5 + DROP_PUSH)) < 1e-9);
  assert.ok(Math.abs(boat.yaw - YAW * DROP_TURN) < 1e-9);
  stroke(boat, { kind: 'drop', q: 0, turn: -1, level: 2, rush: true });
  assert.ok(Math.abs(boat.v - (5 + 2 * DROP_PUSH + RUSH_PUSH)) < 1e-9);
});

test("a missed note breaks that verse's rush; the next verse starts afresh", () => {
  const j = createJudge(song);
  const bar = rowed.filter((b) => b.rush);
  // verse 1: skip one droplet
  const v1 = bar.slice(0, 4);
  let n = 0;
  for (const b of v1) {
    j.stroke(1, b.t);
    for (const d of song.drops.filter((x) => x.beat === b.i)) if (n++ !== 3) j.stroke(-1, d.t);
  }
  assert.equal(j.state.rushes, 0);
  for (const b of bar.slice(4, 8)) {
    j.stroke(1, b.t);
    for (const d of song.drops.filter((x) => x.beat === b.i)) j.stroke(-1, d.t);
  }
  assert.equal(j.state.rushes, 1);
});

test('moonblooms: every stream has lines of them, clear of solid things; sailing over one takes it once', () => {
  for (const def of STREAMS) {
    const c = buildCourse(def);
    assert.ok(c.blooms.length >= def.length / 12, `${def.id}: ${c.blooms.length} blooms`);
    for (const m of c.blooms) {
      assert.ok(m.s > c.start && m.s < c.finish, `${def.id} bloom at ${m.s}`);
      assert.ok(Math.abs(m.d) < c.at(m.s).hw - 0.6, `${def.id} bloom in the bank`);
      for (const o of c.rocks) assert.ok(Math.hypot(o.s - m.s, o.d - m.d) >= o.r + 0.99, `${def.id} bloom in a rock`);
      const isl = c.islandAt(m.s);
      if (isl) assert.ok(Math.abs(m.d - isl.c) >= isl.half, `${def.id} bloom on an island`);
    }
    for (let i = 1; i < c.blooms.length; i++) assert.ok(c.blooms[i].s >= c.blooms[i - 1].s, 'sorted along the river');
  }
  const c = buildCourse(STREAMS[0]);
  const m = c.blooms[0];
  const b = createBoat(c, m.s - 0.5, m.d);
  b.v = 0;
  const ev = [];
  step(b, DT, { course: c, t: 1, beat: 0.6, resting: false, B: 1 }, ev);
  assert.equal(ev.filter((e) => e.type === 'bloom').length, 1);
  assert.equal(b.blooms, 1);
  assert.ok(b.v >= BLOOM_PUSH * 0.9);
  const ev2 = [];
  step(b, DT, { course: c, t: 1 + DT, beat: 0.6, resting: false, B: 1 }, ev2);
  assert.equal(ev2.filter((e) => e.type === 'bloom').length, 0, 'taken once');
  assert.ok(BLOOM_R > 1 && BLOOM_R < 1.6);
});

test("a close shave pays for passing a rock within a hand's width; a touch pays nothing", () => {
  const rockCourse = (d) => {
    const c = buildCourse({ id: 'flat', length: 400, segs: [[500]], widths: [[0, 30]], islands: [], rapids: [], whirls: [], pendulums: [], rocks: 0, logs: 0, pads: 0 });
    const p = c.point(80, d);
    c.rocks.push({ s: 80, d, r: 1, x: p.x, z: p.z });
    c.blooms.length = 0;
    return c;
  };
  const sail = (gap) => {
    // the hull is two circles of HULL_R 0.7 on the centre line: a rock of r 1 at d = 1.7 + gap leaves `gap`
    const c = rockCourse(1 + 0.7 + gap);
    const b = createBoat(c, 70, 0);
    const ev = [];
    let t = 0;
    for (let k = 0; k < 600; k++) {
      t += DT;
      b.v = 6;
      step(b, DT, { course: c, t, beat: 0.6, resting: false, B: t / 0.6 }, ev);
    }
    return { shaves: ev.filter((e) => e.type === 'shave').length, bumps: ev.filter((e) => e.type === 'bump').length };
  };
  assert.deepEqual(sail(SHAVE * 0.5), { shaves: 1, bumps: 0 });
  assert.deepEqual(sail(SHAVE * 2), { shaves: 0, bumps: 0 });
  const hit = sail(-0.3);
  assert.equal(hit.shaves, 0);
  assert.ok(hit.bumps >= 1);
  assert.ok(SHAVE_PUSH > 0);
});

test('score: rhythm multiplied by the lanterns lit, the rest flat; never below zero', () => {
  const sc = createScore();
  assert.equal(sc.add('perfect', 4), POINTS.perfect * 4);
  assert.equal(sc.add('bloom', 4), POINTS.bloom);
  assert.equal(sc.add('nothing', 1), 0);
  const got = sc.events([
    { type: 'stroke', res: { kind: 'drop', level: 2, rush: true } },
    { type: 'shave' },
    { type: 'stroke', res: { kind: 'splash', level: 1 } },
  ]);
  assert.equal(got, POINTS.drop * 2 + POINTS.rush + POINTS.shave);
  const low = createScore();
  low.add('bump');
  assert.equal(low.state.total, 0);
});
