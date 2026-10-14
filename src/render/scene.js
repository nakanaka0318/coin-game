// Renderer, camera rig, lighting and post-processing.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { makeBackdrop } from './textures.js';
import { STAGE_LOWER } from '../sim/config.js';

// Camera presets: target point, elevation (deg), extent that must fit on
// screen (width, height in world units around the target). A `span` preset
// instead names the top and bottom points that must fit, and is solved for
// the current screen.
const VIEWS = {
  overview: { span: [[0, 11.4 - STAGE_LOWER, -11.5], [0, -3.3, 6.0]], elev: 38, width: 16.8, yaw: 0 },
  field: { target: [0, -0.6, 1.4], elev: 46, width: 15, height: 13.5, yaw: 0 },
  stage: { target: [0, 5.2 - STAGE_LOWER, -8.4], elev: 24, width: 14, height: 11, yaw: 0 },
};
// With touch controls the overview frames just the play area, from the top of
// the LCD down to the offering box; the sign above it can sit behind the HUD.
const TOUCH_VIEWS = {
  ...VIEWS,
  overview: { span: [[0, 10.75 - STAGE_LOWER, -11.5], [0, -3.2, 5.95]], elev: 38, width: 16.8, yaw: 0 },
};

// Solves the target and distance that fit a view's two span points inside the
// picture band with equal margins, as a plain target/width/height preset.
function fitSpan(view, tanV, aspect, fitScale) {
  const e = THREE.MathUtils.degToRad(view.elev);
  const up = new THREE.Vector3(0, Math.cos(e), -Math.sin(e));
  const back = new THREE.Vector3(0, Math.sin(e), Math.cos(e));
  const [a, b] = view.span.map((p) => new THREE.Vector3(...p));
  const target = new THREE.Vector3();
  const r = new THREE.Vector3();
  const screenY = (p, t, d) => {
    target.lerpVectors(a, b, t);
    r.subVectors(p, target);
    return r.dot(up) / ((d - r.dot(back)) * tanV * fitScale);
  };
  const balance = (d) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) {
      const t = (lo + hi) / 2;
      if (screenY(a, t, d) + screenY(b, t, d) > 0) hi = t; else lo = t;
    }
    return (lo + hi) / 2;
  };
  const margin = 0.95;
  let lo = 1, hi = 400;
  for (let i = 0; i < 50; i++) {
    const d = (lo + hi) / 2;
    if (screenY(a, balance(d), d) > margin) lo = d; else hi = d;
  }
  const d = Math.max(hi, (view.width / 2) / (tanV * aspect));
  target.lerpVectors(a, b, balance(d));
  return { target: target.toArray(), elev: view.elev, yaw: view.yaw, width: view.width, height: 2 * d * tanV * fitScale };
}

// A dark hall with a few soft light panels, used only to light reflections
// on the metal medals and lacquer.
function buildEnvironmentScene() {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x04050c);
  const panel = (w, h, color, intensity, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    env.add(m);
  };
  panel(14, 6, 0xffffff, 1.8, [0, 9, 2], [Math.PI / 2, 0, 0]); // ceiling softbox
  panel(5, 5, 0xffc890, 0.8, [0, 4, -10], null); // warm backboard glow
  panel(10, 3, 0xdfe6ff, 0.45, [0, 3, 10], null); // front fill
  panel(3, 8, 0xff5c8a, 1.1, [-9, 3, 2], [0, Math.PI / 2, 0]);
  panel(3, 8, 0x5cc8ff, 1.1, [9, 3, 2], [0, -Math.PI / 2, 0]);
  panel(16, 2, 0x8090ff, 0.5, [0, -2, 9], null);
  return env;
}

export class SceneView {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05061a);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = buildEnvironmentScene();
    this.scene.environment = pmrem.fromScene(envScene, 0.03).texture;
    this.scene.environmentIntensity = 1;
    pmrem.dispose();

    this._lights();
    this._backdrop();

    this.viewName = 'overview';
    this.viewFrom = null;
    this.viewBlend = 1;
    this.shake = 0;
    this.time = 0;

    this.composer = null;
    this.setQuality(quality);
    this.resize();
    this.view = { ...this.views.overview };
  }

  _lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x6070d0, 0x140c18, 0.35));
    const key = this.key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(2.5, 22, 9);
    key.target.position.set(0, 0, -3);
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 11; sc.bottom = -11; sc.near = 5; sc.far = 40;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    s.add(key, key.target);

    const warm = new THREE.PointLight(0xff8a50, 5, 9, 2);
    warm.position.set(0, 12.5, -10.5);
    s.add(warm);
    this.warm = warm;
    const lcdGlow = new THREE.PointLight(0x7f9bff, 5, 8, 2);
    lcdGlow.position.set(0, 8.5, -10);
    s.add(lcdGlow);
    const rimL = new THREE.PointLight(0xff4f8a, 7, 14, 2);
    rimL.position.set(-5.2, 3.5, 3);
    const rimR = new THREE.PointLight(0x4fd6ff, 7, 14, 2);
    rimR.position.set(5.2, 3.5, 3);
    s.add(rimL, rimR);
  }

  _backdrop() {
    const tex = makeBackdrop();
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(140, 70), mat);
    plane.position.set(0, 8, -40);
    this.scene.add(plane);
    // Floor of the arcade hall.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x0b0a18, roughness: 0.6, metalness: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -6.3;
    this.scene.add(floor);
  }

  setQuality(q) {
    this.quality = q;
    const r = this.renderer;
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1);
    r.setPixelRatio(dpr);
    r.shadowMap.enabled = q !== 'low';
    this.key.castShadow = q !== 'low';
    this.key.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; }
    if (q === 'high') {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.45, 1.05);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } else {
      this.composer = null;
    }
    this.resize();
  }

  setView(name) {
    if (!this.views[name]) return;
    this.viewFrom = { ...this.view };
    this.viewName = name;
    this.viewBlend = 0;
  }

  cycleView() {
    const names = Object.keys(this.views);
    this.setView(names[(names.indexOf(this.viewName) + 1) % names.length]);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.size = { w, h };
    this._applyInsets();
    if (this.composer) this.composer.setSize(w, h);
  }

  // Screen space taken by the HUD (top) and touch controls (bottom). The
  // picture is centred in the band between them.
  setInsets(top, bottom, compact = false) {
    if (this.insets && this.insets.top === top && this.insets.bottom === bottom && this.insets.compact === compact) return;
    this.insets = { top, bottom, compact };
    if (this.size) this._applyInsets();
  }

  _applyInsets() {
    const { w, h } = this.size;
    const { top, bottom, compact } = this.insets || { top: 0, bottom: 0, compact: false };
    const cam = this.camera;
    if (!top && !bottom) {
      cam.aspect = w / h;
      cam.clearViewOffset();
      this.fitScale = 1;
    } else {
      // Render a window of a taller virtual frame whose centre sits in the
      // middle of the free band.
      const usable = Math.max(120, h - top - bottom);
      const yc = top + usable / 2;
      const half = Math.max(yc, h - yc);
      cam.aspect = w / (2 * half);
      cam.setViewOffset(w, 2 * half, 0, half - yc, w, h);
      this.fitScale = usable / (2 * half);
    }
    cam.updateProjectionMatrix();
    const base = compact ? TOUCH_VIEWS : VIEWS;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    this.views = Object.fromEntries(Object.entries(base).map(([k, v]) =>
      [k, v.span ? fitSpan(v, tanV, cam.aspect, this.fitScale) : v]));
  }

  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  _placeCamera(dt) {
    const target = this.views[this.viewName];
    if (this.viewBlend < 1) {
      this.viewBlend = Math.min(1, this.viewBlend + dt * 1.6);
      const k = this.viewBlend * this.viewBlend * (3 - 2 * this.viewBlend);
      const f = this.viewFrom;
      this.view = {
        target: f.target.map((v, i) => v + (target.target[i] - v) * k),
        elev: f.elev + (target.elev - f.elev) * k,
        width: f.width + (target.width - f.width) * k,
        height: f.height + (target.height - f.height) * k,
        yaw: f.yaw + (target.yaw - f.yaw) * k,
      };
    } else {
      this.view = { ...target };
    }
    const v = this.view;
    const cam = this.camera;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const dist = Math.max((v.height / 2) / (tanV * (this.fitScale ?? 1)), (v.width / 2) / (tanV * cam.aspect));
    const e = THREE.MathUtils.degToRad(v.elev);
    const yaw = THREE.MathUtils.degToRad(v.yaw);
    cam.position.set(
      v.target[0] + Math.sin(yaw) * Math.cos(e) * dist,
      v.target[1] + Math.sin(e) * dist,
      v.target[2] + Math.cos(yaw) * Math.cos(e) * dist);
    if (this.shake > 0) {
      const s = this.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.lookAt(v.target[0], v.target[1], v.target[2]);
  }

  render(dt) {
    this.time += dt;
    this._placeCamera(dt);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  // World-space point where a screen ray hits the horizontal plane y = planeY.
  screenToPlane(clientX, clientY, planeY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const t = (planeY - ray.ray.origin.y) / ray.ray.direction.y;
    if (!isFinite(t) || t < 0) return null;
    return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
  }

  worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height, behind: v.z > 1 };
  }
}
