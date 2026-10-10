// Additive sparkle particles for payouts, checker hits and jackpots.
import * as THREE from 'three';
import { makeGlowSprite } from './textures.js';

const MAX = 600;

export class Sparkles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: makeGlowSprite() }, scale: { value: 600 } },
      vertexShader: `
        attribute float size; attribute vec3 color; varying vec3 vColor; uniform float scale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor;
        void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor * t.a, t.a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geometry = g;
    this.color = new THREE.Color();
  }

  setScale(px) {
    this.points.material.uniforms.scale.value = px;
  }

  burst(x, y, z, { count = 12, color = 0xffd27a, speed = 3, up = 3, life = 0.8, size = 0.35, spread = 0.2 } = {}) {
    this.color.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.pos[i * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = up * (0.4 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      const k = 0.75 + Math.random() * 0.5;
      this.col[i * 3] = this.color.r * k;
      this.col[i * 3 + 1] = this.color.g * k;
      this.col[i * 3 + 2] = this.color.b * k;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.6);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
    }
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { if (this.size[i] !== 0) { this.size[i] = 0; any = true; } continue; }
      any = true;
      this.life[i] -= dt;
      const p = i * 3;
      this.vel[p + 1] -= 6 * dt;
      this.vel[p] *= 0.98; this.vel[p + 2] *= 0.98;
      this.pos[p] += this.vel[p] * dt;
      this.pos[p + 1] += this.vel[p + 1] * dt;
      this.pos[p + 2] += this.vel[p + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.size[i] *= 0.985;
      if (k <= 0) this.size[i] = 0;
    }
    if (any) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
      this.geometry.attributes.size.needsUpdate = true;
    }
  }
}
