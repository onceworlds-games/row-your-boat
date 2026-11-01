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
// ---------------------------------------------------------------- finishes

/**
 * What a surface is made of: each finish is one material with its own small detail drawn in world space (grain in
 * wood, a weave in cloth, fibres in paper, brushing in metal, a glossy coat on glaze).
 */
const DETAIL = /* glsl */ `
float kh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float kn(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(kh(i), kh(i + vec3(1, 0, 0)), f.x), mix(kh(i + vec3(0, 1, 0)), kh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(kh(i + vec3(0, 0, 1)), kh(i + vec3(1, 0, 1)), f.x), mix(kh(i + vec3(0, 1, 1)), kh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;
const FINISH = {
  matte: { rough: 0.85 },
  wood: { rough: 0.55, detail: `
    vec3 an = abs(vKN);
    float along = an.y > 0.6 ? vKP.x * 0.7 + vKP.z * 0.7 : vKP.y;
    float warp = kn(vKP * 0.35) * 2.6 + kn(vKP * 1.7) * 0.4;
    float grain = 0.5 + 0.5 * sin((along * 2.4 + warp) * 6.2831);
    float k = 0.84 + 0.16 * smoothstep(0.2, 0.95, grain) - 0.08 * kn(vKP * vec3(4.0, 0.4, 4.0));
    diffuseColor.rgb *= k;` },
  glaze: { physical: { clearcoat: 1, clearcoatRoughness: 0.06 }, rough: 0.28, detail: `
    diffuseColor.rgb *= 0.97 + 0.03 * kn(vKP * 2.0);` },
  metal: { rough: 0.32, metal: 0.85, detail: `
    diffuseColor.rgb *= 0.9 + 0.1 * kn(vKP * vec3(9.0, 0.6, 9.0));` },
  fabric: { physical: { sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ffffff') }, rough: 0.92, detail: `
    vec3 an = abs(vKN);
    vec2 uvw = an.y > 0.6 ? vKP.xz : an.x > an.z ? vKP.zy : vKP.xy;
    float weave = sin(uvw.x * 26.0) * sin(uvw.y * 26.0);
    diffuseColor.rgb *= 0.9 + 0.07 * weave + 0.06 * kn(vKP * 0.8);` },
  paper: { rough: 0.9, detail: `
    diffuseColor.rgb *= 0.92 + 0.08 * kn(vKP * vec3(14.0, 3.0, 14.0));` },
};
const finishes = new Map();
/** The shared material of a finish. */
export function finishMaterial(name) {
  if (finishes.has(name)) return finishes.get(name);
  const f = FINISH[name] ?? FINISH.matte;
  const opts = { vertexColors: true, roughness: f.rough ?? 0.85, metalness: f.metal ?? 0, ...(f.physical ?? {}) };
  const mat = f.physical ? new THREE.MeshPhysicalMaterial(opts) : new THREE.MeshStandardMaterial(opts);
  if (f.detail) {
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vKP;\nvarying vec3 vKN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvKP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvKN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vKP;\nvarying vec3 vKN;\n' + DETAIL)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + f.detail);
    };
    mat.customProgramCacheKey = () => `finish-${name}`;
  }
  mat.userData.shared = true;
  finishes.set(name, mat);
  return mat;
}

// colours that are always brass, silver or wood in the dreams (so old pieces get a finish without a tag)
const METALS = new Set(['#c9a24e', '#e2bd52', '#b08a3e', '#d8b866', '#d9dbe4', '#e4e6ee', '#9a9aa8', '#8a8a96']);
const WOODS = new Set(['#5a3d2e', '#6b4a38', '#4a3226', '#7d5a44', '#3c2a22', '#4a3428', '#5a4a30', '#6b4a32', '#5a2e1e', '#3a2a22', '#4d3e28']);

/**
 * A kit: pieces added with a colour (and a placement), merged per finish on build. auto: pick a finish from the colour
 * when a piece has none (brass, silver, wood); otherwise everything is one matte mesh.
 */
export function createKit({ roughness = 0.85, metalness = 0, shadows = true, auto = false } = {}) {
  const buckets = new Map();
  const glow = [];
  let def = null;
  const kit = {
    add(geo, color, p = {}, o = {}) {
      const g = prep(geo, color, o.bright ?? 1);
      const m = p.isMatrix4 ? p : matrixOf(p);
      if (o.parent) m.premultiply(o.parent);
      g.applyMatrix4(m);
      if (o.glow) {
        glow.push(g);
        return kit;
      }
      let fin = o.mat ?? def ?? null;
      if (!fin && auto && typeof color === 'string') {
        const c = color.toLowerCase();
        fin = METALS.has(c) ? 'metal' : WOODS.has(c) ? 'wood' : null;
      }
      fin = fin ?? 'solid';
      if (!buckets.has(fin)) buckets.set(fin, []);
      buckets.get(fin).push(g);
      return kit;
    },
    /** The finish for pieces added from now on (null: by colour). */
    set finish(v) {
      def = v;
    },
    /** Add everything inside fn with this finish (unless a piece says otherwise). */
    as(finish, fn) {
      const keep = def;
      def = finish;
      try {
        fn();
      } finally {
        def = keep;
      }
      return kit;
    },
    get count() {
      let n = glow.length;
      for (const b of buckets.values()) n += b.length;
      return n;
    },
    build(name = 'kit') {
      const group = new THREE.Group();
      group.name = name;
      for (const [fin, list] of buckets) {
        if (!list.length) continue;
        const geo = mergeGeometries(list, false);
        list.forEach((g) => g.dispose());
        const mat = fin === 'solid' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness }) : finishMaterial(fin);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = shadows;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.name = `${name}-${fin}`;
        group.add(mesh);
        if (fin === 'solid' || !group.userData.solid) group.userData.solid = mesh;
      }
      if (glow.length) {
        const geo = mergeGeometries(glow, false);
        glow.forEach((g) => g.dispose());
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
        group.userData.glow = mesh;
      }
      buckets.clear();
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
