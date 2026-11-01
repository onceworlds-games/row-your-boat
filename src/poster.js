// Store pictures: ?poster=cover|action|win|multi|icon|badge-<id>&w=&h=. One staged frame with the real renderer (no
// room, no HUD). body[data-ready] says when it is on screen, or 'error' with the reason in data-error.

import { createScene } from './render/scene.js';
import { courseOf, songOf } from './race.js';
import { streamByN, ROWER_NAMES } from './sim/streams.js';
import { rowerLook, playerLook } from './looks.js';
import { beatPos } from './sim/racer.js';

const FPS = 30;
const FRAMES = 46;

export async function drawPoster(canvas, q) {
  const errors = [];
  const keep = console.error.bind(console);
  console.error = (...a) => {
    errors.push(a.map((x) => String(x?.message ?? x)).join(' ').slice(0, 600));
    keep(...a);
  };
  addEventListener('error', (e) => errors.push(String(e.message)));
  canvas.addEventListener('webglcontextlost', () => errors.push('the WebGL context was lost'));
  const name = q.get('poster') || 'cover';
  const small = name === 'icon' ? 512 : name.startsWith('badge-') ? 256 : 0;
  const W = clampSize(q.get('w'), small || 1280);
  const H = clampSize(q.get('h'), small || 720);
  document.body.dataset.flow = 'poster';
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  try {
    if (name === 'cover') await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
    if (name.startsWith('badge-')) badge(canvas, name.slice(6), W, H);
    else {
      const scene = stage(canvas, name, W, H);
      // wait for the GPU to finish the frame (a software renderer can take seconds)
      const gl = scene.world.renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      if (gl.isContextLost()) errors.push('the WebGL context was lost');
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 300));
  } catch (err) {
    errors.push(String(err?.stack || err));
  }
  if (errors.length) {
    document.body.dataset.error = errors.join(' | ').slice(0, 2000);
    document.body.dataset.ready = 'error';
  } else document.body.dataset.ready = '1';
}

const clampSize = (v, d) => Math.max(64, Math.min(4096, Math.floor(Number(v)) || d));

// ---------------------------------------------------------------- 3D posters

const SHOTS = {
  cover: { n: 2, s: 312 }, // six boats abreast in Teatime, ripples rolling onto the oars, the name once
  action: { n: 8, s: 566 }, // low and close in the Morning rapids
  win: { n: 1 }, // first through the lantern arch
  multi: { n: 5, s: 226 }, // a pack through the Library's shelves
  icon: { n: 1, s: 136 }, // one boat, lanterns lit, in a ring of ripples
  closeup: { n: 1, s: 136 }, // the rower, up close from the stern
  side: { n: 2, s: 200 }, // a boat side on
};

const looks = [playerLook({ shirt: 7, skin: 1, pants: 14 }, 0, 'nightcap'), ...ROWER_NAMES.map(rowerLook)];

function stage(canvas, name, W, H) {
  const shot = SHOTS[name] ?? SHOTS.cover;
  const stream = streamByN(shot.n);
  const course = courseOf(stream);
  const song = songOf(stream);
  const scene = createScene(canvas, { poster: true });
  scene.world.setQuality('high', 1);
  scene.resize(W, H, 1);
  scene.load(stream, course);

  const boats = [];
  const add = (s, d, o = {}) => {
    s -= ((o.v ?? 6.2) * FRAMES) / FPS; // they row into place over the moment
    const p = course.point(s, d);
    const i = boats.length;
    boats.push({ id: `b${i}`, x: p.x, z: p.z, h: p.h + (o.yaw ?? 0), s, d, yaw: o.yaw ?? 0, v: o.v ?? 6.2, c: o.c ?? 3, k: 0, ls: 0, lq: 1, f: 0, phase: o.phase ?? (i * 0.29) % 0.5, look: looks[o.look ?? i % looks.length] });
  };
  const fin = course.finish;
  if (name === 'cover') {
    const ds = [-6.4, -3.9, -1.3, 1.3, 3.9, 6.4];
    const ss = [0.8, -1.2, 1.6, -0.3, -2, 0.4];
    ds.forEach((d, i) => add(shot.s + ss[i], d, { yaw: [0.03, -0.02, 0, 0.02, -0.03, 0.01][i], look: [3, 1, 0, 2, 4, 5][i] }));
  } else if (name === 'action') {
    add(shot.s, 1.2, { yaw: -0.1, v: 8.2, look: 0 });
    add(shot.s + 7, -3.4, { yaw: 0.05, v: 8.2, look: 5 });
  } else if (name === 'win') {
    add(fin + 0.8, 0.3, { look: 0 });
    add(fin - 3.2, -3.9, { look: 2 });
    add(fin - 4.2, 4.1, { look: 5 });
  } else if (name === 'multi') {
    const pack = [[0, -1.6], [-3.2, 2.8], [-4.6, -4.4], [-7.4, 1.9], [-10.4, 4.4], [-12.8, -2.6]];
    pack.forEach(([ds, d], i) => add(shot.s + ds, d, { yaw: i % 2 ? 0.04 : -0.03, look: [2, 0, 4, 1, 5, 3][i] }));
  } else {
    add(shot.s, 0, { v: 4 });
  }
  scene.setBoats(boats.map((b) => ({ id: b.id, look: b.look })));
  const lead = boats[name === 'cover' ? 2 : 0];

  // play a moment so oars, spray and wakes are mid-motion; the frame lands mid-pull
  const frames = FRAMES;
  const tEnd = 30;
  for (let k = 0; k <= frames; k++) {
    const left = (frames - k) / FPS;
    const t = tEnd - left;
    for (const b of boats) {
      if (k > 0) {
        b.s += b.v / FPS;
        const p = course.point(b.s, b.d);
        b.x = p.x;
        b.z = p.z;
        b.h = p.h + b.yaw;
      }
      for (const at of [0.22, 0.82, 1.42]) {
        if (k > 0 && Math.round((at + b.phase) * FPS) === frames - k) {
          b.k++;
          b.ls = b.ls === -1 ? 1 : -1;
          if (name === 'cover' || name === 'icon') b.ls = 0;
        }
      }
    }
    if (name === 'win' && k === frames - 14) {
      const a = course.point(fin, 0);
      scene.fx.finish(a.x, 3.4, a.z);
    }
    if (name === 'action') scene.fx.foam(lead.x + Math.sin(lead.h) * 1.6, lead.z - Math.cos(lead.h) * 1.6, 1);
    const rip = ripplesFor(name, lead);
    scene.frame({
      now: 40 + k / FPS,
      dt: 1 / FPS,
      t,
      B: beatPos(song, t),
      pulse: 0.7,
      boats: boats.map((b) => ({ ...b, rapids: name === 'action' ? 1 : 0 })),
      meId: lead.id,
      focusId: lead.id,
      focusS: lead.s,
      focus: { x: lead.x, z: lead.z },
      ripples: rip.list,
      oar: rip.oar,
      ghost: null,
      calm: 0,
      camera: { mode: 'fixed', ...cameraFor(name, lead), snap: true },
      render: k >= frames - 1, // only the last frames are drawn (a slow machine still answers in time)
      arch: { count: 4, finishLit: 9, sign: '' },
    });
  }
  if (name === 'cover') titleOver(W, H);
  return scene;
}

function cameraFor(name, b) {
  const f = [Math.sin(b.h), -Math.cos(b.h)];
  const r = [Math.cos(b.h), Math.sin(b.h)];
  const at = (fwd, right, y) => [b.x + f[0] * fwd + r[0] * right, y, b.z + f[1] * fwd + r[1] * right];
  if (name === 'cover') return { pos: at(-12, 5, 4.6), look: at(8, -1.5, 1.2), fov: 52 };
  if (name === 'action') return { pos: at(-4.6, -3.4, 1.35), look: at(2.5, 0.6, 1.2), fov: 56 };
  if (name === 'win') return { pos: at(-7.5, 0.7, 2.1), look: at(9, 0, 3.4), fov: 60 };
  if (name === 'multi') return { pos: at(-24, 3.5, 8.5), look: at(1, -0.5, 0), fov: 50 };
  if (name === 'closeup') return { pos: at(-3.4, 1.4, 1.7), look: at(0.2, 0, 0.85), fov: 40 };
  if (name === 'side') return { pos: at(0.3, 6.5, 1.4), look: at(0.3, 0, 0.6), fov: 40 };
  return { pos: at(-5, -4.2, 5.4), look: at(0.6, 0, 0.7), fov: 36 };
}

/** Beat ripples rolling toward the lead boat (only where the camera looks past it at them). */
function ripplesFor(name, b) {
  if (name === 'win' || name === 'action') return { list: [], oar: null };
  const list = [1.4, 8.9, 16.4, 23.9].map((ds, i) => ({ s: b.s + ds, strength: [0.85, 0.7, 0.5, 0.32][i], kind: 0, grow: 0 }));
  return { list, oar: { s: b.s, d: b.d, glow: 0.3 } };
}

function titleOver(W, H) {
  const box = document.createElement('div');
  box.className = 'title';
  box.style.cssText = `left:${Math.round(W * 0.055)}px;top:${Math.round(H * 0.07)}px;transform:none`;
  const h1 = document.createElement('h1');
  h1.className = 'display outlined';
  h1.style.fontSize = `${Math.round(H * 0.2)}px`;
  for (const w of ['Row Your', 'Boat']) {
    const s = document.createElement('span');
    s.textContent = w;
    h1.append(s);
  }
  box.append(h1);
  document.getElementById('ui').append(box);
}

// ---------------------------------------------------------------- badges: a bold symbol on a coloured disc

const INK = '#141A3A';
const CREAM = '#F4EBD0';
const AMBER = '#FFB547';

const BADGES = {
  'first-stroke': { bg: AMBER, ring: INK, draw: oar },
  'merrily-x4': { bg: '#2B3F7C', ring: AMBER, draw: lanterns },
  'perfect-verse': { bg: CREAM, ring: INK, draw: note },
  gently: { bg: '#3d6f9e', ring: CREAM, draw: wave },
  'first-win': { bg: '#232a5c', ring: AMBER, draw: arch },
  'photo-finish': { bg: '#E5533D', ring: INK, draw: shutter },
  choir: { bg: '#9CC5A1', ring: INK, draw: voices },
  dreamer: { bg: '#232a5c', ring: CREAM, draw: moon },
  'life-is-but-a-dream': { bg: '#B7A5E8', ring: INK, draw: crescentStars },
};

function badge(canvas, id, W, H) {
  const b = BADGES[id];
  if (!b) throw new Error(`no badge '${id}'`);
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const R = Math.min(W, H) * 0.47;
  g.clearRect(0, 0, W, H);
  g.save();
  g.translate(W / 2, H / 2);
  g.fillStyle = b.ring;
  circle(g, 0, 0, R);
  g.fill();
  g.fillStyle = b.bg;
  circle(g, 0, 0, R * 0.85);
  g.fill();
  const gr = g.createRadialGradient(-R * 0.3, -R * 0.4, R * 0.1, 0, 0, R * 0.9);
  gr.addColorStop(0, 'rgba(255,255,255,0.22)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  circle(g, 0, 0, R * 0.85);
  g.fill();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  b.draw(g, R * 0.85);
  g.restore();
}

function circle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
}

function star(g, x, y, s) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? s * 0.45 : s;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function lantern(g, x, y, s) {
  g.fillStyle = AMBER;
  g.strokeStyle = INK;
  g.lineWidth = s * 0.16;
  g.beginPath();
  g.ellipse(x, y, s * 0.62, s * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = INK;
  g.fillRect(x - s * 0.26, y - s * 0.66, s * 0.52, s * 0.16);
  g.fillRect(x - s * 0.26, y + s * 0.5, s * 0.52, s * 0.16);
}

function oar(g, r) {
  g.save();
  g.rotate(-0.7);
  g.strokeStyle = INK;
  g.lineWidth = r * 0.07;
  g.fillStyle = '#c49a6c';
  g.beginPath();
  g.roundRect(-r * 0.86, -r * 0.065, r * 0.96, r * 0.13, r * 0.05);
  g.fill();
  g.stroke();
  g.fillStyle = CREAM;
  g.beginPath();
  g.moveTo(r * 0.06, 0);
  g.bezierCurveTo(r * 0.2, -r * 0.3, r * 0.55, -r * 0.34, r * 0.82, -r * 0.2);
  g.bezierCurveTo(r * 0.9, -r * 0.05, r * 0.9, r * 0.05, r * 0.82, r * 0.2);
  g.bezierCurveTo(r * 0.55, r * 0.34, r * 0.2, r * 0.3, r * 0.06, 0);
  g.fill();
  g.stroke();
  g.restore();
  g.fillStyle = CREAM;
  g.strokeStyle = INK;
  g.lineWidth = r * 0.035;
  for (const [x, y, s] of [[0.48, 0.5, 0.08], [0.66, 0.36, 0.055], [0.3, 0.64, 0.05]]) {
    circle(g, x * r, y * r, s * r);
    g.fill();
    g.stroke();
  }
}

function lanterns(g, r) {
  g.strokeStyle = '#c49a6c';
  g.lineWidth = r * 0.06;
  g.beginPath();
  g.moveTo(0, -r * 0.84);
  g.lineTo(0, r * 0.82);
  g.stroke();
  for (let i = 0; i < 4; i++) lantern(g, 0, r * (0.58 - i * 0.39), r * 0.3);
}

function note(g, r) {
  g.fillStyle = INK;
  g.strokeStyle = INK;
  g.lineWidth = r * 0.11;
  g.beginPath();
  g.ellipse(-r * 0.22, r * 0.38, r * 0.25, r * 0.19, -0.4, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(0, r * 0.33);
  g.lineTo(0, -r * 0.58);
  g.quadraticCurveTo(r * 0.36, -r * 0.48, r * 0.42, -r * 0.12);
  g.stroke();
  g.strokeStyle = INK;
  g.lineWidth = r * 0.035;
  g.fillStyle = AMBER;
  for (const [x, y, s] of [[0.5, 0.36, 0.15], [0.58, -0.52, 0.12], [-0.58, -0.28, 0.13]]) {
    star(g, x * r, y * r, s * r);
    g.fill();
    g.stroke();
  }
}

function wave(g, r) {
  g.strokeStyle = CREAM;
  g.lineWidth = r * 0.12;
  for (const [y, a] of [[0.05, 1], [0.42, 0.55]]) {
    g.globalAlpha = a;
    g.beginPath();
    for (let i = 0; i <= 72; i++) {
      const x = -0.72 + i * 0.02;
      const yy = y + Math.sin(x * 7) * 0.07;
      if (i === 0) g.moveTo(x * r, yy * r);
      else g.lineTo(x * r, yy * r);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  // a little boat riding the swell
  g.fillStyle = AMBER;
  g.strokeStyle = INK;
  g.lineWidth = r * 0.06;
  g.beginPath();
  g.moveTo(-r * 0.36, -r * 0.2);
  g.lineTo(r * 0.36, -r * 0.2);
  g.quadraticCurveTo(r * 0.22, r * 0.06, 0, r * 0.04);
  g.quadraticCurveTo(-r * 0.22, r * 0.06, -r * 0.36, -r * 0.2);
  g.fill();
  g.stroke();
  g.fillStyle = CREAM;
  circle(g, 0, -r * 0.34, r * 0.11);
  g.fill();
  g.stroke();
}

function arch(g, r) {
  g.strokeStyle = '#8a6046';
  g.lineWidth = r * 0.14;
  g.beginPath();
  g.moveTo(-r * 0.56, r * 0.68);
  g.lineTo(-r * 0.56, -r * 0.12);
  g.quadraticCurveTo(0, -r * 0.78, r * 0.56, -r * 0.12);
  g.lineTo(r * 0.56, r * 0.68);
  g.stroke();
  for (let i = 0; i < 5; i++) {
    const u = i / 4;
    const x = -r * 0.46 + u * r * 0.92;
    const y = -r * 0.02 - Math.sin(u * Math.PI) * r * 0.3;
    lantern(g, x, y, r * 0.17);
  }
  g.fillStyle = CREAM;
  g.strokeStyle = INK;
  g.lineWidth = r * 0.05;
  star(g, 0, r * 0.36, r * 0.22);
  g.fill();
  g.stroke();
}

function shutter(g, r) {
  g.fillStyle = CREAM;
  g.strokeStyle = INK;
  g.lineWidth = r * 0.07;
  circle(g, 0, 0, r * 0.62);
  g.fill();
  g.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    g.beginPath();
    g.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
    g.lineTo(Math.cos(a + 2.1) * r * 0.2, Math.sin(a + 2.1) * r * 0.2);
    g.stroke();
  }
  g.fillStyle = INK;
  circle(g, 0, 0, r * 0.17);
  g.fill();
}

function voices(g, r) {
  for (const [x, y, c] of [[-0.42, 0.14, '#F2A7B6'], [0, -0.04, CREAM], [0.42, 0.14, AMBER]]) {
    g.fillStyle = c;
    g.strokeStyle = INK;
    g.lineWidth = r * 0.06;
    circle(g, x * r, y * r, r * 0.25);
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(x * r, (y + 0.08) * r, r * 0.07, r * 0.1, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineWidth = r * 0.07;
  for (const x of [-0.3, 0.06, 0.42]) {
    g.beginPath();
    g.moveTo(x * r, -0.5 * r);
    g.lineTo(x * r, -0.8 * r);
    g.stroke();
    circle(g, (x - 0.07) * r, -0.5 * r, r * 0.08);
    g.fill();
  }
}

function moon(g, r) {
  // the crescent: the moon's disc less a second disc, so the badge's own shading shows through the bite
  g.save();
  circle(g, -r * 0.06, r * 0.02, r * 0.58);
  g.clip();
  g.beginPath();
  g.rect(-r, -r, r * 2, r * 2);
  g.arc(r * 0.26, -r * 0.16, r * 0.5, 0, Math.PI * 2);
  g.fillStyle = CREAM;
  g.fill('evenodd');
  g.restore();
  g.fillStyle = AMBER;
  for (const [x, y, s] of [[0.4, 0.32, 0.13], [0.56, -0.2, 0.09], [0.18, 0.62, 0.07]]) {
    star(g, x * r, y * r, s * r);
    g.fill();
  }
}

function crescentStars(g, r) {
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (0.8 + (i / 7) * 1.4);
    g.fillStyle = i % 2 ? CREAM : AMBER;
    g.strokeStyle = INK;
    g.lineWidth = r * 0.03;
    star(g, Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58, r * (0.13 + (i % 3) * 0.03));
    g.fill();
    g.stroke();
  }
  g.fillStyle = CREAM;
  g.strokeStyle = INK;
  g.lineWidth = r * 0.05;
  star(g, r * 0.08, 0, r * 0.32);
  g.fill();
  g.stroke();
}
