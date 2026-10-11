// Shared headless helpers: build a world + game and a simple aiming bot.
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { readFileSync } from 'node:fs';
import { PhysicsWorld } from '../src/sim/physics.js';
import { Game } from '../src/game/game.js';
import { AIM, TORII_MOTION } from '../src/sim/config.js';

await RAPIER.init();

export const initialField = JSON.parse(readFileSync(new URL('../src/sim/initial-field.json', import.meta.url)));

// META="boxSize=3,boxSpeed=2" sets moon shrine levels for the bot.
export function metaFromEnv() {
  const meta = {};
  for (const kv of (process.env.META || '').split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    meta[k] = Number(v);
  }
  return meta;
}

export function makeGame(seed, { field = initialField } = {}) {
  const world = new PhysicsWorld(RAPIER);
  const counters = {};
  const game = new Game(world, {
    seed,
    initialField: field,
    emit: (type) => { counters[type] = (counters[type] || 0) + 1; },
  });
  game.meta = metaFromEnv();
  if (process.env.BOXK) game.boxSharp = Number(process.env.BOXK);
  return { world, game, counters };
}

export function step(world, game) {
  world.step();
  game.update(1 / 60);
}

// Where the bot aims. 'track' leads the swaying torii like a careful player.
export function aimFor(game, strategy) {
  const r = game.rng;
  if (strategy === 'spread') return r.range(AIM.minX, AIM.maxX);
  // A careful player shoots the boss down first, leading its movement.
  const b = game.boss;
  if (strategy === 'track' && b?.alive) return b.x + b.vx * 0.55 + r.range(-0.35, 0.35);
  if (strategy === 'mid') return r.range(-2, 2);
  const w = game.world;
  const lead = 1.0;
  const t = w._moverT + lead;
  const x = TORII_MOTION.amp * Math.sin(2 * Math.PI * t * w.toriiSpeed / TORII_MOTION.period);
  return x + r.range(-0.9, 0.9);
}
