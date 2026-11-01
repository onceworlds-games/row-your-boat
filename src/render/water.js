// The river's surface: one mesh along the course and a shader that does the moon path, the current, foam in rapids and
// at the banks, wakes, whirlpools, lantern streaks, and the game's signature: the beat ripples rolling onto the oars.

import * as THREE from 'three';

export const RIPPLES = 8;

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
uniform float uTime; uniform vec3 uDeep; uniform vec3 uWater; uniform vec3 uFoam; uniform vec3 uMoonDir; uniform vec3 uMoonCol;
uniform vec4 uRip[${RIPPLES}]; uniform vec4 uOar; uniform vec4 uLights[4]; uniform vec3 uLightCol; uniform vec4 uWhirl[4];
uniform vec4 uBoats[6]; uniform float uStars; uniform float uMoonBelow; uniform float uCalm; uniform float uRipOn;
varying vec2 vSD; varying float vHW; varying float vRap; varying vec2 vDir; varying vec3 vWorld;
#include <fog_pars_fragment>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  float s = vSD.x; float d = vSD.y;
  float flow = uTime * (0.6 + 1.6 * vRap);
  vec2 q = vWorld.xz - vDir * flow;
  vec2 rt = vec2(-vDir.y, vDir.x);
  // small waves (height gradient by hand), choppier in rapids
  float chop = (0.55 + vRap * 1.6) * (1.0 - uCalm * 0.7);
  vec2 g = vec2(0.0);
  g += vec2(0.9, 0.35) * cos(dot(q, vec2(0.9, 0.35)) * 1.0 + uTime * 1.3) * 0.12;
  g += vec2(-0.4, 1.1) * cos(dot(q, vec2(-0.4, 1.1)) * 1.7 + uTime * 1.7) * 0.08;
  g += vec2(1.3, -0.9) * cos(dot(q, vec2(1.3, -0.9)) * 2.9 + uTime * 2.3) * 0.05;
  g += vec2(-1.7, -0.6) * cos(dot(q, vec2(-1.7, -0.6)) * 4.3 + uTime * 2.9) * 0.03;
  vec3 N = normalize(vec3(-g.x * chop, 1.0, -g.y * chop));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = mix(uDeep, uWater, 0.25 + 0.55 * fres);
  // the moon's path
  vec3 R = reflect(-V, N);
  float m = max(dot(R, normalize(uMoonDir)), 0.0);
  col += uMoonCol * (pow(m, 400.0) * 0.9 + pow(m, 40.0) * 0.08) * (1.0 - uMoonBelow);
  // the sea of stars: the sky below
  if (uStars > 0.0) {
    vec3 down = -V;
    vec2 sp = down.xz / max(0.05, -down.y) * 40.0 + vec2(0.0, uTime * 0.3);
    vec2 cell = floor(sp);
    float h = hash(cell);
    vec2 c = fract(sp) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
    float star = step(0.93, h) * smoothstep(0.12, 0.0, length(c)) * (0.6 + 0.4 * sin(uTime * 2.0 + h * 40.0));
    col += vec3(0.85, 0.9, 1.0) * star * uStars * 1.4;
    vec3 below = normalize(vec3(uMoonDir.x, -abs(uMoonDir.y), uMoonDir.z));
    float md = dot(down, below);
    col += vec3(0.95, 0.93, 0.85) * (smoothstep(0.9975, 0.9985, md) * 1.6 + pow(max(md, 0.0), 60.0) * 0.4) * uMoonBelow;
  }
  float ad = abs(d);
  // the banks: shade and lapping foam
  col *= 1.0 - smoothstep(vHW - 2.5, vHW, ad) * 0.35;
  float lap = smoothstep(vHW - 0.7, vHW - 0.15, ad) * (0.45 + 0.55 * noise(vec2(s * 1.3 - uTime * 0.8, d)));
  col = mix(col, uFoam * 0.75, lap * 0.45);
  // rapids: streaks and standing waves
  if (vRap > 0.01) {
    // churned water: darker between long foam streaks, white crests on the standing waves
    float n1 = noise(vec2(d * 2.6, (s - flow * 1.4) * 0.35));
    float n2 = noise(vec2(d * 5.3 + 3.0, (s - flow * 1.8) * 0.9));
    float streak = smoothstep(0.62, 0.86, n1 * 0.65 + n2 * 0.35);
    float crest = pow(0.5 + 0.5 * cos(6.2831853 * s / 7.0), 12.0) * smoothstep(0.35, 0.75, noise(vec2(d * 1.8, s * 0.3 + uTime * 1.5)));
    col = mix(col, uDeep * 1.3, 0.3 * vRap);
    col = mix(col, uFoam * 0.85, clamp((streak * 0.6 + crest * 0.75) * vRap, 0.0, 0.7));
  }
  // whirlpools
  for (int i = 0; i < 4; i++) {
    vec4 w = uWhirl[i];
    if (w.w <= 0.0) continue;
    vec2 dv = vWorld.xz - w.xy;
    float r = length(dv);
    if (r > w.z) continue;
    float k = 1.0 - r / w.z;
    float a = atan(dv.y, dv.x);
    float arm = pow(0.5 + 0.5 * sin(a * 3.0 + r * 1.6 - uTime * 3.5), 6.0);
    col = mix(col, uDeep * 0.5, k * 0.65);
    col = mix(col, uFoam, arm * k * 0.6 * w.w);
  }
  // boats: a soft contact shadow and a V of foam behind each
  for (int i = 0; i < 6; i++) {
    vec4 b = uBoats[i];
    if (b.w < 0.0) continue;
    vec2 f = vec2(sin(b.z), -cos(b.z));
    vec2 r = vec2(cos(b.z), sin(b.z));
    vec2 dv = vWorld.xz - b.xy;
    float along = dot(dv, f);
    float across = dot(dv, r);
    float sh = exp(-(along * along) / 3.2 - (across * across) / 0.6);
    col *= 1.0 - sh * 0.55;
    if (along < -1.2 && along > -26.0) {
      float back = -along - 1.2;
      float spread = 0.55 + back * 0.32;
      float vq = (abs(across) - spread) / (0.18 + back * 0.03);
      float vline = exp(-vq * vq);
      float fade = exp(-back * 0.18) * clamp(b.w / 6.0, 0.0, 1.0);
      float churn = exp(-across * across / 0.5) * exp(-back * 0.45) * clamp(b.w / 5.0, 0.0, 1.0);
      col = mix(col, uFoam * 0.8, clamp((vline * 0.24 * (0.6 + 0.4 * noise(vec2(back * 2.0, across * 3.0)))) * fade + churn * 0.26, 0.0, 0.5));
    }
  }
  // warm streaks from the lanterns
  vec2 vxz = normalize(cameraPosition.xz - vWorld.xz + vec2(1e-4));
  vec2 vperp = vec2(-vxz.y, vxz.x);
  for (int i = 0; i < 4; i++) {
    vec4 L = uLights[i];
    if (L.z <= 0.0) continue;
    vec2 dv = vWorld.xz - L.xy;
    float along = dot(dv, vxz);
    float across = dot(dv, vperp);
    float streak = exp(-across * across * 2.6 - along * along * 0.02) * (0.55 + 0.45 * sin(along * 3.0 - uTime * 3.0 + N.x * 8.0));
    float pool = exp(-dot(dv, dv) * 0.06);
    col += uLightCol * (streak * 0.24 + pool * 0.09) * L.z;
  }
  // the oar line: where the ripples meet the oars
  float lat = d - uOar.y;
  float al = abs(lat);
  float os = s - uOar.x;
  float bracket = smoothstep(0.75, 1.0, al) * (1.0 - smoothstep(3.0, 3.35, al));
  float oarLine = exp(-os * os / 0.035) * bracket;
  float eq = (al - 3.15) / 0.12;
  float ends = exp(-eq * eq) * exp(-os * os / 0.5);
  col += vec3(1.0, 0.95, 0.82) * (oarLine * (0.35 + uOar.z * 1.8) + ends * (0.4 + uOar.z)) * uRipOn;
  // the beat ripples
  float latF = mix(0.28, 1.0, exp(-lat * lat / 28.0));
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRip[i];
    if (r.y <= 0.0) continue;
    float cs = r.x + 0.03 * lat * lat;
    float dist = s - cs;
    float w = 0.42 + r.w * 0.8;
    float line = exp(-dist * dist / (w * w));
    float trail = step(0.0, dist) * exp(-dist * 1.4) * 0.22 * (1.0 - r.w);
    float shape = line + trail;
    vec3 c = vec3(1.0, 0.95, 0.84) * 1.05;
    if (r.z > 0.5 && r.z < 1.5) c = vec3(1.0, 0.98, 0.9) * 1.7;
    else if (r.z > 1.5 && r.z < 2.5) c = vec3(1.0, 0.66, 0.24) * 1.5;
    else if (r.z > 2.5) {
      // a miss: the ripple breaks into short red dashes, thin and without a trail
      c = vec3(0.95, 0.3, 0.22) * 1.4;
      shape = exp(-dist * dist / 0.12) * step(0.4, fract(lat * 0.5 + 0.25));
    }
    col += c * shape * r.y * latF * uRipOn;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** The river surface of a course. */
export function createWater(course, theme) {
  const STEP = 1;
  const J = 14;
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
    const half = a.hw + 1.2;
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
      // counter-clockwise seen from above, so the surface faces up
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
      uFoam: { value: new THREE.Color(theme.foam) },
      uMoonDir: { value: new THREE.Vector3(0, 0.4, -1) },
      uMoonCol: { value: new THREE.Color(theme.moon.color) },
      uRip: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uOar: { value: new THREE.Vector4(0, 0, 0, 0) },
      uLights: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uLightCol: { value: new THREE.Color(theme.lantern).multiplyScalar(0.9) },
      uWhirl: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uBoats: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, -1)) },
      uStars: { value: theme.moon.below ? 1 : 0 },
      uMoonBelow: { value: theme.moon.below ? 1 : 0 },
      uCalm: { value: 0 },
      uRipOn: { value: 1 },
    },
  ]);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.name = 'water';

  // whirlpools are fixed
  course.whirls.slice(0, 4).forEach((w, i) => uniforms.uWhirl.value[i].set(w.x, w.z, w.r * 1.15, 1));

  const U = uniforms;
  return {
    mesh,
    uniforms: U,
    setMoon(dir) {
      U.uMoonDir.value.copy(dir);
    },
    /** ripples: [{ s, strength, kind (0 coming, 1 perfect, 2 good, 3 missed), grow }] */
    setRipples(list) {
      for (let i = 0; i < RIPPLES; i++) {
        const r = list[i];
        if (r) U.uRip.value[i].set(r.s, r.strength, r.kind, r.grow ?? 0);
        else U.uRip.value[i].set(0, 0, 0, 0);
      }
    },
    setOar(s, d, glow) {
      U.uOar.value.set(s, d, glow, 0);
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
