// Runs a long headless session until the pile reaches steady state, then
// writes the medal layout used at the start of every run.
//   node tools/bake-field.mjs [drops=420]
import { writeFileSync } from 'node:fs';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { PhysicsWorld, KIND } from '../src/sim/physics.js';
import { Game } from '../src/game/game.js';
import { DROP } from '../src/sim/config.js';

await RAPIER.init();
const world = new PhysicsWorld(RAPIER);
const game = new Game(world, { seed: 7 });
game.fillField();
game.newFreePlay();
game.stats.goldChance = 0;
game.bank = 1e6;
const drops = Number(process.argv[2] || 420);
let t = 0, next = 0, n = 0;
// Medals only, no slot rewards: keep the slot from firing during baking.
game._applyOutcome = () => {};
while (n < drops) {
  if (t >= next) { game.drop(game.rng.range(DROP.minX, DROP.maxX)); n++; next = t + 0.5; }
  world.step(); game.update(1 / 60); t += 1 / 60;
}
// Let everything come to rest without new drops.
for (let i = 0; i < 60 * 8; i++) { world.step(); game.update(1 / 60); }
const snap = world.snapshot();
snap.bodies = snap.bodies.filter((b) => b[0] !== KIND.BALL);
if (!process.env.DRY) writeFileSync(new URL('../src/sim/initial-field.json', import.meta.url), JSON.stringify(snap));
console.log('front paid', game.freeStats.paid, 'per drop', (game.freeStats.paid / drops).toFixed(2));
console.log('baked', snap.bodies.length, 'medals, phase', snap.phase);
