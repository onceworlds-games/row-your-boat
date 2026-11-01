import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STREAMS, par, cap, ROWER_NAMES } from '../src/sim/streams.js';
import { race } from './helpers.mjs';

test('a sharp rower finishes every stream near par; a clumsy one within the cap', () => {
  for (const def of STREAMS) {
    const sharp = race(def, [{ id: 'a', skill: 1 }], `sharp:${def.id}`);
    const t = sharp.fin.a;
    assert.ok(Number.isFinite(t) && t < par(def), `${def.id} sharp ${t?.toFixed(1)} vs par ${par(def).toFixed(1)}`);
    const clumsy = race(def, [{ id: 'b', skill: 0 }], `clumsy:${def.id}`);
    assert.ok(Number.isFinite(clumsy.fin.b) && clumsy.fin.b < cap(def), `${def.id} clumsy ${clumsy.fin.b}`);
    assert.ok(clumsy.fin.b > t * 1.2, `${def.id}: skill matters (${clumsy.fin.b} vs ${t})`);
    const bumps = sharp.racers[0].boat.bumps;
    assert.ok(bumps <= 12, `${def.id}: a sharp rower bumped ${bumps} times`);
  }
});

test('sharp beats clumsy in nearly every race', () => {
  let wins = 0;
  const n = 24;
  for (let i = 0; i < n; i++) {
    const def = STREAMS[i % STREAMS.length];
    const r = race(def, [{ id: 'sharp', skill: 0.85 }, { id: 'clumsy', skill: 0.15 }], `duel:${i}`);
    if (r.groups[0][0] === 'sharp') wins++;
  }
  assert.ok(wins / n > 0.9, `${wins}/${n}`);
});

test('equal rowers spread their wins (no seat or lane advantage)', () => {
  const wins = {};
  const n = 30;
  for (let i = 0; i < n; i++) {
    const def = STREAMS[i % 4];
    const entries = ['s0', 's1', 's2', 's3', 's4', 's5'].map((id) => ({ id, skill: 0.6 }));
    const r = race(def, entries, `even:${i}`);
    wins[r.groups[0][0]] = (wins[r.groups[0][0]] ?? 0) + 1;
  }
  const most = Math.max(...Object.values(wins));
  assert.ok(Object.keys(wins).length >= 4, `winners ${JSON.stringify(wins)}`);
  assert.ok(most <= n * 0.4, `one seat won ${most}/${n}`);
});

test('The Dream: rivals rise with the streams; Bedtime is beatable at a steady ×2', () => {
  let lastMid = -Infinity;
  for (const def of STREAMS) {
    const [lo, hi] = def.rivalSkill;
    assert.ok(lo < hi && lo >= -0.6 && hi <= 1);
    assert.ok((lo + hi) / 2 > lastMid, 'each dream is harder');
    lastMid = (lo + hi) / 2;
    assert.ok(def.rivals.every((n) => ROWER_NAMES.includes(n)));
  }
  const bed = STREAMS[0];
  let beaten = 0;
  for (let i = 0; i < 8; i++) {
    const entries = [{ id: 'me', skill: 0.55, cap: 2 }, ...bed.rivals.map((name, k) => ({ id: name, name, skill: bed.rivalSkill[0] + ((bed.rivalSkill[1] - bed.rivalSkill[0]) * k) / 2 }))];
    const r = race(bed, entries, `bed:${i}`);
    if (r.groups[0][0] === 'me') beaten++;
  }
  assert.ok(beaten >= 6, `a steady ×2 rower won Bedtime ${beaten}/8`);
});

test('every rower habit finishes', () => {
  for (const name of ROWER_NAMES) {
    const r = race(STREAMS[2], [{ id: name, name, skill: 0.5 }], `habit:${name}`);
    assert.ok(Number.isFinite(r.fin[name]), name);
  }
});
