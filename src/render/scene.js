// The 3D scene of one stream: water, river, the dream's set pieces, the boats, particles, light and the camera, driven
// once a frame from plain race state.

import * as THREE from 'three';
import { createWorld } from './world.js';
import { createWater, RING } from './water.js';
import { createRiver, paperLantern } from './river.js';
import { createDream } from './dreams.js';
import { createBoatMesh } from './boats.js';
import { createFx } from './fx.js';
import { createBlooms } from './blooms.js';
import { themeOf } from './themes.js';
import { G, createKit, glowTexture } from './kit.js';
import { NO_MIRROR } from './world.js';

const v3 = new THREE.Vector3();
const v4 = new THREE.Vector3();
const look = new THREE.Vector3();
const KINDS = ['free', 'perfect', 'good', 'splash', 'both', 'free', 'pull', 'drop'];

export function createScene(canvas, { poster = false } = {}) {
  const world = createWorld(canvas, { poster });
  const { scene, camera } = world;
  const fx = createFx(scene);
  let cur = null;
  const hulls = new Map();
  let ghost = null;
  let podium = null;
  let reduced = false;
  let hitstop = 0;
  let slow = 0; // a moment in slow motion (the finish): sparks and spray hang, the camera drifts
  let slowFor = 1;
  let lastNow = 0;
  let lastFocus = null;

  // ---------------------------------------------------------------- loading a stream

  function load(stream, course) {
    if (cur && cur.course === course) return cur;
    if (cur) {
      scene.remove(cur.water.mesh, cur.river.group, cur.dream.group, cur.blooms.group);
      cur.water.dispose();
      disposeTree(cur.river.group);
      disposeTree(cur.dream.group);
      disposeTree(cur.blooms.group);
    }
    const theme = themeOf(stream.id);
    world.setTheme(theme, course);
    const water = createWater(course, theme);
    water.setMoon(world.moonDir);
    const river = createRiver(course, stream.id, theme, { density: world.quality === 'low' ? 0.45 : 1, env: world.scene.environment });
    const dream = createDream(course, stream.id, theme);
    const blooms = createBlooms(course);
    scene.add(water.mesh, river.group, dream.group, blooms.group);
    const lights = [...river.lanterns, ...dream.lights.map((p) => ({ x: p.x, y: p.y, z: p.z, s: course.locate(p.x, p.z).s }))];
    cur = { id: stream.id, stream, course, theme, water, river, dream, blooms, lights };
    needWarm = true;
    fx.clear();
    // shadow casters changed: let materials pick the light setup up
    world.setQuality(world.quality, world.renderer.getPixelRatio());
    return cur;
  }

  let needWarm = false;
  let warming = null;
  let warmAt = 0;
  function warm() {
    const r = world.renderer;
    if (warming || typeof r.compileAsync !== 'function') return;
    warmAt = performance.now();
    warming = r
      .compileAsync(world.scene, world.camera)
      .catch(() => {})
      .then(() => {
        warming = null;
      });
  }

  function disposeTree(o) {
    o.traverse((n) => {
      if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose?.();
      if (n.material) for (const m of Array.isArray(n.material) ? n.material : [n.material]) if (!m.userData?.shared) m.dispose?.();
    });
  }

  // ---------------------------------------------------------------- boats

  /** seats: [{ id, look }]: make, re-dress or remove boats. */
  function setBoats(seats) {
    const keep = new Set(seats.map((s) => s.id));
    for (const [id, m] of hulls) {
      if (!keep.has(id)) {
        scene.remove(m.group);
        hulls.delete(id);
      }
    }
    for (const s of seats) {
      let m = hulls.get(s.id);
      if (!m) {
        m = createBoatMesh(s.look);
        m.lastK = -1;
        m.finAt = -1;
        scene.add(m.group);
        hulls.set(s.id, m);
      } else m.setLook(s.look);
    }
  }

  function setGhost(on) {
    if (on && !ghost) {
      ghost = createBoatMesh({ paint: '#bcd0ff', symbol: 'heart' }, { ghost: true });
      scene.add(ghost.group);
    }
    if (ghost) ghost.group.visible = !!on;
  }

  // ---------------------------------------------------------------- the podium of pillows

  /** A gold numeral on a little ribbon for the front of a stack. */
  function numeral(n) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = n === 1 ? '#c9a24e' : n === 2 ? '#b9bccb' : '#b0784a';
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(40, 24, 16, 0.55)';
    g.stroke();
    g.font = '900 86px "Fraunces Variable", Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#2a1a12';
    g.fillText(String(n), 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.CircleGeometry(0.62, 32), new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, metalness: 0.5 }));
  }

  /**
   * The winners' stage past the finish: a round raft with a velvet top, stacks of pillows (three, two, one) with the
   * top three rowers standing on them, a half-ring of lit paper lanterns behind, and pools of light from above.
   */
  function showPodium(top, looks) {
    hidePodium();
    if (!cur) return;
    const c = cur.course;
    const s = Math.min(c.total - 10, c.finish + 22);
    const a = c.at(s);
    podium = new THREE.Group();
    podium.position.set(a.x, 0, a.z);
    podium.rotation.y = -a.h + Math.PI;
    podium.userData.figs = [];
    podium.userData.lights = [];
    const kit = createKit();
    // the raft: a wooden ring round a velvet top
    kit.add(G.cyl(7.4, 7.6, 0.9, 48), '#4a3226', { y: 0.15 }, { mat: 'wood' });
    kit.add(G.cyl(7.0, 7.0, 0.2, 48), '#4a56a0', { y: 0.65 }, { mat: 'fabric' });
    for (let k = 0; k < 24; k++) {
      const an = (k / 24) * Math.PI * 2;
      kit.add(G.sphere(0.16, 8, 6), '#c9a24e', { x: Math.sin(an) * 7.45, y: 0.62, z: Math.cos(an) * 7.45 }, { mat: 'metal' });
    }
    // stacks of pillows, each with a tuft button and a piped edge
    const stacks = [
      { x: 0, n: 3, cols: ['#f4ebd0', '#F2A7B6', '#f4ebd0'] },
      { x: 4.3, n: 2, cols: ['#B7A5E8', '#f4ebd0'] },
      { x: -4.3, n: 1, cols: ['#9CC5A1'] },
    ];
    const PH = 1.05;
    stacks.forEach((st, i) => {
      for (let k = 0; k < st.n; k++) {
        const y = 0.75 + PH / 2 + k * PH;
        const rot = (k % 2 ? 0.1 : -0.07) * (i + 1);
        const place = { x: st.x, y, ry: rot };
        kit.add(G.rbox(3.5, PH, 2.9, 0.48, 3), st.cols[k], place, { mat: 'fabric' });
        const m = new THREE.Matrix4().makeRotationY(rot).setPosition(st.x, y, 0);
        kit.add(G.sphere(0.13, 10, 8), '#c9a24e', { y: PH / 2 - 0.02, sy: 0.5 }, { parent: m, mat: 'metal' });
        // piping round the middle seam
        kit.add(G.box(3.36, 0.07, 0.07), '#c9a24e', { z: -1.43 }, { parent: m, mat: 'fabric' });
        kit.add(G.box(3.36, 0.07, 0.07), '#c9a24e', { z: 1.43 }, { parent: m, mat: 'fabric' });
      }
      const nm = numeral(i + 1);
      nm.position.set(st.x, 0.75 + st.n * PH - PH / 2, -1.5);
      nm.rotation.y = Math.PI;
      podium.add(nm);
    });
    // a half-ring of lantern posts behind
    const lanternGeo = paperLantern();
    const warm = new THREE.Color(cur.theme?.lantern ?? '#FFB547').lerp(new THREE.Color('#fff2d8'), 0.35);
    const lanternMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: warm.clone().multiplyScalar(2) });
    const glowPos = [];
    for (let k = 0; k < 7; k++) {
      const an = -1.35 + (k / 6) * 2.7;
      const x = Math.sin(an) * 6.7;
      const z = Math.cos(an) * 6.7;
      const h = 4.6 + (k % 2) * 0.6;
      kit.add(G.cyl(0.07, 0.1, h, 6), '#4a3226', { x, y: 0.7 + h / 2, z }, { mat: 'wood' });
      kit.add(G.box(0.9, 0.08, 0.08), '#4a3226', { x: x - Math.cos(an) * 0.35, y: 0.7 + h, z: z + Math.sin(an) * 0.35, ry: an + Math.PI / 2 }, { mat: 'wood' });
      const lm = new THREE.Mesh(lanternGeo, lanternMat);
      lm.scale.setScalar(1.4);
      lm.position.set(x - Math.cos(an) * 0.7, 0.7 + h, z + Math.sin(an) * 0.7);
      podium.add(lm);
      glowPos.push(lm.position.x, lm.position.y - 0.75, lm.position.z);
    }
    const built = kit.build('podium');
    built.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    podium.add(built);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
    const halos = new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTexture(), color: warm, size: 3.6, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    halos.layers.set(NO_MIRROR);
    halos.frustumCulled = false;
    podium.add(halos);
    // the rowers, standing tall on their stacks
    top.forEach((id, i) => {
      if (i > 2) return;
      const lk = looks.get(id);
      if (!lk) return;
      const st = stacks[i];
      const fig = createBoatMesh(lk);
      fig.showBoat(false);
      fig.group.scale.setScalar(1.6);
      fig.group.position.set(st.x, 0.75 + st.n * PH - 0.5, 0);
      fig.group.rotation.y = Math.PI;
      fig.pose(i === 0 ? 'cheer' : 'wave');
      podium.add(fig.group);
      podium.userData.figs.push(fig);
    });
    scene.add(podium);
    podium.updateMatrixWorld(true);
    // where the light pool hangs while the stage is shown: over each stack
    for (const st of stacks) podium.userData.lights.push(new THREE.Vector3(st.x * 1.2, 5.2 + st.n * 0.6, -4.5).applyMatrix4(podium.matrixWorld));
  }
  function hidePodium() {
    if (!podium) return;
    scene.remove(podium);
    podium = null;
  }

  // ---------------------------------------------------------------- camera

  const camState = { h: 0, x: 0, y: 4, z: 8, lx: 0, ly: 0, lz: 0, trauma: 0, shX: 0, shZ: 0, init: false, mode: '', roll: 0, fov: 58, punch: 0, prevH: 0 };

  /**
   * Place the camera. c: { mode: 'race' | 'intro' | 'title' | 'dock' | 'finish' | 'results' | 'spectate' | 'fixed', boat,
   * k (0-1 intro progress), portrait, push (0-1), beat (0-1), dt, now, snap }.
   */
  function placeCamera(c) {
    const course = cur?.course;
    if (!course) return;
    const dt = Math.min(0.1, c.dt ?? 0.016);
    const b = c.boat;
    let px;
    let py;
    let pz;
    let lx;
    let ly;
    let lz;
    let roll = 0;
    let fovAdd = 0;
    let follow = 1 - Math.exp(-dt * 5);
    if (c.mode !== camState.mode) {
      camState.mode = c.mode;
      camState.orbitFor = null;
      if (c.snap) camState.init = false;
    }
    if ((c.mode === 'race' || c.mode === 'spectate' || c.mode === 'intro' || c.mode === 'finish') && b) {
      // follow the boat, leaning toward where the river goes next
      const ahead = course.at(Math.min(course.total, b.s + 9));
      const want = b.h + wrapA(ahead.h - b.h) * 0.4;
      if (!camState.init) {
        camState.h = want;
        camState.prevH = want;
      }
      camState.h += wrapA(want - camState.h) * (1 - Math.exp(-dt * (c.mode === 'finish' ? 1 : 3)));
      const h = camState.h;
      const turn = wrapA(h - camState.prevH) / Math.max(0.001, dt);
      camState.prevH = h;
      roll = reduced ? 0 : Math.max(-0.06, Math.min(0.06, -turn * 0.12));
      const fx_ = Math.sin(h);
      const fz = -Math.cos(h);
      const punch = camState.punch;
      const back = (c.portrait ? 9.2 : 6.8) * (1 - 0.07 * (c.push ?? 0)) * (1 - punch * 0.12) + (c.mode === 'spectate' ? 3 : 0);
      const up = (c.portrait ? 4.5 : 3.0) + (c.mode === 'spectate' ? 2 : 0);
      const lean = wrapA(b.h - h) * 2.4;
      px = b.x - fx_ * back + Math.cos(h) * lean;
      pz = b.z - fz * back + Math.sin(h) * lean;
      py = up + Math.sin((c.beat ?? 0) * Math.PI * 2) * 0.04;
      // look a little ahead down the river, not just along the bow
      const bd = Number.isFinite(b.d) ? b.d : course.locate(b.x, b.z).d;
      const tgt = course.point(Math.min(course.total, b.s + (c.portrait ? 13 : 11)), (Number.isFinite(bd) ? bd : 0) * 0.5);
      lx = tgt.x * 0.7 + (b.x + fx_ * 11) * 0.3;
      lz = tgt.z * 0.7 + (b.z + fz * 11) * 0.3;
      ly = 0.7;
      fovAdd = reduced ? 0 : Math.max(-2, Math.min(7, ((b.v ?? 4) - 4.6) * 1.7)) - punch * 3;
      if (c.mode === 'intro') {
        // swing from beside the boat round to behind it
        const k = smooth(c.k ?? 1);
        const side = 1 - k;
        const sa = h + Math.PI * 0.6 * side;
        const dist = back * (1 - side * 0.3) + side * 3;
        px = b.x - Math.sin(sa) * dist;
        pz = b.z + Math.cos(sa) * dist;
        py = up * (1 - side * 0.45) + side * 0.6;
        lx = b.x + fx_ * 11 * k;
        lz = b.z + fz * 11 * k;
        ly = 0.9 + side * 0.4;
        follow = 1 - Math.exp(-dt * 8);
        fovAdd = -side * 8;
        roll = 0;
      }
      if (c.mode === 'finish') {
        if (camState.orbitFor !== b.id || !Number.isFinite(camState.orbit)) {
          camState.orbitFor = b.id;
          camState.orbit = Math.atan2(camState.x - b.x, camState.z - b.z);
        }
        camState.orbit += dt * 0.28;
        const a = camState.orbit;
        px = b.x + Math.sin(a) * 6.5;
        pz = b.z + Math.cos(a) * 6.5;
        py = 2.2;
        lx = b.x;
        lz = b.z;
        ly = 1.1;
        follow = 1 - Math.exp(-dt * 2);
        fovAdd = -6;
        roll = 0;
      }
    } else if (c.mode === 'title') {
      // a slow glide beside the leading boats, a little ahead, so the rowers and their oars are seen side-on; the
      // camera drifts from one side of the river to the other and keeps the boats clear of the title's corner
      const t = c.now ?? 0;
      const P = c.pack ?? (b ? { s: b.s, d: b.d } : { s: c.focusS ?? course.start, d: 0 });
      const lead = P.s;
      const front = P.top ?? lead;
      const bd = Number.isFinite(P.d) ? P.d : 0;
      const s = Math.max(course.start - 8, Math.min(course.total - 20, front + 7 + Math.sin(t * 0.09) * 1.5));
      const a = course.at(s);
      const sway = Math.sin(t * 0.035 + 0.8);
      let d = Math.max(-a.hw * 0.8, Math.min(a.hw * 0.8, bd + sway * 4));
      for (const o of course.rocks) {
        if (o.s < s - 4 || o.s > s + 2 || Math.abs(o.d - d) > o.r + 2) continue;
        d = Math.max(-a.hw * 0.8, Math.min(a.hw * 0.8, o.d + (o.d > bd ? -1 : 1) * (o.r + 2)));
      }
      const p = course.point(s, d);
      px = p.x;
      pz = p.z;
      py = (c.portrait ? 5.6 : 3.4) + Math.sin(t * 0.11) * 0.3;
      const q = course.point(Math.max(0, lead - 1), bd);
      lx = q.x;
      lz = q.z;
      if (!c.portrait) {
        // aim left of the boats so they sit right of the middle
        const vx = q.x - p.x;
        const vz = q.z - p.z;
        const vl = Math.hypot(vx, vz) || 1;
        lx += (vz / vl) * 1.6;
        lz -= (vx / vl) * 1.6;
      }
      ly = c.portrait ? -0.6 : 0.5;
      follow = 1 - Math.exp(-dt * 3);
    } else if (c.mode === 'dock') {
      const s = course.start - 4 - (c.portrait ? 17 : 12);
      const p = course.point(s, 0);
      const q = course.point(course.start - 3, 0);
      px = p.x;
      pz = p.z;
      py = c.portrait ? 6.5 : 4.2;
      lx = q.x;
      lz = q.z;
      ly = c.portrait ? 0.4 : 1.1;
      follow = 1 - Math.exp(-dt * 3);
    } else if (c.mode === 'boathouse' && b) {
      // close on the player's boat at its berth, a slow sway round its bow; the boat sits clear of the Boathouse sign
      const t = c.now ?? 0;
      // from the stern quarter: the rower faces the stern
      const a = b.h + Math.PI - 0.7 + Math.sin(t * 0.25) * 0.3;
      const dist = c.portrait ? 6.2 : 5.2;
      px = b.x + Math.sin(a) * dist;
      pz = b.z - Math.cos(a) * dist;
      py = c.portrait ? 2.6 : 1.9;
      const dx = b.x - px;
      const dz = b.z - pz;
      const dl = Math.hypot(dx, dz) || 1;
      const side = c.portrait ? 0 : 1.5;
      lx = b.x + (-dz / dl) * side;
      lz = b.z + (dx / dl) * side;
      ly = c.portrait ? -0.35 : 0.85;
      follow = 1 - Math.exp(-dt * 3);
    } else if (c.mode === 'fixed') {
      [px, py, pz] = c.pos;
      [lx, ly, lz] = c.look;
      follow = 1;
    } else if (c.mode === 'results') {
      // the stage, framed in the top of the screen (the results sit over the bottom), drifting a little
      const t = c.now ?? 0;
      const s = Math.min(course.total - 10, course.finish + 22);
      const a = course.at(s);
      const p = course.point(s - (c.portrait ? 17 : 12.5), Math.sin(t * 0.12) * 2.2);
      px = p.x;
      pz = p.z;
      py = c.portrait ? 5.2 : 3.4;
      lx = a.x;
      lz = a.z;
      ly = c.portrait ? -0.6 : 1.1;
      follow = 1 - Math.exp(-dt * 2);
    } else return;
    if (hitstop > 0) follow = 0;
    else if (slow > 0) {
      follow *= 0.3;
      fovAdd -= 7 * Math.min(1, slow / 0.4);
    }
    if (!camState.init || c.snap) {
      Object.assign(camState, { x: px, y: py, z: pz, lx, ly, lz, init: true, roll, fov: (c.fov ?? (c.portrait ? 66 : 58)) + fovAdd });
    } else {
      camState.x += (px - camState.x) * follow;
      camState.y += (py - camState.y) * follow;
      camState.z += (pz - camState.z) * follow;
      camState.lx += (lx - camState.lx) * follow;
      camState.ly += (ly - camState.ly) * follow;
      camState.lz += (lz - camState.lz) * follow;
      camState.roll += (roll - camState.roll) * Math.min(1, dt * 3);
    }
    camState.trauma = Math.max(0, camState.trauma - dt * 1.7);
    camState.punch = Math.max(0, camState.punch - dt * 2.2);
    const sh = reduced ? 0 : camState.trauma * camState.trauma;
    const n = c.now ?? 0;
    const jx = (Math.sin(n * 37) + Math.sin(n * 61) * 0.5) * sh * 0.3 + camState.shX * sh;
    const jz = (Math.sin(n * 31 + 2) + Math.sin(n * 53) * 0.5) * sh * 0.3 + camState.shZ * sh;
    camera.position.set(camState.x + jx, camState.y + Math.sin(n * 41 + 1) * sh * 0.22, camState.z + jz);
    look.set(camState.lx, camState.ly, camState.lz);
    camera.lookAt(look);
    camera.rotateZ(camState.roll);
    const fov = (c.fov ?? (c.portrait ? 66 : 58)) + fovAdd;
    camState.fov += (fov - camState.fov) * Math.min(1, dt * 4);
    if (Math.abs(camera.fov - camState.fov) > 0.01) {
      camera.fov = camState.fov;
      camera.updateProjectionMatrix();
    }
  }

  // ---------------------------------------------------------------- the frame

  const lightList = [];
  let packAt = null;
  const strokeV = new THREE.Vector3();
  const bowV = new THREE.Vector3();
  /**
   * f: { now, dt, t (song time), B (beat position), pulse (0-1), boats: [{ id, x, z, h, s, d, v, c, k, ls, lq, f, away,
   * hidden, mood }], meId, focusId, focusS, ripples, oar: { s, d, glow }, ghost: { x, z, h } | null, calm (0-1),
   * camera: {...}, arch: { count, finishLit, sign } }
   */
  function frame(f) {
    if (!cur) return;
    const { course, water, river, dream } = cur;
    const now = f.now;
    lastNow = now;
    let dt = Math.min(0.1, f.dt);
    hitstop = Math.max(0, hitstop - dt);
    slow = Math.max(0, slow - dt);
    const fxDt = hitstop > 0 ? dt * 0.12 : slow > 0 ? dt * (0.25 + 0.75 * Math.pow(1 - slow / slowFor, 3)) : dt;
    // boats
    const wakes = [];
    let focus = null;
    for (const b of f.boats) {
      const m = hulls.get(b.id);
      if (!m) continue;
      m.group.visible = !b.hidden;
      m.group.position.set(b.x, 0, b.z);
      m.setNear(b.id !== f.focusId && (b.x - camera.position.x) ** 2 + (b.z - camera.position.z) ** 2 < 36);
      m.group.rotation.y = -b.h;
      const mine = b.id === f.meId;
      const lvl = Math.max(1, Math.min(4, (b.c | 0) + 1));
      if (m.level !== lvl) {
        if (mine && lvl < m.level) {
          const l = m.lanterns[lvl];
          if (l) {
            l.mesh.getWorldPosition(v3);
            fx.smoke(v3.x, v3.y, v3.z);
          }
        }
        if (mine && lvl > m.level) {
          const l = m.lanterns[lvl - 1];
          if (l) {
            l.mesh.getWorldPosition(v3);
            fx.lantern(v3.x, v3.y, v3.z, m.look.lantern);
          }
        }
        m.setLevel(lvl, m.lastK < 0);
      }
      const near = Math.abs(b.s - (f.focusS ?? b.s)) < 40;
      // a new stroke: oars, spray and a ring on the water from each blade
      if (m.lastK >= 0 && b.k > m.lastK && !b.away) {
        const kind = KINDS[b.lq] ?? 'good';
        m.stroke(b.ls, kind);
        if (near) {
          const fxx = Math.sin(b.h);
          const fzz = -Math.cos(b.h);
          for (const side of b.ls === 0 ? [-1, 1] : [b.ls]) {
            m.oarTip(side, strokeV);
            fx.oar(strokeV.x, strokeV.z, kind, fxx, fzz, mine);
            const ring = !mine ? RING.splash : kind === 'pull' || (b.ls === 0 && (kind === 'perfect' || kind === 'good')) ? RING.pull : kind === 'perfect' ? RING.perfect : kind === 'good' || kind === 'drop' ? RING.good : RING.splash;
            water.ring(strokeV.x, strokeV.z, now, ring);
          }
          if (kind === 'pull') fx.pull(b.x, b.z, fxx, fzz);
        }
      }
      m.lastK = b.k;
      // the rower's mood: cheer over the line, slump when away
      let mood = b.mood ?? 'row';
      if (!b.mood) {
        if (b.away) mood = 'slump';
        else if (b.f) {
          if (m.finAt < 0) m.finAt = now;
          mood = now - m.finAt < 3.5 ? 'cheer' : 'wave';
        } else m.finAt = -1;
      }
      m.pose(mood);
      // the head turns to look over a shoulder at a bend ahead
      const hd = wrapA(course.at(Math.min(course.total, b.s + 14)).h - b.h);
      m.update(fxDt, now, { v: b.v, away: b.away, finished: b.f, wave: b.rapids ?? 0, look: Math.max(-1, Math.min(1, -hd * 2.2)), lanternPulse: mine ? f.pulse ?? 0 : 0 });
      if (near) {
        for (const p of m.takeDrips()) {
          fx.drip(p.x, p.y, p.z);
          water.ring(p.x, p.z, now + 0.12, RING.splash);
        }
      } else m.takeDrips();
      if (!b.hidden) wakes.push({ x: b.x, z: b.z, h: b.h, v: b.away ? 0 : Math.max(b.v, 0.5) });
      if (b.id === f.focusId) focus = b;
      if (Math.abs(b.s - (f.focusS ?? b.s)) < 30 && !b.away) {
        fx.wake(b.x, b.z, Math.sin(b.h), -Math.cos(b.h), b.v, b.slip, mine || Math.random() < 0.5 ? m.look.wake : null);
        if ((b.rapids ?? 0) > 0.5) fx.foam(b.x, b.z, 0.5);
      }
    }
    lastFocus = focus;
    if (ghost && f.ghost) {
      ghost.group.visible = true;
      ghost.group.position.set(f.ghost.x, 0, f.ghost.z);
      ghost.group.rotation.y = -f.ghost.h;
      ghost.update(dt, now, {});
    } else if (ghost) ghost.group.visible = false;
    water.setBoats(wakes.sort((a, b) => dist2(a, f.focus) - dist2(b, f.focus)).slice(0, 6));
    // the water
    water.uniforms.uTime.value = now;
    water.setMirror(world.mirror);
    water.setRipples(f.ripples ?? []);
    if (f.oar) water.setOar(f.oar.s, f.oar.d, f.oar.glow, true);
    else water.setOar(0, 0, 0, false);
    water.uniforms.uCalm.value = f.calm ?? 0;
    // the river: lanterns pulse on the beat; the nearest lanterns get the real lights
    river.update(f.t ?? 0, f.focusS ?? course.start, f.pulse ?? 0, now);
    river.swing(f.B ?? 0);
    dream.tick(now, f.B ?? 0, f.pulse ?? 0);
    cur.blooms.update(now, f.pulse ?? 0, f.got ?? null);
    const fs = f.focusS ?? course.start;
    lightList.length = 0;
    for (const l of cur.lights) {
      const ds = l.s - fs;
      if (ds > -6 && ds < 45) lightList.push(l);
    }
    lightList.sort((a, b) => Math.abs(a.s - fs - 8) - Math.abs(b.s - fs - 8));
    if (podium && f.camera?.mode === 'results') world.setPool(podium.userData.lights, 0.4);
    else world.setPool(lightList.slice(0, 3).map((l) => ({ x: l.x, y: l.y + 0.3, z: l.z })), f.pulse ?? 0);
    const streaks = lightList.slice(0, 3).map((l) => ({ x: l.x, z: l.z, i: 0.55 + (f.pulse ?? 0) * 0.35 }));
    // the focused boat's lanterns light it and the water around it
    const fm = focus ? hulls.get(focus.id) : null;
    if (focus && fm && f.beam !== false) {
      fm.tilt.localToWorld(bowV.set(0, 1.55, -1.45));
      const sx = focus.x - Math.sin(focus.h) * 2.6;
      const sz = focus.z + Math.cos(focus.h) * 2.6;
      world.setBow({ x: bowV.x, y: bowV.y, z: bowV.z, sx, sy: 1.6, sz }, (0.45 + 0.55 * ((focus.c | 0) + 1) / 4) * (typeof f.beam === 'number' ? f.beam : 1));
      streaks.push({ x: bowV.x, z: bowV.z, i: 0.25 + 0.15 * (focus.c | 0) });
    } else world.setBow(null);
    water.setLights(streaks);
    if (f.arch) {
      river.arches.start.light(f.arch.count ?? 0);
      river.arches.finish.light(f.arch.finishLit ?? 9);
      river.arches.finish.sign?.set(f.arch.sign ?? '');
    }
    for (const p of dream.foam) {
      if (Math.abs(p.s - fs) < 50) {
        const q = course.point(p.s, p.d);
        fx.foam(q.x, q.z, 0.6);
      }
    }
    if ((f.calm ?? 0) > 0.5 && focus) fx.firefly(focus.x + Math.sin(focus.h) * 8, focus.z - Math.cos(focus.h) * 8);
    if (podium) {
      for (const fig of podium.userData.figs) fig.update(dt, now, {});
      if (Math.random() < 0.6) fx.confetti(podium.position.x, 9, podium.position.z);
    }
    fx.update(fxDt, now);
    let pack = null;
    if (f.camera?.mode === 'title' && f.boats?.length) {
      // the middle of the leading group (boats within 10 m of the front), followed smoothly
      let top = -Infinity;
      for (const b of f.boats) if (!b.hidden && b.s > top) top = b.s;
      let ps = 0;
      let pd = 0;
      let pn = 0;
      for (const b of f.boats) {
        if (b.hidden || b.s < top - 10) continue;
        ps += b.s;
        pd += b.d ?? 0;
        pn++;
      }
      if (pn) {
        ps /= pn;
        pd /= pn;
        // the front moves smoothly by itself; only the group's shape behind it is eased
        if (!packAt || Math.abs(packAt.top - top) > 40) packAt = { top, off: ps - top, d: pd, s: ps };
        const k = 1 - Math.exp(-dt * 1.5);
        packAt.top = top;
        packAt.off += (ps - top - packAt.off) * k;
        packAt.d += (pd - packAt.d) * k;
        packAt.s = top + packAt.off;
        pack = packAt;
      }
    }
    if (f.camera) placeCamera({ ...f.camera, dt, now, boat: f.camera.boat ?? focus, focusS: fs, pack });
    v4.set(camera.position.x, 0, camera.position.z);
    world.follow(focus ? v3.set(focus.x, 0, focus.z) : v4, now, dt);
    if (f.render !== false) {
      // a new dream's materials compile off the page's main thread first (the last picture stays up meanwhile, at most
      // a few seconds), so loading one never freezes the page
      if (needWarm) {
        needWarm = false;
        if (!poster) warm();
      }
      if (!warming || performance.now() - warmAt > 4000) world.render(dt);
    }
  }

  return {
    world,
    fx,
    load,
    setBoats,
    setGhost,
    showPodium,
    hidePodium,
    frame,
    hulls,
    get current() {
      return cur;
    },
    /** The player took moonbloom i (run: how many in a row from one line). */
    bloom(i, run = 0) {
      if (!cur) return;
      const m = cur.course.blooms?.[i];
      if (!m) return;
      cur.blooms.take(i, lastNow);
      fx.bloom(m.x, m.z, run);
      cur.water.ring(m.x, m.z, lastNow, RING.bloom);
    },
    /** Every bloom back on the water (the same stream rowed again). */
    resetBlooms() {
      cur?.blooms.reset();
    },
    /** A pull landed: a push in for the surge. */
    pull() {
      if (!reduced) camState.punch = Math.min(1.2, camState.punch + 0.2);
    },
    /** A merrily rush: sparks wind round the focused boat. */
    rush() {
      const b = lastFocus;
      if (!b) return;
      fx.rush(b.x, b.z);
      if (cur) cur.water.ring(b.x, b.z, lastNow, RING.pull);
    },
    /** Shake the camera; (dx, dz) pushes it that way (a bump from a side). */
    shake(amount, dx = 0, dz = 0) {
      camState.trauma = Math.min(1, camState.trauma + amount);
      camState.shX = dx * 0.5;
      camState.shZ = dz * 0.5;
    },
    /** A short push in (a big moment). */
    punch(amount = 1) {
      if (!reduced) camState.punch = Math.min(1.2, camState.punch + amount);
    },
    /** Slow motion for a moment (the finish): the sparks hang and the camera drifts in close. */
    slowmo(secs = 1.2) {
      if (reduced) return;
      slow = Math.max(slow, secs);
      slowFor = Math.max(slow, 0.01);
    },
    /** Freeze the camera and slow the sparks for a moment. */
    hitstop(secs = 0.08) {
      if (!reduced) hitstop = Math.max(hitstop, secs);
    },
    flash(color, amount) {
      if (!reduced) world.setFlash(color, amount);
    },
    setReduced(r) {
      reduced = r;
      fx.setReduced(r);
    },
    resize(w, h, pr) {
      world.resize(w, h);
      fx.setScale(pr * (h / 900));
    },
    /** Screen position of a world point (CSS px), or null behind the camera. */
    project(x, y, z, w, h) {
      v3.set(x, y, z).project(camera);
      if (v3.z > 1) return null;
      return { x: (v3.x * 0.5 + 0.5) * w, y: (-v3.y * 0.5 + 0.5) * h };
    },
    snapCamera() {
      camState.init = false;
    },
  };
}

const wrapA = (a) => {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
};
const smooth = (k) => {
  const t = Math.max(0, Math.min(1, k));
  return t * t * (3 - 2 * t);
};
const dist2 = (a, b) => (b ? (a.x - b.x) ** 2 + (a.z - b.z) ** 2 : 0);
