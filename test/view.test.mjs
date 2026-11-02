import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOW, replayAt, stepView } from '../src/view.js';

const boat = (s) => ({ id: 'a', x: 0, z: -s, h: 0, s, d: 0, v: 5 });

test('replay: boats between two recorded frames, the newest frame as it is', () => {
  const rec = [{ t: 0, boats: [boat(0)] }, { t: 1, boats: [boat(5)] }];
  assert.equal(replayAt(rec, 1), null);
  assert.equal(replayAt(rec, 0.5)[0].s, 2.5);
  assert.equal(replayAt(rec, -1)[0].s, 0);
  assert.equal(replayAt([], 0), null);
});

test('the finish in slow motion: the view slows, falls behind, then catches up and runs with the race again', () => {
  const st = {};
  let tv = 0;
  let perf = 0;
  const dt = 1 / 60;
  const step = () => {
    perf += dt * 1000;
    tv += dt;
    return stepView(st, { perf, dt, tv, boats: [boat(tv * 5)] });
  };
  for (let i = 0; i < 60; i++) assert.equal(step().rate, 1);
  st.slow = { at: perf, secs: SLOW.win };
  const early = step();
  assert.ok(early.rate < 0.3, `slow ${early.rate}`);
  let v = early;
  for (let i = 0; i < SLOW.win * 60; i++) v = step();
  assert.ok(st.lag > 0.5, `behind by ${st.lag}`);
  assert.ok(v.boats[0].s < tv * 5 - 2, 'drawn from the record, behind the race');
  let fastest = 1;
  for (let i = 0; i < 60 * 20 && st.lag > 0; i++) fastest = Math.max(fastest, step().rate);
  assert.equal(st.lag, 0);
  assert.ok(fastest > 1 && fastest <= 1 + SLOW.catchMax + 1e-9, `catch-up ${fastest}`);
  const after = step();
  assert.equal(after.rate, 1);
  assert.equal(after.vt, tv);
});

test('a pause holds the view as it is', () => {
  const st = { slow: { at: 0, secs: 1 } };
  const v = stepView(st, { perf: 10, dt: 0.1, tv: 3, boats: [boat(1)], paused: true });
  assert.equal(v.rate, 1);
  assert.equal(st.lag, 0);
});
