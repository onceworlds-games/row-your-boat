import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSong, ROW_BEATS } from '../src/sim/song.js';
import { createJudge, PERFECT, GOOD } from '../src/sim/judge.js';
import { rng } from '../src/sim/rng.js';

const song = makeSong(100);
const T = (i) => song.beats[i].t;

test('window edges: perfect ±45 ms, good ±110 ms, splash beyond', () => {
  const cases = [
    [0, 'perfect'], [0.044, 'perfect'], [-0.044, 'perfect'], [0.046, 'good'], [-0.109, 'good'], [0.109, 'good'], [0.112, 'splash'], [-0.112, 'splash'],
  ];
  for (const [dt, want] of cases) {
    const j = createJudge(song);
    const r = j.stroke(1, T(3) + dt);
    assert.equal(r.kind, want, `delta ${dt}`);
  }
});

test('ease widens both windows (the first race, the first stream)', () => {
  const j = createJudge(song, { ease: 1.3 });
  assert.equal(j.stroke(1, T(2) + 0.055).kind, 'perfect');
  assert.equal(j.stroke(-1, T(3) + 0.14).kind, 'good');
  assert.ok(Math.abs(j.windows.good - GOOD * 1.3) < 1e-12);
});

test('combo: a lantern every 4 on-beat strokes, ×4 at 12', () => {
  const j = createJudge(song);
  const levels = [];
  for (let i = 0; i < 14; i++) levels.push(j.stroke(i % 2 ? 1 : -1, T(i)).level);
  assert.deepEqual(levels, [1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4]);
  assert.equal(j.state.bestLevel, 4);
});

test('a miss puts one lantern out; a splash puts all but one out', () => {
  const j = createJudge(song);
  for (let i = 0; i < 12; i++) j.stroke(i % 2 ? 1 : -1, T(i));
  assert.equal(j.state.level, 4);
  const misses = j.advance(T(12) + GOOD + 0.01);
  assert.equal(misses.length, 1);
  assert.equal(misses[0].kind, 'miss');
  assert.equal(j.state.level, 3);
  j.stroke(1, T(13));
  const r = j.stroke(-1, T(14) - 0.2);
  assert.equal(r.kind, 'splash');
  assert.equal(j.state.level, 1);
  assert.equal(j.state.miss, 1);
  assert.equal(j.state.splash, 1);
});

test('one stroke per beat: a second tap is a splash, the other oar at once is both oars', () => {
  const j = createJudge(song);
  assert.equal(j.stroke(1, T(1)).kind, 'perfect');
  const both = j.stroke(-1, T(1) + 0.03);
  assert.equal(both.kind, 'both');
  assert.equal(both.turn, -1, 'the second oar cancels the first one\'s turn');
  assert.equal(j.stroke(1, T(1) + 0.08).kind, 'splash', 'a third tap on the same beat');
  const k = createJudge(song);
  k.stroke(1, T(1));
  assert.equal(k.stroke(1, T(1) + 0.03).kind, 'splash', 'the same oar twice');
});

test('strokes long before the start are ignored; breaths are free strokes that keep the combo', () => {
  const j = createJudge(song);
  assert.equal(j.stroke(1, -1).kind, 'early');
  assert.equal(j.state.splash, 0);
  for (let i = 0; i < ROW_BEATS; i++) j.stroke(i % 2 ? 1 : -1, T(i));
  const lvl = j.state.level;
  const mid = song.beats[ROW_BEATS + 1].t + 0.02;
  const r = j.stroke(1, mid);
  assert.equal(r.kind, 'free');
  assert.equal(j.state.level, lvl);
  assert.equal(j.advance(song.beats[ROW_BEATS + 3].t + 0.3).length, 0, 'no misses in a breath');
});

test('jittered taps: hit rates follow the windows (σ 30 ms and 70 ms players)', () => {
  for (const [sigma, minPerfect, maxPerfect, minGood] of [[0.03, 0.75, 0.95, 0.99], [0.07, 0.35, 0.6, 0.85]]) {
    const r = rng(`jitter:${sigma}`);
    const j = createJudge(song);
    let n = 0;
    for (let i = 0; i < 600; i++) {
      if (song.beats[i].rest) continue;
      n++;
      j.stroke(i % 2 ? 1 : -1, song.beats[i].t + r.normal() * sigma);
    }
    j.advance(song.beats[600].t);
    const s = j.state;
    assert.equal(s.perfect + s.good + s.splash + s.miss, n, 'every beat accounted for once');
    assert.ok(s.perfect / n > minPerfect && s.perfect / n < maxPerfect, `perfect share ${s.perfect / n} at σ ${sigma}`);
    assert.ok((s.perfect + s.good) / n > minGood, `on-beat share at σ ${sigma}`);
  }
});

test('a late player (input lag) is fixed by the calibration offset', () => {
  const r = rng('lag');
  const raw = createJudge(song);
  const cal = createJudge(song, { offset: 0.09 });
  let a = 0;
  let b = 0;
  for (let i = 0; i < 200; i++) {
    if (song.beats[i].rest) continue;
    const t = song.beats[i].t + 0.09 + r.normal() * 0.02;
    if (raw.stroke(1, t).kind === 'perfect') a++;
    if (cal.stroke(1, t).kind === 'perfect') b++;
  }
  assert.ok(a < 20 && b > 150, `${a} vs ${b}`);
});

test('rhythm score and perfect runs', () => {
  const j = createJudge(song);
  for (let i = 0; i < 16; i++) j.stroke(1, T(i));
  assert.equal(j.state.bestRun, 16);
  assert.equal(j.rhythm(), 1);
  j.stroke(1, T(16) + 0.08);
  assert.equal(j.state.run, 0);
  assert.ok(j.rhythm() < 1 && j.rhythm() > 0.9);
  assert.ok(PERFECT < GOOD);
});

test('a late tap after its beat was missed is an extra, not a second judgement', () => {
  const j = createJudge(song);
  j.stroke(1, T(0));
  const r = j.stroke(-1, T(1) + 0.2);
  assert.equal(r.kind, 'splash');
  assert.equal(j.state.miss, 1);
  assert.equal(j.state.splash, 0);
  assert.equal(j.state.extra, 1);
  assert.equal(j.judged(), 2);
});
