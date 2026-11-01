// Particles: spray from the oars, sparkles on perfect strokes, smoke from snuffed lanterns, fireflies in the breaths,
// paper sky lanterns and star confetti at the finish. Two point pools (one draw each) and one instanced mesh.

import * as THREE from 'three';
import { G, glowTexture } from './kit.js';
import { NO_MIRROR } from './world.js';
import { LANTERN_COLORS } from '../cosmetics.js';

const VERT = /* glsl */ `
attribute float aSize; attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.5, -mv.z);
}`;
const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
  #include <colorspace_fragment>
}`;

function pool(scene, count, additive) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const color = new Float32Array(count * 4);
  const p = Array.from({ length: count }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, r: 1, g: 1, b: 1, a: 1, grav: 0, drag: 0, grow: 0 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 4).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uMap: { value: glowTexture() }, uScale: { value: 300 } },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  points.layers.set(NO_MIRROR);
  scene.add(points);
  let next = 0;
  const col = new THREE.Color();
  return {
    mat,
    emit(o) {
      const q = p[next];
      next = (next + 1) % count;
      col.set(o.color ?? '#ffffff');
      Object.assign(q, { alive: true, x: o.x, y: o.y, z: o.z, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, life: 0, max: o.life ?? 1, size: o.size ?? 0.3, r: col.r, g: col.g, b: col.b, a: o.a ?? 1, grav: o.grav ?? 0, drag: o.drag ?? 0, grow: o.grow ?? 0 });
    },
    update(dt) {
      for (let i = 0; i < count; i++) {
        const q = p[i];
        if (!q.alive) {
          size[i] = 0;
          color[i * 4 + 3] = 0;
          continue;
        }
        q.life += dt;
        if (q.life >= q.max) {
          q.alive = false;
          size[i] = 0;
          color[i * 4 + 3] = 0;
          continue;
        }
        q.vy -= q.grav * dt;
        const k = Math.exp(-q.drag * dt);
        q.vx *= k;
        q.vy *= k;
        q.vz *= k;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.z += q.vz * dt;
        if (q.grav > 0 && q.y < 0) {
          q.alive = false;
          size[i] = 0;
          color[i * 4 + 3] = 0;
          continue;
        }
        const f = q.life / q.max;
        pos[i * 3] = q.x;
        pos[i * 3 + 1] = q.y;
        pos[i * 3 + 2] = q.z;
        size[i] = q.size * (1 + q.grow * f);
        color[i * 4] = q.r;
        color[i * 4 + 1] = q.g;
        color[i * 4 + 2] = q.b;
        color[i * 4 + 3] = q.a * (f < 0.1 ? f / 0.1 : 1 - (f - 0.1) / 0.9);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
    },
  };
}

export function createFx(scene) {
  const spray = pool(scene, 600, false);
  const glow = pool(scene, 500, true);
  let reduced = false;
  let scale = 1;

  // sky lanterns that rise from the finish arch
  const SKY = 28;
  const skyMat = new THREE.MeshStandardMaterial({ color: '#ffe0b0', emissive: '#FFB547', emissiveIntensity: 2.4, roughness: 0.6 });
  const skyGeo = G.cyl(0.3, 0.22, 0.55, 10);
  const sky = new THREE.InstancedMesh(skyGeo, skyMat, SKY);
  sky.frustumCulled = false;
  sky.count = 0;
  scene.add(sky);
  const skyL = [];
  const tmp = new THREE.Object3D();

  const R = Math.random;
  return {
    setReduced(r) {
      reduced = r;
      scale = r ? 0.5 : 1;
    },
    setScale(px) {
      spray.mat.uniforms.uScale.value = 300 * px;
      glow.mat.uniforms.uScale.value = 300 * px;
    },
    /** An oar entering the water. kind: perfect, good, splash, both, free. (x, z): the blade; (fx, fz): the boat's forward. */
    oar(x, z, kind, fx, fz, mine = true) {
      if (!mine && R() < 0.5) return;
      if (kind === 'drop') {
        // a flick of the blade between the beats: a few bright beads and a glint
        for (let i = 0; i < 7 * scale; i++) spray.emit({ x: x + (R() - 0.5) * 0.3, y: 0.08, z: z + (R() - 0.5) * 0.3, vx: (R() - 0.5) * 1.2 - fx * 0.8, vy: 1.6 + R() * 1.4, vz: (R() - 0.5) * 1.2 - fz * 0.8, life: 0.55, size: 0.09 + R() * 0.07, color: '#f3f6ff', a: 0.9, grav: 9 });
        if (mine) for (let i = 0; i < 3 * scale; i++) glow.emit({ x, y: 0.3 + R() * 0.3, z, vx: (R() - 0.5) * 0.8, vy: 0.9 + R() * 0.6, vz: (R() - 0.5) * 0.8, life: 0.45, size: 0.28, color: '#cfe0ff', a: 1, drag: 2 });
        return;
      }
      if (kind === 'pull') kind = 'perfect';
      const n = Math.round((kind === 'splash' ? 26 : kind === 'perfect' ? 16 : 11) * scale);
      for (let i = 0; i < n; i++) {
        const up = kind === 'splash' ? 2.4 + R() * 2.6 : 1.4 + R() * 1.8;
        const out = kind === 'splash' ? 1.8 : 0.8;
        spray.emit({ x: x + (R() - 0.5) * 0.4, y: 0.05, z: z + (R() - 0.5) * 0.4, vx: (R() - 0.5) * out * 2 - fx * 1.2, vy: up, vz: (R() - 0.5) * out * 2 - fz * 1.2, life: 0.7 + R() * 0.4, size: kind === 'splash' ? 0.2 + R() * 0.22 : 0.12 + R() * 0.12, color: kind === 'splash' ? '#d8dcf0' : '#eef2ff', a: 0.85, grav: 9 });
      }
      if (kind === 'perfect') {
        for (let i = 0; i < 6 * scale; i++) glow.emit({ x: x + (R() - 0.5) * 0.6, y: 0.2 + R() * 0.4, z: z + (R() - 0.5) * 0.6, vy: 0.8 + R(), vx: (R() - 0.5), vz: (R() - 0.5), life: 0.5 + R() * 0.3, size: 0.4 + R() * 0.3, color: '#fff3d6', a: 1, drag: 2 });
      }
      if (kind === 'good') {
        for (let i = 0; i < 3 * scale; i++) glow.emit({ x: x + (R() - 0.5) * 0.5, y: 0.2, z: z + (R() - 0.5) * 0.5, vy: 0.6, life: 0.4, size: 0.35, color: '#FFB547', a: 0.8, drag: 2 });
      }
      if (kind === 'splash') {
        // a ring of grey-ember mist
        for (let i = 0; i < 8 * scale; i++) {
          const a = (i / 8) * Math.PI * 2;
          spray.emit({ x, y: 0.15, z, vx: Math.cos(a) * 1.6, vz: Math.sin(a) * 1.6, vy: 0.3, life: 0.6, size: 0.6, color: '#c9a0a0', a: 0.35, drag: 3, grow: 1.5 });
        }
      }
    },
    /** A pull: both blades drive at once; a gold fan of water behind them and sparks off the blades. */
    pull(x, z, fx, fz) {
      for (let i = 0; i < 34 * scale; i++) {
        const side = R() < 0.5 ? -1 : 1;
        const out = 0.6 + R() * 1.6;
        spray.emit({ x: x - fx * 0.6 + fz * side * 1.8, y: 0.1, z: z - fz * 0.6 - fx * side * 1.8, vx: -fx * (2.4 + R() * 2) + fz * side * out, vy: 1.2 + R() * 2.2, vz: -fz * (2.4 + R() * 2) - fx * side * out, life: 0.7 + R() * 0.3, size: 0.12 + R() * 0.16, color: R() < 0.25 ? '#ffe6b0' : '#eef2ff', a: 0.9, grav: 9 });
      }
      for (let i = 0; i < 16 * scale; i++) {
        const side = R() < 0.5 ? -1 : 1;
        glow.emit({ x: x + fz * side * 1.9, y: 0.3 + R() * 0.5, z: z - fx * side * 1.9, vx: (R() - 0.5) * 1.6 - fx, vy: 0.8 + R() * 1.4, vz: (R() - 0.5) * 1.6 - fz, life: 0.6 + R() * 0.3, size: 0.32 + R() * 0.25, color: R() < 0.5 ? '#FFC94D' : '#fff3d6', a: 1, drag: 2 });
      }
    },
    /** A moonbloom taken: its petals scatter up in a spiral of pale light; a run of them burns warmer. */
    bloom(x, z, run = 0) {
      const warm = Math.min(1, run / 4);
      const n = Math.round((18 + run * 3) * scale);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + R() * 0.3;
        const sp = 0.9 + R() * 1.3;
        glow.emit({ x: x + Math.cos(a) * 0.25, y: 0.25, z: z + Math.sin(a) * 0.25, vx: Math.cos(a) * sp, vy: 1.4 + R() * 2.2, vz: Math.sin(a) * sp, life: 0.8 + R() * 0.5, size: 0.22 + R() * 0.22, color: R() < warm * 0.6 ? '#FFD27A' : R() < 0.5 ? '#EAF0FF' : '#BFD3FF', a: 1, grav: 1.2, drag: 1.6 });
      }
      for (let i = 0; i < 6 * scale; i++) spray.emit({ x: x + (R() - 0.5) * 0.5, y: 0.1, z: z + (R() - 0.5) * 0.5, vx: (R() - 0.5) * 1.4, vy: 1 + R() * 1.4, vz: (R() - 0.5) * 1.4, life: 0.9, size: 0.12, color: '#FFD7A8', a: 0.9, grav: 4, drag: 1 });
    },
    /** A merrily rush: golden sparks wind up around the boat and a ring of light runs out over the water. */
    rush(x, z) {
      const n = Math.round(60 * scale);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 6;
        const r = 1.4 + (i / n) * 1.2;
        glow.emit({ x: x + Math.cos(a) * r, y: 0.3 + (i / n) * 1.6, z: z + Math.sin(a) * r, vx: -Math.sin(a) * 2.2, vy: 1.6 + R() * 1.2, vz: Math.cos(a) * 2.2, life: 0.9 + R() * 0.6, size: 0.3 + R() * 0.3, color: R() < 0.6 ? '#FFC94D' : '#FFF1C8', a: 1, grav: 0.6, drag: 1.2 });
      }
      for (let i = 0; i < 28 * scale; i++) {
        const a = (i / 28) * Math.PI * 2;
        spray.emit({ x: x + Math.cos(a) * 1.2, y: 0.12, z: z + Math.sin(a) * 1.2, vx: Math.cos(a) * 5, vy: 0.6 + R() * 0.8, vz: Math.sin(a) * 5, life: 0.7, size: 0.18, color: '#fff4d8', a: 0.8, grav: 3, drag: 1.5 });
      }
    },
    /** A bump: water thrown up at the hull. */
    bump(x, z, power = 1) {
      for (let i = 0; i < 22 * power * scale; i++) spray.emit({ x: x + (R() - 0.5), y: 0.2, z: z + (R() - 0.5), vx: (R() - 0.5) * 4, vy: 2 + R() * 3, vz: (R() - 0.5) * 4, life: 0.8, size: 0.18 + R() * 0.2, color: '#e6eaff', a: 0.9, grav: 9 });
    },
    /** A lantern snuffed: a curl of smoke. */
    smoke(x, y, z) {
      for (let i = 0; i < 6; i++) spray.emit({ x: x + (R() - 0.5) * 0.15, y, z: z + (R() - 0.5) * 0.15, vx: (R() - 0.5) * 0.3, vy: 0.6 + R() * 0.4, vz: (R() - 0.5) * 0.3, life: 1.0 + R() * 0.4, size: 0.25, color: '#8a8aa0', a: 0.45, drag: 1, grow: 2 });
    },
    /** A lantern lit: a soft burst in its colour. */
    lantern(x, y, z, color = 'amber') {
      const c = LANTERN_COLORS[color] ?? '#FFB547';
      for (let i = 0; i < 14 * scale; i++) glow.emit({ x, y, z, vx: (R() - 0.5) * 2.2, vy: (R() - 0.2) * 2, vz: (R() - 0.5) * 2.2, life: 0.55 + R() * 0.3, size: 0.3 + R() * 0.2, color: R() < 0.3 ? '#fff4dc' : c, a: 1, drag: 3 });
    },
    /** Drops falling from a blade on the recovery. */
    drip(x, y, z) {
      for (let i = 0; i < 5 * scale; i++) spray.emit({ x: x + (R() - 0.5) * 0.25, y: Math.max(0.15, y) + R() * 0.1, z: z + (R() - 0.5) * 0.25, vx: (R() - 0.5) * 0.3, vy: -0.2 - R() * 0.5, vz: (R() - 0.5) * 0.3, life: 0.6, size: 0.06 + R() * 0.05, color: '#e8eeff', a: 0.8, grav: 8 });
    },
    /** Spray at the bow at speed, and silver sparkle in a slipstream. */
    wake(x, z, fx, fz, v, slip) {
      if (v > 3 && R() < (v - 3) * 0.15 * scale) {
        const side = R() < 0.5 ? -1 : 1;
        spray.emit({ x: x + fx * 1.4 + fz * side * 0.3, y: 0.1, z: z + fz * 1.4 - fx * side * 0.3, vx: -fz * side * 1.2 + fx * 0.5, vy: 0.8 + R() * 0.6, vz: fx * side * 1.2 + fz * 0.5, life: 0.5, size: 0.1 + R() * 0.08, color: '#eef2ff', a: 0.7, grav: 7 });
      }
      if (slip && R() < 0.5 * scale) glow.emit({ x: x - fx * 1.8 + (R() - 0.5) * 0.8, y: 0.12, z: z - fz * 1.8 + (R() - 0.5) * 0.8, vy: 0.2, life: 0.6, size: 0.3, color: '#dfe8ff', a: 0.8, drag: 1 });
    },
    /** White water in rapids and at a whirlpool. */
    foam(x, z, amount) {
      if (R() < amount * scale) spray.emit({ x: x + (R() - 0.5) * 3, y: 0.1, z: z + (R() - 0.5) * 3, vx: (R() - 0.5), vy: 1 + R() * 1.5, vz: (R() - 0.5), life: 0.6, size: 0.15 + R() * 0.15, color: '#f4f6ff', a: 0.7, grav: 6 });
    },
    /** Fireflies drifting over the water in a breath. */
    firefly(x, z) {
      if (reduced && R() < 0.5) return;
      glow.emit({ x: x + (R() - 0.5) * 18, y: 0.4 + R() * 1.8, z: z + (R() - 0.5) * 18, vx: (R() - 0.5) * 0.5, vy: (R() - 0.5) * 0.3, vz: (R() - 0.5) * 0.5, life: 1.6 + R() * 1.2, size: 0.25, color: '#e8ff9a', a: 1 });
    },
    /** Finish: sparks and paper lanterns rising from the arch. */
    finish(x, y, z) {
      for (let i = 0; i < 70 * scale; i++) glow.emit({ x: x + (R() - 0.5) * 8, y: y + (R() - 0.5) * 1.5, z: z + (R() - 0.5) * 2, vx: (R() - 0.5) * 6, vy: 1 + R() * 5, vz: (R() - 0.5) * 6, life: 1 + R() * 0.8, size: 0.25 + R() * 0.3, color: R() < 0.5 ? '#FFB547' : '#F4EBD0', a: 1, grav: 2, drag: 0.6 });
      for (let i = 0; i < 9; i++) {
        if (skyL.length >= SKY) skyL.shift();
        skyL.push({ x: x + (R() - 0.5) * 9, y: y - 1 + R(), z: z + (R() - 0.5) * 3, vy: 0.9 + R() * 0.7, ph: R() * 6, t: 0 });
      }
    },
    /** Star confetti over the podium. */
    confetti(x, y, z) {
      const cols = ['#F4EBD0', '#FFB547', '#F2A7B6', '#9CC5A1', '#B7A5E8'];
      for (let i = 0; i < 6 * scale; i++) spray.emit({ x: x + (R() - 0.5) * 8, y: y + R() * 2, z: z + (R() - 0.5) * 4, vx: (R() - 0.5) * 0.8, vy: -0.6 - R() * 0.6, vz: (R() - 0.5) * 0.8, life: 3, size: 0.18, color: cols[Math.floor(R() * cols.length)], a: 1 });
    },
    update(dt, now) {
      spray.update(dt);
      glow.update(dt);
      let n = 0;
      for (let i = skyL.length - 1; i >= 0; i--) {
        const l = skyL[i];
        l.t += dt;
        if (l.t > 14) {
          skyL.splice(i, 1);
          continue;
        }
      }
      for (const l of skyL) {
        tmp.position.set(l.x + Math.sin(now * 0.7 + l.ph) * 0.6, l.y + l.vy * l.t, l.z + Math.cos(now * 0.6 + l.ph) * 0.4);
        tmp.rotation.set(Math.sin(now + l.ph) * 0.1, 0, Math.cos(now * 1.2 + l.ph) * 0.1);
        tmp.scale.setScalar(Math.min(1, l.t * 3));
        tmp.updateMatrix();
        sky.setMatrixAt(n++, tmp.matrix);
      }
      sky.count = n;
      sky.instanceMatrix.needsUpdate = true;
    },
    clear() {
      skyL.length = 0;
    },
  };
}
