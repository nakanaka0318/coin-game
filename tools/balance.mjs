// Balance harness: a bot plays with real physics and reports payout rates.
//   node tools/balance.mjs steady [drops=300] [interval=0.5] [aim=spread|center]
//   node tools/balance.mjs run [runs=3]
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { PhysicsWorld } from '../src/sim/physics.js';
import { Game } from '../src/game/game.js';
import { DROP } from '../src/sim/config.js';
import { readFileSync } from 'node:fs';

const initialField = JSON.parse(readFileSync(new URL('../src/sim/initial-field.json', import.meta.url)));

await RAPIER.init();
const mode = process.argv[2] || 'steady';

function makeGame(seed) {
  const world = new PhysicsWorld(RAPIER);
  const log = [];
  const counters = {};
  const game = new Game(world, {
    seed,
    initialField,
    emit: (type, d) => { counters[type] = (counters[type] || 0) + 1; log.push([type, d]); },
  });
  return { world, game, counters, log };
}

function step(world, game) { world.step(); game.update(1 / 60); }

function aimX(game, aim) {
  if (aim === 'center') return game.rng.range(-0.8, 0.8);
  if (aim === 'mid') return game.rng.range(-2, 2);
  return game.rng.range(DROP.minX, DROP.maxX);
}

if (mode === 'steady') {
  const drops = Number(process.argv[3] || 300);
  const interval = Number(process.argv[4] || 0.5);
  const aim = process.argv[5] || 'spread';
  const { world, game, counters } = makeGame(42);
  game.bank = 100000;
  game.resetField();
  game.newFreePlay();
  game.bank = 100000;
  let t = 0, nextDrop = 0, dropped = 0;
  const marks = [];
  const startPaid = () => game.freeStats.paid;
  let lastPaid = 0, lastDrop = 0, half = null;
  const t0 = performance.now();
  while (dropped < drops || game.rain.length || game.slot.spinning) {
    if (t >= nextDrop && dropped < drops) { game.drop(aimX(game, aim)); dropped++; nextDrop = t + interval; }
    step(world, game);
    t += 1 / 60;
    if (dropped === Math.floor(drops / 2) && !half) {
      half = { paid: game.freeStats.paid, lost: counters.lost || 0, checker: counters.checker || 0, bodies: world.count };
    }
    if (dropped % 50 === 0 && dropped !== lastDrop) {
      marks.push(`drops ${dropped}: paid +${game.freeStats.paid - lastPaid} bodies=${world.count} lost=${counters.lost || 0} checker=${counters.checker || 0} jp=${game.freeStats.jackpots}`);
      lastPaid = game.freeStats.paid; lastDrop = dropped;
    }
  }
  for (let i = 0; i < 600; i++) { step(world, game); }
  const hd = drops - Math.floor(drops / 2);
  console.log(`[${process.env.TAG || ''}] 2nd half per drop: paid ${((game.freeStats.paid - half.paid) / hd).toFixed(3)} lost ${(((counters.lost || 0) - half.lost) / hd).toFixed(3)} checker ${(((counters.checker || 0) - half.checker) / hd).toFixed(3)} bodies ${half.bodies}->${world.count}`);
  if (!process.env.QUIET) console.log(marks.join('\n'));
  console.log(`total drops=${dropped} paid=${startPaid()} perDrop=${(startPaid() / dropped).toFixed(3)} checker=${counters.checker || 0} spins=${counters.spin || 0} wins=${JSON.stringify(Object.fromEntries(Object.entries(counters).filter(([k]) => ['jackpot', 'ball', 'rain', 'slotResult'].includes(k))))} lost=${counters.lost || 0} time=${((performance.now() - t0) / 1000).toFixed(1)}s`);
}

if (mode === 'run') {
  const runs = Number(process.argv[3] || 3);
  const first = Number(process.env.FIRST || 0);
  const results = [];
  for (let k = first; k < first + runs; k++) {
    const { world, game, counters } = makeGame(1000 + k);
    game.newRun(1000 + k);
    let t = 0, nextDrop = 0;
    const nightLog = [];
    let guard = 0;
    while (game.phase !== 'over' && game.phase !== 'clear' && guard++ < 60 * 60 * 30) {
      if (game.phase === 'night') {
        if (process.env.DEBUG && game.night.time < 1 / 60 + 1e-9) console.log('night start', game.night.name, JSON.stringify(game.night.omen), 'stroke', world.pusherStroke, 'speed', world.pusherSpeed, 'gap', game.stats.checkerHalfGap);
        if (process.env.DEBUG && Math.round(game.night.time * 60) % 120 === 0) console.log('  t', game.night.time.toFixed(1), 'front', world.pusherFront.toFixed(2), 'phase', world.phase.toFixed(3), 'bodies', world.count, 'bank', game.bank, 'paid', game.night.paid);
        if (game.talismans.length && game.night.dropsLeft < 6) game.useTalisman(0);
        const n = game.night;
        const want = n.dropsLeft > 0 || game.netOf(n) < n.quota;
        if (t >= nextDrop && want && game.canDrop()) { game.drop(aimX(game, process.env.AIM || 'mid')); nextDrop = t + 0.5; }
        step(world, game);
        t += 1 / 60;
      } else if (game.phase === 'dawn') {
        const n = game.night;
        nightLog.push(`${n.name}: net ${game.netOf(n)}/${n.quota} drops ${n.dropsTotal}+${n.fromBank} bank(after tribute) ${game.bank} charms [${game.charms.join(',')}] omen ${n.omen?.name || '-'} | ${JSON.stringify(Object.fromEntries(Object.entries(counters).filter(([k]) => ['drop', 'payout', 'lost', 'checker', 'talisman', 'rain'].includes(k))))} bodies ${world.count}`);
        for (const key of Object.keys(counters)) delete counters[key];
        game.openShop();
      } else if (game.phase === 'shop') {
        // Buy the first affordable charm, then a talisman.
        for (const c of game.shop.charms) if (game.canBuy(c, 'charm') && game.bank - c.price >= 2) game.buy(c, 'charm');
        for (const tl of game.shop.talismans) if (game.canBuy(tl, 'talisman') && game.bank - tl.price >= 6) game.buy(tl, 'talisman');
        game.leaveShop();
      }
    }
    const n = game.night;
    nightLog.push(`END ${game.phase} at ${n.name}: net ${game.netOf(n)}/${n.quota} bank ${game.bank} charms [${game.charms.join(',')}] | ${JSON.stringify(Object.fromEntries(Object.entries(counters).filter(([k]) => ['drop', 'payout', 'lost', 'checker', 'talisman', 'rain', 'shop', 'bought'].includes(k))))} bodies ${world.count} talismans ${game.talismans}`);
    console.log(`--- run ${k}\n` + nightLog.join('\n'));
    results.push(game.phase === 'clear' ? 8 : game.nightIndex);
  }
  console.log('nights reached', results);
}
