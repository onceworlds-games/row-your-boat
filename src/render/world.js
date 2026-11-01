// The renderer, the sky (gradient, moon, clouds, stars, a shooting star now and then), the light, the river's mirror
// (a planar reflection the water samples) and the lens (bloom, the grade, the vignette): everything every scene shares.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { glowTexture, srand } from './kit.js';

/** Things on this layer are seen by the camera but not by the river's mirror (the water itself, sparks, mist). */
export const NO_MIRROR = 1;

// ---------------------------------------------------------------- the lens: tone mapping, grade, vignette, grain

class GradePass extends Pass {
  constructor() {
    super();
    this.uniforms = {
      tDiffuse: { value: null },
      toneMappingExposure: { value: 1 },
      uLift: { value: new THREE.Vector3(0.02, 0.018, 0.05) },
      uGain: { value: new THREE.Vector3(1.05, 1.0, 0.96) },
      uSat: { value: 1.08 },
      uVig: { value: 0.75 },
      uGrain: { value: 0.022 },
      uTime: { value: 0 },
      uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec3 uLift; uniform vec3 uGain; uniform float uSat; uniform float uVig; uniform float uGrain; uniform float uTime;
uniform vec4 uFlash;
#include <tonemapping_pars_fragment>
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  // one bad pixel (a light grazing a surface) would smear over the whole frame through the bloom
  if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
  vec3 col = ACESFilmicToneMapping(clamp(c.rgb, 0.0, 64.0));
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  col = col * uGain + uLift * (1.0 - col);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
  vec2 q = vUv - 0.5;
  col *= clamp(1.0 - dot(q, q) * uVig, 0.0, 1.0);
  col = mix(col, uFlash.rgb, uFlash.a);
  col = sRGBTransferOETF(vec4(col, 1.0)).rgb;
  col += (h(vUv * 911.0 + uTime) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}

// ---------------------------------------------------------------- the sky

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w; // always the farthest thing
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform vec3 uMoonDir; uniform vec3 uMoonCol; uniform float uSun;
uniform vec3 uBand; uniform float uBandAmt; uniform float uTime; uniform float uMoonSize; uniform float uMoonOn; uniform float uInMirror;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c = mix(uBot, uMid, smoothstep(-0.06, 0.24, y));
  c = mix(c, uTop, smoothstep(0.2, 0.92, y));
  vec3 md = normalize(uMoonDir);
  float m = max(0.0, dot(d, md));
  // the moon's (or the sun's) glow: wide and soft, then close
  c += uMoonCol * (pow(m, 5.0) * (0.07 + uSun * 0.45) + pow(m, 48.0) * (0.16 + uSun * 0.5)) * uMoonOn;
  // the horizon under the moon is lighter
  vec2 hz = normalize(vec2(d.x, d.z) + 1e-4);
  vec2 hm = normalize(vec2(md.x, md.z) + 1e-4);
  c += uMoonCol * 0.07 * pow(max(0.0, dot(hz, hm)), 3.0) * (1.0 - smoothstep(0.0, 0.32, abs(y))) * uMoonOn;
  // a dream band across the sky: a soft nebula of rose and lilac
  float az = atan(d.z, d.x);
  float band = exp(-pow((y - 0.45 - 0.13 * sin(az * 1.5 + 0.7)) * 3.0, 2.0));
  float neb = fbm(vec2(az * 2.2, y * 5.0) + vec2(uTime * 0.003, 0.0));
  c += uBand * band * smoothstep(0.38, 0.85, neb) * uBandAmt;
  // the disc, with soft seas on its face
  float r = acos(clamp(dot(d, md), -1.0, 1.0));
  float R = uMoonSize;
  if (uInMirror > 0.5) {
    // seen in the river the moon is a path of light: narrow across, long toward the viewer, never a crisp disc
    float el = asin(clamp(d.y, -1.0, 1.0)) - asin(clamp(md.y, -1.0, 1.0));
    float az = acos(clamp(dot(hz, hm), -1.0, 1.0));
    float path = exp(-pow(az / (R * 1.6), 2.0) - pow(el / (R * 7.0), 2.0));
    float core = exp(-pow(az / (R * 0.7), 2.0) - pow(el / (R * 2.2), 2.0));
    c += uMoonCol * (path * 0.55 + core * 0.9) * (1.0 + uSun) * uMoonOn;
  } else if (uMoonOn > 0.5 && r < R * 1.1) {
    float k = smoothstep(R, R * 0.94, r);
    vec3 t = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
    vec3 b = cross(t, md);
    vec2 uv = vec2(dot(d - md, t), dot(d - md, b)) / R;
    float seas = smoothstep(0.5, 0.72, fbm(uv * 2.2 + 3.0));
    float limb = sqrt(max(0.0, 1.0 - dot(uv, uv)));
    vec3 disc = mix(vec3(1.0, 0.97, 0.9), vec3(0.74, 0.74, 0.78), seas * 0.8) * (0.72 + 0.28 * limb);
    disc = mix(disc, mix(vec3(1.0, 0.72, 0.45), vec3(1.0, 0.95, 0.8), limb), uSun);
    c = mix(c, disc * (1.7 + uSun * 2.5), k);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize; attribute float aPhase;
uniform float uTime; uniform float uPx; uniform float uAmt;
varying float vA;
void main() {
  vA = (0.55 + 0.45 * sin(uTime * (1.3 + aPhase) + aPhase * 9.0)) * uAmt;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w * 0.99999;
  gl_PointSize = aSize * uPx;
}`;
const STAR_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(q));
  a = a * a;
  // the brightest have a little cross of light
  float x = max(0.0, 1.0 - abs(q.x) * 16.0) * max(0.0, 1.0 - abs(q.y) * 2.2) + max(0.0, 1.0 - abs(q.y) * 16.0) * max(0.0, 1.0 - abs(q.x) * 2.2);
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * (1.0 + a), (a + x * 0.3) * vA);
}`;

/** A soft cloud painted on a canvas: lit from above by the moon, shadowed underneath. */
function cloudTexture(seed) {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const R = srand(seed);
  const puffs = [];
  for (let i = 0; i < 26; i++) {
    const u = R();
    const x = 70 + u * (W - 140);
    const top = 1 - Math.abs(u - 0.5) * 1.6;
    const r = 24 + R() * 44 * (0.5 + top * 0.6);
    const y = H * 0.62 - top * 70 - R() * 28 + r * 0.25;
    puffs.push([x, y, r]);
  }
  for (const [x, y, r] of puffs) {
    const gr = g.createRadialGradient(x, y + r * 0.25, r * 0.2, x, y + r * 0.2, r);
    gr.addColorStop(0, 'rgba(118,124,170,0.95)');
    gr.addColorStop(0.7, 'rgba(104,110,156,0.7)');
    gr.addColorStop(1, 'rgba(104,110,156,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  for (const [x, y, r] of puffs) {
    const gr = g.createRadialGradient(x - r * 0.15, y - r * 0.45, r * 0.05, x, y - r * 0.2, r * 0.85);
    gr.addColorStop(0, 'rgba(255,250,240,0.95)');
    gr.addColorStop(0.5, 'rgba(222,226,250,0.5)');
    gr.addColorStop(1, 'rgba(200,205,240,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y - r * 0.12, r * 0.9, 0, Math.PI * 2);
    g.fill();
  }
  const fade = g.createLinearGradient(0, H * 0.55, 0, H);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = fade;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.85, 'rgba(255,248,230,0.8)');
  gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr;
  g.fillRect(0, 6, 256, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- the world

/** Whether WebGL draws in software here (no GPU: SwiftShader, llvmpipe), asked once of a throwaway context. */
let soft = null;
export function softwareGL() {
  if (soft !== null) return soft;
  soft = false;
  try {
    // a local switch for looking at this path on a machine with a GPU (captures)
    if (new URLSearchParams(location.search).has('lite')) return (soft = true);
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      soft = /swiftshader|llvmpipe|softpipe|software/i.test(name);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {}
  return soft;
}

export function createWorld(canvas, { poster = false } = {}) {
  // without a GPU every shader compiles and every pixel shades on the CPU: one lantern light, no reflections of the sky
  // and no multisampling keep the river playable there
  const lite = !poster && softwareGL();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, powerPreference: 'high-performance', preserveDrawingBuffer: poster, alpha: false, stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#141A3A');
  scene.fog = new THREE.FogExp2('#1a2352', 0.0105);

  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 1600);
  camera.position.set(0, 4, 8);
  camera.layers.enable(NO_MIRROR);

  // ---- sky
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3(0, 0.4, -1) }, uMoonCol: { value: new THREE.Color() }, uSun: { value: 0 },
      uBand: { value: new THREE.Color('#b78ad8') }, uBandAmt: { value: 0.2 }, uTime: { value: 0 }, uMoonSize: { value: 0.07 }, uMoonOn: { value: 1 }, uInMirror: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // ---- stars
  const R = srand(7);
  const N = 1800;
  const sp = new Float32Array(N * 3);
  const ss = new Float32Array(N);
  const sph = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const y = 0.03 + Math.pow(R(), 0.75) * 0.97;
    const a = R() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    sp[i * 3] = Math.cos(a) * r * 900;
    sp[i * 3 + 1] = y * 900;
    sp[i * 3 + 2] = Math.sin(a) * r * 900;
    ss[i] = 1 + Math.pow(R(), 7) * 6;
    sph[i] = R() * 3;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sph, 1));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uAmt: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  scene.add(stars);

  // ---- clouds: big soft billboards far away, drifting
  const cloudTex = [cloudTexture(11), cloudTexture(23), cloudTexture(37)];
  const clouds = [];
  const cloudGroup = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex[i % 3], transparent: true, depthWrite: false, fog: false, opacity: 0.8 }));
    const w = 240 + R() * 260;
    s.scale.set(w, w * 0.5, 1);
    s.userData = { a: (i / 14) * Math.PI * 2 + R() * 0.3, dist: 620 + R() * 220, h: 30 + R() * 160, speed: 0.004 + R() * 0.006 };
    s.renderOrder = -8;
    s.frustumCulled = false;
    cloudGroup.add(s);
    clouds.push(s);
  }
  scene.add(cloudGroup);

  // ---- a shooting star now and then
  const shootMat = new THREE.MeshBasicMaterial({ map: streakTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
  const shoot = new THREE.Mesh(new THREE.PlaneGeometry(90, 2.2), shootMat);
  shoot.visible = false;
  shoot.frustumCulled = false;
  shoot.renderOrder = -7;
  scene.add(shoot);
  const shootState = { t: -1, next: 5, from: new THREE.Vector3(), dir: new THREE.Vector3() };
  const sv = new THREE.Vector3();
  const iq = new THREE.Quaternion();

  // ---- light
  const hemi = new THREE.HemisphereLight('#4d5aa8', '#0b0b18', 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#c3cdff', 1.3);
  sun.castShadow = true;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.035;
  const sc = sun.shadow.camera;
  sc.left = -22;
  sc.right = 22;
  sc.top = 22;
  sc.bottom = -22;
  sc.near = 1;
  sc.far = 190;
  scene.add(sun);
  scene.add(sun.target);
  const moonDir = new THREE.Vector3(0, 0.4, -1).normalize();

  // the focused boat's lanterns: warm light on the rower, the hull and the banks it passes
  const bow = new THREE.PointLight('#ffb560', 0, 14, 1.6);
  scene.add(bow);
  // a soft lamp behind the boat that lights the rower's face from the camera's side
  const stern = new THREE.PointLight('#ffd08a', 0, 8, 1.6);
  if (!lite) scene.add(stern);
  // a fixed pool of real lights that move to the bank lanterns nearest the camera
  const pool = [0, 1, 2].map(() => {
    const l = new THREE.PointLight('#ffb547', 0, 17, 1.7);
    if (!lite) scene.add(l);
    return l;
  });

  // ---- the environment (glints on glaze and varnish), made from this sky
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  function makeEnvironment(th) {
    if (lite) {
      scene.environment = null;
      return;
    }
    const es = new THREE.Scene();
    const m = skyMat.clone();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), m);
    es.add(dome);
    // warm lanterns around the horizon so varnish and glaze catch them
    const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(th.lantern).multiplyScalar(4) });
    const ball = new THREE.SphereGeometry(1.6, 8, 6);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const b = new THREE.Mesh(ball, warm);
      b.position.set(Math.cos(a) * 30, 2 + (i % 3) * 2.5, Math.sin(a) * 30);
      es.add(b);
    }
    const old = envRT;
    envRT = pmrem.fromScene(es, 0.03);
    scene.environment = envRT.texture;
    old?.dispose();
    m.dispose();
    dome.geometry.dispose();
    ball.dispose();
    warm.dispose();
  }

  // ---- the river's mirror
  const mirror = {
    on: true,
    scale: 0.5,
    rt: new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }),
    cam: new THREE.PerspectiveCamera(),
    matrix: new THREE.Matrix4(),
  };
  mirror.rt.texture.generateMipmaps = false;
  mirror.cam.layers.set(0);
  const mPlane = new THREE.Plane();
  const clipPlane = new THREE.Vector4();
  const qv = new THREE.Vector4();
  const camPos = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const up = new THREE.Vector3();
  const N_UP = new THREE.Vector3(0, 1, 0);
  const ON_WATER = new THREE.Vector3(0, 0.03, 0);

  function renderMirror() {
    camera.updateMatrixWorld();
    camPos.setFromMatrixPosition(camera.matrixWorld);
    const rc = mirror.cam;
    // the camera reflected in the water (y = 0)
    rc.position.set(camPos.x, -camPos.y, camPos.z);
    rot.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    lookAt.y = -lookAt.y;
    up.set(0, 1, 0).applyMatrix4(rot);
    up.y = -up.y;
    rc.up.copy(up);
    rc.lookAt(lookAt);
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(camera.projectionMatrix);
    mirror.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    mirror.matrix.multiply(rc.projectionMatrix);
    mirror.matrix.multiply(rc.matrixWorldInverse);
    // an oblique near plane at the water, so nothing under it shows
    mPlane.setFromNormalAndCoplanarPoint(N_UP, ON_WATER);
    mPlane.applyMatrix4(rc.matrixWorldInverse);
    clipPlane.set(mPlane.normal.x, mPlane.normal.y, mPlane.normal.z, mPlane.constant);
    const pm = rc.projectionMatrix;
    qv.x = (Math.sign(clipPlane.x) + pm.elements[8]) / pm.elements[0];
    qv.y = (Math.sign(clipPlane.y) + pm.elements[9]) / pm.elements[5];
    qv.z = -1.0;
    qv.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clipPlane.multiplyScalar(2.0 / clipPlane.dot(qv));
    pm.elements[2] = clipPlane.x;
    pm.elements[6] = clipPlane.y;
    pm.elements[10] = clipPlane.z + 1.0;
    pm.elements[14] = clipPlane.w;
    rc.projectionMatrixInverse.copy(pm).invert();
    renderer.setRenderTarget(mirror.rt);
    renderer.clear();
    skyMat.uniforms.uInMirror.value = 1;
    renderer.render(scene, rc);
    skyMat.uniforms.uInMirror.value = 0;
    renderer.setRenderTarget(null);
  }

  // ---- post-processing
  let composer = null;
  let bloom = null;
  let grade = null;
  let quality = 'high';
  let pixelRatio = 1;
  let width = 1;
  let height = 1;

  function setupComposer() {
    if (composer) return;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.5, 0.55, theme?.bloomT ?? 0.9);
    composer.addPass(bloom);
    grade = new GradePass();
    composer.addPass(grade);
    if (theme) applyGrade(theme);
  }

  function setQuality(q, pr) {
    quality = q;
    pixelRatio = pr;
    renderer.setPixelRatio(pr);
    renderer.shadowMap.enabled = q !== 'low';
    sun.castShadow = q !== 'low';
    const size = q === 'high' || poster ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    mirror.on = q !== 'low' || poster;
    mirror.scale = q === 'high' || poster ? 0.5 : 0.34;
    if (q !== 'low' || poster) setupComposer();
    if (bloom) bloom.enabled = q === 'high' || poster;
    resize(width, height);
    // materials compile against the shadow setting
    scene.traverse((o) => {
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
  }

  function resize(w, h) {
    width = Math.max(1, w);
    height = Math.max(1, h);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    }
    const ms = mirror.scale * pixelRatio;
    mirror.rt.setSize(Math.max(4, Math.round(width * ms)), Math.max(4, Math.round(height * ms)));
    starMat.uniforms.uPx.value = Math.min(2, pixelRatio);
  }

  function applyGrade(th) {
    if (!grade) return;
    grade.uniforms.uLift.value.set(...(th.lift ?? [0.02, 0.016, 0.05]));
    grade.uniforms.uGain.value.set(...(th.gain ?? [1.05, 1.0, 0.95]));
    grade.uniforms.uSat.value = th.sat ?? 1.08;
  }

  let theme = null;
  function setTheme(th, course) {
    theme = th;
    const U = skyMat.uniforms;
    U.uTop.value.set(th.skyTop);
    U.uMid.value.set(th.skyMid);
    U.uBot.value.set(th.skyBot);
    U.uBand.value.set(th.band ?? '#b78ad8');
    U.uBandAmt.value = th.bandAmt ?? 0.18;
    scene.background.set(th.skyBot);
    scene.fog.color.set(th.fog);
    scene.fog.density = th.fogD;
    hemi.color.set(th.hemi[0]);
    hemi.groundColor.set(th.hemi[1]);
    hemi.intensity = th.hemi[2];
    sun.color.set(th.moon.color);
    sun.intensity = th.moon.intensity;
    if (th.moon.sun && course) {
      // the sun rises behind the finish
      const a = course.point(course.start, 0);
      const b = course.point(course.finish, 0);
      moonDir.set(b.x - a.x, 0, b.z - a.z).normalize();
      moonDir.y = th.moon.dir[1];
      moonDir.normalize();
    } else moonDir.set(...th.moon.dir).normalize();
    U.uMoonDir.value.copy(moonDir);
    U.uMoonCol.value.set(th.moon.color);
    U.uSun.value = th.moon.sun ? 1 : 0;
    U.uMoonSize.value = th.moon.size / 1000;
    U.uMoonOn.value = th.moon.below ? 0 : 1;
    starMat.uniforms.uAmt.value = th.stars;
    stars.visible = th.stars > 0;
    for (const s of clouds) {
      s.material.color.set(th.cloud ?? '#b9bfe6');
      s.material.opacity = th.cloudAmt ?? 0.7;
      s.visible = (th.cloudAmt ?? 0.7) > 0.01;
    }
    for (const l of pool) l.color.set(th.lantern);
    renderer.toneMappingExposure = th.exposure ?? (th.moon.sun ? 0.7 : 0.78);
    if (bloom) bloom.threshold = th.bloomT ?? 0.9;
    scene.environmentIntensity = th.env ?? 0.5;
    applyGrade(th);
    makeEnvironment(th);
  }

  /** Keep the sky, the clouds and the shadow box with the camera and the boat in focus. */
  function follow(focus, time, dt = 0.016) {
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    cloudGroup.position.copy(camera.position);
    starMat.uniforms.uTime.value = time;
    skyMat.uniforms.uTime.value = time;
    for (const s of clouds) {
      const u = s.userData;
      u.a += u.speed * dt * 0.1;
      s.position.set(Math.cos(u.a) * u.dist, u.h, Math.sin(u.a) * u.dist);
    }
    sun.position.copy(focus).addScaledVector(moonDir, 90);
    if (moonDir.y < 0.25) sun.position.y = focus.y + 34; // a low sun still casts sensible shadows
    sun.target.position.copy(focus);
    // a shooting star
    const st = shootState;
    if (st.t < 0) {
      st.next -= dt;
      shoot.visible = false;
      if (st.next <= 0 && (theme?.stars ?? 0) > 0.3) {
        st.t = 0;
        st.next = 8 + Math.random() * 14;
        const a = Math.random() * Math.PI * 2;
        st.from.set(Math.cos(a) * 700, 300 + Math.random() * 220, Math.sin(a) * 700);
        st.dir.set(-Math.sin(a) + (Math.random() - 0.5), -0.4, Math.cos(a) + (Math.random() - 0.5)).normalize();
      }
    } else {
      st.t += dt;
      const k = st.t / 0.85;
      if (k >= 1) {
        st.t = -1;
        shoot.visible = false;
      } else {
        shoot.visible = true;
        shoot.position.copy(camera.position).add(st.from).addScaledVector(st.dir, k * 260);
        shoot.quaternion.copy(camera.quaternion);
        sv.copy(st.dir).applyQuaternion(iq.copy(camera.quaternion).invert());
        shoot.rotateZ(Math.atan2(sv.y, sv.x));
        shootMat.opacity = Math.sin(k * Math.PI);
      }
    }
  }

  /** The focused boat's lights (null: off). p: { x, y, z, sx, sy, sz }. */
  function setBow(p, power = 1) {
    // Lights stay in the scene (intensity 0 when off): a change in the number of lights recompiles every material.
    if (!p) {
      bow.intensity = 0;
      stern.intensity = 0;
      return;
    }
    bow.position.set(p.x, p.y, p.z);
    bow.intensity = (theme?.moon.sun ? 3 : 9) * power;
    stern.position.set(p.sx, p.sy, p.sz);
    stern.intensity = theme?.moon.sun ? 1.5 : 3.5;
  }

  /** Place the pool of lights at these positions (nearest first). */
  function setPool(points, pulse = 0) {
    pool.forEach((l, i) => {
      const p = points[i];
      if (p) {
        l.position.set(p.x, p.y, p.z);
        l.intensity = (theme?.moon.sun ? 3 : 9) * (1 + pulse * 0.3);
      } else l.intensity = 0;
    });
  }

  const flash = { a: 0, color: new THREE.Color() };
  /** A brief wash of colour over the frame (a perfect pull, the finish). */
  function setFlash(color, amount) {
    flash.color.set(color);
    flash.a = Math.max(flash.a, amount);
  }

  let frameNo = 0;
  function render(dt = 0.016) {
    frameNo++;
    renderer.shadowMap.needsUpdate = true;
    if (mirror.on) renderMirror();
    flash.a = Math.max(0, flash.a - dt * 2.5);
    if (composer && (quality !== 'low' || poster)) {
      grade.uniforms.uTime.value = poster ? 0 : (frameNo % 61) * 0.37;
      grade.uniforms.uGrain.value = poster ? 0.012 : 0.022;
      grade.uniforms.uFlash.value.set(flash.color.r, flash.color.g, flash.color.b, flash.a);
      composer.render(dt);
    } else renderer.render(scene, camera);
  }

  return {
    renderer, scene, camera, sun, hemi, moonDir, stars, mirror, lite,
    resize, setQuality, setTheme, follow, setBow, setPool, setFlash, render,
    glowTexture,
    get quality() {
      return quality;
    },
    get theme() {
      return theme;
    },
  };
}
