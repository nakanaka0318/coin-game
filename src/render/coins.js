// Instanced rendering of every dynamic body (medals and balls).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COIN, GOLD_COIN, OBAN, BALL, DARUMA, CHEST } from '../sim/config.js';
import { KIND } from '../sim/physics.js';
import { makeCoinFace, makeReededEdge, makeRainbowStrip, makeDarumaTexture, makeChestTexture } from './textures.js';

function coinGeometry(radius, halfHeight, segments = 40) {
  const b = Math.min(0.03, halfHeight * 0.5);
  const profile = [
    new THREE.Vector2(radius - b, -halfHeight),
    new THREE.Vector2(radius - b * 0.3, -halfHeight + b * 0.3),
    new THREE.Vector2(radius, -halfHeight + b),
    new THREE.Vector2(radius, halfHeight - b),
    new THREE.Vector2(radius - b * 0.3, halfHeight - b * 0.3),
    new THREE.Vector2(radius - b, halfHeight),
  ];
  const side = new THREE.LatheGeometry(profile, segments);
  const top = new THREE.CircleGeometry(radius - b, segments);
  top.rotateX(-Math.PI / 2);
  top.translate(0, halfHeight, 0);
  const bottom = new THREE.CircleGeometry(radius - b, segments);
  bottom.rotateX(Math.PI / 2);
  bottom.translate(0, -halfHeight, 0);
  const g = mergeGeometries([side, top, bottom], true);
  side.dispose(); top.dispose(); bottom.dispose();
  return g;
}

export class CoinRenderer {
  constructor(scene, capacity) {
    this.capacity = capacity;
    const edgeNormal = makeReededEdge();
    edgeNormal.repeat.set(1, 1);

    const silverFace = makeCoinFace('silver');
    const goldFace = makeCoinFace('gold');
    const obanFace = makeCoinFace('oban');
    const mk = (color, face, rough) => {
      const faceMat = new THREE.MeshStandardMaterial({
        color, metalness: 0.92, roughness: rough,
        map: face.map, normalMap: face.normalMap, normalScale: new THREE.Vector2(1, 1),
      });
      const edgeMat = new THREE.MeshStandardMaterial({
        color, metalness: 0.92, roughness: rough + 0.06, normalMap: edgeNormal,
      });
      return [edgeMat, faceMat, faceMat];
    };

    this.silver = new THREE.InstancedMesh(
      coinGeometry(COIN.radius, COIN.halfHeight), mk(0xe9ecf2, silverFace, 0.3), capacity);
    this.gold = new THREE.InstancedMesh(
      coinGeometry(GOLD_COIN.radius, GOLD_COIN.halfHeight), mk(0xf5c55a, goldFace, 0.22), 200);
    // The 小判 shimmers: rainbow face and rim that slowly turn, with a glow.
    this.rainbowFace = obanFace.map;
    this.rainbowFace.center.set(0.5, 0.5);
    this.rainbowRim = makeRainbowStrip();
    const rainbow = (map, normalMap) => new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map, normalMap, normalScale: new THREE.Vector2(1, 1),
      metalness: 0.55, roughness: 0.18, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.32,
      iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1, clearcoatRoughness: 0.08,
    });
    const rim = rainbow(this.rainbowRim, edgeNormal);
    const face = rainbow(this.rainbowFace, obanFace.normalMap);
    this.oban = new THREE.InstancedMesh(
      coinGeometry(OBAN.radius, OBAN.halfHeight), [rim, face, face], 60);
    this.ball = new THREE.InstancedMesh(
      new THREE.SphereGeometry(BALL.radius, 40, 28),
      new THREE.MeshPhysicalMaterial({
        color: 0xffe9a8, metalness: 0.2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05,
        emissive: 0xd08a2a, emissiveIntensity: 0.35, iridescence: 0.4,
      }), 16);
    this.daruma = new THREE.InstancedMesh(
      new THREE.SphereGeometry(DARUMA.radius, 32, 20),
      new THREE.MeshPhysicalMaterial({ map: makeDarumaTexture(), roughness: 0.25, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1 }), 12);
    const side = new THREE.MeshStandardMaterial({ map: makeChestTexture(256, false), roughness: 0.4, metalness: 0.2 });
    const front = new THREE.MeshStandardMaterial({ map: makeChestTexture(256, true), roughness: 0.4, metalness: 0.2 });
    this.chest = new THREE.InstancedMesh(
      new THREE.BoxGeometry(CHEST.half[0] * 2, CHEST.half[1] * 2, CHEST.half[2] * 2),
      [side, side, side, side, front, front], 12);
    this.all = [this.silver, this.gold, this.ball, this.oban, this.daruma, this.chest];
    for (const m of this.all) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.meshes = {
      [KIND.SILVER]: this.silver, [KIND.GOLD]: this.gold, [KIND.BALL]: this.ball, [KIND.OBAN]: this.oban,
      [KIND.DARUMA]: this.daruma, [KIND.CHEST]: this.chest,
    };
  }

  setShadows(on) {
    for (const m of this.all) {
      m.castShadow = on;
      m.receiveShadow = on;
    }
  }

  update(world) {
    if (this.oban.count) {
      const t = performance.now() / 1000;
      this.rainbowFace.rotation = t * 0.9;
      this.rainbowRim.offset.x = (t * 0.25) % 1;
    }
    const counts = this.all.map(() => 0);
    const arrays = this.all.map((m) => m.instanceMatrix.array);
    const caps = this.all.map((m) => m.instanceMatrix.count);
    const { pos, quat, kind } = world;
    for (let i = 0; i < world.highWater; i++) {
      const k = kind[i];
      if (k < 0) continue;
      const n = counts[k];
      if (n >= caps[k]) continue;
      counts[k] = n + 1;
      const te = arrays[k];
      const o = n * 16;
      const x = quat[i * 4], y = quat[i * 4 + 1], z = quat[i * 4 + 2], w = quat[i * 4 + 3];
      const x2 = x + x, y2 = y + y, z2 = z + z;
      const xx = x * x2, xy = x * y2, xz = x * z2;
      const yy = y * y2, yz = y * z2, zz = z * z2;
      const wx = w * x2, wy = w * y2, wz = w * z2;
      te[o] = 1 - (yy + zz); te[o + 1] = xy + wz; te[o + 2] = xz - wy; te[o + 3] = 0;
      te[o + 4] = xy - wz; te[o + 5] = 1 - (xx + zz); te[o + 6] = yz + wx; te[o + 7] = 0;
      te[o + 8] = xz + wy; te[o + 9] = yz - wx; te[o + 10] = 1 - (xx + yy); te[o + 11] = 0;
      te[o + 12] = pos[i * 3]; te[o + 13] = pos[i * 3 + 1]; te[o + 14] = pos[i * 3 + 2]; te[o + 15] = 1;
    }
    this.all.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
    });
  }
}
