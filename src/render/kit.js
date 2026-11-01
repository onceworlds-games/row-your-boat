// Building static scenery from primitives: each piece is coloured per vertex and merged with the rest into one mesh (one
// draw call for everything solid, one for everything that glows).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const col = new THREE.Color();

/** Primitive geometries (unit-ish, centred). */
export const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  rbox: (w, h, d, r = 0.1, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)),
  cyl: (rt, rb, h, seg = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
  sphere: (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h),
  half: (r, w = 14, h = 6) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2),
  cone: (r, h, seg = 14) => new THREE.ConeGeometry(r, h, seg),
  torus: (R, r, seg = 24, tube = 8, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, tube, seg, arc),
  capsule: (r, len, seg = 8) => new THREE.CapsuleGeometry(r, len, 4, seg),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  lathe: (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg),
  ring: (r0, r1, seg = 32) => new THREE.RingGeometry(r0, r1, seg),
  disc: (r, seg = 32) => new THREE.CircleGeometry(r, seg),
  /** A cog: a disc with teeth, lying flat (axis y). */
  cog(R, h, teeth = 12, depth = 0.25) {
    const shape = new THREE.Shape();
    const n = teeth * 4;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = i % 4 < 2 ? R : R - depth;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    const hole = new THREE.Path();
    hole.absarc(0, 0, R * 0.25, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 4 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -h / 2, 0);
    return g;
  },
  /** A five-pointed star prism (axis z). */
  star(R, h, inner = 0.45) {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 === 0 ? R : R * inner;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: h * 0.2, bevelSize: R * 0.05, bevelSegments: 1 });
    g.translate(0, 0, -h / 2);
    return g;
  },
  /** A flat shape from 2D points, extruded (axis z). */
  slab(pts, h) {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    g.translate(0, 0, -h / 2);
    return g;
  },
};

/** Keep only position and normal, unindexed, with a colour attribute. */
function prep(geo, color, scale = 1) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  col.set(color);
  if (scale !== 1) col.multiplyScalar(scale);
  for (let i = 0; i < n; i++) {
    c[i * 3] = col.r;
    c[i * 3 + 1] = col.g;
    c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.morphAttributes = {};
  return g;
}

/** A placement: { x, y, z, rx, ry, rz, s | sx, sy, sz }. */
export function matrixOf(p = {}) {
  tmpE.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0, p.order ?? 'YXZ');
  tmpQ.setFromEuler(tmpE);
  tmpV.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
  const s = p.s ?? 1;
  tmpS.set(p.sx ?? s, p.sy ?? s, p.sz ?? s);
  return tmpM.compose(tmpV, tmpQ, tmpS).clone();
}

/**
 * A collector of coloured pieces. add(geo, color, placement, { glow, bright }) and, at the end, build() → a Group with
 * (up to) two meshes. `under` nests a placement inside a parent frame (a matrix).
 */
export function createKit({ roughness = 0.85, metalness = 0, shadows = true } = {}) {
  const solid = [];
  const glow = [];
  const kit = {
    add(geo, color, p = {}, o = {}) {
      const g = prep(geo, color, o.bright ?? 1);
      const m = p.isMatrix4 ? p : matrixOf(p);
      if (o.parent) m.premultiply(o.parent);
      g.applyMatrix4(m);
      (o.glow ? glow : solid).push(g);
      return kit;
    },
    get count() {
      return solid.length + glow.length;
    },
    build(name = 'kit') {
      const group = new THREE.Group();
      group.name = name;
      if (solid.length) {
        const geo = mergeGeometries(solid, false);
        solid.forEach((g) => g.dispose());
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness }));
        mesh.castShadow = shadows;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
        group.userData.solid = mesh;
      }
      if (glow.length) {
        const geo = mergeGeometries(glow, false);
        glow.forEach((g) => g.dispose());
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
        group.userData.glow = mesh;
      }
      solid.length = 0;
      glow.length = 0;
      return group;
    },
  };
  return kit;
}

/** A single mesh of one primitive with a plain material. */
export function part(geo, color, { rough = 0.8, metal = 0, emissive = null, ei = 1, cast = true, basic = false, transparent = false, opacity = 1 } = {}) {
  const mat = basic
    ? new THREE.MeshBasicMaterial({ color, transparent, opacity })
    : new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ?? 0x000000, emissiveIntensity: ei, transparent, opacity });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = !basic;
  return m;
}

/** Soft round glow sprite texture (canvas). */
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** Seeded pseudo random for scenery (same scene every load). */
export function srand(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
