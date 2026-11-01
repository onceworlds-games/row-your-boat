// The renderer, the sky, the light and the camera's lens: everything every scene shares.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { glowTexture, srand } from './kit.js';

const SAFE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
  gl_FragColor = vec4(clamp(c.rgb, 0.0, 48.0), 1.0);
}`,
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // always the farthest thing
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform vec3 uMoonDir; uniform vec3 uMoonCol; uniform float uSun;
varying vec3 vDir;
void main() {
  float y = vDir.y;
  vec3 c = mix(uBot, uMid, smoothstep(-0.05, 0.25, y));
  c = mix(c, uTop, smoothstep(0.2, 0.85, y));
  float m = max(0.0, dot(normalize(vDir), normalize(uMoonDir)));
  c += uMoonCol * (pow(m, 24.0) * 0.35 + pow(m, 4.0) * 0.08 * (1.0 + uSun * 3.0));
  // a faint band of mist on the horizon
  c = mix(c, uBot * 1.15, (1.0 - smoothstep(0.0, 0.08, abs(y))) * 0.5);
  gl_FragColor = vec4(c, 1.0);
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize; attribute float aPhase;
uniform float uTime; uniform float uPx; uniform float uAmt;
varying float vA;
void main() {
  vA = (0.55 + 0.45 * sin(uTime * (1.3 + aPhase) + aPhase * 9.0)) * uAmt;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999;
  gl_PointSize = aSize * uPx;
}`;
const STAR_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a;
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * (1.0 + a), a * vA);
}`;

export function createWorld(canvas, { poster = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: poster, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#141A3A');
  scene.fog = new THREE.FogExp2('#1a2352', 0.0105);

  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 1400);
  camera.position.set(0, 4, 8);

  // ---- sky
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3(0, 0.4, -1) }, uMoonCol: { value: new THREE.Color() }, uSun: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // ---- stars
  const R = srand(7);
  const N = 1400;
  const sp = new Float32Array(N * 3);
  const ss = new Float32Array(N);
  const sph = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = R() * 2 - 1;
    const y = 0.04 + Math.pow(R(), 0.8) * 0.96;
    const a = R() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    sp[i * 3] = Math.cos(a) * r * 850;
    sp[i * 3 + 1] = y * 850 * (u > 2 ? -1 : 1);
    sp[i * 3 + 2] = Math.sin(a) * r * 850;
    ss[i] = 1 + Math.pow(R(), 6) * 4.5;
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

  // ---- the moon (or the sun)
  const moonTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const halo = g.createRadialGradient(128, 128, 30, 128, 128, 128);
    halo.addColorStop(0, 'rgba(255,250,235,0.55)');
    halo.addColorStop(0.35, 'rgba(220,225,255,0.16)');
    halo.addColorStop(1, 'rgba(200,210,255,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#fbf3dc';
    g.beginPath();
    g.arc(128, 128, 40, 0, Math.PI * 2);
    g.fill();
    // a few soft seas on its face
    g.fillStyle = 'rgba(200,190,170,0.35)';
    for (const [x, y, r] of [[116, 118, 11], [140, 136, 8], [124, 146, 6], [143, 112, 5]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true }));
  moon.renderOrder = -8;
  scene.add(moon);

  // ---- light
  const hemi = new THREE.HemisphereLight('#4d5aa8', '#0b0b18', 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#c3cdff', 1.3);
  sun.castShadow = true;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  const sc = sun.shadow.camera;
  sc.left = -22;
  sc.right = 22;
  sc.top = 22;
  sc.bottom = -22;
  sc.near = 1;
  sc.far = 160;
  scene.add(sun);
  scene.add(sun.target);
  const moonDir = new THREE.Vector3(0, 0.4, -1).normalize();

  // the player's bow lantern: a warm beam on the water ahead
  const beam = new THREE.SpotLight('#ffb560', 26, 34, 0.55, 0.6, 1.4);
  beam.castShadow = false;
  scene.add(beam);
  scene.add(beam.target);
  // and a small stern lamp that lights the rower and the hull from the camera's side
  const stern = new THREE.PointLight('#ffd08a', 0, 11, 1.5);
  stern.castShadow = false;
  scene.add(stern);

  // a fixed pool of real lights that move to the bank lanterns nearest the camera
  const pool = [0, 1, 2].map(() => {
    const l = new THREE.PointLight('#ffb547', 9, 16, 1.6);
    l.castShadow = false;
    scene.add(l);
    return l;
  });

  // ---- post-processing (high quality only)
  let composer = null;
  let bloom = null;
  let quality = 'high';
  let pixelRatio = 1;
  let width = 1;
  let height = 1;

  function setupComposer() {
    if (composer) return;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // one bad pixel (Inf/NaN from a light grazing a surface) would smear over the whole frame through the bloom's
    // smallest blur: keep every pixel finite first
    composer.addPass(new ShaderPass(SAFE));
    bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.45, 0.5, 0.95);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  function setQuality(q, pr) {
    quality = q;
    pixelRatio = pr;
    renderer.setPixelRatio(pr);
    renderer.shadowMap.enabled = q !== 'low';
    sun.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    if (q === 'high' && !poster) setupComposer();
    if (poster) setupComposer();
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
    starMat.uniforms.uPx.value = Math.min(2, pixelRatio);
  }

  let theme = null;
  function setTheme(th, course) {
    theme = th;
    skyMat.uniforms.uTop.value.set(th.skyTop);
    skyMat.uniforms.uMid.value.set(th.skyMid);
    skyMat.uniforms.uBot.value.set(th.skyBot);
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
    skyMat.uniforms.uMoonDir.value.copy(moonDir);
    skyMat.uniforms.uMoonCol.value.set(th.moon.color);
    skyMat.uniforms.uSun.value = th.moon.sun ? 1 : 0;
    moon.material.color.set(th.moon.sun ? '#ffd6a0' : '#ffffff');
    moon.scale.setScalar(th.moon.size * 3.2);
    moon.visible = !th.moon.below;
    starMat.uniforms.uAmt.value = th.stars;
    stars.visible = th.stars > 0;
    for (const l of pool) l.color.set(th.lantern);
    // three's ACES brightens by exposure / 0.6: keep nights dark and the lanterns the brightest thing
    renderer.toneMappingExposure = th.moon.sun ? 0.7 : 0.74;
  }

  /** Keep the sky, the moon and the shadow box with the camera and the boat in focus. */
  function follow(focus, time) {
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    moon.position.copy(camera.position).addScaledVector(moonDir, 700);
    starMat.uniforms.uTime.value = time;
    sun.position.copy(focus).addScaledVector(moonDir, 80);
    if (moonDir.y < 0.25) sun.position.y = focus.y + 30; // a low sun still casts sensible shadows
    sun.target.position.copy(focus);
  }

  /** Point the bow lantern's beam: from (x, y, z) toward heading h. */
  function setBeam(on, x, y, z, h, power = 1) {
    // Lights stay in the scene (intensity 0 when off): a change in the number of lights recompiles every material.
    if (!on) {
      beam.intensity = 0;
      stern.intensity = 0;
      return;
    }
    beam.position.set(x, y, z);
    beam.target.position.set(x + Math.sin(h) * 12, 0, z - Math.cos(h) * 12);
    beam.intensity = 26 * power;
    stern.position.set(x - Math.sin(h) * 4, 1.9, z + Math.cos(h) * 4);
    stern.intensity = (theme?.moon.sun ? 2 : 6) * (0.8 + 0.2 * power);
  }

  /** Place the pool of lights at these positions (nearest first). */
  function setPool(points, pulse = 0) {
    pool.forEach((l, i) => {
      const p = points[i];
      if (p) {
        l.position.set(p.x, p.y, p.z);
        l.intensity = (theme?.moon.sun ? 3 : 9) * (1 + pulse * 0.35);
      } else l.intensity = 0;
    });
  }

  function render() {
    if (composer && (quality === 'high' || poster)) composer.render();
    else renderer.render(scene, camera);
  }

  return {
    renderer, scene, camera, sun, hemi, beam, moonDir, moon, stars,
    resize, setQuality, setTheme, follow, setBeam, setPool, render,
    glowTexture,
    get quality() {
      return quality;
    },
    get theme() {
      return theme;
    },
  };
}
