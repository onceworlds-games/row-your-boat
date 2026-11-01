// A little clinker-built rowing boat (or a swan, a teacup, a paper boat...) with its rower, oars, the four paper
// lanterns over the bow (the combo) and the pennant (the symbol), animated stroke by stroke. Forward is -z in the
// boat's own frame; the rower sits facing the stern (+z), toward the camera.

import * as THREE from 'three';
import { G, createKit, glowTexture } from './kit.js';
import { createRower } from './rower.js';
import { HATS, HAT_NAMES, LANTERN_COLORS, TRIM_COLORS } from '../cosmetics.js';

export { HATS, HAT_NAMES };

const L = 3.4;
const SHEER = 0.46;
export const OARLOCK = { x: 0.74, y: SHEER + 0.07, z: 0.215 };
const IN = 0.5;
const OUT = 1.95;
const SEAT_Y = SHEER - 0.13;
const HIPS = { y: SEAT_Y + 0.045, z: -0.1 };
// oar sweep (radians from square): the catch reaches toward the bow, the finish toward the stern
const CATCH = 0.45;
const FINISH = -0.38;
const DRIVE = 0.28;
const RECOVER = 0.42;
const BLADE_IN = Math.asin((-0.06 - OARLOCK.y) / OUT);
const BLADE_UP = Math.asin((0.22 - OARLOCK.y) / OUT);
const BLADE_READY = Math.asin((0.1 - OARLOCK.y) / OUT);

// ---------------------------------------------------------------- the hull

// The rowboat's lines (the oars, the yoke and the rower are placed by these).
const halfWidth = (u) => (u < 0.45 ? 0.4 + 0.34 * Math.sin((u / 0.45) * (Math.PI / 2)) : 0.74 * Math.sqrt(Math.max(0, 1 - ((u - 0.45) / 0.55) ** 2)));
const depthAt = (u) => (u > 0.6 ? 0.5 * (1 - ((u - 0.6) / 0.4) ** 2 * 0.62) : 0.5 - (0.45 - Math.min(0.45, u)) * 0.22);
const sheerAt = (u) => SHEER + 0.2 * u ** 3 + 0.05 * (1 - u) ** 4;
const zAt = (u) => L * (0.5 - u);

// Every body's lines: half width, depth and sheer along u (0 stern, 1 bow), its length, the planks' lap (0: smooth),
// how full its section is (smaller: boxier), and where the lantern post stands.
const ends = (u) => Math.abs(2 * u - 1);
const PROFILES = {
  rowboat: { len: L, halfWidth, depthAt, sheerAt, lap: 0.016, sec: 0.78, strakes: 6, bowZ: zAt(0.9) },
  canoe: {
    len: 3.7,
    halfWidth: (u) => 0.7 * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.62),
    depthAt: (u) => 0.4 * (1 - ends(u) ** 5) + 0.02,
    sheerAt: (u) => SHEER - 0.04 + 0.36 * ends(u) ** 3.2,
    lap: 0,
    sec: 0.62,
    strakes: 6,
    bowZ: -1.32,
  },
  paper: {
    len: 3.5,
    halfWidth: (u) => 0.72 * Math.min(1, Math.min(u, 1 - u) / 0.24) ** 0.85 + 0.02,
    depthAt: () => 0.36,
    sheerAt: (u) => SHEER + 0.05 + 0.62 * Math.max(0, ends(u) - 0.55) / 0.45,
    lap: 0,
    sec: 0.25,
    strakes: 2,
    facets: true,
    bowZ: -1.2,
  },
  swan: {
    len: 3.3,
    halfWidth: (u) => 0.76 * Math.pow(Math.max(0, 1 - ((u - 0.46) / 0.56) ** 2), 0.55),
    depthAt: (u) => 0.48 - 0.12 * ends(u) ** 2,
    sheerAt: (u) => SHEER + 0.04 + 0.18 * Math.max(0, u - 0.6) ** 2 + 0.22 * (Math.max(0, 0.22 - u) / 0.22) ** 2,
    lap: 0,
    sec: 0.9,
    strakes: 6,
    bowZ: -1.2,
  },
  teacup: {
    len: 2.15,
    halfWidth: (u) => 1.04 * Math.sqrt(Math.max(0, 1 - ends(u) ** 2)),
    depthAt: (u) => 0.5 * Math.sqrt(Math.max(0, 1 - ends(u) ** 2)) + 0.06,
    sheerAt: () => SHEER - 0.05,
    lap: 0,
    sec: 1.25,
    strakes: 6,
    bowZ: -0.86,
  },
  walnut: {
    len: 3.1,
    halfWidth: (u) => 0.82 * Math.pow(Math.max(0, 1 - ends(u) ** 2.2), 0.5),
    depthAt: (u) => 0.52 * Math.pow(Math.max(0, 1 - ends(u) ** 2.6), 0.45) + 0.04,
    sheerAt: (u) => SHEER - 0.02 + 0.05 * ends(u) ** 2,
    lap: 0,
    sec: 1.1,
    strakes: 16,
    U: 72,
    bowZ: -1.2,
  },
  tub: {
    len: 3.2,
    halfWidth: (u) => 0.7 * Math.pow(Math.max(0, 1 - ends(u) ** 4), 0.28),
    depthAt: (u) => 0.5 * Math.pow(Math.max(0, 1 - ends(u) ** 5), 0.3) + 0.04,
    sheerAt: (u) => SHEER + 0.04 + 0.1 * Math.max(0, 0.3 - u) / 0.3,
    lap: 0,
    sec: 0.3,
    strakes: 6,
    bowZ: -1.25,
  },
};
/** The lines the hull functions use while a body is built. */
let PROF = PROFILES.rowboat;
const pz = (u) => PROF.len * (0.5 - u);
const pu = (z) => 0.5 - z / PROF.len;

/** Where a body's lantern post stands (z), and how glossy its hull is. */
export const BOW_Z = Object.fromEntries(Object.entries(PROFILES).map(([k, v]) => [k, v.bowZ]));
const ROUGH = { rowboat: 0.42, canoe: 0.36, paper: 0.92, swan: 0.5, teacup: 0.16, walnut: 0.78, tub: 0.2 };

/** A point of the hull's outer surface: u along (0 stern, 1 bow), k round (0 keel, 1 gunwale), on side s. */
function hullPoint(u, k, s, inset = 0) {
  const w = Math.max(0.012, PROF.halfWidth(u)) - inset;
  const dp = PROF.depthAt(u) - inset * 0.8;
  const phi = k * (Math.PI / 2);
  return [s * w * Math.sin(phi), PROF.sheerAt(u) - dp * Math.pow(Math.cos(phi), PROF.sec), pz(u)];
}

/** The planked shell: each strake overlaps the one below it (a step out at every plank's lower edge). */
function shell(colorOf, inner = false, bump = null) {
  const U = PROF.facets ? 12 : PROF.U ?? 30;
  const STRAKES = PROF.strakes;
  const LAP = PROF.lap;
  const pos = [];
  const colr = [];
  const idx = [];
  const c = new THREE.Color();
  const rows = [];
  // the rows round the section: per strake a lower edge (out by LAP), a middle and an upper edge (flush)
  for (let j = 0; j < STRAKES; j++) {
    const ts = inner || !LAP ? [0, 1] : [0, 0.5, 1];
    for (const t of ts) {
      if (t === 0 && j > 0 && !LAP) continue;
      rows.push({ k: (j + t) / STRAKES, lap: inner ? 0 : LAP * (1 - t), j });
    }
  }
  const K = rows.length;
  for (const s of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= U; i++) {
      const u = i / U;
      for (const r of rows) {
        const p = hullPoint(u, r.k, s, inner ? 0.035 : 0);
        // out along the section's normal (roughly: outward and down)
        const q = hullPoint(u, Math.min(1, r.k + 0.01), s, inner ? 0.035 : 0);
        let nx = q[1] - p[1];
        let ny = -(q[0] - p[0]) * s;
        const nl = Math.hypot(nx, ny) || 1;
        nx = (nx / nl) * s;
        ny /= nl;
        const out = r.lap + (bump && !inner ? bump(u, r.k, s) : 0);
        pos.push(p[0] + nx * out * s * s, p[1] + ny * out, p[2]);
        c.set(colorOf(r.j, u, r.k, s));
        colr.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < U; i++) {
      for (let k = 0; k < K - 1; k++) {
        const a = base + i * K + k;
        const b = a + 1;
        const cc = a + K;
        const e = cc + 1;
        const flip = (s > 0) !== inner;
        if (flip) idx.push(a, cc, b, b, cc, e);
        else idx.push(a, b, cc, b, e, cc);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  if (PROF.facets) {
    const f = g.toNonIndexed();
    f.computeVertexNormals();
    return f;
  }
  g.computeVertexNormals();
  return g;
}

/** A thin ribbon following the inside of the hull at u (a rib). */
function rib(u, color) {
  const pos = [];
  const idx = [];
  const n = 10;
  const dz = 0.02;
  for (const s of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const k = 0.12 + (i / n) * 0.86;
      const p = hullPoint(u, k, s, 0.05);
      pos.push(p[0], p[1], p[2] - dz, p[0], p[1], p[2] + dz);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2;
      if (s > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const out = g.toNonIndexed();
  const cc = new THREE.Color(color);
  const cols = new Float32Array(out.attributes.position.count * 3);
  for (let i = 0; i < cols.length; i += 3) cols.set([cc.r, cc.g, cc.b], i);
  out.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return out;
}

/** A tube along the gunwale (k = 1) of both sides, from u0 to u1, lifted by `lift`. */
function rails(color, r = 0.028, lift = 0.012, out = 1.01, u0 = 0, u1 = 1) {
  const parts = [];
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const u = u0 + ((u1 - u0) * i) / 28;
      const p = hullPoint(u, 1, s);
      pts.push(new THREE.Vector3(p[0] * out, p[1] + lift, p[2]));
    }
    parts.push(colored(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, r, 8), color));
  }
  return parts;
}

/** A whole closed rim round a round body (teacup, tub, walnut). */
function rim(color, r, lift = 0, out = 1) {
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const u = 0.5 + 0.5 * Math.cos(a);
    const s = Math.sin(a) >= 0 ? 1 : -1;
    const p = hullPoint(u, 1, s);
    pts.push(new THREE.Vector3(p[0] * out, p[1] + lift, p[2]));
  }
  return colored(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, r, 8, true), color);
}

/** Seats, floorboards and brass oarlocks, fitted to the body's own width. */
function fittings(kit, seatColor = '#b07a4e', { bow = true, stern = true, floor = true, locks = true, lockColor = '#d9a441' } = {}) {
  const seatW = (z) => Math.max(0.3, PROF.halfWidth(pu(z)) * 2 - 0.09);
  if (floor) {
    const floorY = PROF.sheerAt(0.45) - PROF.depthAt(0.45) + 0.075;
    for (const x of [-0.16, 0, 0.16]) kit.add(G.box(0.12, 0.025, Math.min(2.2, PROF.len * 0.6)), WOOD, { x, y: floorY, z: 0.05 });
  }
  kit.add(G.rbox(seatW(HIPS.z), 0.05, 0.3, 0.02), seatColor, { y: SEAT_Y, z: HIPS.z });
  if (stern) kit.add(G.rbox(seatW(Math.min(1.25, PROF.len / 2 - 0.45)), 0.05, 0.34, 0.02), seatColor, { y: SEAT_Y + 0.04, z: Math.min(1.25, PROF.len / 2 - 0.45) });
  if (bow) kit.add(G.rbox(seatW(Math.max(-1.05, -PROF.len / 2 + 0.55)), 0.05, 0.26, 0.02), seatColor, { y: SEAT_Y + 0.06, z: Math.max(-1.05, -PROF.len / 2 + 0.55) });
  if (!locks) return;
  for (const s of [-1, 1]) {
    // a block from the gunwale out (or in) to the oarlock
    const w = PROF.halfWidth(pu(OARLOCK.z));
    const reach = Math.abs(OARLOCK.x - w) + 0.12;
    kit.add(G.box(reach, 0.04, 0.16), WOOD, { x: s * (w + OARLOCK.x) / 2, y: Math.max(SHEER + 0.03, PROF.sheerAt(pu(OARLOCK.z)) + 0.02), z: OARLOCK.z });
    kit.add(G.torus(0.04, 0.009, 10, 6, Math.PI), lockColor, { x: s * OARLOCK.x, y: OARLOCK.y + 0.005, z: OARLOCK.z, ry: Math.PI / 2 });
  }
}

const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getStyle();
const mixc = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k).getStyle();
/** A small, stable noise for bumpy shells (walnut). */
const wob = (a, b) => Math.sin(a * 12.9898 + b * 78.233) * 0.5 + Math.sin(a * 4.1 + b * 9.7) * 0.3 + Math.sin(a * 23.3 - b * 17.1) * 0.2;

function mergeAll(list) {
  const ready = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(name)) n.deleteAttribute(name);
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  let count = 0;
  for (const g of ready) count += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arr = new Float32Array(count * 3);
    let o = 0;
    for (const g of ready) {
      arr.set(g.attributes[name].array, o);
      o += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  out.computeBoundingSphere();
  return out;
}

const WOOD = '#8a5a36';
const WOOD_DARK = '#5a3a26';
const WOOD_IN = '#9a6a44';
const BOTTOM = '#2a2e4a';

const hullCache = new Map();
/** The hull and everything fixed to it, one vertex-coloured geometry per body, paint and trim. */
function hullGeometry(body, paint, trim) {
  const key = `${body}|${paint}|${trim}`;
  if (hullCache.has(key)) return hullCache.get(key);
  const build = BODY_BUILD[body] ?? BODY_BUILD.rowboat;
  PROF = PROFILES[body] ?? PROFILES.rowboat;
  let geo;
  try {
    const tc = TRIM_COLORS[trim] ?? (paint.toUpperCase() === '#F4EBD0' ? '#2B3F7C' : '#F4EBD0');
    geo = mergeAll(build(paint, trim, tc));
  } finally {
    PROF = PROFILES.rowboat;
  }
  hullCache.set(key, geo);
  return geo;
}

const BODY_BUILD = {
  rowboat(paint, trim, tc) {
    const stripes = trim === 'stripes';
    const dark = shade(paint, 0.8);
    const outer = shell((j, u) => {
      if (j <= 1) return BOTTOM;
      if (j === PROF.strakes - 1) return stripes ? (Math.floor(u * 22) % 2 ? '#E5533D' : '#F4EBD0') : tc;
      if (j === 2) return dark;
      return paint;
    });
    const inner = shell((j) => (j <= 1 ? WOOD_DARK : WOOD_IN), true);
    const kit = createKit();
    const parts = [outer, inner];
    for (let u = 0.1; u < 0.9; u += 0.095) parts.push(rib(u, '#6a4229'));
    fittings(kit);
    // the transom, with a band of the trim along its top
    const tw = PROF.halfWidth(0);
    const outline = [];
    for (let i = 0; i <= 10; i++) {
      const p = hullPoint(0, i / 10, 1);
      outline.push([p[0], p[1]]);
    }
    for (let i = 10; i >= 1; i--) {
      const p = hullPoint(0, i / 10, -1);
      outline.push([p[0], p[1]]);
    }
    kit.add(G.slab(outline, 0.035), WOOD_DARK, { z: PROF.len / 2 - 0.005 });
    kit.add(G.box(tw * 2 + 0.02, 0.08, 0.05), tc, { y: PROF.sheerAt(0) - 0.045, z: PROF.len / 2 + 0.005 });
    parts.push(...rails(WOOD));
    const stem = [];
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      const p = hullPoint(1, 0, 1);
      stem.push(new THREE.Vector3(0, PROF.sheerAt(1) - PROF.depthAt(1) * (1 - k) + k * 0.1, p[2] - 0.02 + Math.sin(k * 1.5) * 0.04));
    }
    parts.push(colored(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stem), 12, 0.035, 6), WOOD));
    parts.push(kit.build().userData.solid.geometry);
    return parts;
  },

  canoe(paint, trim, tc) {
    // smooth cedar-strip sides painted, a trim stripe under the gunwale, painted points at both ends
    const stripes = trim === 'stripes';
    const outer = shell((j, u, k) => {
      if (k < 0.22) return shade(paint, 0.62);
      if (k > 0.8 && k < 0.9) return stripes ? (Math.floor(u * 26) % 2 ? '#E5533D' : '#F4EBD0') : tc;
      if (ends(u) > 0.84 && k > 0.35) return tc;
      return paint;
    });
    const inner = shell((j, u) => (Math.floor(u * 40) % 2 ? '#b98a58' : '#a87a4a'), true);
    const kit = createKit();
    const parts = [outer, inner];
    for (let u = 0.12; u < 0.9; u += 0.08) parts.push(rib(u, '#8a5f38'));
    fittings(kit, '#c49a6c', { bow: false, stern: false, floor: false });
    // thwarts across, and the little end decks
    for (const z of [0.95, -0.85]) kit.add(G.box(PROF.halfWidth(pu(z)) * 2, 0.035, 0.08), WOOD, { y: PROF.sheerAt(pu(z)) - 0.04, z });
    for (const u of [0.03, 0.97]) {
      const z = pz(u < 0.5 ? 0.06 : 0.94);
      kit.add(G.cone(0.12, 0.34, 3), tc, { y: PROF.sheerAt(u < 0.5 ? 0.06 : 0.94) - 0.02, z, rx: Math.PI / 2 * (u < 0.5 ? -1 : 1), sz: 0.25 });
    }
    parts.push(...rails(WOOD_DARK, 0.026));
    parts.push(kit.build().userData.solid.geometry);
    return parts;
  },

  paper(paint, trim, tc) {
    // folded from a page of an exercise book: ruled lines, a margin, the fold peaks at either end
    const ink = trim === 'cream' ? '#8fb6e8' : tc;
    const page = '#f3efe4';
    const lined = (u, k, s) => {
      const p = hullPoint(u, k, s);
      const y = p[1];
      if (Math.abs(p[2] - 0.9) < 0.03) return '#e58a8a';
      return Math.abs(((y * 1000) % 90) - 45) < 6 ? ink : page;
    };
    const outer = shell((j, u, k, s) => lined(u, k, s));
    const inner = shell(() => '#e9e3d4', true);
    const kit = createKit();
    const parts = [outer, inner];
    fittings(kit, '#d9cdb4', { floor: false, bow: false });
    // the folds: a crease line along each side, and a paint-coloured doodle on the bow
    parts.push(...rails('#d6cdb8', 0.012, 0.005));
    kit.add(G.sphere(0.1, 10, 8), paint, { x: 0.5, y: 0.62, z: -1.1, sz: 0.3, ry: 0.4 });
    kit.add(G.sphere(0.1, 10, 8), paint, { x: -0.5, y: 0.62, z: -1.1, sz: 0.3, ry: -0.4 });
    parts.push(kit.build().userData.solid.geometry);
    return parts;
  },

  swan(paint, trim, tc) {
    const white = '#f6f2ea';
    const outer = shell((j, u, k) => {
      if (k < 0.18) return '#c9c2b6';
      if (k > 0.9) return tc;
      return mixc(white, '#e9e2d6', ends(u) * 0.4);
    });
    const inner = shell((j) => (j <= 1 ? '#5a3a26' : '#d9cbb0'), true);
    const kit = createKit();
    const parts = [outer, inner];
    fittings(kit, '#c49a6c', { bow: false });
    parts.push(...rails('#e8dfcf', 0.03));
    // wings folded against the sides, their tips raised at the stern, three paint-dipped flight feathers each
    for (const s of [-1, 1]) {
      const zc = 0.72;
      const w = PROF.halfWidth(pu(zc));
      const y = PROF.sheerAt(pu(zc)) - 0.02;
      kit.add(G.sphere(1, 20, 12), white, { x: s * (w + 0.015), y, z: zc, sx: 0.05, sy: 0.16, sz: 0.56, rx: -0.22 });
      for (let f = 0; f < 3; f++) {
        const z = 1.08 + f * 0.1;
        kit.add(G.sphere(1, 12, 8), f === 2 ? paint : '#ffffff', { x: s * (PROF.halfWidth(pu(z)) + 0.03), y: y + 0.13 + f * 0.035, z, sx: 0.035, sy: 0.05, sz: 0.2, rx: -0.5 - f * 0.12 });
      }
    }
    // the neck: an S up from the bow, thick at the base; the head, an orange beak with its black knob, the eyes
    const bz = pz(1);
    const lower = [new THREE.Vector3(0, 0.42, bz + 0.3), new THREE.Vector3(0, 0.75, bz + 0.04), new THREE.Vector3(0, 1.1, bz - 0.08)];
    const upper = [new THREE.Vector3(0, 1.06, bz - 0.08), new THREE.Vector3(0, 1.45, bz + 0.02), new THREE.Vector3(0, 1.78, bz - 0.04), new THREE.Vector3(0, 1.94, bz - 0.16)];
    parts.push(colored(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lower), 16, 0.12, 12), white));
    parts.push(colored(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(upper), 16, 0.085, 12), white));
    kit.add(G.sphere(0.14, 16, 12), white, { y: 1.97, z: bz - 0.2, sz: 1.3 });
    kit.add(G.cone(0.065, 0.26, 12), '#f08a2a', { y: 1.93, z: bz - 0.45, rx: -Math.PI / 2 - 0.3 });
    kit.add(G.sphere(0.058, 10, 8), '#1a1418', { y: 1.99, z: bz - 0.34 });
    for (const s of [-1, 1]) kit.add(G.sphere(0.026, 8, 6), '#1a1418', { x: s * 0.12, y: 2.01, z: bz - 0.24 });
    // a ribbon of the paint round the neck
    kit.add(G.torus(0.11, 0.026, 18, 6), paint, { y: 1.02, z: bz - 0.06, rx: Math.PI / 2 + 0.25 });
    parts.push(kit.build().userData.solid.geometry);
    return parts;
  },

  teacup(paint, trim, tc) {
    // glazed porcelain: the paint outside with a gilt band, white inside, a handle at the stern, on a saucer
    const gilt = trim === 'cream' ? '#d9a441' : tc;
    const outer = shell((j, u, k, s) => {
      if (k > 0.86) return '#fbf8f2';
      if (k > 0.8) return gilt;
      if (k < 0.12) return '#fbf8f2';
      // little painted flowers: dots in a ring
      const a = Math.atan2(s * PROF.halfWidth(u), pz(u));
      if (k > 0.45 && k < 0.6 && Math.abs(((a * 8) / Math.PI) % 2) < 0.22) return '#fbf8f2';
      return paint;
    });
    const inner = shell((j, u, k) => (k < 0.2 ? '#efe6d6' : '#fbf8f2'), true);
    const kit = createKit();
    const parts = [outer, inner];
    parts.push(rim(gilt, 0.03, 0.005));
    fittings(kit, '#c49a6c', { bow: false, stern: false, floor: false });
    // the handle, out over the stern
    kit.add(G.torus(0.22, 0.05, 20, 10, Math.PI * 1.25), paint, { y: 0.28, z: PROF.len / 2 + 0.12, rx: 0, ry: Math.PI / 2, rz: -Math.PI * 0.62 });
    // the saucer under it, at the water
    const saucer = G.lathe([[0.0, -0.06], [0.7, -0.05], [1.32, 0.0], [1.45, 0.06], [1.48, 0.08]], 40);
    kit.add(saucer, '#fbf8f2', {});
    kit.add(G.torus(1.43, 0.02, 48, 6), gilt, { y: 0.07, rx: Math.PI / 2 });
    parts.push(kit.build().userData.solid.geometry);
    return parts;
  },

  walnut(paint, trim, tc) {
    // half a walnut shell: deep wrinkles outside and in, a pale cut rim, the seam along the keel
    const wr = (u, k, s) => wob(u * 11 + s * 3.1, k * 7.3) + 0.5 * wob(u * 23 - s, k * 15);
    const bump = (u, k, s) => 0.07 * wr(u, k, s) * Math.sin(Math.min(1, k * 1.05) * Math.PI);
    const outer = shell((j, u, k, s) => mixc('#4a2a14', '#a8744a', Math.max(0, Math.min(1, 0.55 + wr(u, k, s) * 0.45))), false, bump);
    const inner = shell((j, u, k, s) => mixc('#5a361e', '#c99a64', Math.max(0, Math.min(1, 0.45 + wr(u * 1.3, k + 0.3, -s) * 0.55)) * (0.5 + k * 0.5)), true);
    const kit = createKit();
    const parts = [outer, inner];
    parts.push(rim('#e0c08f', 0.05, 0.0));
    // the seam: a ridge along the keel, and the inner partition's stub across the middle
    const seam = [];
    for (let i = 0; i <= 20; i++) {
      const p = hullPoint(i / 20, 0, 1);
      seam.push(new THREE.Vector3(0, p[1] - 0.02, p[2]));
    }
    parts.push(colored(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seam), 30, 0.05, 6), '#3e2412'));
    // inside: the two hollows of the kernel's halves, parted by a ridge down the middle
    const ridge = [];
    for (let i = 0; i <= 16; i++) {
      const u = 0.08 + (i / 16) * 0.84;
      const p = hullPoint(u, 0, 1, 0.04);
      ridge.push(new THREE.Vector3(0, p[1] + 0.06 + 0.04 * Math.sin(u * Math.PI), p[2]));
    }
    parts.push(colored(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridge), 24, 0.06, 8), '#8a5a34'));
    fittings(kit, '#c99a64', { bow: false, floor: false });
    // a ribbon of the paint tied round the post
    kit.add(G.torus(0.06, 0.02, 14, 6), paint, { y: 0.9, z: BOW_Z.walnut, rx: Math.PI / 2 });
    parts.push(kit.build().userData.solid.geometry);
    return parts;
  },

  tub(paint, trim, tc) {
    // a clawfoot bath: painted outside, white enamel in, a rolled rim, brass taps at the stern, feet below
    const outer = shell((j, u, k) => (k > 0.9 ? '#f4f4f0' : paint));
    const inner = shell((j, u, k) => (k < 0.15 ? '#e6e6e0' : '#f6f6f2'), true);
    const kit = createKit();
    const parts = [outer, inner];
    parts.push(rim('#f6f6f2', 0.045, 0.01, 1.02));
    const brass = trim === 'cream' ? '#d9a441' : tc;
    fittings(kit, '#c49a6c', { bow: false, floor: false, lockColor: brass });
    // taps and a spout at the stern end
    const sz = PROF.len / 2 - 0.08;
    const sy = PROF.sheerAt(0.02);
    kit.add(G.cyl(0.03, 0.03, 0.22, 10), brass, { y: sy + 0.1, z: sz });
    kit.add(G.cyl(0.026, 0.026, 0.2, 10), brass, { y: sy + 0.2, z: sz - 0.09, rx: Math.PI / 2 });
    for (const s of [-1, 1]) {
      kit.add(G.cyl(0.025, 0.025, 0.12, 8), brass, { x: s * 0.18, y: sy + 0.06, z: sz });
      kit.add(G.cyl(0.06, 0.06, 0.03, 4), '#f6f6f2', { x: s * 0.18, y: sy + 0.13, z: sz, ry: Math.PI / 4 });
    }
    // the feet: brass claws at the four corners, down in the water
    for (const [u, s] of [[0.12, -1], [0.12, 1], [0.88, -1], [0.88, 1]]) {
      const p = hullPoint(u, 0.35, s);
      kit.add(G.sphere(0.08, 10, 8), brass, { x: p[0] * 0.9, y: p[1] - 0.14, z: p[2] });
      kit.add(G.cone(0.06, 0.14, 8), brass, { x: p[0] * 0.95, y: p[1] - 0.06, z: p[2], rx: Math.PI });
    }
    // a rubber duck on the rim at the bow
    kit.add(G.sphere(0.09, 12, 10), '#ffd23f', { y: PROF.sheerAt(0.95) + 0.1, z: pz(0.95) + 0.05, sz: 1.2 });
    kit.add(G.sphere(0.06, 12, 10), '#ffd23f', { y: PROF.sheerAt(0.95) + 0.22, z: pz(0.95) - 0.04 });
    kit.add(G.cone(0.03, 0.07, 8), '#f08a2a', { y: PROF.sheerAt(0.95) + 0.21, z: pz(0.95) - 0.12, rx: -Math.PI / 2 });
    parts.push(kit.build().userData.solid.geometry);
    return parts;
  },
};

const YOKE_Y = 1.5;

let yokeGeo = null;
/** The lantern yoke: a post at the bow and a bowed crossbar with brass knobs (its own mesh, hidden near the camera). */
function yokeGeometry() {
  if (yokeGeo) return yokeGeo;
  const kit = createKit();
  const postZ = zAt(0.9);
  const postY = 0.3;
  const top = YOKE_Y + 0.2;
  kit.add(G.cyl(0.028, 0.038, top - postY, 8), WOOD_DARK, { y: (top + postY) / 2, z: postZ });
  const parts = [];
  const bar = [];
  for (let i = 0; i <= 10; i++) {
    const x = -0.86 + (i / 10) * 1.72;
    bar.push(new THREE.Vector3(x, YOKE_Y + 0.13 * (x / 0.86) ** 2, postZ));
  }
  parts.push(colored(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bar), 16, 0.022, 6), WOOD_DARK));
  for (const s of [-1, 1]) kit.add(G.sphere(0.04, 10, 8), '#d9a441', { x: s * 0.88, y: YOKE_Y + 0.14, z: postZ });
  kit.add(G.sphere(0.045, 10, 8), '#d9a441', { y: top, z: postZ });
  parts.push(kit.build().userData.solid.geometry);
  yokeGeo = mergeAll(parts);
  return yokeGeo;
}

function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// ---------------------------------------------------------------- oars

const oarCache = new Map();
/** One oar along +x (sign 1) or -x from its oarlock: grip, loom, leather, a spoon blade with a painted tip. */
function oarGeometry(paint, sign) {
  const key = `${paint}${sign}`;
  if (oarCache.has(key)) return oarCache.get(key);
  const kit = createKit();
  const X = (x) => x * sign;
  const along = (x0, x1, r0, r1, color, seg = 8) => kit.add(G.cyl(r1, r0, Math.abs(x1 - x0), seg), color, { x: X((x0 + x1) / 2), rz: (-Math.PI / 2) * sign });
  along(-IN, -IN + 0.15, 0.03, 0.03, '#3a2418');
  along(-IN + 0.15, OUT - 0.42, 0.027, 0.023, '#d8b07c');
  along(-0.02, 0.18, 0.034, 0.034, '#7a4a2e');
  kit.add(G.cyl(0.044, 0.044, 0.02, 10), '#7a4a2e', { x: X(0.19), rz: Math.PI / 2 });
  // the blade: wide and thin, its face square to the stroke (the oar's own frame: y up, z along the stroke)
  kit.add(G.sphere(1, 16, 10), '#e8d2a8', { x: X(OUT - 0.27), sx: 0.3, sy: 0.115, sz: 0.022 });
  kit.add(G.sphere(1, 16, 10), paint, { x: X(OUT - 0.09), sx: 0.12, sy: 0.118, sz: 0.026 });
  kit.add(G.box(0.36, 0.018, 0.03), '#c99a64', { x: X(OUT - 0.35) });
  const g = kit.build().userData.solid.geometry;
  oarCache.set(key, g);
  return g;
}

// ---------------------------------------------------------------- lanterns and the pennant

const LANTERN_GEO = (() => {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const y = -0.13 + (i / 16) * 0.26;
    const r = 0.115 * Math.sqrt(Math.max(0.04, 1 - (y / 0.14) ** 2)) * (i % 2 ? 0.97 : 1);
    pts.push([r, y]);
  }
  return G.lathe(pts, 18);
})();
const CAP_GEO = G.cyl(0.05, 0.05, 0.03, 10);
const capMat = new THREE.MeshStandardMaterial({ color: '#2a1a14', roughness: 0.6 });
const litMats = new Map();
function lanternMats(color) {
  if (!litMats.has(color)) {
    litMats.set(color, {
      lit: new THREE.MeshStandardMaterial({ color: '#fff0d6', emissive: color, emissiveIntensity: 2.6, roughness: 0.75 }),
      dark: new THREE.MeshStandardMaterial({ color: '#d8c9b0', emissive: color, emissiveIntensity: 0.04, roughness: 0.85 }),
      flash: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 4, roughness: 0.6 }),
      snuff: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#E5533D', emissiveIntensity: 2.2, roughness: 0.6 }),
    });
  }
  return litMats.get(color);
}

const pennants = new Map();
function pennantTexture(paint, symbol) {
  const key = `${paint}${symbol}`;
  if (pennants.has(key)) return pennants.get(key);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = paint;
  g.beginPath();
  g.moveTo(4, 4);
  g.quadraticCurveTo(70, 30, 124, 48);
  g.quadraticCurveTo(70, 66, 4, 92);
  g.closePath();
  g.fill();
  g.strokeStyle = '#141A3A';
  g.lineWidth = 5;
  g.stroke();
  drawSymbol(g, symbol, 42, 48, 20, '#141A3A');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  pennants.set(key, t);
  return t;
}

/** The pennant symbols (also used by the HUD's little river). */
export function drawSymbol(g, symbol, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  switch (symbol) {
    case 'dot':
      g.arc(x, y, r * 0.7, 0, Math.PI * 2);
      break;
    case 'diamond':
      g.moveTo(x, y - r);
      g.lineTo(x + r * 0.75, y);
      g.lineTo(x, y + r);
      g.lineTo(x - r * 0.75, y);
      break;
    case 'square':
      g.rect(x - r * 0.65, y - r * 0.65, r * 1.3, r * 1.3);
      break;
    case 'chevron':
      g.moveTo(x - r, y + r * 0.6);
      g.lineTo(x, y - r * 0.7);
      g.lineTo(x + r, y + r * 0.6);
      g.lineTo(x + r * 0.55, y + r * 0.85);
      g.lineTo(x, y - r * 0.05);
      g.lineTo(x - r * 0.55, y + r * 0.85);
      break;
    case 'star':
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      break;
    default: // heart
      g.moveTo(x, y + r * 0.85);
      g.bezierCurveTo(x - r * 1.3, y - r * 0.1, x - r * 0.6, y - r * 1.1, x, y - r * 0.4);
      g.bezierCurveTo(x + r * 0.6, y - r * 1.1, x + r * 1.3, y - r * 0.1, x, y + r * 0.85);
  }
  g.closePath();
  g.fill();
}

// ---------------------------------------------------------------- the boat

const LANTERN_X = [-0.6, -0.2, 0.2, 0.6];

/**
 * A boat. look: { paint, symbol, shirt, skin, pants, hat, hatColor, hair, hairColor, body, trim, lantern }. ghost: a
 * translucent moonlit hull with no rower.
 */
export function createBoatMesh(look, { ghost = false } = {}) {
  const group = new THREE.Group();
  const tilt = new THREE.Group(); // pitch, roll and heave on the water
  group.add(tilt);
  const lk = { body: 'rowboat', trim: 'cream', lantern: 'amber', ...look };
  const hullMat = ghost
    ? new THREE.MeshBasicMaterial({ color: '#bcd0ff', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });
  const hull = new THREE.Mesh(hullGeometry(lk.body, lk.paint, lk.trim), hullMat);
  hull.castShadow = !ghost;
  hull.receiveShadow = !ghost;
  tilt.add(hull);
  // the yoke, the lanterns and the pennant stand together at the body's bow
  const bow = new THREE.Group();
  bow.position.z = (BOW_Z[lk.body] ?? BOW_Z.rowboat) - BOW_Z.rowboat;
  tilt.add(bow);
  hullMat.roughness = ROUGH[lk.body] ?? 0.42;
  const yoke = new THREE.Mesh(yokeGeometry(), hullMat);
  yoke.castShadow = !ghost;
  bow.add(yoke);
  const api = { group, tilt, ghost, look: lk, level: 1, lanterns: [], showBoat: () => {} };
  if (ghost) {
    api.update = (dt, now) => {
      tilt.position.y = Math.sin(now * 2.1) * 0.03;
      hull.material.opacity = 0.2 + 0.06 * Math.sin(now * 3);
    };
    api.stroke = () => {};
    api.setLevel = () => {};
    api.setLook = () => {};
    api.face = () => {};
    api.pose = () => {};
    api.oarTip = (side, v) => v.set(group.position.x, 0, group.position.z);
    return api;
  }

  // the rower
  const rower = createRower(lk);
  rower.root.position.set(0, HIPS.y, HIPS.z);
  tilt.add(rower.root);

  // oars
  const oarMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  const oars = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * OARLOCK.x, OARLOCK.y, OARLOCK.z);
    pivot.rotation.order = 'YZX';
    const mesh = new THREE.Mesh(oarGeometry(lk.paint, side), oarMat);
    mesh.castShadow = true;
    pivot.add(mesh);
    tilt.add(pivot);
    return { side, pivot, mesh, t: -9, kind: '', a: CATCH, tiltA: BLADE_READY, feather: 0, dripped: false };
  });

  // the four lanterns over the bow, each on its string
  const postZ = zAt(0.9);
  let mats = lanternMats(LANTERN_COLORS[lk.lantern] ?? LANTERN_COLORS.amber);
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: LANTERN_COLORS[lk.lantern] ?? '#FFB547', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.0 });
  LANTERN_X.forEach((x, k) => {
    const hang = new THREE.Group();
    hang.position.set(x, YOKE_Y + 0.13 * (x / 0.86) ** 2, postZ);
    const string = new THREE.Mesh(G.cyl(0.004, 0.004, 0.16, 4), capMat);
    string.position.y = -0.08;
    hang.add(string);
    const body = new THREE.Group();
    body.position.y = -0.3;
    const paper = new THREE.Mesh(LANTERN_GEO, mats.dark);
    body.add(paper);
    for (const y of [-0.13, 0.13]) {
      const cap = new THREE.Mesh(CAP_GEO, capMat);
      cap.position.y = y;
      body.add(cap);
    }
    const glow = new THREE.Sprite(glowMat.clone());
    glow.scale.setScalar(0.9);
    body.add(glow);
    hang.add(body);
    bow.add(hang);
    api.lanterns.push({ hang, body, mesh: paper, glow, pop: 0, snuff: 0, a: 0, v: 0, lit: false });
  });
  // the pennant on top of the post
  const pen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.34, 6, 1), new THREE.MeshStandardMaterial({ map: pennantTexture(lk.paint, lk.symbol), transparent: true, side: THREE.DoubleSide, alphaTest: 0.3, roughness: 0.8 }));
  pen.geometry.translate(0.23, 0, 0);
  const penBase = pen.geometry.attributes.position.array.slice();
  const penPivot = new THREE.Group();
  penPivot.position.set(0, YOKE_Y + 0.2, postZ);
  pen.rotation.y = Math.PI / 2;
  penPivot.add(pen);
  bow.add(penPivot);

  const handL = new THREE.Vector3();
  const handR = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const rowerInv = new THREE.Matrix4();
  let lean = 0.3;
  let surge = 0;
  let pitchV = 0;
  let pitch = 0;
  let roll = 0;
  let rollV = 0;
  let heave = 0;
  let clock = Math.random() * 10;
  let lastSide = 0;
  let mood = 'row';
  const drips = [];

  api.rower = rower;
  api.setLevel = (level, instant = false) => {
    const prev = api.level;
    api.level = level;
    api.lanterns.forEach((l, k) => {
      const on = k < level;
      if (!instant && on && !l.lit) {
        l.pop = 1;
        l.v += (Math.random() - 0.5) * 6;
      }
      if (!instant && !on && l.lit) l.snuff = 1;
      l.lit = on;
      l.mesh.material = on ? mats.lit : mats.dark;
    });
    void prev;
  };
  api.setLevel(1, true);

  /** A stroke on side (-1, 1; 0 both). kind: perfect, good, splash, free, both, pull, drop. */
  api.stroke = (side, kind) => {
    for (const o of oars) {
      if (side !== 0 && o.side !== side) continue;
      o.t = clock;
      o.kind = kind;
      o.dripped = false;
    }
    lastSide = side;
    const power = kind === 'splash' ? 0.35 : kind === 'drop' ? 0.55 : kind === 'pull' ? 2 : side === 0 ? 1.4 : 1;
    surge = Math.max(surge, power);
    pitchV += 0.9 * power;
    rollV += side * (kind === 'splash' ? 0.9 : 0.35);
    if (kind === 'perfect' || kind === 'drop' || side === 0) rower.face('happy', 0.5);
    if (kind === 'splash') rower.face('oops', 0.7);
  };
  api.bump = (side = 0, power = 1) => {
    rollV += side * 1.6 * power;
    pitchV -= 1.2 * power;
    rower.face('oops', 0.9);
  };
  api.face = (expr, secs) => rower.face(expr, secs);
  /** row, cheer, wave, slump */
  api.pose = (name) => {
    mood = name;
    rower.pose(name);
  };

  api.setLook = (next) => {
    const before = { ...lk };
    Object.assign(lk, next);
    if (['shirt', 'skin', 'pants', 'hat', 'hatColor', 'hair', 'hairColor'].some((k) => before[k] !== lk[k])) rower.setLook(lk);
    if (['body', 'paint', 'trim'].some((k) => before[k] !== lk[k])) hull.geometry = hullGeometry(lk.body, lk.paint, lk.trim);
    if (before.body !== lk.body) {
      bow.position.z = (BOW_Z[lk.body] ?? BOW_Z.rowboat) - BOW_Z.rowboat;
      hullMat.roughness = ROUGH[lk.body] ?? 0.42;
    }
    if (before.paint !== lk.paint) for (const o of oars) o.mesh.geometry = oarGeometry(lk.paint, o.side);
    if (before.paint !== lk.paint || before.symbol !== lk.symbol) {
      pen.material.map = pennantTexture(lk.paint, lk.symbol);
      pen.material.needsUpdate = true;
    }
    if (before.lantern !== lk.lantern) {
      mats = lanternMats(LANTERN_COLORS[lk.lantern] ?? LANTERN_COLORS.amber);
      for (const l of api.lanterns) {
        l.mesh.material = l.lit ? mats.lit : mats.dark;
        l.glow.material.color.set(LANTERN_COLORS[lk.lantern] ?? '#FFB547');
      }
    }
  };
  /** Hide what stands tall over the bow (a boat right in front of the camera). */
  api.setNear = (near) => {
    if (api.near === near) return;
    api.near = near;
    yoke.visible = !near;
    penPivot.visible = !near;
    for (const l of api.lanterns) l.hang.visible = !near;
  };
  api.showBoat = (on) => {
    hull.visible = on;
    yoke.visible = on;
    for (const o of oars) o.pivot.visible = on;
    for (const l of api.lanterns) l.hang.visible = on;
    penPivot.visible = on;
  };

  /** World position of an oar's blade (for spray). */
  api.oarTip = (side, v) => {
    const o = oars[side < 0 ? 0 : 1];
    v.set(side * (OUT - 0.25), 0, 0);
    o.pivot.updateWorldMatrix(true, false);
    o.pivot.localToWorld(v);
    return v;
  };
  /** Drips from the blades on the recovery (world positions, for the particles), taken once. */
  api.takeDrips = () => drips.splice(0);

  /** st: { v (speed), away, finished, wave (0-1 rough water), look (-1..1 head turn), lanternPulse } */
  api.update = (dt, now, st = {}) => {
    clock += dt;
    let drivePhase = -1; // 0-1 through the latest drive, or -1
    let recPhase = -1;
    for (const o of oars) {
      const since = clock - o.t;
      let a;
      let ta;
      let fe;
      if (since < DRIVE) {
        const k = since / DRIVE;
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        a = CATCH + (FINISH - CATCH) * e;
        ta = BLADE_IN + (o.kind === 'splash' ? -0.05 : 0);
        fe = 0;
        drivePhase = Math.max(drivePhase, k);
      } else if (since < DRIVE + RECOVER) {
        const k = (since - DRIVE) / RECOVER;
        const e = 1 - (1 - k) ** 3;
        a = FINISH + (CATCH - FINISH) * e;
        ta = BLADE_IN + (BLADE_UP - BLADE_IN) * Math.min(1, k * 4) - (BLADE_UP - BLADE_READY) * Math.max(0, (k - 0.6) / 0.4);
        fe = k < 0.75 ? Math.min(1, k * 5) : 1 - (k - 0.75) / 0.25;
        recPhase = Math.max(recPhase, k);
        if (!o.dripped && k > 0.15) {
          o.dripped = true;
          drips.push(api.oarTip(o.side, new THREE.Vector3()));
        }
      } else {
        a = CATCH;
        ta = BLADE_READY + Math.sin(now * 2 + o.side) * 0.01;
        fe = 0;
      }
      if (st.away || mood === 'cheer' || mood === 'slump') {
        a = 0.05;
        ta = BLADE_IN + 0.02;
        fe = 1;
      }
      o.a += (a - o.a) * Math.min(1, dt * 30);
      o.tiltA += (ta - o.tiltA) * Math.min(1, dt * 25);
      o.feather += (fe - o.feather) * Math.min(1, dt * 20);
      o.pivot.rotation.set(o.side * o.feather * (Math.PI / 2) * 0.92, o.side * o.a, o.side * o.tiltA);
    }
    // the rower's lean follows the drive and the recovery; one-sided strokes lean less and twist
    let want;
    const one = lastSide !== 0 ? 0.65 : 1;
    if (drivePhase >= 0) want = 0.48 - 0.82 * drivePhase * one;
    else if (recPhase >= 0) want = 0.48 - 0.82 * one + 0.82 * one * (1 - (1 - recPhase) ** 2);
    else want = 0.44;
    lean += (want - lean) * Math.min(1, dt * 22);
    // the oar handles, in rower space
    tilt.updateMatrixWorld(true);
    rowerInv.copy(rower.root.matrixWorld).invert();
    for (const o of oars) {
      tmp.set(-o.side * (IN - 0.06), 0.0, 0).applyMatrix4(o.pivot.matrixWorld).applyMatrix4(rowerInv);
      (o.side < 0 ? handL : handR).copy(tmp);
    }
    rower.update({ dt, lean, twist: drivePhase >= 0 ? -lastSide * 0.25 * (1 - drivePhase) : 0, look: st.look ?? 0, hands: { L: handL, R: handR }, surge, speed: st.v ?? 0, now });
    // the boat on the water: the bow lifts on the drive, one-sided strokes roll it
    surge *= Math.exp(-dt * 4);
    pitchV += (-pitch * 40 - pitchV * 6) * dt;
    pitch += pitchV * dt;
    rollV += (-roll * 30 - rollV * 4.5) * dt;
    roll += rollV * dt;
    const wave = st.wave ?? 0;
    heave = Math.sin(now * 1.9 + group.id) * 0.025 + surge * 0.025;
    tilt.position.y = heave;
    tilt.position.z = -surge * 0.04;
    tilt.rotation.x = pitch * 0.06 + Math.sin(now * 1.3 + group.id) * 0.012 + wave * Math.sin(now * 6) * 0.06;
    tilt.rotation.z = roll * 0.07 + Math.sin(now * 1.1 + group.id * 2) * 0.014 + wave * Math.sin(now * 4.3) * 0.05;
    // the lanterns swing on their strings: pop when lit, flash red when snuffed
    for (const [k, l] of api.lanterns.entries()) {
      l.v += (-l.a * 30 - l.v * 2.2 - (pitchV * 0.5 + surge * 0.6) * 0.2) * dt;
      l.a += l.v * dt;
      l.hang.rotation.x = l.a * 0.5;
      l.hang.rotation.z = -roll * 0.05 + Math.sin(now * 2.2 + k) * 0.03;
      if (l.pop > 0) l.pop = Math.max(0, l.pop - dt * 3);
      if (l.snuff > 0) l.snuff = Math.max(0, l.snuff - dt * 3.5);
      const pop = l.pop > 0 ? Math.sin(l.pop * Math.PI) * l.pop : 0;
      l.body.scale.setScalar(1 + pop * 0.7);
      if (l.snuff > 0.4) l.mesh.material = mats.snuff;
      else if (l.pop > 0.75) l.mesh.material = mats.flash;
      else l.mesh.material = l.lit ? mats.lit : mats.dark;
      l.glow.material.opacity = l.lit ? 0.55 + pop * 0.8 + (st.lanternPulse ?? 0) * 0.25 : l.snuff * 0.5;
      l.glow.scale.setScalar(0.85 + pop * 1.4);
    }
    // the pennant ripples in the wind
    const pa = pen.geometry.attributes.position;
    const flap = 0.4 + Math.min(1, (st.v ?? 0) / 6);
    for (let i = 0; i < pa.count; i++) {
      const x = penBase[i * 3];
      pa.setZ(i, Math.sin(x * 9 - now * 9 * flap) * 0.035 * (x / 0.46) * flap);
    }
    pa.needsUpdate = true;
    penPivot.rotation.y = Math.sin(now * 1.7 + group.id) * 0.15 - 0.15;
  };

  return api;
}
