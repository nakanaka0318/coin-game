// Balance harness: a bot plays with real physics and reports payout rates.
//   node tools/balance.mjs steady [shots=300] [interval=0.5] [aim=track|mid|spread]
//   node tools/balance.mjs run [runs=3]          (env AIM, META, FIRST, ECLIPSE)
import { makeGame, step, aimFor } from './bot.mjs';

const mode = process.argv[2] || 'steady';

if (mode === 'steady') {
  const shots = Number(process.argv[3] || 300);
  const interval = Number(process.argv[4] || 0.5);
  const aim = process.argv[5] || 'track';
  const { world, game, counters } = makeGame(42);
  game.bank = 100000;
  game.resetField();
  game.newFreePlay();
  game.bank = 100000;
  let t = 0, next = 0, fired = 0;
  const t0 = performance.now();
  while (fired < shots || game.rain.length || game.slot.spinning || game.fever > 0) {
    if (t >= next && fired < shots) { game.setAim(aimFor(game, aim)); game.requestFire(); fired++; next = t + interval; }
    step(world, game);
    t += 1 / 60;
    if (t > shots * interval + 120) break;
  }
  for (let i = 0; i < 600; i++) step(world, game);
  const c = counters;
  const caught = game.run.caught, missed = game.run.missed;
  console.log(`[${aim}] shots=${fired} paid=${game.freeStats.paid} perShot=${(game.freeStats.paid / fired).toFixed(2)} caught=${caught} missed=${missed} catchRate=${(caught / Math.max(1, caught + missed) * 100).toFixed(0)}% lostSide=${c.lost || 0} checker=${c.checker || 0} (${((c.checker || 0) / fired * 100).toFixed(0)}%) spins=${c.spin || 0} fevers=${c.fever || 0} jp=${c.jackpot || 0} bodies=${world.count} time=${((performance.now() - t0) / 1000).toFixed(0)}s`);
}

if (mode === 'run') {
  const runs = Number(process.argv[3] || 3);
  const first = Number(process.env.FIRST || 0);
  const aim = process.env.AIM || 'track';
  const results = [];
  for (let k = first; k < first + runs; k++) {
    const { world, game, counters } = makeGame(1000 + k);
    game.newRun(1000 + k, Number(process.env.ECLIPSE || 0));
    let t = 0, next = 0;
    const log = [];
    let guard = 0;
    while (game.phase !== 'over' && game.phase !== 'clear' && guard++ < 60 * 60 * 40) {
      if (game.phase === 'night') {
        const n = game.night;
        if (game.talismans.length && n.dropsLeft < 6) game.useTalisman(0);
        const want = n.dropsLeft > 0 || game.netOf(n) < n.quota;
        if (t >= next && want && game.canFire()) { game.setAim(aimFor(game, aim)); game.requestFire(); next = t + game.stats.fireInterval; }
        step(world, game);
        t += 1 / 60;
      } else if (game.phase === 'dawn') {
        const n = game.night;
        log.push(`[run ${k}] ${n.name}: net ${game.netOf(n)}/${n.quota} shots ${n.dropsTotal}+${n.fromBank} catch ${n.caught}/${n.caught + n.missed} bank ${game.bank} charms [${game.charms.join(',')}] ${n.omen?.name || n.boss?.name || ''} fevers ${counters.fever || 0} kills ${game.run.bossKills || 0}`);
        console.log(log[log.length - 1]);
        for (const key of Object.keys(counters)) delete counters[key];
        game.openShop();
      } else if (game.phase === 'shop') {
        for (const c of game.shop.charms) if (game.canBuy(c, 'charm') && game.bank - c.price >= 2) game.buy(c, 'charm');
        for (const tl of game.shop.talismans) if (game.canBuy(tl, 'talisman') && game.bank - tl.price >= 6) game.buy(tl, 'talisman');
        game.leaveShop();
      }
    }
    const n = game.night;
    log.push(`[run ${k}] END ${game.phase} at ${n.name}: net ${game.netOf(n)}/${n.quota} catch ${n.caught}/${n.caught + n.missed} bank ${game.bank} charms [${game.charms.join(',')}]`);
    console.log(log[log.length - 1]);
    results.push(game.phase === 'clear' ? 8 : game.nightIndex);
  }
  console.log('nights cleared', results);
}
