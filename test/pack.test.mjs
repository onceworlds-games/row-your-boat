import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packForm, PACK, botParams } from '../src/sim/bot.js';
import { createRaceSim } from '../src/race.js';
import { STREAMS, ROWER_NAMES, par } from '../src/sim/streams.js';
import { raceOver } from '../src/sim/race.js';
import { BOT_SKILL } from '../src/net.js';
import { race } from './helpers.mjs';

test('pack form: as it is near the leading player, looser far ahead, sharper far behind, within limits', () => {
  assert.equal(packForm(0), 1);
  assert.equal(packForm(PACK.free), 1);
  assert.equal(packForm(-PACK.free), 1);
  assert.ok(packForm(PACK.free + 10) > 1 && packForm(PACK.free + 10) < packForm(PACK.free + 20));
  assert.ok(packForm(-PACK.free - 10) < 1 && packForm(-PACK.free - 10) > packForm(-PACK.free - 20));
  assert.equal(packForm(500), 1 + PACK.loose);
  assert.equal(packForm(-500), 1 - PACK.sharp);
  assert.equal(packForm(NaN), 1);
});

test('the skill curve is flat through the middle: rowers from 0.3 up race within a few seconds', () => {
  for (const def of STREAMS.slice(0, 4)) {
    const time = (k) => {
      let sum = 0;
      for (let seed = 0; seed < 3; seed++) sum += race(def, [{ id: 'a', skill: k, name: 'X' }], `flat:${def.id}:${k}:${seed}`).fin.a;
      return sum / 3;
    };
    const sharp = time(1);
    const mid = time(0.3);
    assert.ok(mid < sharp * 1.12, `${def.id}: 0.3 rows ${mid.toFixed(1)} s vs sharp ${sharp.toFixed(1)} s`);
    assert.ok(botParams(0.3).sigma - botParams(0.6).sigma < 0.02);
  }
});

/** A room race through race.js: a player rowing at `me` skill and five bots across the room's range. */
function roomRace(def, me, seed) {
  const seats = [{ id: 'me', name: 'Me', bot: false, slot: 0 }];
  for (let i = 0; i < 5; i++) seats.push({ id: `b${i}`, name: ROWER_NAMES[(i + seed) % 6], bot: true, skill: BOT_SKILL[0] + ((BOT_SKILL[1] - BOT_SKILL[0]) * i) / 4, slot: i + 1 });
  const sim = createRaceSim({ n: def.n, seats, me: 'me', key: `room:${def.id}:${seed}`, pilot: me });
  for (const s of seats) if (s.bot) sim.simulate(s.id);
  const fin = {};
  for (let t = -2; t < par(def) * 3; t += 0.05) {
    for (const { id, ev } of sim.step(t)) if (ev.type === 'finish') fin[id] = ev.t;
    if (raceOver(def, fin, seats.map((s) => s.id), t)) break;
  }
  return fin;
}

test('room races are pack fights: the first four within seconds, a mid player places anywhere', () => {
  const places = new Set();
  let tight = 0;
  let n = 0;
  for (const def of STREAMS) {
    for (let seed = 0; seed < 2; seed++) {
      const fin = roomRace(def, 0.45, seed);
      const ts = Object.values(fin).sort((a, b) => a - b);
      assert.equal(ts.length, 6, `${def.id}:${seed}: everyone finishes`);
      if (ts[3] - ts[0] < 8) tight++;
      places.add(Object.entries(fin).sort((a, b) => a[1] - b[1]).findIndex(([id]) => id === 'me'));
      n++;
    }
  }
  assert.ok(tight / n >= 0.75, `the first four within 8 s in ${tight}/${n}`);
  assert.ok(places.size >= 3, `a mid player's places: ${[...places].join(',')}`);
});
