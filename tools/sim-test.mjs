// Headless physics check: fills the field, runs the pusher, drops medals,
// and reports step timings and where medals went.
//   node tools/sim-test.mjs [coins=320] [seconds=40]
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { PhysicsWorld, KIND } from '../src/sim/physics.js';
import { HALF_W, FRONT_Z, KILL_Y, PUSHER, DROP, COIN } from '../src/sim/config.js';

await RAPIER.init();
let impacts = 0;
const world = new PhysicsWorld(RAPIER, { onImpact: process.env.EVENTS === '0' ? null : () => impacts++ });

const rnd = (a, b) => a + Math.random() * (b - a);
function tilt(maxAngle) {
  const ax = rnd(-1, 1), az = rnd(-1, 1);
  const len = Math.hypot(ax, az) || 1;
  const a = rnd(0, maxAngle), s = Math.sin(a / 2);
  return { x: ax / len * s, y: 0, z: az / len * s, w: Math.cos(a / 2) };
}

const target = Number(process.argv[2] || 320);
let placed = 0;
for (let layer = 0; placed < target && layer < 6; layer++)
  for (let z = PUSHER.frontMax + 0.6; z < FRONT_Z - 0.4 && placed < target; z += 1.02)
    for (let x = -HALF_W + 0.55; x < HALF_W - 0.5 && placed < target; x += 1.02) {
      world.spawn(KIND.SILVER, x + rnd(-0.25, 0.25), 0.1 + layer * 0.35, z + rnd(-0.25, 0.25), tilt(0.08));
      placed++;
    }
for (let z = -6.6; z < PUSHER.frontMin - 0.2; z += 1.05)
  for (let x = -HALF_W + 0.55; x < HALF_W - 0.5; x += 1.05)
    world.spawn(KIND.SILVER, x + rnd(-0.2, 0.2), PUSHER.height + 0.2, z, tilt(0.05));
console.log('spawned', world.count);

let front = 0, side = 0, dropped = 0;
const times = [];
const seconds = Number(process.argv[3] || 40);
const dropEvery = Number(process.env.DROP_EVERY || 30);
for (let s = 0; s < seconds * 60; s++) {
  if (s > 300 && s % dropEvery === 0) {
    world.spawn(KIND.SILVER, rnd(DROP.minX, DROP.maxX), DROP.y, DROP.z, tilt(0.5));
    dropped++;
  }
  world.step();
  times.push(world.lastStepMs);
  for (let i = 0; i < world.highWater; i++) {
    if (world.kind[i] < 0) continue;
    if (world.pos[i * 3 + 1] < KILL_Y) {
      if (world.pos[i * 3 + 2] > FRONT_Z - 0.2 && Math.abs(world.pos[i * 3]) < HALF_W + 0.3) front++; else side++;
      world.remove(i);
    }
  }
  if (s % 600 === 599) {
    const r = times.slice(-600);
    const avg = r.reduce((a, b) => a + b, 0) / r.length;
    console.log(`t=${(s + 1) / 60}s coins=${world.count} awake=${world.activeCount()} step avg=${avg.toFixed(2)}ms max=${Math.max(...r).toFixed(1)}ms front=${front} side=${side} dropped=${dropped} impacts=${impacts}`);
  }
}
let standing = 0, sunk = 0;
for (let i = 0; i < world.highWater; i++) {
  if (world.kind[i] < 0) continue;
  const qx = world.quat[i * 4], qz = world.quat[i * 4 + 2];
  if (Math.abs(1 - 2 * (qx * qx + qz * qz)) < 0.5) standing++;
  const y = world.pos[i * 3 + 1], z = world.pos[i * 3 + 2];
  if (y < COIN.halfHeight * 0.5 && y > -1 && z < FRONT_Z - 0.6 && Math.abs(world.pos[i * 3]) < HALF_W) sunk++;
}
console.log('standing on edge:', standing, 'sunk into floor:', sunk);
