// Headless physics check: plays the baked field with the pitchers for a while
// and reports step timings, body counts and where medals went.
//   node tools/sim-test.mjs [seconds=60]
import { makeGame, step, aimFor } from './bot.mjs';

const { world, game, counters } = makeGame(3);
game.resetField();
game.newFreePlay();
game.bank = 1e6;
const seconds = Number(process.argv[2] || 60);
const times = [];
for (let s = 0; s < seconds * 60; s++) {
  if (game.canFire()) { game.setAim(aimFor(game, 'spread')); game.requestFire(); }
  const t0 = performance.now();
  step(world, game);
  times.push(performance.now() - t0);
  if (s % 600 === 599) {
    const r = times.slice(-600);
    const avg = r.reduce((a, b) => a + b, 0) / r.length;
    console.log(`t=${(s + 1) / 60}s bodies=${world.count} awake=${world.activeCount()} step avg=${avg.toFixed(2)}ms max=${Math.max(...r).toFixed(1)}ms fired=${counters.fire || 0} caught=${game.run.caught} missed=${game.run.missed} checker=${counters.checker || 0}`);
  }
}
