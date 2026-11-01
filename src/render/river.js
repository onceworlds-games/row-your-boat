// The river's furniture: banks, islands, bank lanterns, the start and finish arches, and everything in the water (each
// dream's own rocks, drifting logs, pads, pendulums). Static parts are merged; moving parts are instanced.

import * as THREE from 'three';
import { G, createKit, glowTexture, srand } from './kit.js';
import { NO_MIRROR } from './world.js';
import { texture } from './tex.js';
import { BANK_PROFILE, GARDEN_S, SWAY_TIME, bankHeight, islandHeight, createScatter } from './scatter.js';

const tmp = new THREE.Object3D();
const c3 = new THREE.Color();

// ---------------------------------------------------------------- the ground on each dream's banks

// Each dream's ground: a photographed surface (or vertex colour), how big one tile is (m), its tint and finish.
// swap: the texture's long axis runs along the river (floorboards).
const GROUND = {
  bedtime: { map: 'floor', tile: 3.2, swap: true, color: '#f0c49a', bright: 1.7, rough: 0.8, ns: 0.9 },
  garden: { normal: 'blanket', tile: 1.6, color: '#ffffff', rough: 0.95, ns: 0.6, vc: ['#2e5232', '#466f3c', '#5d8646'] },
  teatime: { map: 'tablecloth', tile: 6.5, color: '#fff4f0', rough: 0.85, ns: 0.8 },
  staircase: { map: 'marble', tile: 7, color: '#c7c1d8', rough: 0.5, ns: 0.6, env: 0.25 },
  cloudbank: { normal: 'blanket', tile: 3.4, color: '#ffffff', rough: 0.95, ns: 1.2, vc: ['#eef0fb', '#d9def4', '#c3caea'] },
  library: { map: 'carpet', tile: 3, color: '#ff9a8a', rough: 0.95, ns: 1.4 },
  clockwork: { normal: 'plate', tile: 2.6, color: '#ffffff', rough: 0.62, metal: 0.3, ns: 1, env: 0.3, vc: ['#a8823a', '#b8913f', '#8f6e33'] },
  stars: { normal: 'marble', tile: 6, color: '#ffffff', rough: 0.22, ns: 0.5, vc: ['#151b48', '#1d2560', '#10153a'] },
  morning: { map: 'blanket', tile: 7, color: '#fff1e4', rough: 0.95, ns: 1 },
};

const mats = new Map();
/** The bank lanterns' warm pools on the ground (baked per vertex in aGlow), pulsing with the beat. */
const POOL = { value: new THREE.Color() };
/** The ground material: the texture under vertex colour, glossy where the river wets it (aWet). */
function groundMaterial(key) {
  if (mats.has(key)) return mats.get(key);
  const g = GROUND[key];
  const nm = g.normal ?? g.map;
  const mat = new THREE.MeshStandardMaterial({
    color: g.color,
    roughness: g.rough,
    metalness: g.metal ?? 0,
    vertexColors: true,
    map: g.map ? texture(g.map, 0) : null,
    normalMap: nm ? texture(nm, 1) : null,
    normalScale: new THREE.Vector2(g.ns ?? 1, g.ns ?? 1),
  });
  if (g.bright) mat.color.multiplyScalar(g.bright);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPool = POOL;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWet;\nattribute float aGlow;\nvarying float vWet;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWet = aWet;\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPool;\nvarying float vWet;\nvarying float vGlow;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.1, vWet);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uPool * vGlow * vGlow * (diffuseColor.rgb + 0.06);');
  };
  mat.customProgramCacheKey = () => 'wet-ground';
  mat.userData.shared = true;
  mats.set(key, mat);
  return mat;
}

/** Faces up: if the grid came out wound the other way round, turn every triangle over. */
function faceUp(geo) {
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  let sum = 0;
  for (let i = 0; i < n.count; i++) sum += n.getY(i);
  if (sum >= 0) return geo;
  const ix = geo.index.array;
  for (let i = 0; i < ix.length; i += 3) {
    const t = ix[i + 1];
    ix[i + 1] = ix[i + 2];
    ix[i + 2] = t;
  }
  geo.index.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const vary = (s, off, side) => 0.5 + 0.5 * Math.sin(s * 0.13 + off * 0.41 + side) * Math.sin(s * 0.051 - off * 0.23 + 1.3);

/** The colour at a point of the ground: the dream's own vertex colours (or grey), darkened where it is wet. */
function groundColor(g, s, off, side, wet) {
  const n = vary(s, off, side);
  if (g.vc) {
    const k = n * (g.vc.length - 1);
    const i = Math.min(g.vc.length - 2, Math.floor(k));
    c3.set(g.vc[i]).lerp(c4.set(g.vc[i + 1]), k - i);
  } else c3.setScalar(0.86 + 0.18 * n);
  c3.multiplyScalar(1 - 0.5 * wet);
  return c3;
}
const c4 = new THREE.Color();

/** How much lantern light falls on a point of the ground (s along, d across). */
function poolAt(spots, s, d) {
  let g = 0;
  for (const l of spots) {
    const ds = s - l.s;
    if (ds > 7 || ds < -7) continue;
    const dd = d - l.d;
    g += Math.exp(-(ds * ds + dd * dd) / 9);
  }
  return Math.min(1, g);
}

/** One stretch of both banks, s0 to s1, in one ground. */
function buildBanks(course, id, key, s0, s1, spots) {
  const g = GROUND[key];
  const STEP = 1.5;
  const rows = Math.max(2, Math.ceil((s1 - s0) / STEP) + 1);
  const OFF = BANK_PROFILE.off;
  const K = OFF.length;
  const pos = [];
  const uv = [];
  const colr = [];
  const wet = [];
  const glow = [];
  const idx = [];
  let v = 0;
  for (const side of [-1, 1]) {
    const start = v;
    for (let r = 0; r < rows; r++) {
      const s = s0 + ((s1 - s0) * r) / (rows - 1);
      const a = course.at(s);
      for (let k = 0; k < K; k++) {
        const off = Math.min(OFF[k], 34 - a.hw);
        const d = side * (a.hw + off);
        const p = course.point(s, d);
        pos.push(p.x, bankHeight(id, s, side, off), p.z);
        const u = d / g.tile;
        const w = s / g.tile;
        if (g.swap) uv.push(w, u);
        else uv.push(u, w);
        const wt = 1 - smooth(-0.15, 0.35, off);
        wet.push(wt);
        glow.push(poolAt(spots, s, d));
        const c = groundColor(g, s, off, side, wt);
        colr.push(c.r, c.g, c.b);
        v++;
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let k = 0; k < K - 1; k++) {
        const a = start + r * K + k;
        const b = a + 1;
        const c = a + K;
        const e = c + 1;
        if (side < 0) idx.push(a, b, c, b, e, c);
        else idx.push(a, c, b, b, c, e);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  geo.setAttribute('aWet', new THREE.Float32BufferAttribute(wet, 1));
  geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 1));
  geo.setIndex(idx);
  faceUp(geo);
  const mesh = new THREE.Mesh(geo, groundMaterial(key));
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.name = `banks-${key}`;
  return mesh;
}

/** Islands: a mound in river coordinates (so it follows bends), in the dream's ground. */
function islandMeshes(course, id) {
  const group = new THREE.Group();
  const key = id;
  const g = GROUND[key];
  for (const is of course.islands) {
    const K = 12;
    const A = 32;
    const pos = [];
    const uv = [];
    const colr = [];
    const wet = [];
    const idx = [];
    for (let k = 0; k <= K; k++) {
      const r = 1.1 - (k / K) * 1.1;
      for (let j = 0; j < A; j++) {
        const th = (j / A) * Math.PI * 2;
        const s = is.sm + is.a * r * Math.cos(th);
        const d = is.b * r * Math.sin(th);
        const p = course.point(s, d);
        pos.push(p.x, islandHeight(id, r), p.z);
        uv.push(g.swap ? s / g.tile : d / g.tile, g.swap ? d / g.tile : s / g.tile);
        const off = (1 - r) * is.b;
        const wt = 1 - smooth(-0.15, 0.35, off);
        wet.push(wt);
        const c = groundColor(g, s, off, 1, wt);
        colr.push(c.r, c.g, c.b);
      }
    }
    for (let k = 0; k < K; k++) {
      for (let j = 0; j < A; j++) {
        const a = k * A + j;
        const b = k * A + ((j + 1) % A);
        const c = a + A;
        const e = b + A;
        idx.push(a, c, b, b, c, e);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    geo.setAttribute('aWet', new THREE.Float32BufferAttribute(wet, 1));
    geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(new Float32Array(wet.length), 1));
    geo.setIndex(idx);
    faceUp(geo);
    const m = new THREE.Mesh(geo, groundMaterial(key));
    m.receiveShadow = true;
    m.castShadow = true;
    group.add(m);
  }
  return group;
}

// ---------------------------------------------------------------- bank lanterns

/** Where the bank lanterns stand: every 15 m, sides alternating, none beside an island. */
function lanternSpots(course) {
  const out = [];
  for (let s = course.start - 10, k = 0; s < course.total - 4; s += 15, k++) {
    if (course.islandAt(s)) continue;
    out.push({ s, k, side: k % 2 ? 1 : -1 });
  }
  return out;
}

/** A paper lantern on its string: ribbed paper (bright), dark caps; one geometry with vertex colour. */
export function paperLantern() {
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(new THREE.Vector2(0.09 + 0.2 * Math.pow(Math.sin(Math.PI * t), 0.75), (t - 0.5) * 0.6));
  }
  const paper = new THREE.LatheGeometry(pts, 24).toNonIndexed();
  const P = paper.attributes.position;
  const pc = [];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    const z = P.getZ(i);
    const y = P.getY(i);
    const ang = Math.atan2(z, x);
    const rib = Math.cos(ang * 12);
    const f = 1 + 0.035 * rib;
    P.setX(i, x * f);
    P.setZ(i, z * f);
    const ring = Math.abs(Math.sin(((y + 0.3) / 0.6) * Math.PI * 7));
    const glow = (0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(Math.PI * ((y + 0.3) / 0.6))), 0.6)) * (0.82 + 0.18 * ring) * (0.9 + 0.1 * rib);
    pc.push(glow, glow * 0.97, glow * 0.92);
  }
  paper.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
  paper.computeVertexNormals();
  const dark = (geo, y) => {
    const gg = geo.toNonIndexed();
    gg.translate(0, y, 0);
    for (const n of Object.keys(gg.attributes)) if (n !== 'position' && n !== 'normal') gg.deleteAttribute(n);
    gg.setAttribute('color', new THREE.Float32BufferAttribute(new Array(gg.attributes.position.count * 3).fill(0.05), 3));
    return gg;
  };
  const parts = [paper, dark(new THREE.CylinderGeometry(0.1, 0.12, 0.06, 12), 0.31), dark(new THREE.CylinderGeometry(0.12, 0.1, 0.06, 12), -0.31), dark(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), 0.42)];
  for (const p of parts) if (p.attributes.uv) p.deleteAttribute('uv');
  let count = 0;
  for (const p of parts) count += p.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3]]) {
    const arr = new Float32Array(count * size);
    let o = 0;
    for (const p of parts) {
      arr.set(p.attributes[name].array, o);
      o += p.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.translate(0, -0.52, 0); // hangs from its top
  return out;
}

// ---------------------------------------------------------------- things in the water

const TOY = ['#F2A7B6', '#9CC5A1', '#FFB547', '#B7A5E8', '#F4EBD0', '#E5533D', '#7fb3d5'];

/** Alphabet blocks: a raised border and a letter or picture on every face (tinted by the block's colour). */
let blockTex = null;
function blockTexture() {
  if (blockTex) return blockTex;
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 512;
  const g = c.getContext('2d');
  const marks = ['A', 'B', 'C', 'moon', 'star', 'Z'];
  marks.forEach((mk, i) => {
    const x0 = (i % 3) * 256;
    const y0 = Math.floor(i / 3) * 256;
    g.fillStyle = '#d6d6d6';
    g.fillRect(x0, y0, 256, 256);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(x0 + 22, y0 + 22, 212, 212, 18);
    g.fill();
    g.strokeStyle = '#b4b4b4';
    g.lineWidth = 5;
    g.stroke();
    g.fillStyle = '#3a3358';
    const cx = x0 + 128;
    const cy = y0 + 132;
    if (mk === 'moon') {
      g.beginPath();
      g.arc(cx, cy, 70, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(cx + 34, cy - 22, 62, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      // what was cut is paper again
      g.fillStyle = '#ffffff';
      g.globalCompositeOperation = 'destination-over';
      g.fillRect(x0, y0, 256, 256);
      g.globalCompositeOperation = 'source-over';
    } else if (mk === 'star') {
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
        const r = k % 2 ? 32 : 78;
        g.lineTo(cx + Math.cos(a) * r, cy - 4 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    } else {
      g.font = '900 170px Georgia, "Times New Roman", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(mk, cx, cy + 8);
    }
  });
  blockTex = new THREE.CanvasTexture(c);
  blockTex.colorSpace = THREE.SRGBColorSpace;
  blockTex.anisotropy = 4;
  return blockTex;
}

/** A rounded block whose six faces each take one cell of the block texture. */
function blockGeometry(size, r) {
  const g = G.rbox(size, size, size, r, 3);
  const uv = g.attributes.uv;
  // a box keeps each face's vertices to itself (in the order +x, -x, +y, -y, +z, -z): move each face's 0-1 square
  // into its own cell of the 3 x 2 texture
  const faceOf = new Int8Array(uv.count).fill(-1);
  g.groups.forEach((gr, face) => {
    for (let i = gr.start; i < gr.start + gr.count; i++) faceOf[g.index ? g.index.getX(i) : i] = face;
  });
  for (let i = 0; i < uv.count; i++) {
    const f = faceOf[i];
    if (f < 0) continue;
    const u = Math.min(1, Math.max(0, uv.getX(i)));
    const v = Math.min(1, Math.max(0, uv.getY(i)));
    uv.setXY(i, (u + (f % 3)) / 3, (v + (1 - Math.floor(f / 3))) / 2);
  }
  uv.needsUpdate = true;
  return g;
}

function rockLook(id) {
  switch (id) {
    case 'bedtime':
      return { geo: blockGeometry(1.6, 0.14), map: blockTexture(), colors: TOY, y: 0.35, tilt: 0.25 };
    case 'teatime':
      return { geo: G.rbox(1.5, 1.5, 1.5, 0.12), colors: ['#fbf7ef', '#f3eee4', '#fffaf3'], y: 0.4, tilt: 0.3 };
    case 'staircase':
      return { geo: G.cyl(0.55, 0.7, 2.4, 10), colors: ['#d9d3c7', '#c9c1b2'], y: 0.6, tilt: 0.12 };
    case 'cloudbank':
      return { geo: G.ico(1, 1), colors: ['#eef0fb', '#dfe3f6'], y: 0.2, tilt: 0, squash: 0.6 };
    case 'library':
      return { geo: G.rbox(2.2, 0.55, 1.6, 0.06), colors: ['#7a2e34', '#2f5a4a', '#2e3f73', '#8a6a2e', '#5a2e5e'], y: 0.25, tilt: 0.15, stack: 3 };
    case 'clockwork':
      return { geo: G.cog(1, 0.5, 10, 0.22), colors: ['#c9a24e', '#b08a3e', '#d8b866'], y: 0.15, tilt: 0.35, metal: 0.7 };
    case 'stars':
      return { geo: G.ico(1, 1), colors: ['#3a3f7a', '#5a4a8a', '#2e5a7a'], y: 0.1, tilt: 0, glowRing: true };
    case 'morning':
      return { geo: G.rbox(1.8, 0.9, 1.8, 0.35), colors: ['#c46e64', '#e2b46a', '#8fb39a', '#7f8cc4', '#f4ebd0'], y: 0.25, tilt: 0.2 };
    default:
      return { geo: G.ico(1, 0), colors: ['#555'], y: 0, tilt: 0 };
  }
}

function logLook(id) {
  switch (id) {
    case 'teatime': {
      // a silver spoon: a long handle and a bowl
      const kit = createKit();
      kit.add(G.cyl(0.13, 0.18, 1, 8), '#d9dbe4', { rz: Math.PI / 2 });
      kit.add(G.sphere(0.5, 12, 8), '#e4e6ee', { x: 0.62, sx: 1.2, sy: 0.35, sz: 0.85 });
      const g = kit.build().userData.solid.geometry;
      return { geo: g, color: '#ffffff', metal: 0.6, vc: true };
    }
    case 'staircase': {
      const kit = createKit();
      kit.add(G.cyl(0.25, 0.25, 1, 10), '#e6dfcf', { rz: Math.PI / 2 });
      for (const x of [-0.42, 0, 0.42]) kit.add(G.sphere(0.36, 10, 8), '#d5ccb8', { x, sx: 0.4 });
      return { geo: kit.build().userData.solid.geometry, color: '#ffffff', vc: true };
    }
    case 'library': {
      const kit = createKit();
      kit.add(G.cyl(0.45, 0.45, 1, 14), '#f1e6cc', { rz: Math.PI / 2 });
      kit.add(G.cyl(0.47, 0.47, 0.12, 14), '#b0412e', { rz: Math.PI / 2 });
      return { geo: kit.build().userData.solid.geometry, color: '#ffffff', vc: true };
    }
    case 'clockwork': {
      const kit = createKit();
      kit.add(G.box(1, 0.16, 0.42), '#2a2522', {});
      kit.add(G.cone(0.42, 0.5, 4), '#2a2522', { x: 0.62, rz: -Math.PI / 2, ry: Math.PI / 4 });
      return { geo: kit.build().userData.solid.geometry, color: '#ffffff', vc: true, metal: 0.4 };
    }
    case 'stars': {
      // a fallen star drifting with its tail: an upright five-pointed star (facing along the river; thin, since the
      // length scales along x) and a tapering tail that cools from gold to blue
      const sh = new THREE.Shape();
      for (let k = 0; k < 10; k++) {
        const a = Math.PI / 2 + (k / 10) * Math.PI * 2;
        const r = k % 2 ? 0.3 : 0.72;
        if (k === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      sh.closePath();
      const star = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.06, bevelSegments: 2 });
      star.translate(0, 0, -0.02);
      star.rotateY(Math.PI / 2);
      star.translate(0.42, 0.62, 0);
      const tail = new THREE.ConeGeometry(0.34, 0.95, 12, 4, true);
      tail.rotateZ(Math.PI / 2);
      tail.translate(-0.06, 0.55, 0);
      const parts = [star.toNonIndexed(), tail.toNonIndexed()];
      const gold = new THREE.Color('#fff1c0');
      const blue = new THREE.Color('#6f86ff');
      const cc = new THREE.Color();
      for (const g of parts) {
        if (g.attributes.uv) g.deleteAttribute('uv');
        const P = g.attributes.position;
        const col = new Float32Array(P.count * 3);
        for (let i = 0; i < P.count; i++) {
          cc.copy(blue).lerp(gold, Math.min(1, Math.max(0, (P.getX(i) + 0.53) / 0.9)));
          col.set([cc.r, cc.g, cc.b], i * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      let n = 0;
      for (const g of parts) n += g.attributes.position.count;
      const geo = new THREE.BufferGeometry();
      for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3]]) {
        const arr = new Float32Array(n * size);
        let o = 0;
        for (const g of parts) {
          arr.set(g.attributes[name].array, o);
          o += g.attributes[name].array.length;
        }
        geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
      }
      return { geo, color: '#ffffff', vc: true, glow: true, double: true };
    }
    default: {
      const kit = createKit();
      kit.add(G.cyl(0.42, 0.42, 1, 12), '#6b4a32', { rz: Math.PI / 2 });
      return { geo: kit.build().userData.solid.geometry, color: '#ffffff', vc: true };
    }
  }
}

// ---------------------------------------------------------------- the river

/**
 * Everything along a course. `lit(i)` etc. come back through `update`. Returns { group, lanterns (world positions),
 * update(t, beat, focus), arches: { start, finish }, dispose }.
 */
export function createRiver(course, id, theme, opts = {}) {
  const group = new THREE.Group();
  group.name = 'river';
  // the banks see less of the sky than glaze does (or the floor turns to the sky's colour at a glance)
  for (const key of [id, 'garden']) {
    if (!GROUND[key]) continue;
    const m = groundMaterial(key);
    m.envMap = opts.env ?? null;
    m.envMapIntensity = (theme.env ?? 0.5) * (GROUND[key].env ?? 0.5);
  }
  const spots = id === 'stars' ? [] : lanternSpots(course).map((l) => ({ s: l.s, d: l.side * (course.at(l.s).hw + 0.36) }));
  if (id === 'bedtime') {
    // the bedroom floor, then out through the window into the garden
    group.add(buildBanks(course, id, 'bedtime', 0, GARDEN_S + 3, spots));
    group.add(buildBanks(course, id, 'garden', GARDEN_S, course.total, spots));
  } else group.add(buildBanks(course, id, id, 0, course.total, spots));
  group.add(islandMeshes(course, id));
  const scatter = createScatter(course, id, opts.density ?? 1);
  group.add(scatter);
  const rnd = srand(id.length * 13 + 1);

  // ---- rocks (instanced)
  const look = rockLook(id);
  const rocks = course.rocks;
  const stackN = look.stack ?? 1;
  if (rocks.length) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: look.metal ?? 0, map: look.map ?? null });
    const im = new THREE.InstancedMesh(look.geo, mat, rocks.length * stackN);
    let n = 0;
    for (const o of rocks) {
      const p = course.point(o.s, o.d);
      for (let k = 0; k < stackN; k++) {
        const sc = o.r / 0.85;
        tmp.position.set(p.x + (rnd() - 0.5) * 0.2 * k, look.y + k * 0.5 * sc, p.z + (rnd() - 0.5) * 0.2 * k);
        tmp.rotation.set((rnd() - 0.5) * look.tilt, rnd() * Math.PI * 2, (rnd() - 0.5) * look.tilt);
        tmp.scale.set(sc * (k ? 0.9 : 1), sc * (look.squash ?? 1), sc * (k ? 0.9 : 1));
        tmp.updateMatrix();
        im.setMatrixAt(n, tmp.matrix);
        im.setColorAt(n, c3.set(look.colors[Math.floor(rnd() * look.colors.length)]));
        n++;
      }
    }
    im.count = n;
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
  }

  // ---- logs (instanced, moving)
  let logMesh = null;
  if (course.logs.length) {
    const ll = logLook(id);
    const mat = ll.glow ? new THREE.MeshBasicMaterial({ vertexColors: !!ll.vc, side: ll.double ? THREE.DoubleSide : THREE.FrontSide }) : new THREE.MeshStandardMaterial({ vertexColors: !!ll.vc, roughness: 0.55, metalness: ll.metal ?? 0 });
    logMesh = new THREE.InstancedMesh(ll.geo, mat, course.logs.length);
    logMesh.castShadow = true;
    logMesh.frustumCulled = false;
    group.add(logMesh);
  }

  // ---- pads (cloud puffs)
  if (course.pads.length) {
    const kit = createKit();
    for (const p of course.pads) {
      const n = 4 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd();
        const rr = p.r * (0.35 + rnd() * 0.4);
        kit.add(G.sphere(p.r * (0.38 + rnd() * 0.2), 10, 6), k % 2 ? '#f4f6ff' : '#dfe4f8', { x: p.x + Math.cos(a) * rr, y: 0.05, z: p.z + Math.sin(a) * rr, sy: 0.35 });
      }
    }
    group.add(kit.build('pads'));
  }

  // ---- pendulums: a beam high above, an arm and a brass bob
  const pendulums = course.pendulums.map((p) => {
    const a = course.at(p.s);
    const L = 11;
    const pivot = new THREE.Group();
    pivot.position.set(a.x, L + 0.9, a.z);
    pivot.rotation.y = -a.h;
    const swing = new THREE.Group();
    pivot.add(swing);
    const arm = new THREE.Mesh(G.box(0.18, L, 0.18), new THREE.MeshStandardMaterial({ color: '#b08a3e', metalness: 0.7, roughness: 0.35 }));
    arm.position.y = -L / 2;
    swing.add(arm);
    const bob = new THREE.Mesh(G.cyl(p.r + 0.25, p.r + 0.25, 0.4, 24), new THREE.MeshStandardMaterial({ color: '#d8b866', metalness: 0.8, roughness: 0.25 }));
    bob.rotation.z = Math.PI / 2;
    bob.rotation.y = Math.PI / 2;
    bob.position.y = -L;
    bob.castShadow = true;
    swing.add(bob);
    // the beam it hangs from, bank to bank
    const beam = new THREE.Mesh(G.box(a.hw * 2 + 6, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: '#5a4a30', metalness: 0.4, roughness: 0.5 }));
    beam.position.y = 0;
    pivot.add(beam);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(G.box(0.6, L + 1.4, 0.6), beam.material);
      post.position.set(side * (a.hw + 2.6), -(L + 1.4) / 2, 0);
      post.castShadow = true;
      pivot.add(post);
    }
    group.add(pivot);
    return { p, swing, L };
  });

  // ---- bank lanterns: paper lanterns on shepherd's hooks leaning over the water (in the Sea of Stars they hang from
  // the sky), swaying a little on their strings
  const lanterns = [];
  const posts = createKit({ roughness: 0.7 });
  const wood = id === 'clockwork' ? '#3a3026' : id === 'staircase' ? '#2a2f48' : '#2e211b';
  for (const { s, k, side } of lanternSpots(course)) {
    const a = course.at(s);
    const off = 1.0;
    const p = course.point(s, side * (a.hw + off));
    const y0 = bankHeight(id, s, side, off);
    // toward the water, across the river
    const inX = -Math.cos(a.h) * side;
    const inZ = -Math.sin(a.h) * side;
    if (id === 'stars') {
      const q = course.point(s, side * (a.hw - 0.4));
      posts.add(G.cyl(0.012, 0.012, 5, 4), '#9aa3d8', { x: q.x, y: 6.4, z: q.z });
      lanterns.push({ x: q.x, y: 3.9, z: q.z, s, hang: 3.9 + 0.52, ax: q.x, az: q.z, ph: k * 1.7 });
      continue;
    }
    const H = 2.3;
    const R = 0.32;
    const frame = new THREE.Matrix4().makeRotationY(Math.atan2(-inZ, inX)).setPosition(p.x, y0, p.z);
    posts.add(G.cyl(0.055, 0.075, H, 7), wood, { y: H / 2 }, { parent: frame });
    posts.add(G.cyl(0.11, 0.13, 0.16, 8), wood, { y: 0.08 }, { parent: frame });
    // the hook: half a ring over the top
    posts.add(new THREE.TorusGeometry(R, 0.04, 6, 14, Math.PI), wood, { x: R, y: H }, { parent: frame });
    const hx = p.x + inX * 2 * R;
    const hz = p.z + inZ * 2 * R;
    lanterns.push({ x: hx, y: y0 + H - 0.52, z: hz, s, hang: y0 + H, ax: hx, az: hz, ph: k * 1.7 });
  }
  group.add(posts.build('posts'));
  const lanternCol = new THREE.Color(theme.lantern).lerp(new THREE.Color('#fff2d8'), 0.35);
  const lanternMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: lanternCol.clone().multiplyScalar(1.8), fog: true });
  const lanternMesh = new THREE.InstancedMesh(paperLantern(), lanternMat, Math.max(1, lanterns.length));
  lanternMesh.count = lanterns.length;
  lanternMesh.frustumCulled = false;
  group.add(lanternMesh);
  // their halos
  const halo = new THREE.BufferGeometry();
  const haloPos = new Float32Array(lanterns.length * 3);
  halo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
  const haloMat = new THREE.PointsMaterial({ map: glowTexture(), color: theme.lantern, size: 3.2, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const halos = new THREE.Points(halo, haloMat);
  halos.layers.set(NO_MIRROR);
  halos.frustumCulled = false;
  group.add(halos);
  const hangLanterns = (now) => {
    lanterns.forEach((l, i) => {
      const sx = Math.sin(now * 1.1 + l.ph) * 0.07 + Math.sin(now * 2.3 + l.ph * 1.3) * 0.02;
      const sz = Math.sin(now * 0.8 + l.ph * 0.7) * 0.05;
      tmp.position.set(l.ax, l.hang, l.az);
      tmp.rotation.set(sz, l.ph, sx);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      lanternMesh.setMatrixAt(i, tmp.matrix);
      l.x = l.ax + Math.sin(sx) * 0.52;
      l.z = l.az - Math.sin(sz) * 0.52;
      haloPos[i * 3] = l.x;
      haloPos[i * 3 + 1] = l.y;
      haloPos[i * 3 + 2] = l.z;
    });
    lanternMesh.instanceMatrix.needsUpdate = true;
    halo.attributes.position.needsUpdate = true;
  };
  hangLanterns(0);

  // ---- arches
  const arches = { start: buildArch(course, course.start, 3, theme, 'start'), finish: buildArch(course, course.finish, 9, theme, 'finish') };
  group.add(arches.start.group, arches.finish.group);

  // ---- mist sprites near the water, recycled around the focus
  const mistTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    for (let k = 0; k < 14; k++) {
      const x = 30 + Math.random() * 68;
      const y = 40 + Math.random() * 48;
      const r = 18 + Math.random() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const mistCol = new THREE.Color(theme.fog).lerp(new THREE.Color('#ffffff'), 0.45);
  const mistOpacity = id === 'cloudbank' ? 0.4 : 0.15;
  const mist = Array.from({ length: 12 }, (_, i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: mistCol, transparent: true, opacity: mistOpacity, depthWrite: false, fog: true }));
    sp.scale.set(24, 5, 1);
    sp.layers.set(NO_MIRROR);
    sp.userData = { s: -999, d: 0, k: i };
    group.add(sp);
    return sp;
  });

  const lightCol = new THREE.Color(theme.lantern);
  return {
    group,
    lanterns,
    arches,
    /** Per frame: t (song time), beat (0-1 phase), focusS (the camera's s), pulse (0-1 on the beat). */
    update(t, focusS, pulse, now) {
      lanternMat.color.copy(lanternCol).multiplyScalar(1.6 + pulse * 0.7);
      POOL.value.copy(lanternCol).multiplyScalar(1.1 + pulse * 0.4);
      haloMat.size = 3.0 + pulse * 0.9;
      hangLanterns(now);
      SWAY_TIME.value = now;
      if (logMesh) {
        course.logs.forEach((l, i) => {
          const g = course.logAt(l, t);
          tmp.position.set(g.x, 0.12 + Math.sin(now * 1.3 + i) * 0.05, g.z);
          tmp.rotation.set(0, -g.a + Math.PI / 2, Math.sin(now * 0.9 + i) * 0.05);
          tmp.scale.set(l.len, 1, 1);
          tmp.updateMatrix();
          logMesh.setMatrixAt(i, tmp.matrix);
        });
        logMesh.instanceMatrix.needsUpdate = true;
      }
      for (const m of mist) {
        const u = m.userData;
        if (u.s < focusS - 25 || u.s > focusS + 140) {
          u.s = focusS + 20 + ((u.k * 37) % 120) + Math.random() * 10;
          if (u.s > course.total) u.s = focusS + 10 + Math.random() * 30;
          const a = course.at(u.s);
          u.d = (Math.random() < 0.5 ? -1 : 1) * (a.hw * (0.4 + Math.random() * 0.9));
        }
        const p = course.point(u.s, u.d + Math.sin(now * 0.1 + u.k) * 1.5);
        m.position.set(p.x, 0.6 + (u.k % 3) * 0.3, p.z);
        // mist is seen at a distance: close to the camera it would be a white wall
        const near = Math.min(1, Math.max(0, (u.s - focusS - 4) / 14));
        m.material.opacity = mistOpacity * near * near * (3 - 2 * near);
      }
    },
    /** Pendulums at beat position B. */
    swing(B) {
      for (const pd of pendulums) {
        const g = course.pendulumAt(pd.p, B);
        pd.swing.rotation.z = -Math.asin(Math.max(-0.99, Math.min(0.99, g.d / pd.L)));
      }
    },
    lightColor: lightCol,
  };
}

// ---------------------------------------------------------------- arches

function buildArch(course, s, count, theme, kind) {
  const group = new THREE.Group();
  const a = course.at(s);
  const span = a.hw + 0.9;
  const kit = createKit();
  const wood = kind === 'finish' ? '#4a3226' : '#3c2a22';
  const H = kind === 'finish' ? 7.2 : 5.6;
  const frame = new THREE.Matrix4().makeRotationY(-a.h).setPosition(a.x, 0, a.z);
  for (const side of [-1, 1]) {
    kit.add(G.cyl(0.22, 0.3, H, 8), wood, { x: side * span, y: H / 2 }, { parent: frame });
    kit.add(G.cyl(0.42, 0.42, 0.3, 8), wood, { x: side * span, y: 0.15 }, { parent: frame });
  }
  // the crossbeam: a gentle arc of segments
  const N = 14;
  for (let i = 0; i < N; i++) {
    const u0 = i / N;
    const u1 = (i + 1) / N;
    const x0 = -span + 2 * span * u0;
    const x1 = -span + 2 * span * u1;
    const y0 = H + Math.sin(u0 * Math.PI) * 1.1;
    const y1 = H + Math.sin(u1 * Math.PI) * 1.1;
    const len = Math.hypot(x1 - x0, y1 - y0);
    kit.add(G.box(len + 0.05, 0.34, 0.36), wood, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, rz: Math.atan2(y1 - y0, x1 - x0) }, { parent: frame });
  }
  group.add(kit.build(`arch-${kind}`));
  // its lanterns, hung from the beam: the same ribbed paper lanterns as the banks, bigger
  const warm = new THREE.Color(theme.lantern).lerp(new THREE.Color('#fff2d8'), 0.35);
  const lit = new THREE.MeshBasicMaterial({ vertexColors: true, color: warm.clone().multiplyScalar(2.1), fog: true });
  // unlit: pale paper that still shows a little warmth, never a black hole in the sky
  const dark = new THREE.MeshStandardMaterial({ vertexColors: true, color: '#e6d5b4', emissive: theme.lantern, emissiveIntensity: 0.1, roughness: 0.85 });
  const geo = paperLantern();
  const k = kind === 'finish' ? 1.45 : 1.65;
  geo.scale(k, k, k);
  const lamps = [];
  for (let i = 0; i < count; i++) {
    const u = (i + 1) / (count + 1);
    const x = -span + 2 * span * u;
    const y = H + Math.sin(u * Math.PI) * 1.1 - 0.17 - (kind === 'finish' ? Math.sin(u * Math.PI * 3) * 0.2 : 0);
    const m = new THREE.Mesh(geo, dark);
    const p = new THREE.Vector3(x, y, 0).applyMatrix4(frame);
    m.position.copy(p);
    m.rotation.y = -a.h + i * 0.7;
    group.add(m);
    lamps.push(m);
  }
  // a sign on the finish arch for the closing clock
  let sign = null;
  if (kind === 'finish') {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.98), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    const p = new THREE.Vector3(0, H + 2.0, 0.25).applyMatrix4(frame);
    m.position.copy(p);
    m.rotation.y = -a.h + Math.PI;
    m.visible = false;
    group.add(m);
    let shown = '';
    sign = {
      mesh: m,
      set(text) {
        if (text === shown) return;
        shown = text;
        m.visible = !!text;
        if (!text) return;
        const g = c.getContext('2d');
        g.clearRect(0, 0, 256, 96);
        g.fillStyle = '#141A3A';
        g.beginPath();
        g.roundRect(6, 6, 244, 84, 14);
        g.fill();
        g.font = '800 64px "Fraunces Variable", Georgia, serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#FFB547';
        g.fillText(text, 128, 52);
        tex.needsUpdate = true;
      },
    };
  }
  return {
    group,
    lamps,
    sign,
    /** Light the first n lamps. */
    light(n) {
      lamps.forEach((m, i) => (m.material = i < n ? lit : dark));
    },
  };
}
