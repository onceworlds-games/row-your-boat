// The room through the SDK's match, host and bots helpers on an in-memory server: rounds start with the count-in and
// the bots, finishes are checked by the host, a host who leaves hands the bots on, latecomers row the next stream.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalServer } from './fake-room.mjs';
import { createNet, cleanBoat, cleanExtras, cleanRound, easedSkill, botLift, BOT_LIFT, streamForRound, ROOM_LEAD, BOT_SKILL, NEWBIE_SKILL } from '../src/net.js';
import { courseOf } from '../src/race.js';
import { streamByN, cap } from '../src/sim/streams.js';

const flush = () => new Promise((r) => setImmediate(r));
async function advance(ms, step = 100) {
  for (let t = 0; t < ms; t += step) {
    mock.timers.tick(step);
    await flush();
  }
}

function setup(kind = 'public') {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
  return createLocalServer({ now: () => Date.now(), kind });
}

function teardown(...nets) {
  for (const n of nets) n.dispose();
  mock.timers.reset();
}

test('a solo race: one stream, five rival rowers, the first beat a breath after the match starts', async () => {
  const srv = setup('solo');
  const a = srv.join('a', 'Ann');
  const net = createNet(a);
  await advance(800);
  a.startMatch();
  await advance(1500);
  assert.equal(net.match.phase, 'round');
  const d = net.round;
  assert.ok(d, 'a round record');
  assert.equal(d.n, 1);
  const seats = net.match.seats;
  assert.equal(seats.length, 6);
  assert.equal(seats.filter((s) => s.bot).length, 5);
  assert.deepEqual(Object.values(d.slots).sort(), [0, 1, 2, 3, 4, 5]);
  for (const s of seats.filter((x) => x.bot)) assert.ok(d.bs[s.id] >= BOT_SKILL[0] && d.bs[s.id] <= BOT_SKILL[1], `bot skill ${d.bs[s.id]}`);
  // the platform's 3-2-1 was the countdown: the first beat comes ROOM_LEAD seconds after the round began
  const songT = net.songTime();
  assert.ok(songT > -ROOM_LEAD && songT < -ROOM_LEAD + 2, `song time ${songT}`);
  teardown(net);
});

test('a newcomer in the race eases the bots', async () => {
  const srv = setup('solo');
  const a = srv.join('a', 'Ann');
  a.setPresence({ r: '', nb: 1, hat: 'nightcap' });
  const net = createNet(a);
  await advance(800);
  a.startMatch();
  await advance(1500);
  const d = net.round;
  assert.equal(d.nb, 1);
  for (const v of Object.values(d.bs)) assert.ok(v >= NEWBIE_SKILL[0] - 1e-9 && v <= NEWBIE_SKILL[1] + 1e-9, `eased skill ${v}`);
  assert.equal(easedSkill(0.3, false), 0.3);
  assert.ok(Math.abs(easedSkill(BOT_SKILL[1], true) - NEWBIE_SKILL[1]) < 1e-9);
  teardown(net);
});

test('bots rise with the most seasoned rower: none at first, a little per level, capped', () => {
  assert.equal(botLift(1), 0);
  assert.equal(botLift(BOT_LIFT.from), 0);
  assert.ok(Math.abs(botLift(BOT_LIFT.from + 5) - 5 * BOT_LIFT.per) < 1e-9);
  assert.equal(botLift(99), BOT_LIFT.max);
  assert.equal(botLift(NaN), 0);
  assert.ok(BOT_SKILL[1] + BOT_LIFT.max <= 0.95, 'the best bot stays beatable');
});

test('the host refuses forged and early finishes, and takes a believable one', async () => {
  const srv = setup('public');
  const a = srv.join('a', 'Ann');
  const b = srv.join('b', 'Bo');
  const na = createNet(a, { distanceOf: () => 0 });
  const nb = createNet(b);
  await advance(800);
  a.setReady(true);
  b.setReady(true);
  await advance(1500);
  assert.equal(na.match.phase, 'round');
  const d0 = na.round;
  const course = courseOf(streamByN(d0.n));
  // ten seconds in, still at the start: a finish now is a lie
  await advance(10_000);
  b.setPresence({ r: nb.roundKey, s: course.start + 40, x: 0, z: 0, h: 0, v: 6, c: 2, k: 10, ls: 0, lq: 1, f: 0 });
  nb.finish(8);
  await advance(500);
  assert.equal(na.round.fin.b, undefined, 'an early finish is refused');
  // garbage never leaves the page
  assert.equal(nb.finish('soon'), false);
  // a finish far beyond where the boat says it is: refused
  await advance(50_000);
  nb.finish(nb.songTime() - 0.2);
  await advance(500);
  assert.equal(na.round.fin.b, undefined, 'a finish from mid-river is refused');
  // at the finish line, at a believable time: taken
  b.setPresence({ r: nb.roundKey, s: course.finish + 1, x: 0, z: 0, h: 0, v: 6, c: 2, k: 80, ls: 0, lq: 1, f: 1 });
  const t = nb.songTime() - 0.2;
  nb.finish(t);
  await advance(500);
  assert.equal(na.round.fin.b, t);
  // and only once
  nb.finish(t + 3);
  await advance(2000);
  assert.equal(na.round.fin.b, t);
  teardown(na, nb);
});

test('when the host leaves, the next host carries the bots on from the last published boats', async () => {
  const srv = setup('public');
  const a = srv.join('a', 'Ann');
  const b = srv.join('b', 'Bo');
  const na = createNet(a);
  const nb = createNet(b);
  await advance(800);
  a.setReady(true);
  b.setReady(true);
  await advance(1500);
  const bot = na.match.seats.find((s) => s.bot);
  na.publishBots({ [bot.id]: { s: 30, x: 1, z: -30, h: 0, v: 6, c: 1, k: 4, ls: 1, lq: 2, f: 0, ft: 0 } }, 3.5);
  await advance(200);
  assert.equal(nb.botStates()?.b[bot.id].s, 30, 'the others see the host’s bots');
  // a page that is not the host cannot publish
  nb.publishBots({ [bot.id]: { s: 999 } }, 4);
  await advance(200);
  assert.equal(nb.botStates()?.b[bot.id].s, 30);
  srv.drop('a');
  na.dispose();
  await advance(1500);
  assert.equal(b.isHost, true);
  assert.equal(nb.match.isHost, true, 'the new host has adopted the match');
  const st = nb.botStates();
  assert.equal(st.t, 3.5);
  assert.equal(st.b[bot.id].s, 30, 'the bots go on from where they were');
  teardown(nb);
});

test('a latecomer watches this stream and rows the next one of the cup', async () => {
  const srv = setup('public');
  srv.settings = { ...srv.settings, race: 3, stream: 1 };
  const a = srv.join('a', 'Ann');
  const na = createNet(a, { distanceOf: () => 0 });
  await advance(800);
  a.setReady(true);
  await advance(1500);
  assert.equal(na.match.round, 1);
  const c = srv.join('c', 'Cy');
  const nc = createNet(c);
  await advance(1000);
  assert.ok(!na.match.seats.some((s) => s.id === 'c'), 'not in this round');
  assert.equal(nc.match.me, null);
  // nobody finishes: the stream closes at its time cap, then the next stream starts with Cy in it
  await advance((cap(streamByN(1)) + ROOM_LEAD + 8) * 1000, 250);
  assert.equal(na.match.round, 2);
  assert.ok(na.match.seats.some((s) => s.id === 'c'), 'in the next round');
  assert.equal(na.round.n, streamForRound(1, 2));
  assert.equal(na.round.n, 2);
  teardown(na, nc);
});

test('values from other pages are checked', () => {
  const prev = cleanBoat({ s: 10, x: 1, z: 2, h: 0.1, v: 5, c: 1, k: 3, ls: 1, lq: 1, f: 0, ft: 0, y: 0 });
  const bad = cleanBoat({ s: NaN, x: 'x', z: 1e9, h: Infinity, v: 40, c: 7, k: -1, ls: 2, lq: 1.5, f: 3, ft: -5, y: null }, prev, 500);
  assert.deepEqual(bad, prev, 'every bad value keeps the last good one');
  assert.equal(cleanBoat(null, prev), prev);
  assert.equal(cleanBoat({ s: 600 }, null, 500).s, 0, 'past the end of the course');
  const plain = { nb: 0, hat: 'nightcap', body: 'rowboat', lantern: 'amber', wake: 'none', trim: 'cream', lv: 1, r: '' };
  assert.deepEqual(cleanExtras({ nb: 'yes', hat: '<img>', body: 'yacht', lantern: 'red', wake: 1, trim: null, lv: 99, r: 'x'.repeat(200) }), plain);
  assert.deepEqual(cleanExtras({ nb: 1, hat: 'beret', body: 'swan', lantern: 'rose', wake: 'stars', trim: 'gold', lv: 12, r: 'm1.2' }), { nb: 1, hat: 'beret', body: 'swan', lantern: 'rose', wake: 'stars', trim: 'gold', lv: 12, r: 'm1.2' });
  assert.equal(cleanRound({ n: 99, t0: 0 }), null);
  assert.equal(cleanRound({ n: 2, t0: 'soon' }), null);
  const r = cleanRound({ n: 2, t0: 5, slots: { a: 0, b: 'x', c: 40 }, fin: { a: 12.5, b: -1, c: 'x' }, bs: { x: 0.3, y: 5 }, nb: 1 });
  assert.deepEqual(r, { n: 2, t0: 5, slots: { a: 0 }, fin: { a: 12.5 }, nb: 1, bs: { x: 0.3 } });
});
