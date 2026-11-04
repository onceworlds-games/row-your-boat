// Row Your Boat: join the room first, then build the scene and run the game. ?poster=<name> draws a store picture instead.

import './style.css';
import '@fontsource-variable/fraunces/soft.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-700.css';
import ow from '@onceworlds/sdk';
import { createScene } from './render/scene.js';
import { createUI } from './ui/ui.js';
import { createStore } from './save.js';
import { createGame } from './game.js';
import { JOIN } from './net.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('cv');

/** Autoplay and its switches work only on a copy running on this computer (shots, the trailer), never in production. */
function localCopy() {
  const h = location.hostname;
  return location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');
}

// a local switch: keep the console's errors where a capture can read them (window.__errs)
if (q.has('debug')) {
  window.__errs = [];
  const log = console.error;
  console.error = (...a) => {
    window.__errs.push(a.map((x) => String(x?.stack ?? x)).join(' ').slice(0, 1200));
    log.apply(console, a);
  };
  addEventListener('error', (e) => window.__errs.push(String(e.error?.stack ?? e.message).slice(0, 1200)));
}

function flagsOf() {
  if (!localCopy()) return {};
  const int = (k, lo, hi) => {
    const v = Number(q.get(k));
    return Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  };
  const to = q.get('autoplay-to');
  const pilot = Number(q.get('pilot'));
  return {
    autoplay: q.has('autoplay') && q.get('autoplay') !== '0',
    autoplayTo: to === 'title' || to === 'lobby' ? to : null, // the Dock is the first screen: both stop there
    pilot: Number.isFinite(pilot) && q.has('pilot') ? Math.max(0, Math.min(1, pilot)) : 0.92,
    stream: int('stream', 1, 8),
    race: int('race', 1, 3) === 3 ? 3 : null,
    dream: int('dream', 1, 8),
    hud: q.get('hud') !== '0',
  };
}

const QUALITY = new URLSearchParams(location.search).get('quality');

function settings(world) {
  const s = ow.settings;
  let quality = 'medium';
  let pr = Math.min(2, devicePixelRatio || 1);
  let reduced = false;
  try {
    quality = ['low', 'medium', 'high'].includes(s.quality) ? s.quality : 'medium';
    pr = s.pixelRatio(2) || pr;
    reduced = !!s.reducedMotion;
  } catch {}
  // drawing without a GPU: the lightest look (no mirror, shadows or bloom) at half resolution keeps it playable
  if (world?.lite) {
    quality = 'low';
    pr = 0.5;
  }
  // a local switch for looking at one quality (captures, tests)
  if (['low', 'medium', 'high'].includes(QUALITY)) quality = QUALITY;
  return { quality, pr, reduced };
}

async function boot() {
  // Join as the page loads, before the heavy scene is built, so a reload keeps its seat.
  const joining = ow.rooms.join(JOIN).catch((err) => {
    console.warn('[row] could not join', err);
    return null;
  });
  const ui = createUI(document.getElementById('ui'), document.getElementById('tags'));
  ui.title(true);
  // Building the world blocks the page for a moment (seconds on a slow phone): let the SDK finish its handshake with the
  // platform and the room answer first, or a slow page can miss the handshake and play alone.
  await Promise.race([joining, new Promise((r) => setTimeout(r, 6000))]);
  try {
    ow.ui.setLook({ accent: '#FFB547', panel: '#141A3A', text: '#F4EBD0' });
  } catch {}
  try {
    ow.controls.set(null);
  } catch {}
  const store = createStore();
  const loading = store.load();
  const scene = createScene(canvas);
  const game = createGame({ ow, scene, ui, store, flags: flagsOf() });

  const fit = () => {
    const s = settings(scene.world);
    scene.world.setQuality(s.quality, s.pr);
    scene.resize(innerWidth, innerHeight, s.pr);
    scene.setReduced(s.reduced);
    game.resize(innerWidth, innerHeight);
  };
  fit();
  addEventListener('resize', fit);
  try {
    ow.settings.on('change', fit);
  } catch {}
  try {
    game.setReserved(ow.ui.reserved);
    ow.on('reserved', (areas) => game.setReserved(areas));
  } catch {}
  try {
    ow.on('pause', () => game.pause());
  } catch {}
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.pause();
  });

  // The world paints at once; the Dock waits for the save (the profile).
  let drawn = false;
  // the frame's time from performance.now() (the clock input events and the audio are mapped to), not the rAF argument
  const loop = () => {
    const perf = performance.now();
    try {
      game.frame(perf);
    } catch (err) {
      console.error(err);
    } finally {
      if (!drawn) document.body.classList.add('drawn');
      drawn = true;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  await Promise.race([loading, new Promise((r) => setTimeout(r, 2500))]);
  game.start();

  const room = await joining;
  if (room) game.attach(room);
  else game.lost();
  // The platform can seat this page in another room (a party going on together): carry on there.
  try {
    ow.rooms.on('moved', (r) => game.attach(r));
  } catch {}
}

if (q.has('poster')) {
  document.body.classList.add('drawn');
  import('./poster.js').then((m) => m.drawPoster(canvas, q)).catch((err) => {
    document.body.dataset.error = String(err?.stack || err).slice(0, 400);
    document.body.dataset.ready = 'error';
  });
} else {
  boot().catch((err) => console.error(err));
}
