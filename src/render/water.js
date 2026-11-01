// The river's surface: one mesh along the course and a shader that mirrors the world (a planar reflection broken up by
// flowing waves), with Fresnel, deep and shallow water, a lapping shoreline, moon glitter, rapids, whirlpools, wakes,
// rings left by every oar blade, and the game's signature: the beat swells rolling down the river onto the oars.

import * as THREE from 'three';
import { NO_MIRROR } from './world.js';

export const RIPPLES = 10;
export const RINGS = 16;
/** Swell types (packed with the judgement into one number: kind + 4 * type). */
export const SWELL = { plain: 0, gold: 1, drop: 2 };
/** Ring kinds. */
export const RING = { splash: 0, perfect: 1, good: 2, pull: 3, bloom: 4 };
/** Where the blades enter the water, from the boat's middle. */
export const OAR_REACH = 2.05;
export const OAR_AHEAD = 0.55;

const VERT = /* glsl */ `
attribute vec2 aSD; attribute float aHW; attribute float aRap; attribute vec2 aDir;
varying vec2 vSD; varying float vHW; varying float vRap; varying vec2 vDir; varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vSD = aSD; vHW = aHW; vRap = aRap; vDir = aDir;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uDeep; uniform vec3 uWater; uniform vec3 uShallow; uniform vec3 uFoam;
uniform vec3 uMoonDir; uniform vec3 uMoonCol; uniform vec3 uSkyTop; uniform vec3 uSkyBot;
uniform sampler2D uMirror; uniform mat4 uMirrorMatrix; uniform float uMirrorOn; uniform float uReflect;
uniform vec4 uRip[${RIPPLES}]; uniform vec4 uOar; uniform vec4 uRing[${RINGS}]; uniform vec4 uLights[4]; uniform vec3 uLightCol;
uniform vec4 uWhirl[4]; uniform vec4 uBoats[6]; uniform float uStars; uniform float uMoonBelow; uniform float uCalm;
varying vec2 vSD; varying float vHW; varying float vRap; varying vec2 vDir; varying vec3 vWorld;
#include <fog_pars_fragment>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
// the gradient of a little noise, by differences
vec2 ngrad(vec2 p) {
  float n = noise(p);
  return vec2(noise(p + vec2(0.07, 0.0)) - n, noise(p + vec2(0.0, 0.07)) - n) / 0.07;
}

void main() {
  float s = vSD.x; float d = vSD.y;
  float flow = uTime * (0.55 + 1.7 * vRap);
  vec2 fdir = vDir;
  vec2 q = vWorld.xz - fdir * flow;
  float ad = abs(d);
  float chop = (0.5 + vRap * 1.7) * (1.0 - uCalm * 0.6);
  // waves: long swells across the current, then small noise chop
  vec2 g = vec2(0.0);
  g += vec2(0.9, 0.35) * cos(dot(q, vec2(0.9, 0.35)) * 1.1 + uTime * 1.3) * 0.10;
  g += vec2(-0.45, 1.1) * cos(dot(q, vec2(-0.45, 1.1)) * 1.6 + uTime * 1.7) * 0.07;
  g += vec2(1.3, -0.9) * cos(dot(q, vec2(1.3, -0.9)) * 2.7 + uTime * 2.2) * 0.04;
  g += ngrad(q * 1.7 + vec2(uTime * 0.2, 0.0)) * 0.05;
  g += ngrad(q * 4.3 - vec2(0.0, uTime * 0.35)) * 0.025;
  g *= chop;

  // ---- the beat swells: a crest rolling down the river that catches the light
  float lat = d - uOar.y;
  float latF = mix(0.35, 1.0, exp(-lat * lat / 30.0));
  vec3 glowAdd = vec3(0.0);
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRip[i];
    if (r.y <= 0.0) continue;
    float type = floor(r.z / 4.0 + 0.01);
    float kind = r.z - type * 4.0;
    float cs = r.x + 0.025 * lat * lat;
    float dist = s - cs;
    if (abs(dist) > 4.0) continue;
    float w = (type > 1.5 ? 0.32 : type > 0.5 ? 0.62 : 0.5) * (1.0 + r.w * 1.2);
    float h = exp(-dist * dist / (w * w));
    float reach = type > 1.5 ? exp(-lat * lat / 6.0) : latF;
    float amp = r.y * reach;
    // tilt the water along the current: a real crest for the mirror to bend
    g += fdir * (-2.0 * dist / (w * w)) * h * amp * (type > 0.5 && type < 1.5 ? 0.42 : 0.28) * (1.0 - r.w);
    float spark = pow(noise(vec2(lat * 6.0, dist * 4.0 + uTime * 3.0)), 5.0) * 2.5;
    vec3 c = vec3(0.62, 0.7, 0.95) * (0.28 + spark * 0.5);
    if (type > 0.5 && type < 1.5) c = vec3(1.0, 0.72, 0.28) * (0.75 + spark);
    if (type > 1.5) c = vec3(0.85, 0.9, 1.0) * (0.35 + spark * 0.8) * step(0.45, fract(lat * 0.9 + 0.2));
    if (kind > 0.5 && kind < 1.5) c = vec3(1.0, 0.93, 0.75) * (1.6 + spark);
    else if (kind > 1.5 && kind < 2.5) c = vec3(1.0, 0.62, 0.22) * (1.1 + spark * 0.5);
    else if (kind > 2.5) c = vec3(0.9, 0.28, 0.2) * 0.9 * step(0.5, fract(lat * 0.45 + 0.25)) * (1.0 - r.w);
    glowAdd += c * h * amp;
  }
  // ---- rings left by the blades
  for (int i = 0; i < ${RINGS}; i++) {
    vec4 rg = uRing[i];
    float age = uTime - rg.z;
    if (age < 0.0 || age > 1.8) continue;
    vec2 dv = vWorld.xz - rg.xy;
    float dd = length(dv);
    float big = rg.w > 2.5 && rg.w < 3.5 ? 1.6 : 1.0;
    float rad = 0.2 + age * 1.7 * big;
    if (abs(dd - rad) > 0.8) continue;
    float band = (dd - rad) / (0.16 * big);
    float life = 1.0 - age / (1.8);
    float hh = exp(-band * band) * life;
    g += (dv / max(dd, 0.01)) * (-2.0 * band / 0.16) * hh * 0.035 * big;
    vec3 rc = vec3(0.0);
    if (rg.w > 0.5 && rg.w < 1.5) rc = vec3(1.0, 0.9, 0.68) * 0.55;
    else if (rg.w > 1.5 && rg.w < 2.5) rc = vec3(1.0, 0.62, 0.25) * 0.3;
    else if (rg.w > 2.5 && rg.w < 3.5) rc = vec3(1.0, 0.76, 0.35) * 0.8;
    else if (rg.w > 3.5) rc = vec3(0.85, 0.75, 1.0) * 0.6;
    glowAdd += rc * hh * life * life;
  }
  // ---- boats: wakes and bow waves bend the water
  float foam = 0.0;
  float shade = 1.0;
  for (int i = 0; i < 6; i++) {
    vec4 b = uBoats[i];
    if (b.w < 0.0) continue;
    vec2 f = vec2(sin(b.z), -cos(b.z));
    vec2 rr = vec2(cos(b.z), sin(b.z));
    vec2 dv = vWorld.xz - b.xy;
    float along = dot(dv, f);
    float across = dot(dv, rr);
    if (along > 4.0 || along < -30.0 || abs(across) > 12.0) continue;
    shade *= 1.0 - exp(-(along * along) / 3.0 - (across * across) / 0.55) * 0.5;
    float sp = clamp(b.w / 6.0, 0.0, 1.0);
    if (along < -1.3) {
      float back = -along - 1.3;
      float spread = 0.6 + back * 0.33;
      float vq = (abs(across) - spread) / (0.22 + back * 0.035);
      float vline = exp(-vq * vq);
      float fade = exp(-back * 0.14) * sp;
      // the V's crest: tilt across it, and a little broken foam
      g += rr * sign(across) * (-2.0 * vq) * vline * fade * 0.12;
      foam += vline * fade * 0.35 * (0.5 + 0.5 * noise(vec2(back * 2.5, across * 3.0 + uTime)));
      float churn = exp(-across * across / 0.45) * exp(-back * 0.4) * sp;
      foam += churn * 0.45 * noise(vec2(back * 3.0 - uTime * 2.0, across * 4.0));
    } else if (along < 2.4) {
      // the bow wave curling off each side
      float bq = (abs(across) - 0.75 - (1.9 - along) * 0.25) / 0.16;
      foam += exp(-bq * bq) * smoothstep(-1.3, 0.6, along) * smoothstep(2.4, 1.2, along) * sp * 0.6;
    }
  }
  // ---- whirlpools
  float whirl = 0.0;
  float whirlArm = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 w = uWhirl[i];
    if (w.w <= 0.0) continue;
    vec2 dv = vWorld.xz - w.xy;
    float r = length(dv);
    if (r > w.z) continue;
    float k = 1.0 - r / w.z;
    float a = atan(dv.y, dv.x);
    whirl = max(whirl, k);
    whirlArm += pow(0.5 + 0.5 * sin(a * 3.0 + r * 1.6 - uTime * 3.5), 6.0) * k * w.w;
    g += vec2(-dv.y, dv.x) / max(r, 0.1) * k * 0.4;
  }

  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float NdV = max(dot(N, V), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
  float dist = length(cameraPosition - vWorld);
  // what is in the water: deep in the middle, lighter near the banks
  float shallow = smoothstep(vHW - 3.5, vHW, ad);
  vec3 body = mix(uDeep, uWater, 0.2 + 0.3 * (1.0 - NdV));
  body = mix(body, uShallow, shallow * 0.45);
  // what the water mirrors
  vec3 R = reflect(-V, N);
  vec3 refl;
  if (uMirrorOn > 0.5) {
    vec4 mc = uMirrorMatrix * vec4(vWorld, 1.0);
    vec2 muv = mc.xy / mc.w + N.xz * (0.045 / (1.0 + dist * 0.015));
    refl = texture2D(uMirror, clamp(muv, 0.001, 0.999)).rgb;
  } else {
    refl = mix(uSkyBot, uSkyTop, smoothstep(0.0, 0.7, R.y));
  }
  float mixR = clamp(fres * 1.1 + uReflect, 0.0, 0.92);
  vec3 col = mix(body, refl, mixR);
  // moon glitter: tiny bright glints where the waves face the moon
  float m = max(dot(R, normalize(uMoonDir)), 0.0);
  float glint = pow(m, 1400.0) * step(0.72, noise(vWorld.xz * 7.0 + uTime * 1.5));
  col += uMoonCol * (glint * 2.2 + pow(m, 60.0) * 0.05 * (1.0 - uMirrorOn)) * (1.0 - uMoonBelow);
  // the sea of stars: the sky below
  if (uStars > 0.0) {
    vec3 down = -V;
    vec2 sp = down.xz / max(0.05, -down.y) * 40.0 + vec2(0.0, uTime * 0.3) + N.xz * 0.6;
    vec2 cell = floor(sp);
    float hs = hash(cell);
    vec2 c = fract(sp) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
    float star = step(0.93, hs) * smoothstep(0.12, 0.0, length(c)) * (0.6 + 0.4 * sin(uTime * 2.0 + hs * 40.0));
    col += vec3(0.85, 0.9, 1.0) * star * uStars * 1.4;
    vec3 below = normalize(vec3(uMoonDir.x, -abs(uMoonDir.y), uMoonDir.z));
    float md = dot(down, below);
    col += vec3(0.95, 0.93, 0.85) * (smoothstep(0.9975, 0.9985, md) * 1.6 + pow(max(md, 0.0), 60.0) * 0.4) * uMoonBelow;
  }
  // the banks: a dark wet edge and a line of lapping foam
  col *= 1.0 - smoothstep(vHW - 1.6, vHW + 0.2, ad) * 0.35;
  float lapLine = abs(ad - (vHW - 0.35 + 0.18 * sin(s * 0.7 + uTime * 1.1) + 0.12 * sin(s * 2.3 - uTime * 1.7)));
  float lap = exp(-lapLine * lapLine / 0.012) * (0.4 + 0.6 * noise(vec2(s * 2.0 - uTime * 0.6, d * 3.0)));
  foam += lap * 0.4;
  // rapids: churned water, long foam streaks and white standing waves
  if (vRap > 0.01) {
    float n1 = noise(vec2(d * 2.6, (s - flow * 1.4) * 0.35));
    float n2 = noise(vec2(d * 5.3 + 3.0, (s - flow * 1.8) * 0.9));
    float streak = smoothstep(0.62, 0.86, n1 * 0.65 + n2 * 0.35);
    float crest = pow(0.5 + 0.5 * cos(6.2831853 * s / 7.0), 12.0) * smoothstep(0.35, 0.75, noise(vec2(d * 1.8, s * 0.3 + uTime * 1.5)));
    col = mix(col, uDeep * 1.2, 0.25 * vRap);
    foam += (streak * 0.6 + crest * 0.8) * vRap;
  }
  col = mix(col, uDeep * 0.4, whirl * 0.6);
  foam += whirlArm * 0.6;
  col *= shade;
  // foam is lit by the moon and the sky, never pure white
  col = mix(col, uFoam * (0.55 + 0.25 * N.y), clamp(foam, 0.0, 0.75));
  // warm light on the water from the lanterns nearest the camera (their own reflections are in the mirror)
  vec2 vxz = normalize(cameraPosition.xz - vWorld.xz + vec2(1e-4));
  vec2 vperp = vec2(-vxz.y, vxz.x);
  for (int i = 0; i < 4; i++) {
    vec4 L = uLights[i];
    if (L.z <= 0.0) continue;
    vec2 dv = vWorld.xz - L.xy;
    float along = dot(dv, vxz);
    float across = dot(dv, vperp);
    float streak = exp(-across * across * 3.0 - along * along * 0.03) * (0.5 + 0.5 * sin(along * 3.0 - uTime * 3.0 + N.x * 10.0));
    float pool = exp(-dot(dv, dv) * 0.08);
    col += uLightCol * (streak * 0.16 + pool * 0.08) * L.z;
  }
  // the oar marks: two small lights on the water where the blades go in
  if (uOar.w > 0.5) {
    for (int k = 0; k < 2; k++) {
      float side = k == 0 ? -1.0 : 1.0;
      vec2 mv = vec2((s - uOar.x - ${OAR_AHEAD.toFixed(2)}) / 0.62, (d - uOar.y - side * ${OAR_REACH.toFixed(2)}) / 0.4);
      float rr = length(mv);
      float ringR = 0.95 - uOar.z * 0.25;
      float ring = exp(-pow((rr - ringR) / 0.12, 2.0));
      float core = exp(-rr * rr * 3.0);
      glowAdd += vec3(1.0, 0.9, 0.7) * (ring * (0.22 + uOar.z * 1.1) + core * (0.05 + uOar.z * 0.5));
    }
  }
  col += glowAdd;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** The river surface of a course. */
export function createWater(course, theme) {
  const STEP = 1;
  const J = 16;
  const rows = Math.floor(course.total / STEP) + 1;
  const pos = new Float32Array(rows * (J + 1) * 3);
  const sd = new Float32Array(rows * (J + 1) * 2);
  const hw = new Float32Array(rows * (J + 1));
  const rap = new Float32Array(rows * (J + 1));
  const dir = new Float32Array(rows * (J + 1) * 2);
  let v = 0;
  for (let r = 0; r < rows; r++) {
    const s = Math.min(course.total, r * STEP);
    const a = course.at(s);
    const half = a.hw + 1.4;
    for (let j = 0; j <= J; j++) {
      const d = -half + (2 * half * j) / J;
      const p = course.point(s, d);
      pos[v * 3] = p.x;
      pos[v * 3 + 1] = 0;
      pos[v * 3 + 2] = p.z;
      sd[v * 2] = s;
      sd[v * 2 + 1] = d;
      hw[v] = a.hw;
      rap[v] = course.rapidsAt(s, d);
      dir[v * 2] = Math.sin(a.h);
      dir[v * 2 + 1] = -Math.cos(a.h);
      v++;
    }
  }
  const idx = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let j = 0; j < J; j++) {
      const a = r * (J + 1) + j;
      const b = a + 1;
      const c = a + J + 1;
      const e = c + 1;
      idx.push(a, b, c, b, e, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSD', new THREE.BufferAttribute(sd, 2));
  geo.setAttribute('aHW', new THREE.BufferAttribute(hw, 1));
  geo.setAttribute('aRap', new THREE.BufferAttribute(rap, 1));
  geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(theme.deep) },
      uWater: { value: new THREE.Color(theme.water) },
      uShallow: { value: new THREE.Color(theme.shallow ?? theme.water) },
      uFoam: { value: new THREE.Color(theme.foam) },
      uMoonDir: { value: new THREE.Vector3(0, 0.4, -1) },
      uMoonCol: { value: new THREE.Color(theme.moon.color) },
      uSkyTop: { value: new THREE.Color(theme.skyMid) },
      uSkyBot: { value: new THREE.Color(theme.skyBot) },
      uMirror: { value: null },
      uMirrorMatrix: { value: new THREE.Matrix4() },
      uMirrorOn: { value: 0 },
      uReflect: { value: theme.reflect ?? 0.1 },
      uRip: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uOar: { value: new THREE.Vector4(0, 0, 0, 0) },
      uRing: { value: Array.from({ length: RINGS }, () => new THREE.Vector4(0, 0, -99, 0)) },
      uLights: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uLightCol: { value: new THREE.Color(theme.lantern).multiplyScalar(0.9) },
      uWhirl: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uBoats: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, -1)) },
      uStars: { value: theme.moon.below ? 1 : 0 },
      uMoonBelow: { value: theme.moon.below ? 1 : 0 },
      uCalm: { value: 0 },
    },
  ]);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.name = 'water';
  mesh.layers.set(NO_MIRROR);

  course.whirls.slice(0, 4).forEach((w, i) => uniforms.uWhirl.value[i].set(w.x, w.z, w.r * 1.15, 1));

  const U = uniforms;
  let ringNext = 0;
  return {
    mesh,
    uniforms: U,
    setMoon(dir) {
      U.uMoonDir.value.copy(dir);
    },
    /** The world's mirror (null: the cheap sky instead). */
    setMirror(mirror) {
      U.uMirrorOn.value = mirror?.on ? 1 : 0;
      if (mirror?.on) {
        // by reference: the world updates both just before it draws the frame
        U.uMirror.value = mirror.rt.texture;
        U.uMirrorMatrix.value = mirror.matrix;
      }
    },
    /** ripples: [{ s, strength, kind (0 coming, 1 perfect, 2 good, 3 missed), type (SWELL), grow }] */
    setRipples(list) {
      for (let i = 0; i < RIPPLES; i++) {
        const r = list[i];
        if (r) U.uRip.value[i].set(r.s, r.strength, (r.kind ?? 0) + 4 * (r.type ?? 0), r.grow ?? 0);
        else U.uRip.value[i].set(0, 0, 0, 0);
      }
    },
    /** A ring spreading from (x, z) from now on (time: the shader's clock). */
    ring(x, z, time, kind = RING.splash) {
      U.uRing.value[ringNext].set(x, z, time, kind);
      ringNext = (ringNext + 1) % RINGS;
    },
    clearRings() {
      for (const r of U.uRing.value) r.set(0, 0, -99, 0);
    },
    setOar(s, d, glow, on = true) {
      U.uOar.value.set(s, d, glow, on ? 1 : 0);
    },
    setLights(list) {
      for (let i = 0; i < 4; i++) {
        const l = list[i];
        if (l) U.uLights.value[i].set(l.x, l.z, l.i, 0);
        else U.uLights.value[i].set(0, 0, 0, 0);
      }
    },
    setBoats(list) {
      for (let i = 0; i < 6; i++) {
        const b = list[i];
        if (b) U.uBoats.value[i].set(b.x, b.z, b.h, b.v);
        else U.uBoats.value[i].set(0, 0, 0, -1);
      }
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
