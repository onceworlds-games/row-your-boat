// Small things along the banks, instanced in chunks along the river (so the camera only draws what is near): grass and
// reeds that sway, flowers, mushrooms that glow, pebbles, and each dream's own clutter (marbles and crayons on the
// bedroom floor, sugar cubes on the tablecloth, candles, pages, bolts, crystals).

import * as THREE from 'three';
import { G, srand } from './kit.js';

/** The wind's clock for everything that sways. */
export const SWAY_TIME = { value: 0 };

const col = new THREE.Color();

/** Merge pieces into one geometry with colour and a sway weight (aSway: 0 at the root, 1 at the top). */
function proto(pieces, swayH = 0) {
  const list = [];
  for (const [geo, color, m, tip] of pieces) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    const sw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const y = g.attributes.position.getY(i);
      col.set(typeof color === 'function' ? color(y) : color);
      c.set([col.r, col.g, col.b], i * 3);
      sw[i] = swayH > 0 ? Math.max(0, Math.min(1.5, y / swayH)) * (tip ?? 1) : 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
    list.push(g);
  }
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3], ['aSway', 1]]) {
    const arr = new Float32Array(count * size);
    let o = 0;
    for (const g of list) {
      arr.set(g.attributes[name].array, o);
      o += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  list.forEach((g) => g.dispose());
  out.computeBoundingSphere();
  return out;
}

const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, sy = s, sz = s) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, sy, sz));

/** A blade of grass: a narrow bent strip. */
function blade(h, w, bend) {
  const pos = [];
  const N = 4;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const ww = w * (1 - t * 0.9);
    const z = bend * t * t;
    pos.push(-ww / 2, h * t, z, ww / 2, h * t, z);
  }
  const idx = [];
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const R0 = srand(4242);
const PROTOS = {
  grass: () => {
    const p = [];
    for (let k = 0; k < 9; k++) {
      const h = 0.28 + R0() * 0.3;
      p.push([blade(h, 0.05, 0.08 + R0() * 0.12), (y) => (y < 0.1 ? '#2f4a2c' : y < 0.3 ? '#4f7a3e' : '#8fb86a'), M((R0() - 0.5) * 0.18, 0, (R0() - 0.5) * 0.18, 0, R0() * Math.PI * 2, (R0() - 0.5) * 0.5)]);
    }
    return proto(p, 0.5);
  },
  reed: () => {
    const p = [];
    for (let k = 0; k < 4; k++) {
      const h = 1.0 + R0() * 0.8;
      const x = (R0() - 0.5) * 0.3;
      const z = (R0() - 0.5) * 0.3;
      const lean = (R0() - 0.5) * 0.15;
      p.push([G.cyl(0.008, 0.016, h, 5), '#5f7a44', M(x, h / 2, z, 0, 0, lean)]);
      if (k < 2) p.push([G.capsule(0.035, 0.16, 6), '#6a4630', M(x - Math.sin(lean) * h, h + 0.02, z, 0, 0, lean)]);
      p.push([blade(h * 0.8, 0.04, 0.25), '#6f8f4e', M(x, 0, z, 0, R0() * 6, 0)]);
    }
    return proto(p, 1.6);
  },
  flower: () => {
    const p = [[G.cyl(0.008, 0.012, 0.42, 5), '#4a6e3a', M(0, 0.21, 0)], [blade(0.22, 0.06, 0.1), '#5a8a44', M(0, 0, 0, 0, 1, 0)]];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      p.push([G.sphere(0.045, 8, 6), '#ffffff', M(Math.cos(a) * 0.05, 0.43, Math.sin(a) * 0.05, 0, 0, 0, 1, 0.45, 1)]);
    }
    p.push([G.sphere(0.028, 8, 6), '#ffc95a', M(0, 0.45, 0)]);
    return proto(p, 0.45);
  },
  mushroom: () => proto([[G.cyl(0.035, 0.045, 0.16, 8), '#efe6d6', M(0, 0.08, 0)], [G.half(0.11, 14, 6), '#ffffff', M(0, 0.15, 0, 0, 0, 0, 1, 0.75, 1)]]),
  cap: () => proto([[G.half(0.106, 14, 6), '#ffffff', M(0, 0.152, 0, 0, 0, 0, 1.02, 0.78, 1.02)]]),
  pebble: () => proto([[G.ico(0.12, 1), '#ffffff', M(0, 0.03, 0, 0, 0, 0, 1, 0.5, 0.8)]]),
  marble: () => proto([[G.sphere(0.13, 14, 10), '#ffffff', M(0, 0.13, 0)]]),
  block: () => proto([[G.rbox(0.42, 0.42, 0.42, 0.06), '#ffffff', M(0, 0.21, 0)]]),
  crayon: () => proto([[G.cyl(0.06, 0.06, 0.8, 6), '#ffffff', M(0, 0.06, 0, 0, 0, Math.PI / 2)], [G.cone(0.06, 0.16, 6), '#ffffff', M(0.48, 0.06, 0, 0, 0, -Math.PI / 2)], [G.cyl(0.062, 0.062, 0.45, 6), '#f4ebd0', M(-0.05, 0.06, 0, 0, 0, Math.PI / 2)]]),
  sugar: () => proto([[G.rbox(0.36, 0.36, 0.36, 0.04), '#fbf8f2', M(0, 0.18, 0)]]),
  biscuit: () => proto([[G.cyl(0.32, 0.32, 0.08, 18), '#d9a85e', M(0, 0.04, 0)], [G.cyl(0.26, 0.26, 0.09, 18), '#e9c482', M(0, 0.045, 0)]]),
  berry: () => proto([[G.sphere(0.16, 12, 10), '#d8333f', M(0, 0.15, 0, 0, 0, 0, 1, 1.25, 1)], [G.cone(0.1, 0.06, 6), '#3f7a3a', M(0, 0.33, 0, Math.PI)]]),
  candle: () => proto([[G.cyl(0.07, 0.075, 0.42, 10), '#f4ebd0', M(0, 0.21, 0)], [G.cyl(0.12, 0.13, 0.03, 12), '#c9a24e', M(0, 0.015, 0)]]),
  flame: () => proto([[G.sphere(0.04, 8, 6), '#ffd27a', M(0, 0.47, 0, 0, 0, 0, 1, 1.8, 1)]]),
  page: () => proto([[G.box(0.5, 0.012, 0.66), '#f1e6cc', M(0, 0.01, 0)], [G.box(0.4, 0.014, 0.012), '#8a7a6a', M(0, 0.017, -0.15)], [G.box(0.36, 0.014, 0.012), '#8a7a6a', M(0, 0.017, 0)], [G.box(0.38, 0.014, 0.012), '#8a7a6a', M(0, 0.017, 0.15)]]),
  pencil: () => proto([[G.cyl(0.035, 0.035, 0.9, 6), '#e2bd52', M(0, 0.035, 0, 0, 0, Math.PI / 2)], [G.cone(0.035, 0.12, 6), '#e8c9a0', M(0.51, 0.035, 0, 0, 0, -Math.PI / 2)], [G.cyl(0.037, 0.037, 0.1, 6), '#F2A7B6', M(-0.48, 0.035, 0, 0, 0, Math.PI / 2)]]),
  books: () => proto([[G.rbox(0.9, 0.18, 0.62, 0.02), '#7a2e34', M(0, 0.09, 0)], [G.rbox(0.8, 0.16, 0.56, 0.02), '#2f5a4a', M(0.03, 0.26, 0, 0, 0.2, 0)], [G.rbox(0.72, 0.15, 0.5, 0.02), '#2e3f73', M(-0.02, 0.42, 0, 0, -0.15, 0)]]),
  bolt: () => proto([[G.cyl(0.1, 0.1, 0.07, 6), '#ffffff', M(0, 0.035, 0)], [G.cyl(0.045, 0.045, 0.32, 8), '#ffffff', M(0, 0.07, 0.14, Math.PI / 2, 0, 0)]]),
  cog: () => proto([[G.cog(0.32, 0.07, 10, 0.08), '#ffffff', M(0, 0.04, 0)]]),
  crystal: () => proto([[G.ico(0.18, 0), '#ffffff', M(0, 0.22, 0, 0, 0, 0, 0.6, 1.6, 0.6)], [G.ico(0.11, 0), '#ffffff', M(0.12, 0.12, 0.05, 0, 0, -0.5, 0.6, 1.4, 0.6)]]),
  puff: () => proto([[G.sphere(0.5, 12, 8), '#ffffff', M(0, 0.1, 0, 0, 0, 0, 1, 0.55, 1)], [G.sphere(0.36, 12, 8), '#ffffff', M(0.4, 0.15, 0.1, 0, 0, 0, 1, 0.6, 1)]]),
};
const protoCache = new Map();
const protoOf = (name) => {
  if (!protoCache.has(name)) {
    const g = PROTOS[name]();
    g.userData.shared = true;
    protoCache.set(name, g);
  }
  return protoCache.get(name);
};

/**
 * What lies along each dream's banks: [proto, density (per metre per bank), offsets from the water [min, max],
 * scale [min, max], colours, { glow, gloss, from, to (s range), lie (lying down) }].
 */
const RECIPES = {
  bedtime: [
    ['marble', 0.07, [0.4, 6], [0.8, 1.3], ['#7fb3d5', '#F2A7B6', '#9CC5A1', '#FFB547', '#B7A5E8'], { gloss: true, to: 368 }],
    ['block', 0.025, [1.2, 9], [0.8, 1.6], ['#F2A7B6', '#9CC5A1', '#FFB547', '#B7A5E8', '#E5533D'], { to: 368 }],
    ['crayon', 0.03, [0.8, 8], [0.9, 1.2], ['#E5533D', '#5b87c5', '#9CC5A1', '#FFB547', '#8b68a8'], { to: 368, lie: true }],
    ['grass', 1.6, [0.0, 9], [0.8, 1.5], ['#ffffff'], { two: true, from: 372 }],
    ['reed', 0.35, [-0.3, 0.8], [0.8, 1.2], ['#ffffff'], { two: true, from: 372 }],
    ['flower', 0.5, [0.8, 8], [0.8, 1.4], ['#F2A7B6', '#f4ebd0', '#B7A5E8', '#ffffff'], { two: true, from: 372 }],
    ['cap', 0.05, [1, 6], [0.9, 1.8], ['#9ff0ff', '#d9b8ff'], { from: 372, glow: true }],
  ],
  teatime: [
    ['sugar', 0.05, [0.5, 8], [0.8, 1.4], ['#ffffff'], {}],
    ['biscuit', 0.03, [1, 8], [0.9, 1.3], ['#ffffff'], { tilt: 0.25 }],
    ['berry', 0.025, [0.8, 7], [0.9, 1.3], ['#ffffff'], {}],
    ['pebble', 0.18, [0.3, 6], [0.3, 0.6], ['#e9c482', '#d9a85e'], {}],
    ['flower', 0.06, [1, 7], [0.6, 0.9], ['#F2A7B6', '#ffffff'], { two: true, lie: true }],
  ],
  staircase: [
    ['candle', 0.035, [1.0, 2.2], [1.6, 2.4], ['#ffffff'], { flame: true }],
    ['pebble', 0.2, [0.2, 3], [0.6, 1.2], ['#e6dfcf', '#cfc6b2'], {}],
  ],
  cloudbank: [
    ['puff', 0.5, [-0.4, 6], [0.8, 2.2], ['#ffffff', '#e4e8fa'], {}],
    ['crystal', 0.04, [1, 8], [0.6, 1.1], ['#fff3c8'], { glow: true }],
  ],
  library: [
    ['page', 0.2, [0.3, 8], [0.8, 1.3], ['#ffffff'], { tilt: 0.1 }],
    ['pencil', 0.03, [0.5, 6], [0.9, 1.1], ['#ffffff'], {}],
    ['books', 0.02, [1.5, 7], [1.2, 2.2], ['#ffffff'], {}],
    ['candle', 0.02, [1.5, 5], [1.4, 2], ['#ffffff'], { flame: true }],
  ],
  clockwork: [
    ['bolt', 0.18, [0.3, 7], [0.8, 1.5], ['#c9a24e', '#9a9aa8', '#b08a3e'], { gloss: true, metal: true }],
    ['cog', 0.06, [0.8, 8], [0.8, 2.2], ['#c9a24e', '#d8b866', '#8a8a96'], { gloss: true, metal: true }],
  ],
  stars: [
    ['crystal', 0.12, [0.2, 7], [0.7, 1.8], ['#9fb4ff', '#d9b8ff', '#fff3c8'], { glow: true }],
    ['cap', 0.12, [0.5, 6], [0.8, 1.6], ['#7ff0e0', '#b48cff'], { glow: true }],
    ['mushroom', 0.12, [0.5, 6], [0.8, 1.6], ['#3a3f7a'], {}],
    ['pebble', 0.25, [0.1, 5], [0.5, 1.4], ['#2a3060', '#3a3f7a'], {}],
  ],
  morning: [
    ['grass', 1.4, [0.0, 10], [0.8, 1.5], ['#ffffff'], { two: true }],
    ['reed', 0.25, [-0.3, 0.8], [0.8, 1.2], ['#ffffff'], { two: true }],
    ['flower', 0.55, [0.6, 9], [0.8, 1.4], ['#F2A7B6', '#ffffff', '#FFB547', '#B7A5E8'], { two: true }],
    ['mushroom', 0.05, [1, 6], [0.9, 1.6], ['#ffffff'], {}],
    ['cap', 0.05, [1, 6], [0.9, 1.6], ['#E5533D', '#f4ebd0'], {}],
    ['pebble', 0.15, [0.0, 2], [0.5, 1.2], ['#b8a898', '#8a7a6a'], {}],
  ],
};

const tmp = new THREE.Object3D();
const CHUNK = 50;

function material(o) {
  let mat;
  if (o.glow) mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  else if (o.metal) mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.85 });
  else if (o.gloss) mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 });
  else mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: o.two ? THREE.DoubleSide : THREE.FrontSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSwayTime = SWAY_TIME;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSway;\nuniform float uSwayTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.53;
#else
  float ph = 0.0;
#endif
  float sw = aSway * aSway;
  transformed.x += (sin(uSwayTime * 1.6 + ph) + 0.4 * sin(uSwayTime * 3.7 + ph * 2.1)) * sw * 0.07;
  transformed.z += cos(uSwayTime * 1.2 + ph * 1.3) * sw * 0.05;`,
      );
  };
  mat.customProgramCacheKey = () => `sway-${o.glow ? 'g' : o.metal ? 'm' : o.gloss ? 's' : o.two ? 't' : 'd'}`;
  return mat;
}

/**
 * Scatter a dream's clutter along a course. density: 1 (high), 0.5 (low). Returns a Group of chunked instanced meshes.
 */
export function createScatter(course, id, density = 1) {
  const group = new THREE.Group();
  group.name = 'scatter';
  const recipe = RECIPES[id] ?? [];
  const R = srand(id.length * 31 + 7);
  const mats = new Map();
  const matOf = (o) => {
    const k = o.glow ? 'g' : o.metal ? 'm' : o.gloss ? 's' : o.two ? 't' : 'd';
    if (!mats.has(k)) mats.set(k, material(o));
    return mats.get(k);
  };
  const chunks = Math.ceil(course.total / CHUNK);
  for (const [name, dens, off, sc, colors, o] of recipe) {
    const geo = protoOf(name);
    const per = Array.from({ length: chunks }, () => []);
    const from = o.from ?? 0;
    const to = Math.min(course.total, o.to ?? course.total);
    const n = Math.floor((to - from) * dens * density);
    for (const side of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const s = from + R() * (to - from);
        const a = course.at(s);
        const off0 = off[0] + Math.pow(R(), 1.6) * (off[1] - off[0]);
        const d = side * (a.hw + off0);
        // keep off the islands' water and out of the river
        if (off0 < 0 && course.islandAt?.(s)) continue;
        const p = course.point(s, d);
        const k = Math.min(chunks - 1, Math.floor(s / CHUNK));
        per[k].push({ x: p.x, z: p.z, y: bankHeight(id, s, side, off0) - 0.02, s: sc[0] + R() * (sc[1] - sc[0]), r: R() * Math.PI * 2, c: colors[Math.floor(R() * colors.length)], tilt: (R() - 0.5) * (o.tilt ?? 0) });
      }
    }
    // the islands get the same, thinner
    if (!o.from && !o.noIsland) {
      for (const is of course.islands ?? []) {
        const m = Math.floor(is.a * is.b * 2 * dens * density * 0.6);
        for (let i = 0; i < m; i++) {
          const th = R() * Math.PI * 2;
          const r = Math.sqrt(R()) * 0.92;
          const s = is.sm + is.a * r * Math.cos(th);
          if (s < from || s > to) continue;
          const p = course.point(s, is.b * r * Math.sin(th));
          const k = Math.min(chunks - 1, Math.floor(s / CHUNK));
          per[k].push({ x: p.x, z: p.z, y: islandHeight(id, r) - 0.02, s: sc[0] + R() * (sc[1] - sc[0]), r: R() * Math.PI * 2, c: colors[Math.floor(R() * colors.length)], tilt: (R() - 0.5) * (o.tilt ?? 0) });
        }
      }
    }
    for (const list of per) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geo, matOf(o), list.length);
      list.forEach((q, i) => {
        tmp.position.set(q.x, q.y, q.z);
        tmp.rotation.set(q.tilt, q.r, q.tilt * 0.7);
        tmp.scale.setScalar(q.s);
        tmp.updateMatrix();
        im.setMatrixAt(i, tmp.matrix);
        im.setColorAt(i, col.set(q.c));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = !o.glow && (name === 'block' || name === 'books' || name === 'cog');
      im.receiveShadow = !o.glow;
      group.add(im);
      if (o.flame) {
        const fm = new THREE.InstancedMesh(protoOf('flame'), matOf({ glow: true }), list.length);
        list.forEach((q, i) => {
          tmp.position.set(q.x, q.y, q.z);
          tmp.rotation.set(0, q.r, 0);
          tmp.scale.setScalar(q.s);
          tmp.updateMatrix();
          fm.setMatrixAt(i, tmp.matrix);
          fm.setColorAt(i, col.set('#ffd27a').multiplyScalar(2));
        });
        fm.computeBoundingSphere();
        group.add(fm);
      }
    }
  }
  return group;
}

/** The bank's height at an offset from the water's edge (matches river.js's profile). */
export function bankY(off) {
  const P = BANK_PROFILE;
  if (off <= P.off[0]) return P.y[0];
  for (let i = 1; i < P.off.length; i++) {
    if (off <= P.off[i]) {
      const k = (off - P.off[i - 1]) / (P.off[i] - P.off[i - 1]);
      return P.y[i - 1] + (P.y[i] - P.y[i - 1]) * k;
    }
  }
  return P.y[P.y.length - 1];
}

/** Where the bedroom's floor ends and the garden starts (Bedtime). */
export const GARDEN_S = 372;

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The ground's height on a bank: the profile, gentle swells away from the water (big soft ones in the clouds). */
export function bankHeight(id, s, side, off) {
  const amp = id === 'cloudbank' ? 1.5 : id === 'stars' ? 0.25 : id === 'morning' ? 0.45 : id === 'teatime' ? 0.18 : id === 'bedtime' && s > GARDEN_S ? 0.4 : 0.04;
  const w = smooth(0.6, 5, off);
  const bump = amp * w * (Math.sin(s * 0.21 + side * 1.7 + off * 0.31) * 0.6 + Math.sin(s * 0.53 + off * 0.67 + side) * 0.4);
  return bankY(off) + bump + (id === 'cloudbank' ? 0.55 * smooth(-0.2, 1.2, off) : 0);
}

/** An island's height at r (0 the middle, 1 its edge). */
export function islandHeight(id, r) {
  const H = id === 'cloudbank' ? 2.4 : id === 'stars' ? 0.6 : 1.3;
  return -0.35 + (H + 0.35) * Math.pow(Math.max(0, 1 - Math.min(1, r) ** 2), 0.55);
}

/** The bank's cross-section: offsets from the water's edge (m) and heights. */
export const BANK_PROFILE = {
  off: [-1.4, -0.5, -0.1, 0.25, 0.7, 1.4, 2.6, 4.5, 7.5, 12, 19, 30],
  y: [-0.55, -0.16, 0.02, 0.14, 0.27, 0.38, 0.47, 0.55, 0.62, 0.72, 0.9, 1.3],
};
