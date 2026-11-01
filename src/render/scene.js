// The 3D scene of one stream: water, river, the dream's set pieces, the boats, particles, light and the camera, driven
// once a frame from plain race state.

import * as THREE from 'three';
import { createWorld } from './world.js';
import { createWater } from './water.js';
import { createRiver } from './river.js';
import { createDream } from './dreams.js';
import { createBoatMesh } from './boats.js';
import { createFx } from './fx.js';
import { themeOf } from './themes.js';
import { G } from './kit.js';

const v3 = new THREE.Vector3();
const v4 = new THREE.Vector3();
const look = new THREE.Vector3();

export function createScene(canvas, { poster = false } = {}) {
  const world = createWorld(canvas, { poster });
  const { scene, camera } = world;
  const fx = createFx(scene);
  let cur = null;
  const hulls = new Map();
  let ghost = null;
  let podium = null;
  let reduced = false;

  // ---------------------------------------------------------------- loading a stream

  function load(stream, course) {
    if (cur && cur.id === stream.id) return cur;
    if (cur) {
      scene.remove(cur.water.mesh, cur.river.group, cur.dream.group);
      cur.water.dispose();
      disposeTree(cur.river.group);
      disposeTree(cur.dream.group);
    }
    const theme = themeOf(stream.id);
    world.setTheme(theme, course);
    const water = createWater(course, theme);
    water.setMoon(world.moonDir);
    const river = createRiver(course, stream.id, theme);
    const dream = createDream(course, stream.id);
    scene.add(water.mesh, river.group, dream.group);
    const lights = [...river.lanterns, ...dream.lights.map((p) => ({ x: p.x, y: p.y, z: p.z, s: course.locate(p.x, p.z).s }))];
    cur = { id: stream.id, stream, course, theme, water, river, dream, lights };
    fx.clear();
    // shadow casters changed: let materials pick the light setup up
    world.setQuality(world.quality, world.renderer.getPixelRatio());
    return cur;
  }

  function disposeTree(o) {
    o.traverse((n) => {
      if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose?.();
      if (n.material) for (const m of Array.isArray(n.material) ? n.material : [n.material]) m.dispose?.();
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
      if (m && m.look.paint !== s.look.paint) {
        scene.remove(m.group);
        hulls.delete(s.id);
        m = null;
      }
      if (!m) {
        m = createBoatMesh(s.look);
        m.lastK = -1;
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

  function showPodium(top, looks) {
    hidePodium();
    if (!cur) return;
    const c = cur.course;
    const s = Math.min(c.total - 10, c.finish + 22);
    const a = c.at(s);
    podium = new THREE.Group();
    podium.position.set(a.x, 0, a.z);
    podium.rotation.y = -a.h + Math.PI;
    const cols = ['#F2A7B6', '#f4ebd0', '#B7A5E8', '#9CC5A1', '#FFB547'];
    const heights = [3, 2, 1];
    const xs = [0, -4.2, 4.2];
    podium.userData.figs = [];
    top.forEach((id, i) => {
      if (i > 2) return;
      for (let k = 0; k < heights[i]; k++) {
        const m = new THREE.Mesh(G.rbox(3.4, 1.15, 2.6, 0.5), new THREE.MeshStandardMaterial({ color: cols[(i * 2 + k) % cols.length], roughness: 0.9 }));
        m.position.set(xs[i], 0.6 + k * 1.1, 0);
        m.rotation.y = (k % 2 ? 0.12 : -0.08) * (i + 1);
        m.castShadow = true;
        m.receiveShadow = true;
        podium.add(m);
      }
      const lk = looks.get(id);
      if (lk) {
        const fig = createBoatMesh(lk);
        // only the rower: stand them on top of the stack
        fig.group.position.set(xs[i], heights[i] * 1.1 + 0.1 - 0.32, 0);
        fig.group.children[0].children.forEach((ch) => {
          if (!ch.isGroup || ch.children.length < 2) ch.visible = false;
        });
        fig.group.rotation.y = Math.PI;
        podium.add(fig.group);
        podium.userData.figs.push(fig);
      }
    });
    scene.add(podium);
  }
  function hidePodium() {
    if (!podium) return;
    scene.remove(podium);
    podium = null;
  }

  // ---------------------------------------------------------------- camera

  const camState = { h: 0, x: 0, y: 4, z: 8, lx: 0, ly: 0, lz: 0, trauma: 0, init: false, mode: '' };

  /**
   * Place the camera. c: { mode: 'race' | 'intro' | 'title' | 'dock' | 'finish' | 'results' | 'spectate', boat, k (0-1
   * intro progress), portrait, push (0-1), beat (0-1), dt, now, snap }.
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
    let follow = 1 - Math.exp(-dt * 5);
    if (c.mode !== camState.mode) {
      camState.mode = c.mode;
      if (c.snap) camState.init = false;
    }
    if ((c.mode === 'race' || c.mode === 'spectate' || c.mode === 'intro' || c.mode === 'finish') && b) {
      if (!camState.init) camState.h = b.h;
      camState.h += wrapA(b.h - camState.h) * (1 - Math.exp(-dt * (c.mode === 'finish' ? 1 : 3.2)));
      const h = camState.h;
      const fx_ = Math.sin(h);
      const fz = -Math.cos(h);
      const back = (c.portrait ? 9.5 : 7) * (1 - 0.08 * (c.push ?? 0)) + (c.mode === 'spectate' ? 3 : 0);
      const up = (c.portrait ? 4.6 : 3.2) + (c.mode === 'spectate' ? 2 : 0);
      const ahead = c.portrait ? 13 : 10;
      const lean = wrapA(b.h - h) * 2.2;
      px = b.x - fx_ * back + Math.cos(h) * lean;
      pz = b.z - fz * back + Math.sin(h) * lean;
      py = up + Math.sin((c.beat ?? 0) * Math.PI * 2) * 0.05;
      lx = b.x + fx_ * ahead;
      lz = b.z + fz * ahead;
      ly = 0.6;
      if (c.mode === 'intro') {
        // swing from beside the boat round to behind it
        const k = smooth(c.k ?? 1);
        const side = 1 - k;
        const sa = h + Math.PI * 0.55 * side;
        const dist = back + side * 6;
        px = b.x - Math.sin(sa) * dist;
        pz = b.z + Math.cos(sa) * dist;
        py = up + side * 3;
        lx = b.x + fx_ * ahead * k;
        lz = b.z + fz * ahead * k;
        ly = 0.6 + side * 0.8;
        follow = 1 - Math.exp(-dt * 8);
      }
      if (c.mode === 'finish') {
        const a = (c.now ?? 0) * 0.25;
        px = b.x + Math.sin(a) * 9;
        pz = b.z + Math.cos(a) * 9;
        py = 3.4;
        lx = b.x;
        lz = b.z;
        ly = 1;
        follow = 1 - Math.exp(-dt * 2);
      }
    } else if (c.mode === 'title') {
      // a slow glide along the river, low over the water, looking back at the boats
      const t = c.now ?? 0;
      const s = Math.max(course.start, Math.min(course.total - 30, (c.focusS ?? course.start) + 11 + Math.sin(t * 0.07) * 4));
      const a = course.at(s);
      const d = Math.sin(t * 0.05) * a.hw * 0.55;
      const p = course.point(s, d);
      px = p.x;
      pz = p.z;
      py = 1.5 + Math.sin(t * 0.11) * 0.35;
      const q = course.point(Math.max(0, s - 14), d * 0.2);
      lx = q.x;
      lz = q.z;
      ly = 1.2;
      follow = 1 - Math.exp(-dt * 1.5);
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
    } else if (c.mode === 'fixed') {
      // a staged shot (posters): exactly here, looking there
      [px, py, pz] = c.pos;
      [lx, ly, lz] = c.look;
      follow = 1;
    } else if (c.mode === 'results') {
      const s = Math.min(course.total - 10, course.finish + 22);
      const a = course.at(s);
      const p = course.point(s - 13, 0);
      px = p.x;
      pz = p.z;
      py = 5.2;
      lx = a.x;
      lz = a.z;
      ly = 2.6;
      follow = 1 - Math.exp(-dt * 2);
    } else return;
    if (!camState.init || c.snap) {
      Object.assign(camState, { x: px, y: py, z: pz, lx, ly, lz, init: true });
    } else {
      camState.x += (px - camState.x) * follow;
      camState.y += (py - camState.y) * follow;
      camState.z += (pz - camState.z) * follow;
      camState.lx += (lx - camState.lx) * follow;
      camState.ly += (ly - camState.ly) * follow;
      camState.lz += (lz - camState.lz) * follow;
    }
    camState.trauma = Math.max(0, camState.trauma - dt * 1.6);
    const sh = reduced ? 0 : camState.trauma * camState.trauma;
    const n = c.now ?? 0;
    camera.position.set(camState.x + Math.sin(n * 37) * sh * 0.35, camState.y + Math.sin(n * 41 + 1) * sh * 0.25, camState.z + Math.sin(n * 31 + 2) * sh * 0.35);
    look.set(camState.lx, camState.ly, camState.lz);
    camera.lookAt(look);
    const fov = c.fov ?? (c.portrait ? 66 : 58);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  // ---------------------------------------------------------------- the frame

  const lightList = [];
  const strokeV = new THREE.Vector3();
  /**
   * f: { now, dt, t (song time), B (beat position), pulse (0-1), boats: [{ id, x, z, h, s, v, c, k, ls, lq, f, away, ghost
   * }], meId, ripples, oar: { s, d, glow }, ghost: { x, z, h } | null, calm (0-1), camera: {...}, arch: { count, finishLit,
   * sign } }
   */
  function frame(f) {
    if (!cur) return;
    const { course, water, river, dream } = cur;
    const now = f.now;
    const dt = Math.min(0.1, f.dt);
    // boats
    const wakes = [];
    let focus = null;
    for (const b of f.boats) {
      const m = hulls.get(b.id);
      if (!m) continue;
      m.group.visible = !b.hidden;
      m.group.position.set(b.x, 0, b.z);
      m.group.rotation.y = -b.h;
      const lvl = Math.max(1, Math.min(4, (b.c | 0) + 1));
      if (m.level !== lvl) {
        if (lvl < m.level && b.id === f.meId) {
          const l = m.lanterns[lvl];
          if (l) {
            l.mesh.getWorldPosition(v3);
            fx.smoke(v3.x, v3.y, v3.z);
          }
        }
        if (lvl > m.level && b.id === f.meId) {
          const l = m.lanterns[lvl - 1];
          if (l) {
            l.mesh.getWorldPosition(v3);
            fx.lantern(v3.x, v3.y, v3.z);
          }
        }
        m.setLevel(lvl, m.lastK < 0);
      }
      // a new stroke: oars and spray
      if (m.lastK >= 0 && b.k > m.lastK && !b.away) {
        const kind = ['free', 'perfect', 'good', 'splash', 'both', 'free'][b.lq] ?? 'good';
        m.stroke(b.ls, kind);
        const fxx = Math.sin(b.h);
        const fzz = -Math.cos(b.h);
        const near = Math.abs(b.s - (f.focusS ?? b.s)) < 40;
        if (near) {
          for (const side of b.ls === 0 ? [-1, 1] : [b.ls]) {
            m.oarTip(side, strokeV);
            fx.oar(strokeV.x, strokeV.z, kind, fxx, fzz);
          }
        }
      }
      m.lastK = b.k;
      m.update(dt, now, { v: b.v, away: b.away, finished: b.f, wave: b.rapids ?? 0 });
      if (!b.hidden) wakes.push({ x: b.x, z: b.z, h: b.h, v: b.away ? 0 : Math.max(b.v, 0.5) });
      if (b.id === f.focusId) focus = b;
      if (Math.abs(b.s - (f.focusS ?? b.s)) < 30 && !b.away) {
        fx.wake(b.x, b.z, Math.sin(b.h), -Math.cos(b.h), b.v, b.slip);
        if ((b.rapids ?? 0) > 0.5) fx.foam(b.x, b.z, 0.5);
      }
    }
    if (ghost && f.ghost) {
      ghost.group.visible = true;
      ghost.group.position.set(f.ghost.x, 0, f.ghost.z);
      ghost.group.rotation.y = -f.ghost.h;
      ghost.update(dt, now, {});
    } else if (ghost) ghost.group.visible = false;
    water.setBoats(wakes.sort((a, b) => dist2(a, f.focus) - dist2(b, f.focus)).slice(0, 6));
    // the water
    water.uniforms.uTime.value = now;
    water.setRipples(f.ripples ?? []);
    if (f.oar) water.setOar(f.oar.s, f.oar.d, f.oar.glow);
    water.uniforms.uRipOn.value = f.oar ? 1 : 0;
    water.uniforms.uCalm.value = f.calm ?? 0;
    // the river: lanterns pulse on the beat; the nearest lanterns get the real lights
    river.update(f.t ?? 0, f.focusS ?? course.start, f.pulse ?? 0, now);
    river.swing(f.B ?? 0);
    dream.tick(now, f.B ?? 0);
    const fs = f.focusS ?? course.start;
    lightList.length = 0;
    for (const l of cur.lights) {
      const ds = l.s - fs;
      if (ds > -6 && ds < 45) lightList.push(l);
    }
    lightList.sort((a, b) => Math.abs(a.s - fs - 8) - Math.abs(b.s - fs - 8));
    world.setPool(lightList.slice(0, 3).map((l) => ({ x: l.x, y: l.y + 0.3, z: l.z })), f.pulse ?? 0);
    const streaks = lightList.slice(0, 3).map((l) => ({ x: l.x, z: l.z, i: 0.55 + (f.pulse ?? 0) * 0.35 }));
    // the bow lantern's beam
    if (focus && f.beam !== false) {
      const fxx = Math.sin(focus.h);
      const fzz = -Math.cos(focus.h);
      world.setBeam(true, focus.x + fxx * 1.5, 2.2, focus.z + fzz * 1.5, focus.h, 0.6 + 0.4 * ((focus.c | 0) + 1) / 4);
      streaks.push({ x: focus.x + fxx * 4, z: focus.z + fzz * 4, i: 0.25 + 0.15 * (focus.c | 0) });
    } else world.setBeam(false);
    water.setLights(streaks);
    // arches: count-in lanterns, the finish arch's closing lanterns and clock
    if (f.arch) {
      river.arches.start.light(f.arch.count ?? 0);
      river.arches.finish.light(f.arch.finishLit ?? 9);
      river.arches.finish.sign?.set(f.arch.sign ?? '');
    }
    // white water at the dream's falls
    for (const p of dream.foam) {
      if (Math.abs(p.s - fs) < 50) {
        const q = course.point(p.s, p.d);
        fx.foam(q.x, q.z, 0.6);
      }
    }
    if ((f.calm ?? 0) > 0.5 && focus) fx.firefly(focus.x + Math.sin(focus.h) * 8, focus.z - Math.cos(focus.h) * 8);
    if (podium) {
      for (const [i, fig] of podium.userData.figs.entries()) {
        fig.update(dt, now, {});
        fig.group.position.y += Math.abs(Math.sin(now * 4 + i)) * 0.012;
      }
      if (Math.random() < 0.6) fx.confetti(podium.position.x, 9, podium.position.z);
    }
    fx.update(dt, now);
    if (f.camera) placeCamera({ ...f.camera, dt, now, boat: f.camera.boat ?? focus, focusS: fs });
    v4.set(camera.position.x, 0, camera.position.z);
    world.follow(focus ? v3.set(focus.x, 0, focus.z) : v4, now);
    if (f.render !== false) world.render();
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
    shake(amount) {
      camState.trauma = Math.min(1, camState.trauma + amount);
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
