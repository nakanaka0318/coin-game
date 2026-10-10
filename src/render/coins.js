// Instanced rendering of every dynamic body (medals and balls).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COIN, GOLD_COIN, BALL } from '../sim/config.js';
import { KIND } from '../sim/physics.js';
import { makeCoinFace, makeReededEdge } from './textures.js';

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
    this.ball = new THREE.InstancedMesh(
      new THREE.SphereGeometry(BALL.radius, 40, 28),
      new THREE.MeshPhysicalMaterial({
        color: 0xffe9a8, metalness: 0.2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05,
        emissive: 0xd08a2a, emissiveIntensity: 0.35, iridescence: 0.4,
      }), 16);
    for (const m of [this.silver, this.gold, this.ball]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.meshes = { [KIND.SILVER]: this.silver, [KIND.GOLD]: this.gold, [KIND.BALL]: this.ball };
  }

  setShadows(on) {
    for (const m of [this.silver, this.gold, this.ball]) {
      m.castShadow = on;
      m.receiveShadow = on;
    }
  }

  update(world) {
    const counts = [0, 0, 0];
    const arrays = [this.silver.instanceMatrix.array, this.gold.instanceMatrix.array, this.ball.instanceMatrix.array];
    const caps = [this.silver.instanceMatrix.count, this.gold.instanceMatrix.count, this.ball.instanceMatrix.count];
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
    this.silver.count = counts[0];
    this.gold.count = counts[1];
    this.ball.count = counts[2];
    this.silver.instanceMatrix.needsUpdate = true;
    this.gold.instanceMatrix.needsUpdate = true;
    this.ball.instanceMatrix.needsUpdate = true;
  }
}
