// The rower: a small knitted person with a skeleton. One skinned mesh for the knitwear (jumper, mittens, scarf, hat) and
// one for everything else (head, hair, trousers, boots), a face that blinks and smiles, arms that reach for the oar
// handles by two-bone IK, a hat tip and scarf tails on springs, and poses (row, cheer, wave, slump) blended smoothly.
// Rower space: origin at the hips, facing +z.

import * as THREE from 'three';
import { G } from './kit.js';

// ---------------------------------------------------------------- the skeleton (bind pose, rower space)

const B = {
  hips: 0, spine: 1, chest: 2, neck: 3, head: 4, hatTip: 5,
  upperArmL: 6, foreArmL: 7, handL: 8, upperArmR: 9, foreArmR: 10, handR: 11,
  thighL: 12, shinL: 13, footL: 14, thighR: 15, shinR: 16, footR: 17, scarfA: 18, scarfB: 19,
};
const PARENT = [-1, 0, 1, 2, 3, 4, 2, 6, 7, 2, 9, 10, 0, 12, 13, 0, 15, 16, 3, 18];
// world (rower space) bind positions
const BIND = [
  [0, 0, 0], [0, 0.1, 0], [0, 0.28, 0], [0, 0.44, 0], [0, 0.5, 0], [0, 0.9, -0.08],
  [-0.19, 0.4, 0], [-0.24, 0.2, 0.03], [-0.27, 0.01, 0.07], [0.19, 0.4, 0], [0.24, 0.2, 0.03], [0.27, 0.01, 0.07],
  [-0.1, 0, 0.03], [-0.11, 0.07, 0.27], [-0.11, -0.22, 0.34], [0.1, 0, 0.03], [0.11, 0.07, 0.27], [0.11, -0.22, 0.34],
  [0.08, 0.4, 0.12], [0.08, 0.26, 0.16],
];
const HEAD_C = new THREE.Vector3(0, 0.72, 0.01);
const HEAD_R = 0.25;

const col = new THREE.Color();

// ---------------------------------------------------------------- a geometry builder with bone weights

function builder() {
  const parts = { cloth: [], other: [] };
  return {
    /**
     * geo: a geometry (consumed). m: a Matrix4 placing it in rower space. w: a bone index, or fn(pos) → [[bone, w], ...].
     * color: a colour or fn(pos) → colour.
     */
    add(geo, color, m, w, cloth = false) {
      let g = geo.index ? geo.toNonIndexed() : geo;
      if (g !== geo) geo.dispose();
      if (!g.attributes.normal) g.computeVertexNormals();
      if (m) g.applyMatrix4(m);
      const n = g.attributes.position.count;
      const P = g.attributes.position;
      const c = new Float32Array(n * 3);
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      const p = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        p.fromBufferAttribute(P, i);
        col.set(typeof color === 'function' ? color(p) : color);
        c[i * 3] = col.r;
        c[i * 3 + 1] = col.g;
        c[i * 3 + 2] = col.b;
        const ws = typeof w === 'function' ? w(p) : [[w, 1]];
        let total = 0;
        for (let k = 0; k < Math.min(4, ws.length); k++) total += ws[k][1];
        for (let k = 0; k < 4; k++) {
          si[i * 4 + k] = ws[k] ? ws[k][0] : 0;
          sw[i * 4 + k] = ws[k] ? ws[k][1] / (total || 1) : 0;
        }
      }
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      (cloth ? parts.cloth : parts.other).push(g);
    },
    build() {
      const out = {};
      for (const k of ['cloth', 'other']) {
        const list = parts[k];
        if (!list.length) continue;
        const geo = new THREE.BufferGeometry();
        for (const [name, size, Type] of [['position', 3, Float32Array], ['normal', 3, Float32Array], ['uv', 2, Float32Array], ['color', 3, Float32Array], ['skinIndex', 4, Uint16Array], ['skinWeight', 4, Float32Array]]) {
          let count = 0;
          for (const g of list) count += g.attributes[name].count;
          const arr = new Type(count * size);
          let o = 0;
          for (const g of list) {
            arr.set(g.attributes[name].array, o);
            o += g.attributes[name].count * size;
          }
          geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
        }
        list.forEach((g) => g.dispose());
        geo.computeBoundingSphere();
        geo.boundingSphere.radius += 0.6;
        out[k] = geo;
      }
      return out;
    },
  };
}

const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));

/** A tube through points (rower space) with radii; returns a geometry and each vertex's t (0-1 along the tube). */
function tube(points, radii, seg = 12, ringsPer = 5) {
  const pts = points.map((p) => new THREE.Vector3(...p));
  const pos = [];
  const uv = [];
  const ts = [];
  const idx = [];
  const total = pts.reduce((a, p, i) => (i ? a + p.distanceTo(pts[i - 1]) : 0), 0);
  let acc = 0;
  let ring = 0;
  const up = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = a.distanceTo(b);
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.dot(up)) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    const side2 = new THREE.Vector3().crossVectors(dir, side).normalize();
    for (let k = i === 0 ? 0 : 1; k <= ringsPer; k++) {
      const f = k / ringsPer;
      const c = new THREE.Vector3().lerpVectors(a, b, f);
      const r = radii[i] + (radii[i + 1] - radii[i]) * f;
      const t = (acc + len * f) / total;
      for (let j = 0; j <= seg; j++) {
        const an = (j / seg) * Math.PI * 2;
        const p = c.clone().addScaledVector(side, Math.cos(an) * r).addScaledVector(side2, Math.sin(an) * r);
        pos.push(p.x, p.y, p.z);
        uv.push(j / seg, t * 3);
        ts.push(t);
      }
      ring++;
    }
    acc += len;
  }
  for (let r = 0; r < ring - 1; r++) {
    for (let j = 0; j < seg; j++) {
      const a = r * (seg + 1) + j;
      const b = a + 1;
      const c = a + seg + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.t = ts;
  return g;
}

/** Weights along a limb: t (0-1) from the root bone to the end bone, with a blend at the joint (tj). */
const limbW = (geo, a, b, tj, blend = 0.18, root = null, rootT = 0) => {
  const ts = geo.userData.t;
  let i = 0;
  // tube() vertices are in t order, toNonIndexed reorders: carry t through the index instead
  const idx = geo.index ? geo.index.array : null;
  const tv = idx ? Array.from(idx, (k) => ts[k]) : ts;
  return () => {
    const t = tv[i++] ?? 1;
    const k = Math.max(0, Math.min(1, (t - (tj - blend / 2)) / blend));
    const out = [[a, 1 - k], [b, k]];
    if (root !== null && t < rootT) {
      const rk = 1 - t / rootT;
      out[0][1] *= 1 - rk * 0.5;
      out.push([root, rk * 0.5]);
    }
    return out;
  };
};

// ---------------------------------------------------------------- textures

let knitTex = null;
function knitTexture() {
  if (knitTex) return knitTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#404040';
  g.fillRect(0, 0, 64, 64);
  // columns of V stitches
  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      for (const s of [-1, 1]) {
        const gr = g.createLinearGradient(x + 4, y, x + 4 + s * 4, y + 8);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(1, '#7a7a7a');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(x + 4 + s * 1.9, y + 4, 1.8, 4.2, s * 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  knitTex = new THREE.CanvasTexture(c);
  knitTex.wrapS = knitTex.wrapT = THREE.RepeatWrapping;
  knitTex.repeat.set(6, 6);
  return knitTex;
}

export const FACES = { open: 0, blink: 1, happy: 2, oops: 3 };
let faceCanvas = null;
function faceAtlas() {
  if (faceCanvas) return faceCanvas;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  const ink = '#2a2230';
  for (let f = 0; f < 4; f++) {
    const ox = f * 128;
    // cheeks
    for (const s of [-1, 1]) {
      const gr = g.createRadialGradient(ox + 64 + s * 33, 80, 0, ox + 64 + s * 33, 80, 13);
      gr.addColorStop(0, 'rgba(236,120,132,0.55)');
      gr.addColorStop(1, 'rgba(236,120,132,0)');
      g.fillStyle = gr;
      g.fillRect(ox + 64 + s * 33 - 14, 66, 28, 28);
    }
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      const ex = ox + 64 + s * 19;
      const ey = 62;
      if (f === 0) {
        g.beginPath();
        g.ellipse(ex, ey, 7, 9.5, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(ex + 2.4, ey - 3.6, 2.8, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(ex - 2.2, ey + 3.4, 1.2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = ink;
      } else if (f === 1) {
        g.lineWidth = 3.4;
        g.beginPath();
        g.arc(ex, ey - 2, 7, 0.25 * Math.PI, 0.75 * Math.PI);
        g.stroke();
      } else if (f === 2) {
        g.lineWidth = 3.6;
        g.beginPath();
        g.arc(ex, ey + 5, 7.5, 1.15 * Math.PI, 1.85 * Math.PI);
        g.stroke();
      } else {
        g.lineWidth = 3.2;
        g.beginPath();
        g.moveTo(ex - 6, ey - 5);
        g.lineTo(ex + 6 * 0.2, ey);
        g.lineTo(ex - 6, ey + 5);
        if (s > 0) {
          g.moveTo(ex + 6, ey - 5);
          g.lineTo(ex - 6 * 0.2, ey);
          g.lineTo(ex + 6, ey + 5);
        }
        g.stroke();
        if (s < 0) {
          // mirror for the left eye: "><"
          g.clearRect(ex - 9, ey - 8, 18, 16);
          g.beginPath();
          g.moveTo(ex + 6, ey - 5);
          g.lineTo(ex - 1.2, ey);
          g.lineTo(ex + 6, ey + 5);
          g.stroke();
        }
      }
    }
    // mouth
    g.lineWidth = 3;
    g.strokeStyle = '#5a2630';
    g.beginPath();
    if (f === 2) {
      g.fillStyle = '#7a2f3a';
      g.moveTo(ox + 55, 82);
      g.quadraticCurveTo(ox + 64, 97, ox + 73, 82);
      g.closePath();
      g.fill();
    } else if (f === 3) {
      g.fillStyle = '#7a2f3a';
      g.ellipse(ox + 64, 87, 4.5, 5.5, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      g.arc(ox + 64, 80, 6, 0.2 * Math.PI, 0.8 * Math.PI);
      g.stroke();
    }
  }
  faceCanvas = c;
  return c;
}

// ---------------------------------------------------------------- hats and hair

/** Hat pieces: [geo, colour, matrix, bone, cloth]. Positions are rower space; the tip bone sits where `tip` says. */
function hatParts(hat, hc) {
  const H = HEAD_C;
  const out = [];
  let tip = new THREE.Vector3(0, H.y + 0.3, -0.04);
  const add = (geo, color, m, bone = B.head, cloth = false) => out.push([geo, color, m, bone, cloth]);
  switch (hat) {
    case 'nightcap': {
      add(G.torus(HEAD_R * 0.97, 0.045, 28, 8), '#f4ebd0', M(0, H.y + 0.1, H.z - 0.01, Math.PI / 2 - 0.25, 0, 0), B.head, true);
      const a = new THREE.Vector3(0, H.y + 0.12, H.z - 0.03);
      const d1 = new THREE.Vector3(0, Math.cos(0.4), -Math.sin(0.4));
      const lower = G.cyl(0.12, 0.235, 0.26, 18);
      add(lower, hc, M(a.x + d1.x * 0.13, a.y + d1.y * 0.13, a.z + d1.z * 0.13, -0.4, 0, 0), B.head, true);
      tip = a.clone().addScaledVector(d1, 0.26);
      const d2 = new THREE.Vector3(0.18, Math.cos(1.1), -Math.sin(1.1)).normalize();
      const upper = G.cyl(0.02, 0.125, 0.32, 14);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d2);
      const mid = tip.clone().addScaledVector(d2, 0.15);
      add(upper, hc, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)), B.hatTip, true);
      const pom = tip.clone().addScaledVector(d2, 0.32);
      add(G.sphere(0.07, 12, 10), '#f4ebd0', M(pom.x, pom.y, pom.z), B.hatTip, true);
      break;
    }
    case 'beanie': {
      const dome = new THREE.SphereGeometry(HEAD_R * 1.08, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.56);
      add(dome, hc, M(0, H.y + 0.02, H.z - 0.01, -0.12, 0, 0, 1, 0.98, 1), B.head, true);
      add(G.cyl(HEAD_R * 1.1, HEAD_R * 1.12, 0.08, 24, true), '#f4ebd0', M(0, H.y + 0.03, H.z - 0.01, -0.12, 0, 0), B.head, true);
      tip = new THREE.Vector3(0, H.y + 0.26, H.z - 0.06);
      add(G.sphere(0.085, 14, 10), '#f4ebd0', M(tip.x, tip.y + 0.06, tip.z), B.hatTip, true);
      break;
    }
    case 'beret':
      add(G.sphere(0.3, 20, 12), hc, M(0.04, H.y + 0.17, H.z - 0.02, 0, 0, 0.28, 1, 0.3, 1), B.head, true);
      add(G.cyl(0.015, 0.02, 0.06, 6), hc, M(0.09, H.y + 0.25, H.z - 0.02, 0, 0, 0.28), B.head, true);
      break;
    case 'flatcap':
      add(G.sphere(HEAD_R * 1.07, 20, 12), hc, M(0, H.y + 0.1, H.z - 0.01, -0.1, 0, 0, 1, 0.5, 1.05), B.head, true);
      add(G.sphere(0.19, 16, 8), hc, M(0, H.y + 0.08, H.z + 0.2, 0.3, 0, 0, 1, 0.12, 0.7), B.head, true);
      break;
    case 'bowler':
      add(G.half(0.21, 18, 10), hc, M(0, H.y + 0.13, H.z, 0, 0, 0, 1, 1.15, 1));
      add(G.cyl(0.33, 0.33, 0.022, 26), hc, M(0, H.y + 0.13, H.z, -0.08, 0, 0));
      add(G.cyl(0.214, 0.214, 0.05, 22), '#E5533D', M(0, H.y + 0.16, H.z));
      break;
    case 'souwester':
      add(new THREE.SphereGeometry(HEAD_R * 1.08, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hc, M(0, H.y + 0.03, H.z - 0.01, -0.08, 0, 0));
      add(G.lathe([[HEAD_R * 1.04, 0.02], [0.4, -0.06], [0.42, -0.075], [HEAD_R * 1.02, -0.01]], 28), hc, M(0, H.y + 0.04, H.z - 0.03, -0.22, 0, 0));
      break;
    case 'boater':
      add(G.cyl(0.22, 0.225, 0.11, 24), '#e9cf8a', M(0, H.y + 0.19, H.z));
      add(G.cyl(0.38, 0.38, 0.018, 30), '#e2c47c', M(0, H.y + 0.135, H.z, 0.06, 0, 0));
      add(G.cyl(0.228, 0.228, 0.045, 24, true), hc, M(0, H.y + 0.165, H.z));
      break;
    case 'captain':
      add(G.cyl(0.29, 0.23, 0.12, 24), '#f4f1ea', M(0, H.y + 0.22, H.z - 0.02, -0.1, 0, 0));
      add(G.cyl(0.235, 0.235, 0.06, 24), '#1d2340', M(0, H.y + 0.15, H.z - 0.01, -0.1, 0, 0));
      add(G.sphere(0.2, 16, 8), '#151826', M(0, H.y + 0.11, H.z + 0.2, 0.35, 0, 0, 1, 0.1, 0.65));
      add(G.sphere(0.035, 10, 8), '#e2bd52', M(0, H.y + 0.17, H.z + 0.235));
      break;
    case 'crown': {
      add(G.torus(0.2, 0.03, 24, 8), '#5f9a6a', M(0, H.y + 0.17, H.z, Math.PI / 2 - 0.15, 0, 0));
      const petals = ['#f4ebd0', '#F2A7B6', '#B7A5E8'];
      for (let k = 0; k < 7; k++) {
        const an = (k / 7) * Math.PI * 2;
        const cx = Math.cos(an) * 0.2;
        const cz = H.z + Math.sin(an) * 0.2;
        const cy = H.y + 0.17 + Math.sin(an) * 0.03;
        for (let p = 0; p < 5; p++) {
          const pa = (p / 5) * Math.PI * 2;
          add(G.sphere(0.035, 8, 6), petals[k % 3], M(cx + Math.cos(pa) * 0.04, cy + 0.03, cz + Math.sin(pa) * 0.04, 0, 0, 0, 1, 0.5, 1));
        }
        add(G.sphere(0.022, 8, 6), '#FFB547', M(cx, cy + 0.045, cz));
      }
      break;
    }
    case 'tophat':
      add(G.cyl(0.17, 0.16, 0.36, 22), '#2b2a30', M(0, H.y + 0.33, H.z - 0.01, -0.06, 0, 0));
      add(G.cyl(0.3, 0.3, 0.022, 28), '#2b2a30', M(0, H.y + 0.15, H.z, -0.06, 0, 0));
      add(G.cyl(0.172, 0.172, 0.07, 22, true), hc, M(0, H.y + 0.2, H.z - 0.005, -0.06, 0, 0));
      break;
    default:
      break;
  }
  return { parts: out, tip };
}

function hairParts(style, hair) {
  const H = HEAD_C;
  const out = [];
  const add = (geo, m) => out.push([geo, hair, m]);
  // the cap of hair over the top and back of the head
  add(new THREE.SphereGeometry(HEAD_R * 1.045, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), M(0, H.y + 0.005, H.z - 0.01, -0.62, 0, 0, 1, 0.97, 1));
  // a fringe
  for (let k = -2; k <= 2; k++) add(G.sphere(0.06, 10, 8), M(k * 0.058, H.y + 0.17 - Math.abs(k) * 0.02, H.z + 0.165 - Math.abs(k) * 0.025, 0.5, 0, 0, 1, 0.7, 0.55));
  switch (style) {
    case 'bob':
      for (const s of [-1, 1]) add(G.capsule(0.08, 0.16, 10), M(s * 0.2, H.y - 0.06, H.z - 0.02, 0, 0, s * 0.12));
      add(G.sphere(HEAD_R * 1.06, 20, 12), M(0, H.y - 0.03, H.z - 0.06, 0, 0, 0, 1, 0.9, 0.9));
      break;
    case 'buns':
      for (const s of [-1, 1]) add(G.sphere(0.1, 14, 10), M(s * 0.17, H.y + 0.2, H.z - 0.06));
      break;
    case 'curly':
      for (let k = 0; k < 14; k++) {
        const an = (k / 14) * Math.PI * 2;
        add(G.sphere(0.075, 10, 8), M(Math.cos(an) * 0.2, H.y + 0.12 + Math.sin(k * 1.7) * 0.03, H.z - 0.03 + Math.sin(an) * 0.2 - 0.02));
      }
      add(G.sphere(0.09, 10, 8), M(0, H.y + 0.24, H.z - 0.02));
      break;
    case 'braids':
      for (const s of [-1, 1]) {
        for (let k = 0; k < 4; k++) add(G.sphere(0.055 - k * 0.006, 10, 8), M(s * 0.17, H.y - 0.07 - k * 0.075, H.z - 0.12 - k * 0.01));
      }
      break;
    default:
      break;
  }
  return out;
}

// ---------------------------------------------------------------- the rower

const torsoW = (p) => {
  const y = p.y;
  if (y < 0.06) return [[B.hips, 1]];
  if (y < 0.18) {
    const k = (y - 0.06) / 0.12;
    return [[B.hips, 1 - k], [B.spine, k]];
  }
  if (y < 0.32) {
    const k = (y - 0.18) / 0.14;
    return [[B.spine, 1 - k], [B.chest, k]];
  }
  if (y < 0.42) return [[B.chest, 1]];
  const k = Math.min(1, (y - 0.42) / 0.08);
  return [[B.chest, 1 - k * 0.6], [B.neck, k * 0.6]];
};

/**
 * Build a rower. look: { shirt, skin, pants, hat, hatColor, hair, hairColor }. Returns the root object (place it at
 * the seat) and an animator.
 */
export function createRower(look, { shadows = true } = {}) {
  const root = new THREE.Group();
  root.name = 'rower';
  // bones
  const bones = BIND.map(() => new THREE.Bone());
  bones.forEach((b, i) => {
    const p = PARENT[i];
    const w = BIND[i];
    if (p < 0) {
      b.position.set(...w);
      root.add(b);
    } else {
      const pw = BIND[p];
      b.position.set(w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]);
      bones[p].add(b);
    }
  });
  // every bone rests unrotated, so each one's inverse bind is just a move back from where it sits
  const skeleton = new THREE.Skeleton(bones, BIND.map(([x, y, z]) => new THREE.Matrix4().makeTranslation(-x, -y, -z)));
  const clothMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.92, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color('#9a9ab8'), bumpMap: knitTexture(), bumpScale: 1.2 });
  const otherMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
  const meshes = [];
  let hatTipRest = new THREE.Vector3();

  function build(lk) {
    for (const m of meshes) {
      root.remove(m);
      m.geometry.dispose();
    }
    meshes.length = 0;
    const b = builder();
    const shirt = lk.shirt;
    const trim = lk.hatColor ?? '#f4ebd0';
    const dark = new THREE.Color(shirt).multiplyScalar(0.72).getStyle();
    // the jumper: a soft lathe, a knitted band across the chest, a ribbed hem
    const prof = [];
    const knots = [[0.0, -0.07], [0.17, -0.065], [0.205, 0.0], [0.222, 0.1], [0.218, 0.2], [0.2, 0.3], [0.165, 0.37], [0.11, 0.42], [0.06, 0.45], [0.0, 0.46]];
    const curve = new THREE.SplineCurve(knots.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const p of curve.getPoints(22)) prof.push([Math.max(0, p.x), p.y]);
    prof[0][0] = 0;
    prof[prof.length - 1][0] = 0;
    const torso = G.lathe(prof, 22);
    b.add(torso, (p) => (p.y > 0.2 && p.y < 0.26 ? trim : p.y > 0.185 && p.y < 0.275 ? (Math.floor((Math.atan2(p.z, p.x) + 4) * 5) % 2 ? trim : shirt) : p.y < -0.03 ? dark : shirt), M(0, 0, 0.0, 0, 0, 0, 1, 1, 0.84), torsoW, true);
    b.add(G.torus(0.095, 0.04, 18, 8), dark, M(0, 0.45, 0.005, Math.PI / 2, 0, 0), (p) => [[B.chest, 0.4], [B.neck, 0.6]], true);
    // arms (with a shoulder cap) and mittens
    for (const [s, ua, fa, hd] of [[-1, B.upperArmL, B.foreArmL, B.handL], [1, B.upperArmR, B.foreArmR, B.handR]]) {
      const sh = BIND[ua];
      const el = BIND[fa];
      const wr = BIND[hd];
      const arm = tube([sh, el, wr], [0.07, 0.058, 0.05], 12, 6);
      b.add(arm, shirt, null, limbW(arm, ua, fa, 0.5, 0.22, B.chest, 0.12), true);
      b.add(G.sphere(0.074, 14, 10), shirt, M(sh[0], sh[1] + 0.005, sh[2]), (p) => [[ua, 0.65], [B.chest, 0.35]], true);
      b.add(G.torus(0.05, 0.02, 14, 6), dark, M(wr[0], wr[1] + 0.03, wr[2] - 0.004, Math.PI / 2 - 0.2, 0, s * 0.12), fa, true);
      b.add(G.sphere(0.068, 14, 10), trim, M(wr[0], wr[1] - 0.04, wr[2] + 0.005, 0, 0, 0, 0.95, 1.12, 0.82), hd, true);
      b.add(G.sphere(0.03, 10, 8), trim, M(wr[0] - s * 0.05, wr[1] - 0.01, wr[2] + 0.03, 0, 0, s * 0.4, 1, 1.4, 1), hd, true);
    }
    // legs and boots
    for (const [th, sn, ft] of [[B.thighL, B.shinL, B.footL], [B.thighR, B.shinR, B.footR]]) {
      const leg = tube([BIND[th], BIND[sn], BIND[ft]], [0.095, 0.08, 0.066], 12, 5);
      b.add(leg, lk.pants, null, limbW(leg, th, sn, 0.5, 0.15));
      const f = BIND[ft];
      b.add(G.rbox(0.15, 0.11, 0.22, 0.05), '#3a2a2a', M(f[0], f[1] - 0.05, f[2] + 0.04), ft);
      b.add(G.cyl(0.074, 0.078, 0.07, 12), '#4a3434', M(f[0], f[1] + 0.01, f[2]), ft);
    }
    // the head: a round face, ears, a button nose, hair
    const H = HEAD_C;
    b.add(G.sphere(HEAD_R, 32, 24), lk.skin, M(H.x, H.y, H.z, 0, 0, 0, 1, 0.94, 0.97), B.head);
    for (const s of [-1, 1]) b.add(G.sphere(0.055, 10, 8), lk.skin, M(s * 0.245, H.y - 0.01, H.z - 0.01, 0, 0, 0, 0.55, 1, 0.9), B.head);
    b.add(G.sphere(0.03, 10, 8), new THREE.Color(lk.skin).multiplyScalar(0.9).getStyle(), M(0, H.y - 0.03, H.z + HEAD_R * 0.96, 0, 0, 0, 1.2, 0.9, 0.8), B.head);
    const hat = lk.hat ?? 'nightcap';
    const covered = ['beanie', 'souwester', 'flatcap'].includes(hat);
    for (const [geo, c, m] of hairParts(covered ? 'short' : lk.hair ?? 'short', lk.hairColor ?? '#3a2a22')) b.add(geo, c, m, B.head);
    // the hat (the tip on its spring) or the long scarf
    const { parts, tip } = hatParts(hat, lk.hatColor ?? '#c95f56');
    hatTipRest = tip;
    bones[B.hatTip].position.copy(tip).sub(new THREE.Vector3(...BIND[B.head]));
    skeleton.boneInverses[B.hatTip].makeTranslation(-tip.x, -tip.y, -tip.z);
    for (const [geo, c, m, bone, cloth] of parts) b.add(geo, c, m, bone, cloth);
    if (hat === 'scarf') {
      const sc = lk.hatColor ?? '#c95f56';
      b.add(G.torus(0.12, 0.055, 20, 10), sc, M(0, 0.47, 0.01, Math.PI / 2 - 0.1, 0, 0), (p) => [[B.neck, 0.7], [B.chest, 0.3]], true);
      const tail = tube([BIND[B.scarfA], BIND[B.scarfB], [0.08, 0.12, 0.2]], [0.05, 0.045, 0.04], 8, 4);
      b.add(tail, (p) => (Math.floor((p.y + 1) * 22) % 2 ? sc : '#f4ebd0'), null, limbW(tail, B.scarfA, B.scarfB, 0.45, 0.3), true);
    }
    const g = b.build();
    for (const [k, mat] of [['cloth', clothMat], ['other', otherMat]]) {
      if (!g[k]) continue;
      const mesh = new THREE.SkinnedMesh(g[k], mat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      root.add(mesh);
      mesh.bind(skeleton, root.matrixWorld.clone().identity());
      meshes.push(mesh);
    }
  }

  // the face: a patch over the front of the head with its own picture (one of four expressions)
  const faceTex = new THREE.CanvasTexture(faceAtlas());
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.repeat.set(0.25, 1);
  faceTex.anisotropy = 4;
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const facePatch = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.008, 20, 16, Math.PI / 2 - 0.85, 1.7, Math.PI / 2 - 0.5, 1.24), faceMat);
  facePatch.scale.set(1, 0.94, 0.97);
  facePatch.position.set(HEAD_C.x, HEAD_C.y - BIND[B.head][1], HEAD_C.z);
  facePatch.renderOrder = 2;
  bones[B.head].add(facePatch);

  build(look);
  root.updateMatrixWorld(true);

  // ---------------------------------------------------------------- animation

  const S = {
    clock: Math.random() * 10,
    blinkAt: 1 + Math.random() * 3,
    expr: 'open',
    exprUntil: 0,
    w: { row: 1, cheer: 0, wave: 0, slump: 0 },
    want: 'row',
    lean: 0.3,
    twist: 0,
    look: 0,
    nod: 0,
    tip: { a: 0, v: 0, b: 0, vb: 0 },
    scarf: { a: 0, v: 0 },
    bounce: 0,
  };
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const tmpD = new THREE.Vector3();
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const inv = new THREE.Matrix4();
  const bindDir = {};
  for (const [ua, fa, hd] of [[B.upperArmL, B.foreArmL, B.handL], [B.upperArmR, B.foreArmR, B.handR]]) {
    bindDir[ua] = bones[fa].position.clone().normalize();
    bindDir[fa] = bones[hd].position.clone().normalize();
  }
  const lenUp = bones[B.foreArmL].position.length();
  const lenFore = bones[B.handL].position.length() + 0.03;

  /** Two-bone IK: put the hand of arm (ua, fa) at target t (rower space), elbow toward pole. */
  function reach(ua, fa, target, pole) {
    const chest = bones[B.chest];
    chest.updateWorldMatrix(true, false);
    inv.copy(root.matrixWorld).invert().multiply(chest.matrixWorld).invert(); // rower space → chest space
    const T = tmpA.copy(target).applyMatrix4(inv);
    const P = tmpB.copy(pole).applyMatrix4(inv);
    const Sp = bones[ua].position;
    const dir = tmpC.subVectors(T, Sp);
    let c = dir.length();
    dir.normalize();
    c = Math.max(Math.abs(lenUp - lenFore) + 0.01, Math.min(lenUp + lenFore - 0.002, c));
    const bend = tmpD.subVectors(P, Sp);
    bend.addScaledVector(dir, -bend.dot(dir)).normalize();
    const cosA = Math.max(-1, Math.min(1, (lenUp * lenUp + c * c - lenFore * lenFore) / (2 * lenUp * c)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    const E = new THREE.Vector3().copy(Sp).addScaledVector(dir, lenUp * cosA).addScaledVector(bend, lenUp * sinA);
    const W = new THREE.Vector3().copy(Sp).addScaledVector(dir, c);
    const dUp = new THREE.Vector3().subVectors(E, Sp).normalize();
    qa.setFromUnitVectors(bindDir[ua], dUp);
    bones[ua].quaternion.copy(qa);
    const dFore = new THREE.Vector3().subVectors(W, E).normalize().applyQuaternion(qb.copy(qa).invert());
    bones[fa].quaternion.setFromUnitVectors(bindDir[fa], dFore);
  }

  const handT = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  const poseT = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  const poleL = new THREE.Vector3();
  const poleR = new THREE.Vector3();

  const api = {
    root,
    bones,
    B,
    get hatTip() {
      return hatTipRest;
    },
    setLook(lk) {
      build(lk);
      root.updateMatrixWorld(true);
    },
    /** An expression for a moment: open, happy, oops. */
    face(expr, secs = 1) {
      S.expr = expr;
      S.exprUntil = S.clock + secs;
    },
    /** The pose to blend toward: row, cheer, wave, slump. */
    pose(name) {
      S.want = name;
    },
    /**
     * Per frame. o: { dt, lean (rowing lean, rad), twist, look (-1..1 over the shoulder), hands: { L, R } (rower-space
     * oar handles), surge, now }.
     */
    update(o) {
      const dt = Math.min(0.05, o.dt ?? 0.016);
      S.clock += dt;
      const now = S.clock;
      // pose weights
      for (const k of Object.keys(S.w)) S.w[k] += ((k === S.want ? 1 : 0) - S.w[k]) * Math.min(1, dt * 6);
      const w = S.w;
      // poses' hands and lean
      const cheerY = 1.06 + Math.abs(Math.sin(now * 7)) * 0.08;
      const waveX = 0.36 + Math.sin(now * 9) * 0.09;
      poseT.L.set(0, 0, 0).addScaledVector(o.hands.L, w.row).addScaledVector(tmpA.set(-0.3, cheerY, 0.12), w.cheer).addScaledVector(o.hands.L, w.wave).addScaledVector(tmpA.set(-0.12, 0.1, 0.3), w.slump);
      poseT.R.set(0, 0, 0).addScaledVector(o.hands.R, w.row).addScaledVector(tmpA.set(0.3, cheerY, 0.12), w.cheer).addScaledVector(tmpA.set(waveX, 0.95, 0.18), w.wave).addScaledVector(tmpA.set(0.12, 0.1, 0.3), w.slump);
      handT.L.copy(poseT.L);
      handT.R.copy(poseT.R);
      const lean = (o.lean ?? 0.3) * w.row + -0.12 * w.cheer + 0.05 * w.wave + 0.55 * w.slump + Math.sin(now * 1.6) * 0.02;
      S.lean += (lean - S.lean) * Math.min(1, dt * 20);
      S.twist += ((o.twist ?? 0) * w.row - S.twist) * Math.min(1, dt * 10);
      S.look += ((o.look ?? 0) - S.look) * Math.min(1, dt * 3);
      const bounce = w.cheer * Math.abs(Math.sin(now * 7)) * 0.05;
      bones[B.hips].position.y = BIND[B.hips][1] + bounce;
      bones[B.spine].rotation.set(S.lean * 0.45, S.twist * 0.5, 0);
      bones[B.chest].rotation.set(S.lean * 0.55, S.twist * 0.5, 0);
      // the head stays fairly level, looks over a shoulder at bends, droops when slumped, nods with the stroke
      const nod = -S.lean * 0.6 + w.slump * 0.5 + w.cheer * -0.15 + Math.sin(now * 2.1) * 0.03;
      bones[B.neck].rotation.set(nod * 0.4, S.look * 0.5, 0);
      bones[B.head].rotation.set(nod * 0.6, S.look * 0.7, Math.sin(now * 1.3) * 0.04 + w.wave * Math.sin(now * 4.5) * 0.12);
      root.updateMatrixWorld(true);
      // arms
      poleL.set(-0.6, 0.1, -0.3);
      poleR.set(0.6, 0.1, -0.3);
      reach(B.upperArmL, B.foreArmL, handT.L, poleL);
      reach(B.upperArmR, B.foreArmR, handT.R, poleR);
      // springs: the hat's tip and the scarf swing with the lean and the surge
      const tp = S.tip;
      const drive = -S.lean * 1.2 + (o.surge ?? 0) * 0.6 + Math.sin(now * 2.7) * 0.08;
      tp.v += ((drive - tp.a) * 60 - tp.v * 7) * dt;
      tp.a += tp.v * dt;
      tp.vb += ((S.twist * 2 + Math.sin(now * 1.9) * 0.1 - tp.b) * 50 - tp.vb * 6) * dt;
      tp.b += tp.vb * dt;
      bones[B.hatTip].rotation.set(tp.a * 0.5, 0, tp.b * 0.5);
      const sc = S.scarf;
      sc.v += (((o.speed ?? 0) * -0.12 - S.lean * 0.8 - sc.a) * 40 - sc.v * 5) * dt;
      sc.a += sc.v * dt;
      bones[B.scarfA].rotation.set(sc.a + Math.sin(now * 8) * 0.06 * Math.min(1, (o.speed ?? 0) / 4), 0, Math.sin(now * 5.3) * 0.08);
      bones[B.scarfB].rotation.set(sc.a * 0.6 + Math.sin(now * 8 + 1) * 0.1 * Math.min(1, (o.speed ?? 0) / 4), 0, 0);
      // the face
      let frame = FACES.open;
      if (S.clock < S.exprUntil) frame = FACES[S.expr] ?? 0;
      else if (w.cheer > 0.5) frame = FACES.happy;
      else if (w.slump > 0.5) frame = FACES.blink;
      if (S.clock > S.blinkAt) {
        if (frame === FACES.open) frame = FACES.blink;
        if (S.clock > S.blinkAt + 0.12) S.blinkAt = S.clock + 1.5 + Math.random() * 3.5;
      }
      faceTex.offset.x = frame * 0.25;
    },
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      clothMat.dispose();
      otherMat.dispose();
      faceMat.dispose();
      faceTex.dispose();
      facePatch.geometry.dispose();
    },
  };
  return api;
}
