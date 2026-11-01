// Every sound in the game, synthesized in Web Audio, and the audio clock that strokes are judged on.
//
// The clock: `heard(perfMs)` is the AudioContext time of the sound reaching the player's ears at that performance.now()
// moment (getOutputTimestamp, or currentTime minus the output and base latency), smoothed. The song is scheduled on the
// context at anchor + song time, so the ripples, the judge and the music all follow one clock.

import { BEAT_NOTES } from './sim/song.js';

let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let noise = null;
let failed = false;
let off = null; // smoothed (heard context time - perf seconds)
let lastClock = 0;
const beds = {};

const freq = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function make() {
  if (ctx || failed) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      failed = true;
      return null;
    }
    ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    // last, a soft clip: unity for normal levels, loud moments (a finish over a full round) round off below 1 instead of
    // clipping. The shaper's input is scaled by 1/4 so its curve covers ±4.
    const pre = ctx.createGain();
    pre.gain.value = 0.25;
    const soft = ctx.createWaveShaper();
    const curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 4);
    soft.curve = curve;
    soft.oversample = '2x';
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(comp).connect(pre).connect(soft).connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.5;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    const len = Math.floor(ctx.sampleRate * 2);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (err) {
    console.warn('[row] no audio', err);
    failed = true;
    ctx = null;
  }
  return ctx;
}

/** Start (or resume) sound: call from a tap or key press in the game. */
function start() {
  const c = make();
  if (!c) return;
  try {
    const p = c.resume?.();
    if (p && p.catch) p.catch(() => {});
  } catch {}
  try {
    // iOS: a silent buffer played from the gesture unlocks output.
    const b = c.createBuffer(1, 1, c.sampleRate);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  } catch {}
  startBeds();
}

const running = () => !!ctx && ctx.state === 'running';

/** Re-estimate the heard clock (call once a frame). */
function sampleClock(perf = performance.now()) {
  if (!running()) {
    off = null;
    return;
  }
  if (perf - lastClock < 4) return;
  lastClock = perf;
  let est = null;
  try {
    const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
    if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
      const e = ts.contextTime - ts.performanceTime / 1000;
      const h = e + perf / 1000;
      if (h <= ctx.currentTime + 0.02 && h > ctx.currentTime - 0.6) est = e;
    }
  } catch {}
  if (est === null) {
    const lat = (Number(ctx.outputLatency) || 0) + (Number(ctx.baseLatency) || 0);
    est = ctx.currentTime - clamp(lat, 0, 0.5) - perf / 1000;
  }
  if (off === null || Math.abs(est - off) > 0.05) off = est;
  else off += (est - off) * 0.06;
}

/** The context time heard at `perf` (ms, performance.now() clock), or null with no running audio. */
const heard = (perf) => (off === null || !running() ? null : off + perf / 1000);

// ---------------------------------------------------------------- building blocks

function out(bus, pan) {
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    p.connect(bus);
    return p;
  }
  return bus;
}

function env(g, t, a, peak, decay, hold = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + decay);
}

function tone(type, f, t, { vol = 0.2, a = 0.004, decay = 0.4, hold = 0, pan = 0, bus = sfxBus, to = null, toAt = 0, filter = null, q = 1, detune = 0 } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (detune) o.detune.value = detune;
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + (toAt || decay));
  const g = ctx.createGain();
  env(g, t, a, vol, decay, hold);
  let node = o;
  if (filter) {
    const fl = ctx.createBiquadFilter();
    fl.type = filter[0];
    fl.frequency.value = filter[1];
    fl.Q.value = q;
    node.connect(fl);
    node = fl;
  }
  node.connect(g).connect(out(bus, pan));
  o.start(t);
  o.stop(t + a + hold + decay + 0.05);
}

function hiss(t, { vol = 0.2, a = 0.005, decay = 0.25, type = 'bandpass', f = 1500, to = null, q = 0.8, pan = 0, bus = sfxBus, rate = 1 } = {}) {
  if (!ctx) return;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  s.playbackRate.value = rate;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (to) fl.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + a + decay);
  fl.Q.value = q;
  const g = ctx.createGain();
  env(g, t, a, vol, decay);
  s.connect(fl).connect(g).connect(out(bus, pan));
  const offset = Math.random() * 1.5;
  s.start(t, offset);
  s.stop(t + a + decay + 0.05);
}

const at = (t) => (t === undefined || t === null ? ctx.currentTime + 0.005 : Math.max(ctx.currentTime, t));

// ---------------------------------------------------------------- instruments

const TIMBRES = {
  box(m, t, vol, pan, len, bus) {
    tone('sine', freq(m), t, { vol: vol * 0.55, decay: 0.9 + len * 0.15, pan, bus });
    tone('sine', freq(m) * 4, t, { vol: vol * 0.12, decay: 0.25, pan, bus });
    tone('triangle', freq(m), t, { vol: vol * 0.18, decay: 0.3, pan, bus });
  },
  flute(m, t, vol, pan, len, bus) {
    tone('sine', freq(m), t, { vol: vol * 0.42, a: 0.03, hold: len * 0.12, decay: 0.35, pan, bus });
    tone('triangle', freq(m) * 2, t, { vol: vol * 0.05, a: 0.03, hold: len * 0.1, decay: 0.2, pan, bus });
  },
  reed(m, t, vol, pan, len, bus) {
    tone('square', freq(m), t, { vol: vol * 0.13, a: 0.015, hold: len * 0.1, decay: 0.3, pan, bus, filter: ['lowpass', 1400], q: 0.7 });
  },
  glock(m, t, vol, pan, len, bus) {
    tone('sine', freq(m + 12), t, { vol: vol * 0.32, decay: 0.7, pan, bus });
    tone('sine', freq(m + 12) * 2.76, t, { vol: vol * 0.07, decay: 0.18, pan, bus });
  },
  harp(m, t, vol, pan, len, bus) {
    tone('triangle', freq(m), t, { vol: vol * 0.4, decay: 0.8, pan, bus, filter: ['lowpass', 2600] });
    tone('sine', freq(m) * 2, t, { vol: vol * 0.1, decay: 0.35, pan, bus });
  },
  hum(m, t, vol, pan, len, bus) {
    tone('sawtooth', freq(m), t, { vol: vol * 0.1, a: 0.05, hold: len * 0.12, decay: 0.3, pan, bus, filter: ['lowpass', 700], q: 1.5 });
    tone('sine', freq(m), t, { vol: vol * 0.2, a: 0.05, hold: len * 0.12, decay: 0.3, pan, bus });
  },
};
export const VOICES = ['box', 'flute', 'glock', 'reed', 'harp', 'hum'];

function bell(m, t, vol = 0.2, pan = 0, bus = musicBus) {
  const f = freq(m);
  tone('sine', f, t, { vol, decay: 1.8, pan, bus });
  tone('sine', f * 2.76, t, { vol: vol * 0.35, decay: 0.9, pan, bus });
  tone('sine', f * 5.4, t, { vol: vol * 0.15, decay: 0.4, pan, bus });
}

function tock(t, vol = 0.18, accent = false) {
  tone('sine', accent ? 1250 : 1050, t, { vol, decay: 0.05, to: accent ? 900 : 760, toAt: 0.05, bus: musicBus });
  hiss(t, { vol: vol * 0.5, decay: 0.03, f: 2400, q: 2, bus: musicBus });
}

function pad(ms, t, dur, vol) {
  for (const m of ms) {
    for (const det of [-7, 7]) tone('sawtooth', freq(m), t, { vol: vol * 0.05, a: 0.25, hold: Math.max(0, dur - 0.4), decay: 0.5, bus: musicBus, filter: ['lowpass', 1100], detune: det });
  }
}

function cello(m, t, dur, vol) {
  tone('sawtooth', freq(m), t, { vol: vol * 0.16, a: 0.03, hold: dur * 0.5, decay: dur * 0.5, bus: musicBus, filter: ['lowpass', 520], q: 0.9 });
}

// ---------------------------------------------------------------- the song scheduler

/** The harmony of a verse beat: I everywhere, V on "life is but a". */
const chordOf = (vb) => (vb === 12 || vb === 13 ? [7, 11, 14] : [0, 4, 7]);

let sched = { key: '', next: -99, anchor: null };

/**
 * Schedule the song a little ahead: call every frame while a race (or the menu tune) plays. o: { key (a new key starts
 * over), song, anchor (context time of song 0), tonic (midi), level (1-4, the player's combo), voices: [{ lag (beats),
 * oct, vol, pan, timbre }], menu (the slow tune: the melody played by itself) }.
 */
function schedule(o) {
  if (!running() || o.anchor === null || o.anchor === undefined) return;
  const ahead = ctx.currentTime + 0.18;
  if (o.key !== sched.key || Math.abs((sched.anchor ?? o.anchor) - o.anchor) > 0.05) {
    // A new song, or a jump: start from the first beat still to come.
    const now = ctx.currentTime - o.anchor;
    let i = -o.song.count.length;
    if (now > 0) i = Math.max(0, o.song.indexAt(now) + 1);
    else while (i < 0 && o.song.count[o.song.count.length + i] < now) i++;
    sched = { key: o.key, next: i, anchor: o.anchor };
  }
  sched.anchor = o.anchor;
  const song = o.song;
  let guard = 0;
  while (guard++ < 16) {
    const i = sched.next;
    let bt;
    let beat = null;
    if (i < 0) bt = song.count[song.count.length + i];
    else {
      beat = song.beats[i];
      if (!beat) return;
      bt = beat.t;
    }
    const t = o.anchor + bt;
    if (t > ahead) return;
    sched.next++;
    if (t < ctx.currentTime - 0.03) continue;
    playBeat(o, i, beat, t);
  }
}

function playBeat(o, i, beat, t) {
  const tonic = o.tonic;
  const base = o.song.base;
  if (!beat) {
    // The count-in: a soft tock, then three tuned bells.
    const k = o.song.count.length + i; // 0..3
    if (o.menu) return;
    tock(t, 0.14, k > 0);
    if (k > 0) bell(tonic + [0, 4, 7][k - 1] + 12, t, 0.16);
    return;
  }
  const dur = beat.dur;
  const eighth = dur / 3;
  if (beat.rest) {
    // A breath: a held chord and wind chimes.
    if (beat.k === 0) {
      pad([tonic - 12, tonic - 5, tonic + 4], t, dur * 4, o.menu ? 0.5 : 0.8);
      for (let n = 0; n < 6; n++) bell(tonic + 24 + [0, 2, 4, 7, 9, 12][(n * 5) % 6], t + n * dur * 0.6 + Math.random() * 0.1, 0.05);
    }
    return;
  }
  const vb = beat.vb;
  const chord = chordOf(vb);
  const level = o.menu ? 1 : clamp(o.level ?? 1, 1, 4);
  const down = vb % 2 === 0;
  // The oarlock's tock on every beat: the metronome; a gold beat rings a warm bell under it (both oars there).
  if (!o.menu) tock(t, down ? 0.16 : 0.11, down);
  if (!o.menu && beat.gold) {
    bell(tonic + chord[0], t, 0.09, 0, musicBus);
    tone('sine', freq(tonic - 12 + chord[0]), t, { vol: 0.12, decay: 0.6, bus: musicBus });
  }
  // Bass on the downbeat.
  if (down) TIMBRES.harp(tonic - 24 + chord[0], t, o.menu ? 0.35 : 0.5, 0, 3, musicBus);
  if (o.menu) {
    for (const [e, len, semi] of BEAT_NOTES[vb]) TIMBRES.box(tonic + 12 + semi, t + e * eighth, 0.38, 0, len, musicBus);
    if (vb % 4 === 0) pad(chord.map((c) => tonic - 12 + c), t, base * 4, 0.35);
    return;
  }
  if (level >= 2) for (let k = 0; k < 3; k++) TIMBRES.harp(tonic + chord[k] + (k === 2 && vb % 4 >= 2 ? 12 : 0), t + k * eighth, 0.22, k - 1, 1, musicBus);
  if (level >= 3) {
    if (vb % 4 === 0) pad(chord.map((c) => tonic - 12 + c), t, dur * 4, 0.6);
    cello(tonic - 24 + chord[0], t, dur * 0.9, 0.7);
  }
  if (level >= 4 && down) {
    bell(tonic + 24 + chord[2] - 12, t, 0.07);
    if (vb % 4 === 0) TIMBRES.hum(tonic + chord[1], t, 0.5, 0, 12, musicBus);
  }
  // The round: the other boats sing the tune behind the player.
  for (const v of o.voices ?? []) {
    if (!v || v.vol <= 0.01) continue;
    const row = beat.row - v.lag;
    if (row < 0) continue;
    const notes = BEAT_NOTES[row % 16];
    const play = TIMBRES[v.timbre] ?? TIMBRES.flute;
    for (const [e, len, semi] of notes) play(tonic + 12 * (v.oct ?? 0) + semi, t + e * eighth, 0.5 * v.vol, v.pan ?? 0, len, musicBus);
  }
}

// ---------------------------------------------------------------- the player's strokes

/**
 * A stroke sings: the beat's melody notes, the first at the stroke and the rest on time. res: the judge's result; beatCtx:
 * the context time of the beat; strokeCtx: of the stroke.
 */
function stroke(res, { beatCtx, strokeCtx, tonic, side = 0 } = {}) {
  if (!running()) return;
  const now = at(strokeCtx);
  const pan = side * 0.35;
  const kind = res.kind;
  if (kind === 'splash') {
    tone('sine', 150, now, { vol: 0.32, decay: 0.22, to: 62, pan });
    hiss(now, { vol: 0.28, decay: 0.35, f: 900, to: 350, q: 0.6, pan });
    hiss(now + 0.03, { vol: 0.12, decay: 0.25, f: 3000, q: 0.5, pan });
    return;
  }
  if (kind === 'early') return;
  if (kind === 'pull') {
    // both oars dig in on a gold beat: a deep whoomp, the water rushing, a gold chord over the tune
    tone('sine', 110, now, { vol: 0.34, decay: 0.32, to: 55, pan: 0 });
    hiss(now, { vol: 0.2, decay: 0.5, type: 'lowpass', f: 500, to: 2600, q: 0.7 });
    for (const [k, semi] of [0, 7, 12, 16].entries()) bell(tonic + 12 + semi, now + 0.03 + k * 0.025, 0.07, (k - 1.5) * 0.3, sfxBus);
    if (res.rush) fx.rush(tonic);
    return;
  }
  if (kind === 'drop') {
    // a droplet plays its own note of the merrily bar
    const dp = res.drop;
    const b = dp ? BEAT_NOTES[dp.vb] : null;
    const note = b?.find(([e]) => e === dp.k);
    const semi = note ? note[2] : 12;
    tone('sine', 1700 + dp?.k * 300, now, { vol: 0.05, decay: 0.05, to: 900, pan });
    TIMBRES.box(tonic + 12 + semi, now, 0.8, pan, 1, musicBus);
    TIMBRES.glock(tonic + semi, now, 0.22, pan, 1, sfxBus);
    if (res.rush) fx.rush(tonic);
    return;
  }
  // water: a clean plip, a fuller splash for both oars
  const full = kind === 'both';
  tone('sine', 1300, now, { vol: kind === 'perfect' ? 0.12 : 0.08, decay: 0.07, to: 520, pan });
  hiss(now, { vol: full ? 0.14 : 0.09, decay: full ? 0.3 : 0.18, f: 2200, to: 900, q: 0.7, pan });
  if (kind === 'free' || full) return;
  if (kind === 'perfect') for (let k = 0; k < 3; k++) tone('sine', 2600 + k * 700 + Math.random() * 200, now + 0.02 + k * 0.035, { vol: 0.035, decay: 0.12, pan: pan * 2 });
  const beat = res.beat;
  if (!beat || beat.vb < 0) return;
  const vel = kind === 'perfect' ? 0.95 : 0.6;
  const eighth = beat.dur / 3;
  // in the merrily bar the droplets play the notes between the beats themselves
  const notes = beat.rush ? BEAT_NOTES[beat.vb].filter(([e]) => e === 0) : BEAT_NOTES[beat.vb];
  if (res.rush) fx.rush(tonic);
  if (notes.length === 0) {
    // a held note: a soft chord tone
    TIMBRES.box(tonic + 12 + chordOf(beat.vb)[2], now, vel * 0.4, pan, 2, musicBus);
    return;
  }
  notes.forEach(([e, len, semi], k) => {
    const t = k === 0 ? now : Math.max(now + 0.02, beatCtx + e * eighth);
    TIMBRES.box(tonic + 12 + semi, t, vel, pan, len, musicBus);
  });
}

// ---------------------------------------------------------------- effects

const fx = {
  /** A whole merrily rush: the glockenspiel runs up, the choir answers. */
  rush(tonic = 65) {
    if (!running()) return;
    const t = at() + 0.05;
    [0, 2, 4, 7, 9, 12, 14, 16, 19, 24].forEach((semi, k) => TIMBRES.glock(tonic + semi, t + k * 0.045, 0.3, (k / 9 - 0.5) * 0.8, 1, sfxBus));
    for (const semi of [0, 4, 7]) TIMBRES.hum(tonic + semi, t + 0.3, 0.45, (semi - 3.5) * 0.08, 6, sfxBus);
    hiss(t, { vol: 0.12, decay: 0.7, type: 'lowpass', f: 400, to: 5000, q: 0.6 });
  },
  /** A moonbloom: a crystal chime, higher through a line. */
  bloom(k = 0, tonic = 65, pan = 0) {
    if (!running()) return;
    const t = at();
    const semi = [0, 2, 4, 7, 9, 12, 14][Math.max(0, Math.min(6, k))];
    tone('sine', freq(tonic + 24 + semi), t, { vol: 0.09, decay: 0.9, pan, bus: sfxBus });
    tone('sine', freq(tonic + 24 + semi) * 2.01, t, { vol: 0.03, decay: 0.4, pan, bus: sfxBus });
    tone('sine', freq(tonic + 31 + semi), t + 0.06, { vol: 0.04, decay: 0.6, pan, bus: sfxBus });
  },
  /** A close shave: air past the hull and a little pluck. */
  shave(pan = 0) {
    if (!running()) return;
    const t = at();
    hiss(t, { vol: 0.16, decay: 0.28, f: 4200, to: 900, q: 1.2, pan });
    tone('triangle', 880, t + 0.05, { vol: 0.07, decay: 0.12, to: 1320, pan, bus: sfxBus });
  },
  miss(side = 0) {
    if (!running()) return;
    const t = at();
    tone('sawtooth', 150, t, { vol: 0.05, a: 0.02, decay: 0.22, to: 115, filter: ['bandpass', 900], q: 3, pan: side * 0.3 });
  },
  lanternUp(level, tonic = 65) {
    if (!running()) return;
    const t = at();
    hiss(t, { vol: 0.16, decay: 0.3, type: 'lowpass', f: 200, to: 2400, q: 0.8 });
    tone('sine', 90, t, { vol: 0.2, decay: 0.25, to: 140 });
    const run = [0, 4, 7, 12, 16];
    for (let k = 0; k < Math.min(5, level + 1); k++) TIMBRES.harp(tonic + 12 + run[k], t + 0.05 + k * 0.06, 0.4, (k - 2) * 0.2, 1, sfxBus);
  },
  lanternOut() {
    if (!running()) return;
    hiss(at(), { vol: 0.1, decay: 0.3, f: 3000, to: 500, q: 0.9 });
  },
  bump(kind = 'bank', vol = 1) {
    if (!running()) return;
    const t = at();
    if (kind === 'rock' || kind === 'pendulum') {
      tone('sine', 320, t, { vol: 0.3 * vol, decay: 0.09, to: 200 });
      hiss(t, { vol: 0.2 * vol, decay: 0.05, f: 2500, q: 2 });
    } else if (kind === 'log') {
      tone('sine', 210, t, { vol: 0.3 * vol, decay: 0.2, to: 160 });
      hiss(t, { vol: 0.2 * vol, decay: 0.2, f: 420, q: 6 });
    } else {
      tone('sine', 175, t, { vol: 0.32 * vol, decay: 0.16, to: 110 });
      hiss(t, { vol: 0.1 * vol, decay: 0.04, f: 1800, q: 2 });
    }
    hiss(t + 0.04, { vol: 0.13 * vol, decay: 0.45, type: 'lowpass', f: 900, to: 300 });
  },
  touch() {
    if (!running()) return;
    tone('sine', 240, at(), { vol: 0.14, decay: 0.1, to: 190 });
  },
  pad() {
    if (!running()) return;
    hiss(at(), { vol: 0.08, decay: 0.25, f: 600, to: 250, q: 3 });
  },
  wave() {
    if (!running()) return;
    hiss(at(), { vol: 0.12, decay: 0.3, type: 'lowpass', f: 1400, to: 400 });
  },
  overtake(tonic = 65) {
    if (!running()) return;
    const t = at();
    TIMBRES.glock(tonic + 7, t, 0.5, 0, 1, sfxBus);
    TIMBRES.glock(tonic + 12, t + 0.09, 0.5, 0, 1, sfxBus);
  },
  dropped(tonic = 65) {
    if (!running()) return;
    const t = at();
    TIMBRES.flute(tonic + 7, t, 0.25, 0, 1, sfxBus);
    TIMBRES.flute(tonic + 4, t + 0.1, 0.25, 0, 1, sfxBus);
  },
  finish(tonic = 65, win = false) {
    if (!running()) return;
    const t = at();
    for (const [k, s] of [0, 4, 7, 12].entries()) bell(tonic + 12 + s, t + k * 0.02, 0.16, (k - 1.5) * 0.3, sfxBus);
    for (let k = 0; k < 7; k++) hiss(t + 0.15 + Math.random() * 0.6, { vol: 0.08, decay: 0.05, f: 1800 + Math.random() * 1500, q: 1.5 });
    // "life is but a dream": the choir for a win, the music box otherwise
    const beat = 0.42;
    const phrase = [[0, 2, 7], [2, 1, 5], [3, 2, 4], [5, 1, 2], [6, 6, 0]];
    for (const [e, len, semi] of phrase) {
      const tt = t + 0.5 + (e * beat) / 3;
      TIMBRES.box(tonic + 12 + semi, tt, win ? 0.7 : 0.45, 0, len, sfxBus);
      if (win) {
        TIMBRES.hum(tonic + semi, tt, 0.55, -0.3, len, sfxBus);
        TIMBRES.hum(tonic + semi - 5, tt, 0.4, 0.3, len, sfxBus);
      }
    }
    if (win) pad([tonic - 12, tonic - 5, tonic + 4, tonic + 7], t + 0.5 + 2 * beat, 2.5, 0.8);
  },
  star(k = 0, tonic = 65) {
    if (!running()) return;
    bell(tonic + 12 + [0, 4, 7][k % 3] + 12, at(), 0.18, 0, sfxBus);
  },
  tap() {
    if (!running()) return;
    const t = at();
    tone('sine', 520, t, { vol: 0.12, decay: 0.06, to: 380 });
    hiss(t, { vol: 0.06, decay: 0.03, f: 2000, q: 2 });
  },
  page() {
    if (!running()) return;
    hiss(at(), { vol: 0.1, a: 0.04, decay: 0.3, f: 800, to: 2600, q: 0.6 });
  },
  tock(accent = false) {
    if (!running()) return;
    tock(at(), 0.2, accent);
  },
  /** A tock at a given context time (the timing test). */
  tockAt(t, accent = false) {
    if (!running()) return;
    tock(Math.max(ctx.currentTime, t), 0.22, accent);
  },
  count(k, tonic = 65) {
    if (!running()) return;
    bell(tonic + [0, 4, 7, 12][k % 4] + 12, at(), 0.18, 0, sfxBus);
  },
  unstuck() {
    if (!running()) return;
    hiss(at(), { vol: 0.12, decay: 0.4, type: 'lowpass', f: 300, to: 1500 });
  },
};

// ---------------------------------------------------------------- beds: water, rapids, whirlpools, wake, crickets

function startBeds() {
  if (!ctx || beds.water) return;
  try {
    const mk = (name, type, f, q, rate = 1) => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.playbackRate.value = rate;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(fl).connect(g).connect(sfxBus);
      s.start();
      beds[name] = { g, fl, level: 0 };
    };
    mk('water', 'lowpass', 500, 0.6, 0.5);
    mk('rapids', 'bandpass', 900, 0.5);
    mk('whirl', 'bandpass', 400, 4);
    mk('wake', 'highpass', 5000, 0.7);
    beds.water.level = 0.05;
  } catch {}
}

/** Bed levels (0-1) for this frame: { water, rapids, whirl, wake }. */
function setBeds(levels) {
  if (!running()) return;
  const t = ctx.currentTime;
  for (const [name, v] of Object.entries(levels)) {
    const b = beds[name];
    if (!b) continue;
    const want = clamp(v, 0, 1) * (name === 'water' ? 0.12 : name === 'rapids' ? 0.22 : name === 'whirl' ? 0.25 : 0.05);
    if (Math.abs(want - b.level) < 0.002) continue;
    b.level = want;
    b.g.gain.setTargetAtTime(want, t, 0.12);
    if (name === 'whirl') b.fl.frequency.setTargetAtTime(300 + 300 * Math.sin(t * 3), t, 0.1);
  }
}

let cricketAt = 0;
/** Ambience a frame at a time: crickets now and then. */
function ambience(level = 1) {
  if (!running() || level <= 0) return;
  const t = ctx.currentTime;
  if (t < cricketAt) return;
  cricketAt = t + 0.9 + Math.random() * 2.2;
  const f = 4200 + Math.random() * 600;
  const pan = Math.random() * 2 - 1;
  for (let k = 0; k < 3; k++) tone('sine', f, t + k * 0.06, { vol: 0.012 * level, decay: 0.03, pan, bus: sfxBus });
}

function setMusic(level, ramp = 0.4) {
  if (!running()) return;
  musicBus.gain.setTargetAtTime(level, ctx.currentTime, ramp);
}

export const audio = {
  start,
  running,
  sampleClock,
  heard,
  schedule,
  stroke,
  fx,
  setBeds,
  ambience,
  setMusic,
  get ctx() {
    return ctx;
  },
  get now() {
    return ctx ? ctx.currentTime : 0;
  },
  /** Forget what the scheduler did (a new race). */
  reset() {
    sched = { key: '', next: -99, anchor: null };
  },
};
