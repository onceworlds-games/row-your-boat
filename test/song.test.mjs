import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSong, MELODY, BEAT_NOTES, VERSE, ROW_BEATS, BREATH, TEMPO_STEP, TEMPO_STEPS } from '../src/sim/song.js';

test('the melody fills a verse: 48 eighths, each once, in order', () => {
  let at = 0;
  for (const [e, len] of MELODY) {
    assert.equal(e, at);
    at += len;
  }
  assert.equal(at, 48);
  assert.equal(BEAT_NOTES.length, VERSE);
  assert.equal(BEAT_NOTES.flat().length, MELODY.length);
  // every beat either starts a note or sits inside a held one (stream, dream)
  BEAT_NOTES.forEach((notes, vb) => assert.ok(notes.length >= 1 || MELODY.some(([e, len]) => e < vb * 3 && e + len > vb * 3), `beat ${vb}`));
});

test('beats: 48 rowed, then a breath of 4, tempo up 4% after each breath, at most +12%', () => {
  for (const bpm of [84, 100, 132]) {
    const song = makeSong(bpm);
    const b = song.beats;
    assert.equal(b[0].t, 0);
    for (let i = 0; i < ROW_BEATS; i++) assert.equal(b[i].rest, false);
    for (let i = ROW_BEATS; i < ROW_BEATS + BREATH; i++) assert.equal(b[i].rest, true);
    assert.equal(b[ROW_BEATS + BREATH].rest, false);
    assert.equal(b[ROW_BEATS + BREATH].vb, 0, 'a verse starts after a breath');
    const base = 60 / bpm;
    assert.ok(Math.abs(b[0].dur - base) < 1e-9);
    assert.ok(Math.abs(b[ROW_BEATS + BREATH].dur - base / (1 + TEMPO_STEP)) < 1e-9);
    const last = b[b.length - 1];
    assert.ok(Math.abs(last.dur - base / (1 + TEMPO_STEP * TEMPO_STEPS)) < 1e-9, 'the tempo stops rising');
    for (let i = 1; i < b.length; i++) assert.ok(Math.abs(b[i].t - (b[i - 1].t + b[i - 1].dur)) < 1e-9, 'beats tile the song');
    assert.ok(last.t > 590);
  }
});

test('nearestRow skips breaths; indexAt and phase agree', () => {
  const song = makeSong(100);
  const rest = song.beats[ROW_BEATS];
  const near = song.nearestRow(rest.t + rest.dur * 1.5);
  assert.equal(near.rest, false);
  assert.ok(song.resting(rest.t + 0.01));
  assert.equal(song.indexAt(-0.1), -1);
  assert.equal(song.indexAt(0), 0);
  const ph = song.phase(song.beats[10].t + song.beats[10].dur / 2);
  assert.equal(ph.beat.i, 10);
  assert.ok(Math.abs(ph.f - 0.5) < 1e-9);
  assert.equal(song.count.length, 4);
  assert.ok(song.count.every((t) => t < 0));
});
