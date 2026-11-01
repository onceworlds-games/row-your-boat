// A little clinker-built rowing boat with its rower, oars, bow lanterns (the combo) and pennant (the symbol), animated
// stroke by stroke. Forward is -z in the boat's own frame (the rower sits facing the stern, +z, toward the camera).

import * as THREE from 'three';
import { G, createKit } from './kit.js';

export const HATS = ['nightcap', 'scarf', 'beret', 'souwester', 'crown', 'flatcap', 'bowler'];
export const HAT_NAMES = { nightcap: 'Nightcap', scarf: 'Scarf', beret: 'Beret', souwester: "Sou'wester", crown: 'Moonflowers', flatcap: 'Flat cap', bowler: 'Bowler' };

const L = 3.3;
const SHEER = 0.42;
const OAR_X = 0.6;
const OAR_Y = SHEER + 0.06;
const OAR_Z = 0.02;
const IN = 0.72; // inboard length
const OUT = 1.95; // outboard length

function halfWidth(u) {
  const k = (u - 0.4) / (u < 0.4 ? 0.8 : 0.6);
  return 0.66 * Math.sqrt(Math.max(0, 1 - k * k));
}
const depthAt = (u) => 0.5 * (u < 0.82 ? 1 : 1 - ((u - 0.82) / 0.18) * 0.55);
const sheerAt = (u) => SHEER + 0.2 * u ** 3;

const hullCache = new Map();
/** The hull, seats, pole and oarlocks as one vertex-coloured geometry, per paint. */
function hullGeometry(paint) {
  if (hullCache.has(paint)) return hullCache.get(paint);
  const U = 22;
  const K = 12;
  const shell = (scale, inner) => {
    const pos = [];
    const colr = [];
    const idx = [];
    const c = new THREE.Color();
    for (let i = 0; i <= U; i++) {
      const u = i / U;
      const z = L * (0.5 - u);
      const w = Math.max(0.015, halfWidth(u)) * scale;
      const dp = depthAt(u) * scale;
      const sh = sheerAt(u) - (inner ? 0.03 : 0);
      for (let k = 0; k <= K; k++) {
        const phi = -Math.PI / 2 + (Math.PI * k) / K;
        const band = Math.min(k, K - k);
        const x = w * Math.sin(phi) * (1 + (inner ? 0 : 0.03 * (band % 2)));
        const y = sh - dp * Math.pow(Math.cos(phi), 0.75);
        pos.push(x, y, z);
        if (inner) c.set(band === 0 ? '#3a2418' : '#5c3b28');
        else c.set(band <= 1 ? paint : band % 2 ? '#8d5c3c' : '#7a4d33');
        colr.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < U; i++) {
      for (let k = 0; k < K; k++) {
        const a = i * (K + 1) + k;
        const b = a + 1;
        const cc = a + K + 1;
        const e = cc + 1;
        if (inner) idx.push(a, b, cc, b, e, cc);
        else idx.push(a, cc, b, b, cc, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const kit = createKit();
  // transom: a flat painted board at the stern
  const tw = halfWidth(0);
  kit.add(G.box(tw * 2 - 0.04, depthAt(0) * 0.9, 0.05), paint, { y: SHEER - depthAt(0) * 0.45, z: L / 2 - 0.01 });
  // seats, floorboards, gunwale caps
  kit.add(G.box(1.18, 0.06, 0.32), '#a77650', { y: SHEER - 0.16, z: 0.2 });
  kit.add(G.box(0.8, 0.06, 0.26), '#a77650', { y: SHEER - 0.13, z: 1.25 });
  kit.add(G.box(0.5, 0.04, 2.2), '#4a2f20', { y: SHEER - 0.44, z: 0.1 });
  for (const side of [-1, 1]) {
    kit.add(G.cyl(0.035, 0.035, 0.12, 6), '#c9a24e', { x: side * OAR_X, y: OAR_Y, z: OAR_Z });
  }
  // the bow pole and its arm
  kit.add(G.cyl(0.035, 0.045, 1.6, 6), '#3a2418', { y: sheerAt(0.93) + 0.75, z: -L * 0.43 });
  kit.add(G.cyl(0.025, 0.025, 0.5, 6), '#3a2418', { y: sheerAt(0.93) + 1.5, z: -L * 0.43 - 0.22, rx: Math.PI / 2 });
  const parts = kit.build().userData.solid.geometry;
  const geo = mergeAll([shell(1, false), shell(0.9, true), parts]);
  hullCache.set(paint, geo);
  return geo;
}

function mergeAll(list) {
  // all non-indexed with position, normal, color
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

/** The rower's body (torso, head, face, hat, legs) as one geometry. Origin at the hips; faces +z. */
function bodyGeometry({ shirt, skin, pants, hat, hatColor }) {
  const kit = createKit();
  kit.add(G.capsule(0.2, 0.3, 10), shirt, { y: 0.33, sz: 0.85 });
  kit.add(G.torus(0.12, 0.05, 12, 6), shirt, { y: 0.54, rx: Math.PI / 2 });
  kit.add(G.sphere(0.2, 16, 12), skin, { y: 0.8 });
  for (const x of [-0.07, 0.07]) kit.add(G.sphere(0.028, 8, 6), '#1d1a24', { x, y: 0.82, z: 0.175 });
  kit.add(G.sphere(0.035, 8, 6), '#e98f8a', { x: 0.11, y: 0.75, z: 0.15, s: 0.8 });
  kit.add(G.sphere(0.035, 8, 6), '#e98f8a', { x: -0.11, y: 0.75, z: 0.15, s: 0.8 });
  for (const x of [-0.11, 0.11]) {
    kit.add(G.capsule(0.08, 0.42, 6), pants, { x, y: 0.02, z: 0.3, rx: Math.PI / 2 - 0.35 });
    kit.add(G.sphere(0.09, 8, 6), '#2d2a36', { x, y: -0.12, z: 0.58, sz: 1.5 });
  }
  const hc = hatColor;
  switch (hat) {
    case 'nightcap':
      kit.add(G.cyl(0.205, 0.205, 0.08, 14), '#f4ebd0', { y: 0.93 });
      kit.add(G.cone(0.19, 0.5, 14), hc, { y: 1.16, z: -0.08, rx: -0.55 });
      kit.add(G.sphere(0.075, 10, 8), '#f4ebd0', { y: 1.34, z: -0.3 });
      break;
    case 'scarf':
      kit.add(G.torus(0.15, 0.065, 14, 8), hc, { y: 0.6, rx: Math.PI / 2 });
      kit.add(G.box(0.12, 0.38, 0.05), hc, { x: 0.12, y: 0.42, z: 0.17, rz: 0.15 });
      break;
    case 'beret':
      kit.add(G.sphere(0.23, 14, 10), hc, { y: 0.96, x: 0.03, sy: 0.32, rz: 0.2 });
      kit.add(G.cyl(0.02, 0.02, 0.06, 6), hc, { y: 1.04, x: 0.05 });
      break;
    case 'souwester':
      kit.add(G.sphere(0.21, 14, 10), hc, { y: 0.88, sy: 0.85 });
      kit.add(G.cyl(0.24, 0.36, 0.08, 18), hc, { y: 0.88, rx: -0.15 });
      break;
    case 'crown':
      kit.add(G.torus(0.17, 0.035, 18, 6), '#9CC5A1', { y: 0.95, rx: Math.PI / 2 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        kit.add(G.sphere(0.055, 8, 6), '#fbf3dc', { x: Math.cos(a) * 0.17, y: 0.99, z: Math.sin(a) * 0.17 });
      }
      break;
    case 'flatcap':
      kit.add(G.cyl(0.21, 0.21, 0.09, 16), hc, { y: 0.95, sx: 1.04 });
      kit.add(G.box(0.3, 0.025, 0.14), hc, { y: 0.93, z: 0.2, rx: 0.2 });
      break;
    case 'bowler':
      kit.add(G.half(0.19, 14, 8), hc, { y: 0.9 });
      kit.add(G.cyl(0.29, 0.29, 0.025, 18), hc, { y: 0.9 });
      kit.add(G.cyl(0.192, 0.192, 0.04, 14), '#E5533D', { y: 0.93 });
      break;
    default:
      break;
  }
  return kit.build().userData.solid.geometry;
}

const oarCache = new Map();
function oarGeometry(paint, sign) {
  const key = `${paint}${sign}`;
  if (oarCache.has(key)) return oarCache.get(key);
  const kit = createKit();
  // along +x (sign 1) or -x (sign -1) from the oarlock
  kit.add(G.cyl(0.03, 0.035, IN + OUT, 6), '#c49a6c', { x: (sign * (OUT - IN)) / 2, rz: Math.PI / 2 });
  kit.add(G.cyl(0.04, 0.04, 0.22, 6), '#3a2418', { x: -sign * (IN - 0.08), rz: Math.PI / 2 });
  kit.add(G.box(0.62, 0.035, 0.2), '#d9b98c', { x: sign * (OUT - 0.32) });
  kit.add(G.box(0.18, 0.04, 0.21), paint, { x: sign * (OUT - 0.06) });
  const g = kit.build().userData.solid.geometry;
  oarCache.set(key, g);
  return g;
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
  g.lineTo(124, 48);
  g.lineTo(4, 92);
  g.closePath();
  g.fill();
  g.strokeStyle = '#141A3A';
  g.lineWidth = 5;
  g.stroke();
  drawSymbol(g, symbol, 44, 48, 22, '#141A3A');
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

const LANTERN_GEO = (() => {
  const g = G.sphere(0.12, 12, 8);
  g.scale(1, 1.3, 1);
  return g;
})();
const lanternLit = new THREE.MeshStandardMaterial({ color: '#ffe2b0', emissive: '#FFB547', emissiveIntensity: 2.6, roughness: 0.5 });
const lanternDark = new THREE.MeshStandardMaterial({ color: '#4a3a40', emissive: '#2a1a10', emissiveIntensity: 0.4, roughness: 0.8 });
const lanternSnuff = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#E5533D', emissiveIntensity: 2.2, roughness: 0.5 });

const DRIVE = 0.3;
const CATCH = 0.62;
const FINISH = -0.5;

/**
 * A boat. look: { paint, symbol, shirt, skin, pants, hat, hatColor }. ghost: a translucent moonlit hull with no rower.
 */
export function createBoatMesh(look, { ghost = false } = {}) {
  const group = new THREE.Group();
  const tilt = new THREE.Group(); // pitch and roll on the water
  group.add(tilt);
  const hullMat = ghost
    ? new THREE.MeshBasicMaterial({ color: '#bcd0ff', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const hull = new THREE.Mesh(hullGeometry(look.paint), hullMat);
  hull.castShadow = !ghost;
  hull.receiveShadow = !ghost;
  tilt.add(hull);
  const api = { group, tilt, ghost, look: { ...look }, level: 1, lanterns: [], strokes: { '-1': -9, 1: -9 }, kinds: { '-1': '', 1: '' } };
  if (ghost) {
    api.update = (dt, now, st) => {
      tilt.position.y = Math.sin(now * 2.1) * 0.03;
      hull.material.opacity = 0.22 + 0.06 * Math.sin(now * 3);
      void st;
    };
    api.stroke = () => {};
    api.setLevel = () => {};
    api.setLook = () => {};
    api.oarTip = (side, v) => v.set(group.position.x, 0, group.position.z);
    return api;
  }

  // rower
  const rower = new THREE.Group();
  rower.position.set(0, SHEER - 0.1, 0.22);
  tilt.add(rower);
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const body = new THREE.Mesh(bodyGeometry(look), bodyMat);
  body.castShadow = true;
  rower.add(body);
  const armMat = new THREE.MeshStandardMaterial({ color: look.shirt, roughness: 0.85 });
  const handMat = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.7 });
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.22, 0.48, 0.02);
    const arm = new THREE.Mesh(G.capsule(0.065, 0.36, 6), armMat);
    arm.position.y = -0.24;
    arm.castShadow = true;
    pivot.add(arm);
    const hand = new THREE.Mesh(G.sphere(0.075, 8, 6), handMat);
    hand.position.y = -0.5;
    pivot.add(hand);
    rower.add(pivot);
    return { side, pivot, arm, hand };
  });

  // oars
  const oars = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * OAR_X, OAR_Y, OAR_Z);
    const mesh = new THREE.Mesh(oarGeometry(look.paint, side), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    mesh.castShadow = true;
    pivot.add(mesh);
    tilt.add(pivot);
    return { side, pivot, mesh, a: CATCH * 0.8, dip: 0.1, feather: 1, t: -9 };
  });

  // bow lanterns, the bottom one first
  const poleTop = sheerAt(0.93) + 1.5;
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Mesh(LANTERN_GEO, lanternDark);
    m.position.set(0, poleTop - 1.15 + k * 0.29, -L * 0.43 - 0.42);
    tilt.add(m);
    api.lanterns.push({ mesh: m, pop: 0, snuff: 0 });
  }
  // the lanterns' string
  const string = new THREE.Mesh(G.cyl(0.008, 0.008, 1.2, 4), new THREE.MeshBasicMaterial({ color: '#2a1a12' }));
  string.position.set(0, poleTop - 0.62, -L * 0.43 - 0.42);
  tilt.add(string);
  // pennant
  const pen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.38), new THREE.MeshBasicMaterial({ map: pennantTexture(look.paint, look.symbol), transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 }));
  pen.geometry.translate(0.25, 0, 0);
  const penPivot = new THREE.Group();
  penPivot.position.set(0, poleTop + 0.12, -L * 0.43);
  penPivot.add(pen);
  pen.rotation.y = Math.PI / 2;
  tilt.add(penPivot);

  const shoulder = new THREE.Vector3();
  const handle = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const q = new THREE.Quaternion();
  let lean = 0;
  let surge = 0;
  let roll = 0;
  let clock = 0;

  api.setLevel = (level, instant = false) => {
    const prev = api.level;
    api.level = level;
    api.lanterns.forEach((l, k) => {
      const on = k < level;
      l.mesh.material = on ? lanternLit : lanternDark;
      if (!instant && on && k >= prev) l.pop = 1;
      if (!instant && !on && k < prev) l.snuff = 1;
    });
  };
  api.setLevel(1, true);

  /** A stroke on side (-1, 1, 0 both). kind: perfect/good/splash/free/both. */
  api.stroke = (side, kind) => {
    for (const o of oars) {
      if (side !== 0 && o.side !== side) continue;
      o.t = clock;
      o.kind = kind;
    }
    surge = kind === 'splash' ? 0.35 : 1;
    roll = side * (kind === 'splash' ? 0.12 : 0.05);
  };

  api.setLook = (lk) => {
    const changed = ['shirt', 'skin', 'pants', 'hat', 'hatColor'].some((k) => lk[k] !== undefined && lk[k] !== api.look[k]);
    Object.assign(api.look, lk);
    if (!changed) return;
    body.geometry.dispose();
    body.geometry = bodyGeometry(api.look);
    armMat.color.set(api.look.shirt);
    handMat.color.set(api.look.skin);
  };

  /** World position of an oar's blade (for spray). */
  api.oarTip = (side, v) => {
    const o = oars[side < 0 ? 0 : 1];
    v.set(side * (OUT - 0.3), 0, 0);
    o.pivot.localToWorld(v);
    return v;
  };

  /** st: { v (speed), away, finished, wave (0-1 rough water) } */
  api.update = (dt, now, st = {}) => {
    clock += dt;
    // oars
    for (const o of oars) {
      const since = clock - o.t;
      let a;
      let dip;
      let feather;
      if (since < DRIVE) {
        const k = since / DRIVE;
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        a = CATCH + (FINISH - CATCH) * e;
        dip = o.kind === 'splash' ? 0.32 : 0.26;
        feather = 0;
      } else {
        const k = Math.min(1, (since - DRIVE) / 0.45);
        const e = 1 - (1 - k) ** 2;
        a = FINISH + (CATCH * 0.85 - FINISH) * e;
        dip = 0.26 - 0.36 * Math.min(1, k * 3) + 0.06 * e;
        feather = Math.min(1, k * 3);
      }
      if (st.away) {
        a = 0.1;
        dip = 0.18;
        feather = 0;
      }
      o.a = a;
      o.pivot.rotation.set(feather * (Math.PI / 2) * -o.side, a * o.side, -dip * o.side, 'YZX');
    }
    // the rower leans back on the drive and forward to the catch
    const lastDrive = Math.max(oars[0].t, oars[1].t);
    const since = clock - lastDrive;
    const want = since < DRIVE ? -0.42 * Math.min(1, since / DRIVE) : st.away ? 0.35 : 0.3 * Math.min(1, (since - DRIVE) / 0.45) - 0.42 * Math.max(0, 1 - (since - DRIVE) / 0.45);
    lean += (want - lean) * Math.min(1, dt * 18);
    rower.rotation.x = lean;
    rower.position.z = 0.22 - lean * 0.08;
    // arms reach for the handles
    for (const arm of arms) {
      const o = oars[arm.side < 0 ? 0 : 1];
      handle.set(-arm.side * (IN - 0.1), 0, 0);
      o.pivot.updateMatrix();
      handle.applyMatrix4(o.pivot.matrix); // in the tilt frame
      rower.updateMatrix();
      const inv = rower.matrix.clone().invert();
      handle.applyMatrix4(inv);
      shoulder.copy(arm.pivot.position);
      dir.subVectors(handle, shoulder);
      const len = dir.length();
      dir.normalize();
      q.setFromUnitVectors(down, dir);
      arm.pivot.quaternion.copy(q);
      const reach = Math.max(0.6, Math.min(1.4, len / 0.5));
      arm.arm.scale.y = reach;
      arm.arm.position.y = -0.24 * reach;
      arm.hand.position.y = -0.5 * reach;
    }
    // the boat on the water
    surge *= Math.exp(-dt * 5);
    roll *= Math.exp(-dt * 4);
    const wave = st.wave ?? 0;
    tilt.position.y = Math.sin(now * 1.9 + group.id) * 0.025 + surge * 0.03;
    tilt.rotation.x = surge * 0.05 + Math.sin(now * 1.3 + group.id) * 0.012 + wave * Math.sin(now * 6) * 0.06;
    tilt.rotation.z = roll + Math.sin(now * 1.1 + group.id * 2) * 0.015 + wave * Math.sin(now * 4.3) * 0.05;
    // lanterns: pop when lit, flash when snuffed, swing
    for (const [k, l] of api.lanterns.entries()) {
      if (l.pop > 0) l.pop = Math.max(0, l.pop - dt * 3.5);
      if (l.snuff > 0) {
        l.snuff = Math.max(0, l.snuff - dt * 4);
        l.mesh.material = l.snuff > 0.5 ? lanternSnuff : k < api.level ? lanternLit : lanternDark;
      }
      l.mesh.scale.setScalar(1 + l.pop * 0.6);
      l.mesh.position.x = Math.sin(now * 2.2 + k * 0.6) * 0.03 - roll * 0.6;
    }
    penPivot.rotation.y = Math.sin(now * 5 + group.id) * 0.25 - 0.2;
  };

  return api;
}
