// Moonblooms: water-lilies that glow, floating in lines on the river. Each is a pad and a cup of petals lit from
// inside; they bob on the water and open and close a little on the beat. Taken ones sink away.

import * as THREE from 'three';
import { glowTexture } from './kit.js';
import { NO_MIRROR } from './world.js';

const tmp = new THREE.Object3D();

function padGeometry() {
  // a round leaf with a notch, a little cupped
  const shape = new THREE.Shape();
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const a = 0.22 + (i / N) * (Math.PI * 2 - 0.44);
    const r = 0.62 * (1 + 0.04 * Math.sin(a * 5));
    if (i === 0) shape.moveTo(0, 0);
    shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.lineTo(0, 0);
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setY(i, 0.04 + 0.05 * (x * x + z * z));
  }
  g.computeVertexNormals();
  return g;
}

function cupGeometry() {
  // two rings of pointed petals, opening outward, coloured pale at the tips and warm inside
  const parts = [];
  const petal = (len, wid, tilt, a, y) => {
    const g = new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(wid, len, wid * 0.45);
    g.translate(0, 0, 0);
    g.rotateX(-tilt);
    g.rotateY(a);
    g.translate(0, y, 0);
    return g;
  };
  for (let k = 0; k < 7; k++) parts.push([petal(0.34, 0.1, 0.95, (k / 7) * Math.PI * 2, 0.08), 0]);
  for (let k = 0; k < 6; k++) parts.push([petal(0.26, 0.085, 0.45, (k / 6 + 0.08) * Math.PI * 2, 0.1), 1]);
  parts.push([new THREE.SphereGeometry(0.07, 10, 8).translate(0, 0.14, 0), 2]);
  const geos = [];
  const cTip = new THREE.Color('#EAF0FF');
  const cIn = new THREE.Color('#FFD7A8');
  const cMid = new THREE.Color('#FFE58A');
  for (const [g0, ring] of parts) {
    const g = g0.toNonIndexed();
    g.deleteAttribute('uv');
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const c = ring === 2 ? cMid : cIn.clone().lerp(cTip, Math.min(1, Math.max(0, (y - 0.05) / 0.25)));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3]]) {
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of geos) {
      arr.set(g.attributes[name].array, o);
      o += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

const BOB = /* glsl */ `
  #ifdef USE_INSTANCING
    float ph = instanceMatrix[3].x * 0.71 + instanceMatrix[3].z * 0.37;
  #else
    float ph = 0.0;
  #endif
  transformed.y += sin(uBloomTime * 1.7 + ph) * 0.035;
  transformed.xz *= 1.0 + uBloomOpen * 0.12 * smoothstep(0.02, 0.3, transformed.y);
`;

/** The blooms of a course. Returns { group, update(now, pulse, got), take(i, now), reset() }. */
export function createBlooms(course) {
  const list = course.blooms ?? [];
  const group = new THREE.Group();
  group.name = 'blooms';
  const U = { uBloomTime: { value: 0 }, uBloomOpen: { value: 0 } };
  const hook = (mat) => {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uBloomTime;\nuniform float uBloomOpen;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${BOB}`);
    };
    mat.customProgramCacheKey = () => `bloom-${mat.type}`;
    return mat;
  };
  const padMat = hook(new THREE.MeshStandardMaterial({ color: '#2f6b4a', roughness: 0.45, metalness: 0, side: THREE.DoubleSide }));
  const cupMat = hook(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.5, 1.5, 1.5) }));
  const n = Math.max(1, list.length);
  const pads = new THREE.InstancedMesh(padGeometry(), padMat, n);
  const cups = new THREE.InstancedMesh(cupGeometry(), cupMat, n);
  pads.count = cups.count = list.length;
  pads.receiveShadow = true;
  // halos over the water (not mirrored: the cups themselves are)
  const halo = new THREE.BufferGeometry();
  const hp = new Float32Array(list.length * 3);
  halo.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  const haloMat = new THREE.PointsMaterial({ map: glowTexture(), color: '#BFD3FF', size: 2.2, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const halos = new THREE.Points(halo, haloMat);
  halos.layers.set(NO_MIRROR);
  const place = (i, scale, sink = 0) => {
    const m = list[i];
    tmp.position.set(m.x, -sink, m.z);
    tmp.rotation.set(0, (i * 2.399) % (Math.PI * 2), 0);
    tmp.scale.setScalar(scale);
    tmp.updateMatrix();
    pads.setMatrixAt(i, tmp.matrix);
    tmp.position.y = 0.05 - sink;
    tmp.updateMatrix();
    cups.setMatrixAt(i, tmp.matrix);
    hp[i * 3] = m.x;
    hp[i * 3 + 1] = sink > 0.5 ? -50 : 0.35 - sink;
    hp[i * 3 + 2] = m.z;
  };
  list.forEach((_, i) => place(i, 1));
  pads.computeBoundingSphere();
  cups.computeBoundingSphere();
  halos.frustumCulled = false;
  group.add(pads, cups, halos);
  const sinking = new Map(); // i -> time taken
  let shown = null;
  let shownN = 0;
  return {
    group,
    /** Per frame: the beat's pulse opens the cups; `got` (the player's boat) hides the taken ones. */
    update(now, pulse, got) {
      U.uBloomTime.value = now;
      U.uBloomOpen.value = pulse;
      haloMat.size = 2 + pulse * 0.6;
      let dirty = false;
      let n = 0;
      if (got) for (let i = 0; i < got.length; i++) n += got[i];
      if (got !== shown || n !== shownN) {
        shown = got;
        shownN = n;
        list.forEach((_, i) => {
          if (!sinking.has(i)) place(i, got?.[i] ? 0 : 1, got?.[i] ? 1 : 0);
        });
        dirty = true;
      }
      for (const [i, t0] of sinking) {
        const k = (now - t0) / 0.5;
        if (k >= 1) {
          place(i, 0, 1);
          sinking.delete(i);
        } else place(i, 1 + k * 0.6, k * 0.3);
        dirty = true;
      }
      if (dirty) {
        pads.instanceMatrix.needsUpdate = true;
        cups.instanceMatrix.needsUpdate = true;
        halo.attributes.position.needsUpdate = true;
      }
    },
    /** A bloom taken: it swells, sinks and goes. */
    take(i, now) {
      if (i < 0 || i >= list.length) return;
      sinking.set(i, now);
    },
    /** Show every bloom again (a new run on the same course). */
    reset() {
      shown = null;
      shownN = 0;
      sinking.clear();
      list.forEach((_, i) => place(i, 1));
      pads.instanceMatrix.needsUpdate = true;
      cups.instanceMatrix.needsUpdate = true;
      halo.attributes.position.needsUpdate = true;
    },
  };
}
