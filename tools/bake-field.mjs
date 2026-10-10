// Runs a long headless session until the pile reaches steady state, then
// writes the medal layout used at the start of every run.
//   node tools/bake-field.mjs [shots=600]
import { writeFileSync } from 'node:fs';
import { KIND } from '../src/sim/physics.js';
import { makeGame, step, aimFor } from './bot.mjs';

const { world, game } = makeGame(7, { field: null });
game.fillField();
game.newFreePlay();
game.bank = 1e6;
const shots = Number(process.argv[2] || 600);
// Medals only, no slot rewards: keep the slot quiet while baking.
game._applyOutcome = () => {};
game._addStock = () => null;
let t = 0, next = 0, n = 0;
while (n < shots) {
  if (t >= next) { game.setAim(aimFor(game, 'spread')); game.requestFire(); n++; next = t + 0.5; }
  step(world, game);
  t += 1 / 60;
}
for (let i = 0; i < 60 * 8; i++) step(world, game);
const snap = world.snapshot();
snap.bodies = snap.bodies.filter((b) => b[0] !== KIND.BALL && b[2] > -0.5);
if (!process.env.DRY) writeFileSync(new URL('../src/sim/initial-field.json', import.meta.url), JSON.stringify(snap));
console.log('paid', game.freeStats.paid, 'per shot', (game.freeStats.paid / shots).toFixed(2), 'catch', game.run.caught, '/', game.run.caught + game.run.missed);
console.log('baked', snap.bodies.length, 'medals, phase', snap.phase);
