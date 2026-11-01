// The river's furniture: banks, islands, bank lanterns, the start and finish arches, and everything in the water (each
// dream's own rocks, drifting logs, pads, pendulums). Static parts are merged; moving parts are instanced.

import * as THREE from 'three';
import { G, createKit, glowTexture, srand } from './kit.js';
import { NO_MIRROR } from './world.js';

const tmp = new THREE.Object3D();
const c3 = new THREE.Color();

// ---------------------------------------------------------------- bank patterns

function bankColor(id, theme, s, off, side, rnd) {
  const B = theme.bank;
  switch (id) {
    case 'bedtime': {
      if (s > 372) return (Math.floor(off / 1.4) + Math.floor(s / 5)) % 2 ? '#2f4d3b' : '#36573f';
      const plank = Math.floor(off / 0.9);
      const joint = (s + plank * 1.7) % 4.5 < 0.12;
      return joint ? '#2c1f19' : B[plank % 3];
    }
    case 'teatime':
      return (Math.floor(s / 2.4) + Math.floor(off / 2.4)) % 2 ? B[0] : B[1];
    case 'staircase':
      return (Math.floor(s / 4) + Math.floor(off / 4)) % 2 ? B[0] : B[1];
    case 'cloudbank':
      return rnd() < 0.5 ? B[0] : rnd() < 0.5 ? B[1] : B[2];
    case 'library':
      return off > 1.2 && off < 2.0 ? '#c99a4e' : (Math.floor(s / 3) + Math.floor(off / 3)) % 2 ? B[0] : B[1];
    case 'clockwork': {
      const tile = (Math.floor(s / 3.2) + Math.floor(off / 3.2)) % 2;
      return (s % 3.2 < 0.15 || off % 3.2 < 0.15) ? '#3a2e1c' : B[tile];
    }
    case 'stars':
      return rnd() < 0.02 ? '#cfd8ff' : B[(Math.floor(s / 6) + Math.floor(off / 6)) % 3];
    case 'morning': {
      const stitch = s % 3 < 0.12 || off % 3 < 0.12;
      if (stitch) return '#f4ebd0';
      return B[(Math.floor(s / 3) * 3 + Math.floor(off / 3) * 7 + (side > 0 ? 1 : 0)) % 4];
    }
    default:
      return B[0];
  }
}

const PROFILE = {
  off: [-0.8, 0.25, 0.9, 2.2, 4.5, 8, 14, 22, 32],
  y: [-0.6, 0.12, 0.42, 0.58, 0.66, 0.72, 0.85, 1.1, 1.6],
};

function bankAmp(id) {
  return id === 'cloudbank' ? 1.6 : id === 'stars' ? 0.2 : id === 'bedtime' || id === 'library' || id === 'clockwork' ? 0.05 : 0.25;
}

/** Both banks as one vertex-coloured mesh. */
function buildBanks(course, id, theme) {
  const rnd = srand(id.length * 97 + 5);
  const STEP = 2;
  const rows = Math.floor(course.total / STEP) + 1;
  const K = PROFILE.off.length;
  const pos = [];
  const colr = [];
  const idx = [];
  const amp = bankAmp(id);
  let v = 0;
  for (const side of [-1, 1]) {
    const start = v;
    for (let r = 0; r < rows; r++) {
      const s = Math.min(course.total, r * STEP);
      const a = course.at(s);
      for (let k = 0; k < K; k++) {
        const off = Math.min(PROFILE.off[k], 34 - a.hw);
        const d = side * (a.hw + off);
        const p = course.point(s, d);
        const bump = k >= 3 ? amp * (Math.sin(s * 0.21 + side * 1.7 + k) * 0.6 + Math.sin(s * 0.53 + k * 2.1) * 0.4) * Math.min(1, (k - 2) / 3) : 0;
        pos.push(p.x, PROFILE.y[k] + bump + (id === 'cloudbank' && k >= 2 ? 0.6 : 0), p.z);
        c3.set(bankColor(id, theme, s, Math.max(0, off), side, rnd));
        if (k === 0) c3.multiplyScalar(0.55);
        colr.push(c3.r, c3.g, c3.b);
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
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.name = 'banks';
  return mesh;
}

const ISLAND_COL = {
  bedtime: ['#e9dfc8', '#c9b9a0'], teatime: ['#f2ece0', '#d7cdbd'], staircase: ['#3e4466', '#2c3150'], cloudbank: ['#eef0fb', '#c9cfec'],
  library: ['#efe4cc', '#c9b48e'], clockwork: ['#7d6740', '#5a4a30'], stars: ['#1c2456', '#2a3470'], morning: ['#e2b46a', '#c46e64'],
};

/** Islands: a mound in river coordinates (so it follows bends). */
function islandMeshes(course, id) {
  const group = new THREE.Group();
  const cols = ISLAND_COL[id] ?? ISLAND_COL.bedtime;
  for (const is of course.islands) {
    const K = 10;
    const A = 28;
    const pos = [];
    const colr = [];
    const idx = [];
    const H = id === 'cloudbank' ? 2.4 : id === 'stars' ? 0.6 : 1.3;
    for (let k = 0; k <= K; k++) {
      const r = 1.08 - (k / K) * 1.08;
      for (let j = 0; j < A; j++) {
        const th = (j / A) * Math.PI * 2;
        const s = is.sm + is.a * r * Math.cos(th);
        const d = is.b * r * Math.sin(th);
        const p = course.point(s, d);
        const y = -0.35 + (H + 0.35) * Math.pow(Math.max(0, 1 - Math.min(1, r) ** 2), 0.55);
        pos.push(p.x, y, p.z);
        c3.set(k < 2 ? cols[1] : cols[0]);
        colr.push(c3.r, c3.g, c3.b);
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
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    m.receiveShadow = true;
    m.castShadow = true;
    group.add(m);
  }
  return group;
}

// ---------------------------------------------------------------- things in the water

const TOY = ['#F2A7B6', '#9CC5A1', '#FFB547', '#B7A5E8', '#F4EBD0', '#E5533D', '#7fb3d5'];

function rockLook(id) {
  switch (id) {
    case 'bedtime':
      return { geo: G.rbox(1.6, 1.6, 1.6, 0.18), colors: TOY, y: 0.35, tilt: 0.25 };
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
      const kit = createKit();
      kit.add(G.sphere(0.5, 12, 8), '#fff3c8', { x: 0.45 });
      kit.add(G.cone(0.45, 1, 10), '#9fb4ff', { x: -0.05, rz: Math.PI / 2 });
      return { geo: kit.build().userData.solid.geometry, color: '#ffffff', vc: true, glow: true };
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
export function createRiver(course, id, theme) {
  const group = new THREE.Group();
  group.name = 'river';
  group.add(buildBanks(course, id, theme));
  group.add(islandMeshes(course, id));
  const rnd = srand(id.length * 13 + 1);

  // ---- rocks (instanced)
  const look = rockLook(id);
  const rocks = course.rocks;
  const stackN = look.stack ?? 1;
  if (rocks.length) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: look.metal ?? 0 });
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
    const mat = ll.glow ? new THREE.MeshBasicMaterial({ vertexColors: !!ll.vc }) : new THREE.MeshStandardMaterial({ vertexColors: !!ll.vc, roughness: 0.55, metalness: ll.metal ?? 0 });
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

  // ---- bank lanterns
  const lanterns = [];
  const posts = createKit();
  for (let s = course.start - 10, k = 0; s < course.total - 4; s += 15, k++) {
    const side = k % 2 ? 1 : -1;
    const a = course.at(s);
    const d = side * (a.hw + 1.1);
    const p = course.point(s, d);
    if (course.islandAt(s) && Math.abs(d) < a.hw) continue;
    if (id === 'stars') {
      // the dream turned over: lanterns hang from above
      posts.add(G.cyl(0.02, 0.02, 4, 4), '#9aa3d8', { x: p.x, y: 5.6, z: p.z });
      lanterns.push({ x: p.x, y: 3.4, z: p.z, s });
    } else {
      posts.add(G.cyl(0.07, 0.09, 2.1, 6), '#3a2a22', { x: p.x, y: 1.05, z: p.z });
      posts.add(G.box(0.7, 0.07, 0.07), '#3a2a22', { x: p.x - Math.cos(a.h) * side * 0.3, y: 2.08, z: p.z - Math.sin(a.h) * side * 0.3, ry: -a.h });
      const lx = p.x - Math.cos(a.h) * side * 0.6;
      const lz = p.z - Math.sin(a.h) * side * 0.6;
      lanterns.push({ x: lx, y: 1.72, z: lz, s });
    }
  }
  group.add(posts.build('posts'));
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffd8a0', emissive: theme.lantern, emissiveIntensity: 1.6, roughness: 0.6 });
  const lanternGeo = G.sphere(0.32, 12, 8);
  lanternGeo.scale(1, 1.25, 1);
  const lanternMesh = new THREE.InstancedMesh(lanternGeo, lanternMat, lanterns.length);
  lanterns.forEach((l, i) => {
    tmp.position.set(l.x, l.y, l.z);
    tmp.rotation.set(0, 0, 0);
    tmp.scale.setScalar(1);
    tmp.updateMatrix();
    lanternMesh.setMatrixAt(i, tmp.matrix);
  });
  lanternMesh.instanceMatrix.needsUpdate = true;
  lanternMesh.computeBoundingSphere();
  group.add(lanternMesh);
  // their halos
  const halo = new THREE.BufferGeometry();
  halo.setAttribute('position', new THREE.Float32BufferAttribute(lanterns.flatMap((l) => [l.x, l.y, l.z]), 3));
  const haloMat = new THREE.PointsMaterial({ map: glowTexture(), color: theme.lantern, size: 3.2, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const halos = new THREE.Points(halo, haloMat);
  group.add(halos);

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
  const mist = Array.from({ length: 12 }, (_, i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: mistCol, transparent: true, opacity: id === 'cloudbank' ? 0.5 : 0.3, depthWrite: false, fog: true }));
    sp.scale.set(22, 7, 1);
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
      lanternMat.emissiveIntensity = 1.4 + pulse * 0.9;
      haloMat.size = 3.0 + pulse * 0.9;
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
        m.position.set(p.x, 0.9 + (u.k % 3) * 0.4, p.z);
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
  // its lanterns, hung from the beam
  const lit = new THREE.MeshStandardMaterial({ color: '#ffe2b0', emissive: theme.lantern, emissiveIntensity: 1.7, roughness: 0.6 });
  // unlit: paper that still shows a little warmth, never a black hole in the sky
  const dark = new THREE.MeshStandardMaterial({ color: '#b89a74', emissive: theme.lantern, emissiveIntensity: 0.12, roughness: 0.8 });
  const geo = G.sphere(kind === 'finish' ? 0.42 : 0.5, 14, 10);
  geo.scale(1, 1.3, 1);
  const lamps = [];
  for (let i = 0; i < count; i++) {
    const u = (i + 1) / (count + 1);
    const x = -span + 2 * span * u;
    const y = H + Math.sin(u * Math.PI) * 1.1 - 0.9 - (kind === 'finish' ? Math.sin(u * Math.PI * 3) * 0.2 : 0);
    const m = new THREE.Mesh(geo, dark);
    const p = new THREE.Vector3(x, y, 0).applyMatrix4(frame);
    m.position.copy(p);
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
