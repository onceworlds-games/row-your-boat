// The eight dreams' set pieces: giant everyday things the river runs through, built from primitives and merged (one draw
// for the solid, one for the glowing), plus a few moving parts (clock hands, gears, a balloon, an alarm clock).
//
// Placement frames: F(s, d, y) is a point on the river with local +x to the right bank, +y up and -z downstream.

import * as THREE from 'three';
import { G, createKit, part, srand } from './kit.js';

const PI = Math.PI;

function frames(course) {
  return (s, d = 0, y = 0, turn = 0) => {
    const a = course.at(s);
    const p = course.point(s, d);
    return new THREE.Matrix4().makeRotationY(-a.h + turn).setPosition(p.x, y, p.z);
  };
}

/** Each side of the river: a run of pieces every `every` metres, `off` metres beyond the bank. */
function alongBanks(course, from, to, every, off, fn) {
  for (let s = from; s < to; s += every) {
    const a = course.at(s);
    for (const side of [-1, 1]) fn(s, side, side * (a.hw + off), a);
  }
}

// ---------------------------------------------------------------- shared pieces

function teacup(kit, parent, r, color, rim = '#e2bd52') {
  const h = r * 0.9;
  kit.add(G.lathe([[0, 0], [r * 0.55, 0], [r * 0.75, h * 0.25], [r, h], [r * 0.93, h], [r * 0.7, h * 0.3], [0, h * 0.12]], 22), color, {}, { parent });
  kit.add(G.torus(r, r * 0.04, 28, 6), rim, { y: h, rx: PI / 2 }, { parent });
  kit.add(G.torus(r * 0.32, r * 0.08, 14, 6, PI * 1.2), color, { x: r * 1.02, y: h * 0.55, rz: -PI * 0.6 }, { parent });
  kit.add(G.cyl(r * 1.45, r * 1.2, r * 0.12, 26), color, { y: -r * 0.04 }, { parent });
  kit.add(G.torus(r * 1.4, r * 0.03, 28, 6), rim, { y: r * 0.03, rx: PI / 2 }, { parent });
}

function lamp(kit, parent, h, shade, glowKit) {
  kit.add(G.cyl(h * 0.18, h * 0.22, h * 0.06, 18), '#c9a24e', {}, { parent });
  kit.add(G.cyl(h * 0.025, h * 0.03, h * 0.75, 8), '#c9a24e', { y: h * 0.4 }, { parent });
  kit.add(G.cyl(h * 0.17, h * 0.3, h * 0.28, 20, true), shade, { y: h * 0.82 }, { parent });
  glowKit.add(G.cyl(h * 0.16, h * 0.29, h * 0.02, 20), '#ffd27a', { y: h * 0.69 }, { parent, glow: true, bright: 2.2 });
  glowKit.add(G.sphere(h * 0.08, 10, 8), '#fff1c8', { y: h * 0.74 }, { parent, glow: true, bright: 2.5 });
}

function flower(kit, parent, h, petal, rnd) {
  kit.add(G.cyl(h * 0.025, h * 0.035, h, 6), '#2d5a3a', { y: h / 2 }, { parent });
  kit.add(G.sphere(h * 0.12, 8, 6), '#3b6e46', { x: h * 0.1, y: h * 0.45, sy: 0.3, rz: 0.6 }, { parent });
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * PI * 2 + rnd();
    kit.add(G.sphere(h * 0.12, 8, 6), petal, { x: Math.cos(a) * h * 0.14, y: h, z: Math.sin(a) * h * 0.14, sy: 0.35, s: 1 }, { parent });
  }
  kit.add(G.sphere(h * 0.07, 8, 6), '#FFB547', { y: h + 0.1 }, { parent });
}

function cloud(kit, parent, r, color, rnd, n = 6) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * PI * 2;
    const rr = r * (0.3 + rnd() * 0.5);
    kit.add(G.sphere(r * (0.45 + rnd() * 0.35), 12, 8), k % 2 ? color : '#ffffff', { x: Math.cos(a) * rr, y: rnd() * r * 0.4, z: Math.sin(a) * rr * 0.7 }, { parent });
  }
}

function frameOf(kit, parent, w, h, wood, picture, glowKit) {
  const t = 0.35;
  kit.add(G.box(w, t, t), wood, { y: h / 2 }, { parent });
  kit.add(G.box(w, t, t), wood, { y: -h / 2 }, { parent });
  kit.add(G.box(t, h, t), wood, { x: w / 2 }, { parent });
  kit.add(G.box(t, h, t), wood, { x: -w / 2 }, { parent });
  glowKit.add(G.box(w - t, h - t, 0.05), picture, {}, { parent, glow: true, bright: 0.55 });
}

/** A source or an end: a tall gate of mist-coloured pillars so the river never runs into nothing. */
function gate(kit, F, course, s, color, H = 22) {
  const a = course.at(s);
  const w = a.hw + 14;
  const f = F(s);
  kit.add(G.box(10, H, 6), color, { x: -w, y: H / 2 }, { parent: f });
  kit.add(G.box(10, H, 6), color, { x: w, y: H / 2 }, { parent: f });
  kit.add(G.box(w * 2 + 10, 6, 6), color, { y: H + 3 }, { parent: f });
}

// ---------------------------------------------------------------- the dreams

const BUILD = {
  bedtime(c, F, kit, glow, anims, rnd) {
    const wall = (s, side, d, a) => {
      const f = F(s, d);
      kit.add(G.box(1.2, 34, 6.2), Math.floor(s / 6) % 2 ? '#26305e' : '#2d3a70', { x: side * 0.6, y: 17 }, { parent: f });
      kit.add(G.box(1.6, 1.4, 6.2), '#4a3428', { x: side * 0.2, y: 0.7 }, { parent: f });
      void a;
    };
    alongBanks(c, 0, 368, 6, 34, wall);
    // the wardrobe the river pours from
    const w0 = F(2, 0);
    kit.add(G.box(34, 30, 10), '#5a3d2e', { y: 15, z: 9 }, { parent: w0 });
    kit.add(G.box(30, 26, 1), '#140e18', { y: 14, z: 4.2 }, { parent: w0 });
    kit.add(G.box(15, 26, 0.8), '#6b4a38', { x: -24, y: 14, z: -2.5, ry: 0.9 }, { parent: w0 });
    kit.add(G.box(15, 26, 0.8), '#6b4a38', { x: 24, y: 14, z: -2.5, ry: -0.9 }, { parent: w0 });
    kit.add(G.sphere(0.7, 10, 8), '#c9a24e', { x: -19, y: 14, z: -6.6 }, { parent: w0 });
    kit.add(G.sphere(0.7, 10, 8), '#c9a24e', { x: 19, y: 14, z: -6.6 }, { parent: w0 });
    kit.add(G.box(36, 2, 11), '#4a3226', { y: 31, z: 9 }, { parent: w0 });
    // coats hanging inside, lit by a moon-coloured glow
    for (let k = -3; k <= 3; k++) kit.add(G.capsule(1.6, 7, 8), ['#3a4a8a', '#7a3a4a', '#4a6a5a'][(k + 3) % 3], { x: k * 3.6, y: 17, z: 7 }, { parent: w0 });
    glow.add(G.box(28, 0.3, 0.3), '#cfd6ff', { y: 25.5, z: 6 }, { parent: w0, glow: true, bright: 1.4 });
    // slippers and a stack of toy blocks on the floor
    const sl = F(100, c.at(100).hw + 6, 0, 0.3);
    for (const x of [0, 4.2]) {
      kit.add(G.rbox(3.2, 1.6, 8, 0.7), '#F2A7B6', { x, y: 0.8 }, { parent: sl });
      kit.add(G.half(1.7, 14, 6), '#f4ebd0', { x, y: 1.4, z: -2.4, sz: 1.3, sy: 0.7 }, { parent: sl });
    }
    const tb = F(58, -(c.at(58).hw + 5));
    const cols = ['#F2A7B6', '#9CC5A1', '#FFB547', '#B7A5E8', '#E5533D'];
    for (let k = 0; k < 5; k++) kit.add(G.rbox(3.4, 3.4, 3.4, 0.3), cols[k], { x: (k % 2) * 1.2 - 2, y: 1.7 + k * 3.3, z: (k % 3) * 0.6, ry: k * 0.4 }, { parent: tb });
    // the nightstand and its lamp
    const ns = F(150, -(c.at(150).hw + 7));
    kit.add(G.box(8, 9, 8), '#6b4a38', { y: 4.5 }, { parent: ns });
    kit.add(G.box(8.6, 0.6, 8.6), '#7d5a44', { y: 9.2 }, { parent: ns });
    kit.add(G.box(5, 2.4, 0.3), '#5a3d2e', { y: 6.5, x: 0, z: -4.1 }, { parent: ns });
    lamp(kit, new THREE.Matrix4().multiplyMatrices(ns, new THREE.Matrix4().makeTranslation(0, 9.5, 0)), 9, '#F2A7B6', glow);
    anims.lights.push(new THREE.Vector3(0, 16, 0).applyMatrix4(ns));
    // the bed: over the island and the short line (left), so the short way runs under it
    const is = c.islands[0];
    const bm = (is.s0 + is.s1) / 2;
    const bf = F(bm, -8);
    const BL = 40;
    for (const [x, z] of [[-9, -BL / 2 + 1], [-9, BL / 2 - 1], [8, -BL / 2 + 1], [8, BL / 2 - 1]]) kit.add(G.cyl(0.9, 1.1, 7, 10), '#5a3d2e', { x, y: 3.5, z }, { parent: bf });
    kit.add(G.box(19, 1.6, BL), '#5a3d2e', { y: 7.6 }, { parent: bf });
    kit.add(G.rbox(18.4, 3, BL - 1, 1), '#e6e8f6', { y: 9.8 }, { parent: bf });
    kit.add(G.rbox(19.4, 1.6, BL * 0.62, 0.7), '#B7A5E8', { y: 11.4, z: 6 }, { parent: bf });
    for (let k = 0; k < 6; k++) kit.add(G.rbox(3, 0.3, 3, 0.1), k % 2 ? '#F2A7B6' : '#9CC5A1', { x: -6 + (k % 3) * 6, y: 12.25, z: (k < 3 ? 1 : 9) + 3 }, { parent: bf });
    kit.add(G.rbox(7, 2.6, 4.5, 1.2), '#f4ebd0', { x: -4.5, y: 12, z: -BL / 2 + 4 }, { parent: bf });
    kit.add(G.rbox(7, 2.6, 4.5, 1.2), '#f4ebd0', { x: 4.5, y: 12, z: -BL / 2 + 4 }, { parent: bf });
    kit.add(G.box(20, 16, 1.4), '#4a3226', { y: 8, z: -BL / 2 - 0.4 }, { parent: bf });
    kit.add(G.cyl(1, 1, 18, 10), '#4a3226', { x: -10, y: 9, z: -BL / 2 - 0.4 }, { parent: bf });
    kit.add(G.cyl(1, 1, 18, 10), '#4a3226', { x: 10, y: 9, z: -BL / 2 - 0.4 }, { parent: bf });
    kit.add(G.sphere(1.4, 10, 8), '#c9a24e', { x: -10, y: 18.6, z: -BL / 2 - 0.4 }, { parent: bf });
    kit.add(G.sphere(1.4, 10, 8), '#c9a24e', { x: 10, y: 18.6, z: -BL / 2 - 0.4 }, { parent: bf });
    // a teddy bear sat on the bed
    const tf = new THREE.Matrix4().multiplyMatrices(bf, new THREE.Matrix4().makeTranslation(5, 12.4, 2));
    kit.add(G.sphere(2.2, 14, 10), '#b07a55', { y: 2, sy: 1.1 }, { parent: tf });
    kit.add(G.sphere(1.6, 14, 10), '#b07a55', { y: 4.8 }, { parent: tf });
    for (const x of [-1.1, 1.1]) kit.add(G.sphere(0.6, 10, 8), '#b07a55', { x, y: 6.2 }, { parent: tf });
    kit.add(G.sphere(0.6, 10, 8), '#e2c09a', { y: 4.5, z: -1.4 }, { parent: tf });
    // the window out to the garden
    const ws = 372;
    const wf = F(ws, 0);
    const half = c.at(ws).hw + 7;
    kit.add(G.box(60, 40, 1.4), '#2d3a70', { x: -half - 30, y: 20 }, { parent: wf });
    kit.add(G.box(60, 40, 1.4), '#2d3a70', { x: half + 30, y: 20 }, { parent: wf });
    kit.add(G.box(half * 2, 12, 1.4), '#2d3a70', { y: 34 }, { parent: wf });
    for (const x of [-half, half]) kit.add(G.box(1.6, 28, 2.2), '#e9dfc8', { x, y: 14 }, { parent: wf });
    kit.add(G.box(half * 2 + 1.6, 1.6, 2.2), '#e9dfc8', { y: 28 }, { parent: wf });
    kit.add(G.box(half * 2 + 3, 0.8, 3), '#e9dfc8', { y: 0.6 }, { parent: wf });
    kit.add(G.box(0.8, 12, 1.6), '#e9dfc8', { y: 22 }, { parent: wf });
    for (const x of [-1, 1]) kit.add(G.box(5, 30, 1.2), '#3a3f8a', { x: x * (half + 3), y: 15, z: -1.2, ry: x * 0.3 }, { parent: wf });
    // the garden: flowers, hedges, fireflies
    const R = srand(9);
    for (let s = ws + 8; s < c.total; s += 9) {
      for (const side of [-1, 1]) {
        const a = c.at(s);
        flower(kit, F(s, side * (a.hw + 4 + R() * 10)), 6 + R() * 8, ['#F2A7B6', '#f4ebd0', '#B7A5E8'][Math.floor(R() * 3)], R);
        kit.add(G.rbox(9, 5, 7, 2), '#22402e', { x: side * (a.hw + 22), y: 2.5 }, { parent: F(s) });
      }
    }
    gate(kit, F, c, c.total - 1, '#1d3226', 18);
  },

  teatime(c, F, kit, glow, anims, rnd) {
    // a teapot the river pours from
    const tp = F(0, 0, 0);
    kit.add(G.sphere(16, 22, 16), '#e9dfd0', { y: 14, z: 14, sy: 0.82 }, { parent: tp });
    kit.add(G.cyl(5, 7, 4, 18), '#e9dfd0', { y: 27, z: 14 }, { parent: tp });
    kit.add(G.sphere(2, 10, 8), '#e2bd52', { y: 30, z: 14 }, { parent: tp });
    kit.add(G.torus(14, 0.6, 32, 6), '#e2bd52', { y: 14, z: 14, rx: PI / 2 }, { parent: tp });
    kit.add(G.cyl(3, 6, 18, 14), '#e9dfd0', { y: 6, z: 2, rx: -1.1 }, { parent: tp });
    kit.add(G.torus(6, 1.6, 20, 8, PI), '#e9dfd0', { x: 0, y: 16, z: 30, ry: PI / 2 }, { parent: tp });
    for (let k = 0; k < 7; k++) kit.add(G.sphere(1.6, 10, 8), '#F2A7B6', { x: Math.cos(k) * 12, y: 18 + Math.sin(k * 2) * 3, z: 14 - 13 + Math.sin(k) * 2 }, { parent: tp });
    // cups and saucers along the table
    const R = srand(3);
    const cols = ['#F2A7B6', '#9CC5A1', '#B7A5E8', '#f4ebd0', '#7fb3d5'];
    for (let s = 40; s < c.total - 20; s += 34) {
      const side = Math.floor(s / 34) % 2 ? 1 : -1;
      const a = c.at(s);
      teacup(kit, F(s + R() * 8, side * (a.hw + 9 + R() * 6), 0, R() * 6), 5 + R() * 3, cols[Math.floor(R() * cols.length)]);
    }
    // saucers and cups on the islands
    for (const is of c.islands) {
      const m = (is.s0 + is.s1) / 2;
      teacup(kit, F(m, 0, 1.2, 0.5), Math.min(3.5, is.b * 0.8), cols[Math.floor(R() * cols.length)]);
    }
    // the spoon standing in the stirred cup
    for (const w of c.whirls) {
      const f = F(w.s, w.d + Math.sign(w.d || 1) * (w.r + 2), 0, 0);
      kit.add(G.cyl(0.5, 0.7, 22, 10), '#d9dbe4', { y: 10, rz: Math.sign(w.d || 1) * 0.5 }, { parent: f });
      kit.add(G.sphere(2.6, 14, 10), '#e4e6ee', { x: -Math.sign(w.d || 1) * 6.2, y: 21.5, sy: 1.4, sz: 0.4, rz: Math.sign(w.d || 1) * 0.5 }, { parent: f });
      // a giant cup rim around the whirlpool, on the bank side
      kit.add(G.torus(w.r + 4, 0.6, 32, 6, PI * 0.6), '#f4ebd0', { y: 0.2, rx: PI / 2, rz: Math.sign(w.d || 1) > 0 ? -PI * 0.3 : PI * 0.7 }, { parent: F(w.s, w.d) });
    }
    // the teapot pouring a waterfall over the rapids
    for (const z of c.zones) {
      const s = (z.s0 + z.s1) / 2;
      const a = c.at(s);
      const f = F(s, a.hw + 15);
      kit.add(G.sphere(11, 20, 14), '#B7A5E8', { y: 15, sy: 0.85 }, { parent: f });
      kit.add(G.cyl(3, 5, 3, 16), '#B7A5E8', { y: 25 }, { parent: f });
      kit.add(G.cyl(1.2, 2.6, 16, 12), '#B7A5E8', { x: -12, y: 19, rz: -1.0 }, { parent: f });
      kit.add(G.torus(10, 0.5, 30, 6), '#e2bd52', { y: 15, rx: PI / 2 }, { parent: f });
      glow.add(G.cyl(1.1, 1.6, 22, 10, true), '#c79a5e', { x: -19.5, y: 11 }, { parent: f, glow: true, bright: 1.1 });
      anims.foam.push({ s, d: a.hw - 4 });
    }
    // a sugar bowl and a tiered cake stand
    const sb = F(c.total - 60, -(c.at(c.total - 60).hw + 10));
    kit.add(G.lathe([[0, 0], [5, 0.5], [6.5, 4], [6, 6.5], [0, 6.5]], 22), '#f4ebd0', {}, { parent: sb });
    kit.add(G.half(6, 18, 6), '#f4ebd0', { y: 6.5, sy: 0.4 }, { parent: sb });
    kit.add(G.sphere(1, 10, 8), '#e2bd52', { y: 9.2 }, { parent: sb });
    const cs = F(250, c.at(250).hw + 26);
    for (let k = 0; k < 3; k++) {
      kit.add(G.cyl(9 - k * 2.5, 9 - k * 2.5, 0.5, 26), '#f4ebd0', { y: 6 + k * 7 }, { parent: cs });
      for (let j = 0; j < 6 - k; j++) {
        const an = (j / (6 - k)) * PI * 2;
        kit.add(G.rbox(2.2, 1.6, 2.2, 0.6), ['#F2A7B6', '#9CC5A1', '#FFB547'][j % 3], { x: Math.cos(an) * (6 - k * 2), y: 7 + k * 7, z: Math.sin(an) * (6 - k * 2) }, { parent: cs });
      }
    }
    kit.add(G.cyl(0.6, 0.6, 22, 8), '#e2bd52', { y: 11 }, { parent: cs });
    gate(kit, F, c, c.total - 1, '#3a2a4a', 20);
    void rnd;
  },

  staircase(c, F, kit, glow, anims, rnd) {
    const R = srand(5);
    // banisters along both banks
    alongBanks(c, 6, c.total - 4, 2.5, 1.6, (s, side, d) => {
      const f = F(s, d);
      kit.add(G.cyl(0.12, 0.16, 2.2, 6), '#e6dfcf', { y: 1.1 }, { parent: f });
      kit.add(G.box(0.3, 0.2, 2.6), '#6b4a38', { y: 2.25 }, { parent: f });
    });
    // floating staircases spiralling up out of the water into the mist
    for (const [s, side] of [[50, 1], [210, -1], [380, 1], [520, -1]]) {
      if (s > c.total) continue;
      const a = c.at(s);
      const f = F(s, side * (a.hw + 14));
      for (let k = 0; k < 34; k++) {
        const an = k * 0.32;
        kit.add(G.box(6, 0.7, 2.2), k % 2 ? '#e6dfcf' : '#d6cdb9', { x: Math.cos(an) * 5, y: k * 0.95, z: Math.sin(an) * 5, ry: -an }, { parent: f });
        if (k % 3 === 0) kit.add(G.cyl(0.1, 0.1, 2, 5), '#6b4a38', { x: Math.cos(an) * 7.6, y: k * 0.95 + 1, z: Math.sin(an) * 7.6 }, { parent: f });
      }
      kit.add(G.cyl(1.2, 1.2, 34, 12), '#bfb6a2', { y: 16 }, { parent: f });
    }
    // picture frames hanging in the mist
    const pics = ['#7a5a9a', '#4a7a8a', '#9a6a5a', '#5a7a5a', '#8a7a4a'];
    for (let s = 30; s < c.total - 10; s += 26) {
      const side = Math.floor(s / 26) % 2 ? 1 : -1;
      const a = c.at(s);
      const f = F(s, side * (a.hw + 6 + R() * 6), 7 + R() * 7, side * (PI / 2 - 0.4));
      frameOf(kit, f, 5 + R() * 4, 4 + R() * 4, '#c9a24e', pics[Math.floor(R() * pics.length)], glow);
      kit.add(G.cyl(0.03, 0.03, 30, 4), '#9aa0c8', { y: 17 }, { parent: f });
    }
    // the step drops: marble ledges at the banks where the river falls
    for (const z of c.zones) {
      const a = c.at(z.s0);
      const f = F(z.s0);
      for (const side of [-1, 1]) kit.add(G.box(5, 1.6, 1.4), '#e6dfcf', { x: side * (a.hw + 1.5), y: 0.6 }, { parent: f });
      kit.add(G.box(a.hw * 2 + 6, 0.5, 0.8), '#cfc6b2', { y: -0.25 }, { parent: f });
      anims.foam.push({ s: z.s0 + 2, d: 0 });
    }
    // a grand doorway at the source and at the end
    for (const s of [1, c.total - 1]) {
      const a = c.at(s);
      const f = F(s, 0, 0, s < 10 ? 0 : PI);
      const w = a.hw + 3;
      kit.add(G.box(3, 30, 3), '#e6dfcf', { x: -w, y: 15, z: 4 }, { parent: f });
      kit.add(G.box(3, 30, 3), '#e6dfcf', { x: w, y: 15, z: 4 }, { parent: f });
      kit.add(G.torus(w, 1.5, 24, 8, PI), '#e6dfcf', { y: 30, z: 4 }, { parent: f });
      kit.add(G.box(w * 2 + 40, 50, 2), '#1d2346', { y: 25, z: 7 }, { parent: f });
      glow.add(G.box(w * 2 - 2, 26, 0.4), '#3a4a9a', { y: 14, z: 5.6 }, { parent: f, glow: true, bright: 0.6 });
    }
    void rnd;
  },

  cloudbank(c, F, kit, glow, anims, rnd) {
    const R = srand(11);
    // banks of cloud, and clouds drifting above
    for (let s = 0; s < c.total; s += 11) {
      for (const side of [-1, 1]) {
        const a = c.at(s);
        cloud(kit, F(s, side * (a.hw + 5 + R() * 5), 1), 4 + R() * 3, '#e4e8fa', R, 5);
        if (R() < 0.35) cloud(kit, F(s, side * (a.hw + 16 + R() * 20), 10 + R() * 18), 5 + R() * 5, '#d6dcf4', R, 6);
      }
    }
    for (const is of c.islands) cloud(kit, F((is.s0 + is.s1) / 2, 0, 1.5), is.b * 1.2, '#eef0fb', R, 8);
    // kites on long strings
    for (const [s, side] of [[90, 1], [200, -1], [410, 1], [520, -1]]) {
      if (s > c.total) continue;
      const a = c.at(s);
      const f = F(s, side * (a.hw + 3), 0);
      const H = 26 + R() * 8;
      kit.add(G.cyl(0.04, 0.04, H, 4), '#f4ebd0', { y: H / 2, x: side * 4, rz: -side * 0.3 }, { parent: f });
      const k = new THREE.Matrix4().multiplyMatrices(f, new THREE.Matrix4().makeTranslation(side * 8, H, 0));
      kit.add(G.slab([[0, 3], [2, 0], [0, -4], [-2, 0]], 0.2), ['#F2A7B6', '#FFB547', '#9CC5A1'][Math.floor(R() * 3)], { ry: PI / 2 + 0.3 }, { parent: k });
      for (let j = 1; j < 6; j++) kit.add(G.box(0.6, 0.3, 0.05), '#E5533D', { y: -4 - j * 1.1, x: Math.sin(j) * 0.6, ry: PI / 2 }, { parent: k });
    }
    // the hot-air balloon drifting over the river
    const bs = c.islands[0] ? (c.islands[0].s0 + c.islands[0].s1) / 2 + 20 : 300;
    const bal = new THREE.Group();
    const bkit = createKit();
    const stripes = ['#E5533D', '#F4EBD0', '#FFB547', '#F4EBD0'];
    for (let k = 0; k < 8; k++) bkit.add(G.sphere(7, 6, 14, ), stripes[k % 4], { ry: (k / 8) * PI * 2, sx: 0.42, sy: 1.12 });
    bkit.add(G.box(3, 2, 3), '#7a4d33', { y: -11.5 });
    for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) bkit.add(G.cyl(0.05, 0.05, 4, 4), '#3a2418', { x, z, y: -9 });
    const bg = bkit.build('balloon');
    bal.add(bg);
    const flame = part(G.cone(0.6, 1.6, 8), '#ffb547', { basic: true });
    flame.position.y = -9.2;
    flame.rotation.x = PI;
    bal.add(flame);
    const bp = c.point(bs, -2);
    bal.position.set(bp.x, 24, bp.z);
    anims.objects.push(bal);
    anims.ticks.push((now) => {
      bal.position.y = 24 + Math.sin(now * 0.4) * 1.5;
      bal.rotation.y = now * 0.05;
      flame.scale.setScalar(0.8 + Math.sin(now * 17) * 0.2);
    });
    anims.lights.push(new THREE.Vector3(bp.x, 15, bp.z));
    gate(kit, F, c, 1, '#c9cfec', 24);
    gate(kit, F, c, c.total - 1, '#c9cfec', 24);
    void rnd;
    void glow;
  },

  library(c, F, kit, glow, anims, rnd) {
    const R = srand(13);
    const spines = ['#7a2e34', '#2f5a4a', '#2e3f73', '#8a6a2e', '#5a2e5e', '#a0603a', '#3a3a3a', '#c9b48e'];
    // bookshelf cliffs on both banks
    alongBanks(c, 0, c.total, 14, 6, (s, side, d) => {
      const f = F(s, d);
      const H = 26;
      kit.add(G.box(1, H, 14.2), '#3b2418', { x: side * 3.2, y: H / 2 }, { parent: f });
      for (let k = 0; k <= 4; k++) kit.add(G.box(6.4, 0.5, 14.2), '#5a3826', { y: 0.25 + k * 6, x: side * 0.1 }, { parent: f });
      for (let k = 0; k < 4; k++) {
        let z = -6.6;
        while (z < 6.4) {
          const w = 0.7 + R() * 0.9;
          const h = 3.6 + R() * 1.9;
          if (R() < 0.08) {
            kit.add(G.box(5, w, h), spines[Math.floor(R() * spines.length)], { y: 0.5 + k * 6 + w / 2, z: z + h / 2, x: side * -0.2, rx: PI / 2 }, { parent: f });
            z += h + 0.1;
          } else {
            kit.add(G.box(5, h, w), spines[Math.floor(R() * spines.length)], { y: 0.5 + k * 6 + h / 2, z: z + w / 2, x: side * -0.3 + (R() - 0.5) * 0.4, rx: (R() < 0.1 ? 0.15 : 0) }, { parent: f });
            z += w + 0.05;
          }
        }
      }
      kit.add(G.box(7, 1.2, 14.6), '#3b2418', { y: H + 0.6 }, { parent: f });
    });
    // open books over the islands (the split runs through a book's spine)
    for (const is of c.islands) {
      const m = (is.s0 + is.s1) / 2;
      const f = F(m, 0, 0.9);
      const len = is.s1 - is.s0 + 6;
      for (const side of [-1, 1]) {
        kit.add(G.box(is.b * 1.25, 0.6, len), '#f1e6cc', { x: side * is.b * 0.55, y: 0.9, rz: side * -0.22 }, { parent: f });
        kit.add(G.box(is.b * 1.3, 0.25, len + 0.6), '#7a2e34', { x: side * is.b * 0.56, y: 0.45, rz: side * -0.22 }, { parent: f });
      }
      for (let k = 0; k < 6; k++) kit.add(G.box(is.b * 0.9, 0.03, 0.12), '#5a4a3a', { x: (k % 2 ? 1 : -1) * is.b * 0.55, y: 1.3, z: -len / 3 + (k >> 1) * len / 3, rz: (k % 2 ? -0.22 : 0.22) }, { parent: f });
    }
    // the reading lamp
    const s0 = 330;
    const a = c.at(s0);
    const lf = F(s0, a.hw + 4.5, 0, PI);
    kit.add(G.cyl(2.6, 3, 1, 18), '#2f5a4a', { x: 2 }, { parent: lf });
    kit.add(G.cyl(0.35, 0.35, 16, 8), '#c9a24e', { x: 2, y: 8, rz: 0.15 }, { parent: lf });
    kit.add(G.cyl(0.3, 0.3, 10, 8), '#c9a24e', { x: -1.5, y: 16, rz: 1.1 }, { parent: lf });
    kit.add(G.cyl(1.4, 4, 3.5, 20, true), '#2f6a52', { x: -6, y: 13.5, rz: 0.2 }, { parent: lf });
    glow.add(G.cyl(1.3, 3.9, 0.1, 20), '#ffe6a8', { x: -6.3, y: 11.9, rz: 0.2 }, { parent: lf, glow: true, bright: 2.4 });
    anims.lights.push(new THREE.Vector3(-6.5, 10, 0).applyMatrix4(lf));
    // a giant open book the river flows off
    const bf = F(1, 0);
    for (const side of [-1, 1]) kit.add(G.box(28, 1.2, 22), '#f1e6cc', { x: side * 14, y: 4 + Math.abs(side) * 2, z: 10, rz: side * -0.25 }, { parent: bf });
    kit.add(G.box(60, 1, 24), '#7a2e34', { y: 1, z: 10 }, { parent: bf });
    gate(kit, F, c, c.total - 1, '#3b2418', 26);
    void rnd;
  },

  clockwork(c, F, kit, glow, anims, rnd) {
    const R = srand(17);
    const brass = '#c9a24e';
    // giant clock faces with hands that keep the beat
    const faces = [[60, -1], [250, 1], [470, -1], [640, 1]];
    for (const [s, side] of faces) {
      if (s > c.total) continue;
      const a = c.at(s);
      const f = F(s, side * (a.hw + 10), 0, side * PI / 2);
      const Rr = 10;
      kit.add(G.cyl(Rr + 1, Rr + 1, 1.6, 40), '#7d6740', { y: Rr + 2, rx: PI / 2, z: 0.4 }, { parent: f });
      kit.add(G.cyl(Rr, Rr, 1.7, 40), '#f4ebd0', { y: Rr + 2, rx: PI / 2 }, { parent: f });
      for (let k = 0; k < 12; k++) {
        const an = (k / 12) * PI * 2;
        kit.add(G.box(k % 3 ? 0.4 : 0.8, 1.8, 0.3), '#2a2522', { x: Math.sin(an) * (Rr - 1.4), y: Rr + 2 + Math.cos(an) * (Rr - 1.4), z: -0.95, rz: -an }, { parent: f });
      }
      kit.add(G.box(6, Rr + 2, 6), '#5a4a30', { y: (Rr + 2) / 2, z: 3 }, { parent: f });
      // hands (moving)
      const hands = new THREE.Group();
      hands.applyMatrix4(f);
      const centre = new THREE.Group();
      centre.position.set(0, Rr + 2, -1.1);
      hands.add(centre);
      const minute = part(G.box(0.5, Rr * 0.85, 0.2), '#2a2522');
      minute.geometry.translate(0, Rr * 0.42, 0);
      const hour = part(G.box(0.8, Rr * 0.55, 0.2), '#2a2522');
      hour.geometry.translate(0, Rr * 0.27, 0);
      const second = part(G.box(0.18, Rr * 0.9, 0.15), '#E5533D');
      second.geometry.translate(0, Rr * 0.35, 0);
      centre.add(minute, hour, second);
      anims.objects.push(hands);
      const off = R() * 12;
      anims.ticks.push((now, B) => {
        minute.rotation.z = -(now * 0.05 + off);
        hour.rotation.z = -(now * 0.004 + off / 12);
        // the second hand ticks on every beat
        const b = Math.floor(B);
        const f2 = B - b;
        second.rotation.z = -((b + Math.min(1, f2 * 6)) * (PI / 15));
      });
    }
    // gears turning on the banks
    for (let s = 30, k = 0; s < c.total - 20; s += 45, k++) {
      const side = k % 2 ? 1 : -1;
      const a = c.at(s);
      const f = F(s, side * (a.hw + 5 + R() * 6), 0, side * PI / 2);
      const rr = 4 + R() * 4;
      const g = part(G.cog(rr, 1.2, 12 + Math.floor(rr * 1.5), 0.8), k % 3 ? brass : '#b08a3e', { metal: 0.75, rough: 0.35 });
      g.rotation.x = PI / 2;
      const holder = new THREE.Group();
      holder.applyMatrix4(f);
      holder.add(g);
      g.position.y = rr * 0.55;
      anims.objects.push(holder);
      const dir = k % 2 ? 1 : -1;
      anims.ticks.push((now) => {
        g.rotation.y = now * 0.25 * dir * (6 / rr);
      });
    }
    // the clock tower at the source, a clock face at the end
    const tf = F(1, 0);
    const w = c.at(1).hw + 4;
    kit.add(G.box(10, 40, 10), '#4d3e28', { x: -w - 5, y: 20, z: 6 }, { parent: tf });
    kit.add(G.box(10, 40, 10), '#4d3e28', { x: w + 5, y: 20, z: 6 }, { parent: tf });
    kit.add(G.box(w * 2 + 20, 14, 10), '#4d3e28', { y: 33, z: 6 }, { parent: tf });
    kit.add(G.cyl(6, 6, 1, 32), '#f4ebd0', { y: 33, z: 0.6, rx: PI / 2 }, { parent: tf });
    glow.add(G.torus(6.3, 0.25, 32, 6), '#ffd27a', { y: 33, z: 0.4 }, { parent: tf, glow: true, bright: 1.5 });
    gate(kit, F, c, c.total - 1, '#4d3e28', 24);
    void rnd;
  },

  stars(c, F, kit, glow, anims, rnd) {
    const R = srand(19);
    // constellations over the islands
    for (const is of c.islands) {
      const m = (is.s0 + is.s1) / 2;
      const pts = [];
      for (let k = 0; k < 6; k++) pts.push([(R() - 0.5) * is.b * 1.4, 3 + R() * 6, (k / 5 - 0.5) * (is.s1 - is.s0) * 0.8]);
      const f = F(m, 0);
      for (const p of pts) glow.add(G.star(0.7, 0.2), '#fff3c8', { x: p[0], y: p[1], z: p[2], ry: PI / 2 }, { parent: f, glow: true, bright: 2.2 });
      for (let k = 0; k < pts.length - 1; k++) {
        const a = new THREE.Vector3(...pts[k]);
        const b = new THREE.Vector3(...pts[k + 1]);
        const len = a.distanceTo(b);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const dir = b.clone().sub(a).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const mm = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
        glow.add(G.cyl(0.05, 0.05, len, 4), '#9fb4ff', mm, { parent: f, glow: true, bright: 1.2 });
      }
    }
    // stars floating over the banks
    for (let s = 10; s < c.total; s += 13) {
      for (const side of [-1, 1]) {
        if (R() < 0.4) continue;
        const a = c.at(s);
        glow.add(G.star(0.5 + R() * 1.2, 0.3), R() < 0.7 ? '#fff3c8' : '#cfd8ff', { x: 0, y: 2 + R() * 10, rz: R() * PI, ry: R() * PI }, { parent: F(s, side * (a.hw + 3 + R() * 14)), glow: true, bright: 2 });
      }
    }
    // a ringed planet and a small moon
    const pf = F(c.total * 0.45, -(c.at(c.total * 0.45).hw + 60), 40);
    kit.add(G.sphere(18, 28, 20), '#7a6ab0', {}, { parent: pf });
    kit.add(G.torus(28, 2.2, 48, 4), '#c9b8f0', { rx: PI / 2 - 0.35, sz: 0.2 }, { parent: pf });
    const mf = F(c.total * 0.7, c.at(c.total * 0.7).hw + 45, 30);
    kit.add(G.sphere(8, 20, 14), '#cfd2e8', {}, { parent: mf });
    // the crescent moon gates
    for (const s of [1, c.total - 1]) {
      const a = c.at(s);
      const f = F(s, 0, 0);
      glow.add(G.torus(a.hw + 8, 1.6, 40, 10, PI * 1.25), '#fff1c8', { y: 0, rz: -PI * 0.125, z: 3 }, { parent: f, glow: true, bright: 1.6 });
    }
    void rnd;
  },

  morning(c, F, kit, glow, anims, rnd) {
    const R = srand(23);
    // folds of the quilt the rapids run down
    for (const z of c.zones) {
      for (let s = z.s0; s < z.s1; s += 8) {
        const a = c.at(s);
        for (const side of [-1, 1]) {
          if (z.side !== 0 && z.side !== side) continue;
          kit.add(G.capsule(1.2, 6, 10), ['#c46e64', '#e2b46a', '#8fb39a', '#7f8cc4'][Math.floor(R() * 4)], { x: side * (a.hw + 2.4), y: 0.6, rx: PI / 2, rz: 0.2 * side }, { parent: F(s) });
        }
      }
    }
    // the alarm clock, ringing on the beat
    const s0 = 300;
    const a = c.at(s0);
    const af = F(s0, a.hw + 13, 0, -PI / 2);
    const clock = new THREE.Group();
    clock.applyMatrix4(af);
    const ckit = createKit();
    ckit.add(G.cyl(7, 7, 4, 32), '#E5533D', { y: 9, rx: PI / 2 });
    ckit.add(G.cyl(6, 6, 4.2, 32), '#f4ebd0', { y: 9, rx: PI / 2 });
    for (const x of [-4, 4]) ckit.add(G.cyl(0.4, 0.4, 3, 6), '#c9a24e', { x, y: 1.5, rz: x * 0.06 });
    for (let k = 0; k < 12; k++) {
      const an = (k / 12) * PI * 2;
      ckit.add(G.box(0.4, 1.2, 0.3), '#2a2522', { x: Math.sin(an) * 5, y: 9 + Math.cos(an) * 5, z: -2.15, rz: -an });
    }
    ckit.add(G.box(0.5, 4.5, 0.3), '#2a2522', { y: 10.8, z: -2.25 });
    ckit.add(G.box(0.6, 3.6, 0.3), '#2a2522', { x: 1.4, y: 9.5, z: -2.25, rz: -1.2 });
    clock.add(ckit.build('alarm'));
    const bells = [-1, 1].map((side) => {
      const b = part(G.half(2.6, 16, 8), '#c9a24e', { metal: 0.8, rough: 0.3 });
      b.position.set(side * 3.6, 16.5, 0);
      b.rotation.z = side * -0.5;
      clock.add(b);
      return b;
    });
    const hammer = part(G.box(0.4, 3, 0.4), '#c9a24e', { metal: 0.8, rough: 0.3 });
    hammer.position.set(0, 17.6, 0);
    clock.add(hammer);
    anims.objects.push(clock);
    anims.ticks.push((now, B) => {
      const f = B - Math.floor(B);
      const ring = Math.exp(-f * 6);
      hammer.rotation.z = Math.sin(B * PI) * 0.5;
      bells.forEach((b, i) => {
        b.rotation.z = (i ? -0.5 : 0.5) + Math.sin(now * 60) * 0.06 * ring;
      });
      clock.rotation.z = Math.sin(now * 40) * 0.01 * ring;
    });
    // the curtains around the sunrise window at the end
    const wf = F(c.total - 1, 0);
    const half = c.at(c.total - 1).hw + 8;
    for (const side of [-1, 1]) {
      for (let k = 0; k < 5; k++) kit.add(G.cyl(1.4, 1.6, 44, 10), k % 2 ? '#c46e64' : '#b05a52', { x: side * (half + 2 + k * 2.4), y: 22, z: 2 }, { parent: wf });
      kit.add(G.box(40, 50, 2), '#6a5070', { x: side * (half + 34), y: 25, z: 4 }, { parent: wf });
    }
    kit.add(G.box(half * 2 + 80, 8, 2), '#6a5070', { y: 46, z: 4 }, { parent: wf });
    kit.add(G.cyl(0.6, 0.6, half * 2 + 30, 10), '#c9a24e', { y: 44, rz: PI / 2, z: 1.5 }, { parent: wf });
    // pillows and a slipper on the banks, a sleeping lamp
    for (let s = 40; s < c.total - 30; s += 40) {
      const side = Math.floor(s / 40) % 2 ? 1 : -1;
      const aa = c.at(s);
      kit.add(G.rbox(9, 3, 6, 1.4), R() < 0.5 ? '#f4ebd0' : '#F2A7B6', { x: side * (aa.hw + 8 + R() * 6), y: 1.5, ry: R() }, { parent: F(s) });
    }
    const lf = F(140, -(c.at(140).hw + 9));
    lamp(kit, lf, 14, '#7f8cc4', glow);
    // the window frame the river came in through
    const sf = F(1, 0);
    const h0 = c.at(1).hw + 6;
    for (const x of [-h0, h0]) kit.add(G.box(1.6, 28, 2.2), '#e9dfc8', { x, y: 14, z: 2 }, { parent: sf });
    kit.add(G.box(h0 * 2 + 1.6, 1.6, 2.2), '#e9dfc8', { y: 28, z: 2 }, { parent: sf });
    kit.add(G.box(120, 50, 2), '#6a5070', { y: 25, z: 5 }, { parent: sf });
    void rnd;
  },
};

/**
 * Build a dream's set pieces for a course. Returns { group, lights (extra light positions for the pool), foam (spots
 * of white water), tick(now, B) }.
 */
export function createDream(course, id) {
  const F = frames(course);
  const kit = createKit();
  const glow = createKit();
  const anims = { objects: [], ticks: [], lights: [], foam: [] };
  const fn = BUILD[id] ?? BUILD.bedtime;
  fn(course, F, kit, glow, anims, srand(1));
  const group = new THREE.Group();
  group.name = `dream-${id}`;
  const solid = kit.build('set');
  group.add(solid);
  const g = glow.build('set-glow');
  // the glow kit is all emissive: move its meshes over as basic
  if (g.userData.solid) {
    g.userData.solid.material = new THREE.MeshBasicMaterial({ vertexColors: true });
    g.userData.solid.castShadow = false;
  }
  group.add(g);
  for (const o of anims.objects) group.add(o);
  return {
    group,
    lights: anims.lights,
    foam: anims.foam,
    tick(now, B) {
      for (const t of anims.ticks) t(now, B);
    },
  };
}
