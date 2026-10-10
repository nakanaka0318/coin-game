// Game rules on top of the physics world: pitchers, the offering box,
// the torii checker and slot, and the roguelike run (nights, quotas, shop).
// Has no DOM or rendering dependencies so it can be simulated headlessly.
import { KIND } from '../sim/physics.js';
import {
  HALF_W, FRONT_Z, RAIN, STAGE, PUSHER, BOX, PIT_Y, PITCHER, LANDING, AIM, WORLD,
  stagePoint,
} from '../sim/config.js';
import { CHECKER_POST_S } from '../sim/machine.js';
import {
  BASE_STATS, NIGHTS, BOSSES, OMENS, CHARMS, TALISMANS, SYMBOLS, SLOT_TABLE, FEVER_TABLE,
  OUTCOME_TIER, LAMP_COLORS, LAMP_WEIGHTS, PRESENTATION_WEIGHTS, RARITY_WEIGHT,
  EXTRA_DROPS, SHRINE, shardsFor,
} from './data.js';
import { makeRng } from './rng.js';

const FLAG_CHECKED = 1;
const FLAG_FLIGHT = 2; // lobbed by a pitcher, not yet landed
const FLAG_CAUGHT = 4; // landed in the offering box
const MAX_BODIES = 950;
const GRACE_SECONDS = 8;
const JP_BASE = 50;
const FEVER_CHAIN_MAX = 3;

const CHECKER_Z = stagePoint(0, CHECKER_POST_S, 0).z;
const CHECKER_Y = stagePoint(0, CHECKER_POST_S, 0).y;
const STAGE_SIN = Math.sin(STAGE.angle);
const STAGE_COS = Math.cos(STAGE.angle);
const BOX_RIM_Y = BOX.floorY + BOX.height;

export const charmById = Object.fromEntries(CHARMS.map((c) => [c.id, c]));
export const talismanById = Object.fromEntries(TALISMANS.map((t) => [t.id, t]));
export const shrineById = Object.fromEntries(SHRINE.map((u) => [u.id, u]));

function weightedPick(r, weights) {
  const entries = Object.entries(weights);
  let total = 0;
  for (const [, w] of entries) total += w;
  let u = r() * total;
  for (const [k, w] of entries) {
    u -= w;
    if (u <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

// Height of the stage surface at world z (inside the stage's z range).
function stageSurfaceY(z) {
  const t = (z - STAGE.top.z) / (STAGE.lip.z - STAGE.top.z);
  return STAGE.top.y + (STAGE.lip.y - STAGE.top.y) * t;
}

export class Game {
  constructor(world, { emit = () => {}, seed, initialField = null } = {}) {
    this.world = world;
    this.initialField = initialField;
    this.emit = emit;
    this.rng = makeRng(seed);
    this.mode = 'idle';
    this.phase = 'idle';
    this.bank = 0;
    this.charms = [];
    this.talismans = [];
    this.meta = {}; // shrine levels, set by the host
    this.stats = { ...BASE_STATS };
    this.jpPool = JP_BASE;
    this.jpFrac = 0;
    this.slot = {
      queue: [], spinning: false, t: 0, symbols: [0, 1, 2], outcome: null, stopAt: [0, 0, 0],
      stopped: [true, true, true], presentation: 'plain', pause: 0, lastWin: null, fakeThird: null,
      revealAt: 0, revealed: true,
    };
    this.fever = 0; // spins left in fever
    this.feverChain = 0;
    this.rain = [];
    this.timers = { tremor: 0, foxfire: 0, double: 0, mallet: 0, refill: 0, cashback: 0 };
    this.night = null;
    this.nightIndex = 0;
    this.shop = null;
    this.run = { paid: 0, dropped: 0, jackpots: 0, fevers: 0, seed: 0, caught: 0, missed: 0 };
    this.freeStats = { paid: 0, dropped: 0, jackpots: 0 };
    this.time = 0;
    this.stuck = new Float32Array(world.capacity);
    this.jamT = 0;
    this.caught = []; // { slot, body, t }
    // Pitchers: one aim target, each pitcher swings toward it.
    this.aim = { target: 0, x: [0, 0] };
    this.nextPitcher = 0;
    this.cooldown = 0;
    this.pendingShot = false;
    this.boxV = 0;
    this.boxFocus = 0;
    this.boxSharp = 3; // how strongly the box favours medals right at the edge
  }

  // --- field ---------------------------------------------------------------

  _tilt(max) {
    const r = this.rng;
    const ax = r.range(-1, 1), az = r.range(-1, 1);
    const len = Math.hypot(ax, az) || 1;
    const a = r.range(0, max), s = Math.sin(a / 2);
    return { x: (ax / len) * s, y: 0, z: (az / len) * s, w: Math.cos(a / 2) };
  }

  // Start from the baked steady-state pile when available.
  resetField() {
    this.caught = [];
    if (!this.initialField) { this.fillField(); return; }
    this.world.restore(this.initialField);
    for (let i = 0; i < 30; i++) {
      this.world.step();
      this._collect(true);
    }
  }

  // Lay medals on the field and let the pusher run until they settle.
  fillField(settleSteps = 600) {
    const w = this.world, r = this.rng;
    w.clearDynamic();
    const skip = [0, 0, 0.25, 0.6];
    for (let layer = 0; layer < skip.length; layer++) {
      for (let z = PUSHER.frontMax + 0.7; z < FRONT_Z - 0.3; z += 1.03) {
        for (let x = -HALF_W + 0.55; x < HALF_W - 0.5; x += 1.03) {
          if (r() < skip[layer]) continue;
          w.spawn(KIND.SILVER, x + r.range(-0.25, 0.25), 0.08 + layer * 0.3, z + r.range(-0.25, 0.25), this._tilt(0.06));
        }
      }
    }
    for (let layer = 0; layer < 2; layer++) {
      for (let z = -6.6; z < PUSHER.frontMin - 0.1; z += 1.05) {
        for (let x = -HALF_W + 0.55; x < HALF_W - 0.5; x += 1.05) {
          if (layer === 1 && r() < 0.5) continue;
          w.spawn(KIND.SILVER, x + r.range(-0.15, 0.15), PUSHER.height + 0.1 + layer * 0.3, z, this._tilt(0.04));
        }
      }
    }
    for (let i = 0; i < settleSteps; i++) {
      w.step();
      this._collect(true);
    }
  }

  // --- run lifecycle ---------------------------------------------------------

  metaLevel(id) {
    return Math.min(this.meta[id] || 0, shrineById[id]?.max ?? 0);
  }

  newRun(seed) {
    this.rng = makeRng(seed);
    this.mode = 'run';
    this.bank = 5 + 5 * this.metaLevel('startBank');
    this.charms = [];
    this.talismans = ['quake'];
    for (let i = 0; i < this.metaLevel('starter'); i++) this.talismans.push(this.rng.pick(TALISMANS).id);
    this._recomputeStats();
    this.talismans.length = Math.min(this.talismans.length, this.stats.talismanSlots);
    this.jpPool = JP_BASE;
    this.jpFrac = 0;
    this.fever = 0;
    this.run = { paid: 0, dropped: 0, jackpots: 0, fevers: 0, seed: this.rng.state(), caught: 0, missed: 0 };
    this.slot.queue = [];
    this.slot.spinning = false;
    this.rain = [];
    this.nightIndex = 0;
    this.resetField();
    this.startNight();
  }

  newFreePlay() {
    this.mode = 'free';
    this.phase = 'free';
    this.charms = [];
    this.talismans = [];
    if (this.bank <= 0) this.bank = 50;
    this.night = null;
    this.rain = [];
    this.slot.queue = [];
    this.slot.spinning = false;
    this.fever = 0;
    this.pendingShot = false;
    this.cooldown = 0;
    this._recomputeStats();
    if (this.world.count < 50) this.resetField();
    this.emit('free');
  }

  _recomputeStats(extra = null) {
    const s = { ...BASE_STATS };
    for (const u of SHRINE) {
      const lv = this.metaLevel(u.id);
      if (lv > 0) u.apply(s, lv);
    }
    for (const id of this.charms) charmById[id]?.apply(s);
    if (extra) extra(s);
    s.rerollBase = Math.max(1, s.rerollBase);
    this.stats = s;
    const w = this.world;
    w.pusherStroke = s.stroke;
    w.pusherSpeed = s.speed;
    w.setCheckerHalfGap(s.checkerHalfGap);
    w.setPinBounce(s.pinBounce);
    w.setEnabled('sideGuard', !!s.sideGuards);
    w.setEnabled('wallFront', !s.shortWalls);
    w.setBoxWidth(s.boxWidth);
    this.emit('stats', s);
  }

  startNight() {
    const def = NIGHTS[this.nightIndex];
    const r = this.rng;
    let omen = null;
    if (!def.boss && this.nightIndex > 0) omen = r.pick(OMENS);
    const boss = def.boss ? BOSSES[def.boss] : null;
    this._recomputeStats((s) => {
      if (omen) omen.apply(s);
      if (boss) boss.apply(s);
    });
    this.night = {
      index: this.nightIndex,
      name: def.name,
      reading: def.reading,
      moonPhase: def.phase,
      quota: def.quota,
      paid: 0,
      dropsLeft: this.stats.dropsPerNight,
      dropsTotal: this.stats.dropsPerNight,
      fromBank: 0,
      caught: 0,
      missed: 0,
      omen: omen ? { id: omen.id, name: omen.name, desc: omen.desc, good: omen.good } : null,
      boss: boss ? { name: boss.name, desc: boss.desc } : null,
      grace: GRACE_SECONDS,
      cleared: false,
      time: 0,
    };
    this.timers.tremor = this.stats.tremor || 0;
    this.timers.foxfire = this.stats.foxfire || 0;
    this.timers.double = 0;
    this.pendingShot = false;
    this.cooldown = 0;
    this.phase = 'night';
    if (this.stats.openingRain) this.queueRain(this.stats.openingRain, KIND.SILVER, 0.4);
    this.emit('nightStart', this.night);
  }

  // Player ends the night early (only once the quota is met).
  callDawn() {
    if (this.phase !== 'night' || !this.night.cleared) return;
    this._dawn();
  }

  _dawn() {
    const n = this.night;
    const s = this.stats;
    const success = this.netOf(n) >= n.quota;
    if (!success) {
      this.phase = 'over';
      const shards = shardsFor(n.index, false);
      this.emit('gameOver', { night: n, run: this.run, shards, cleared: n.index });
      return;
    }
    // The quota is paid to the moon as tribute; what is left buys charms.
    this.bank -= n.quota;
    const reward = { tribute: n.quota, base: 2 + n.index, interest: 0, bonus: s.nightBonus, over: 0 };
    if (s.interestPer) reward.interest = Math.min(s.interestCap, Math.floor(this.bank / s.interestPer));
    if (s.overQuotaBonus) reward.over = Math.floor((this.netOf(n) - n.quota) / s.overQuotaBonus);
    reward.total = reward.base + reward.interest + reward.bonus + reward.over;
    this.bank += reward.total;
    n.reward = reward;
    if (this.nightIndex >= NIGHTS.length - 1) {
      this.phase = 'clear';
      const shards = shardsFor(NIGHTS.length, true);
      this.emit('runClear', { night: n, run: this.run, reward, shards, cleared: NIGHTS.length });
      return;
    }
    this.phase = 'dawn';
    this.emit('nightEnd', { night: n, reward });
  }

  openShop() {
    this.phase = 'shop';
    this.shop = { charms: [], talismans: [], rerollCost: this.stats.rerollBase, freeRerolls: this.stats.freeRerolls };
    this._stockShop();
    this.emit('shop', this.shop);
  }

  _stockShop() {
    const r = this.rng;
    const pool = CHARMS.filter((c) => !this.charms.includes(c.id));
    const picks = [];
    for (let i = 0; i < this.stats.shopCharms && pool.length; i++) {
      const total = pool.reduce((a, c) => a + RARITY_WEIGHT[c.rarity], 0);
      let u = r() * total;
      let idx = 0;
      for (; idx < pool.length; idx++) {
        u -= RARITY_WEIGHT[pool[idx].rarity];
        if (u <= 0) break;
      }
      idx = Math.min(idx, pool.length - 1);
      picks.push({ id: pool[idx].id, price: pool[idx].price, sold: false });
      pool.splice(idx, 1);
    }
    this.shop.charms = picks;
    this.shop.talismans = [0, 1].map(() => {
      const t = r.pick(TALISMANS);
      return { id: t.id, price: t.price, sold: false };
    });
  }

  rerollCost() {
    if (!this.shop) return 0;
    return this.shop.freeRerolls > 0 ? 0 : this.shop.rerollCost;
  }

  reroll() {
    if (this.phase !== 'shop') return false;
    const cost = this.rerollCost();
    if (this.bank < cost) return false;
    if (this.shop.freeRerolls > 0) this.shop.freeRerolls -= 1;
    else { this.bank -= cost; this.shop.rerollCost += 1; }
    this._stockShop();
    this.emit('shop', this.shop);
    return true;
  }

  canBuy(item, type) {
    if (item.sold || this.bank < item.price) return false;
    if (type === 'charm') return this.charms.length < this.stats.maxCharms;
    return this.talismans.length < this.stats.talismanSlots;
  }

  buy(item, type) {
    if (this.phase !== 'shop' || !this.canBuy(item, type)) return false;
    this.bank -= item.price;
    item.sold = true;
    if (type === 'charm') {
      this.charms.push(item.id);
      this._recomputeStats();
    } else {
      this.talismans.push(item.id);
    }
    this.emit('shop', this.shop);
    this.emit('bought', { id: item.id, type });
    return true;
  }

  sellCharm(index) {
    const id = this.charms[index];
    if (!id) return false;
    this.bank += Math.floor(charmById[id].price / 2);
    this.charms.splice(index, 1);
    this._recomputeStats();
    if (this.shop) this.emit('shop', this.shop);
    this.emit('sold', { id });
    return true;
  }

  leaveShop() {
    if (this.phase !== 'shop') return;
    this.shop = null;
    this.nightIndex += 1;
    this.startNight();
  }

  // --- player actions --------------------------------------------------------

  // In a run the night's own medals are used first, then the bank.
  canFire() {
    if (this.mode === 'free') return this.phase === 'free' && this.bank > 0;
    const n = this.night;
    return this.phase === 'night' && (n.dropsLeft > 0 || (this.bank > 0 && n.fromBank < EXTRA_DROPS));
  }

  // The night's balance: medals paid out minus medals taken from the bank.
  netOf(n = this.night) {
    return n ? n.paid - n.fromBank : 0;
  }

  extraDropsLeft() {
    const n = this.night;
    return n ? Math.max(0, Math.min(EXTRA_DROPS - n.fromBank, this.bank)) : 0;
  }

  setAim(x) {
    this.aim.target = Math.max(AIM.minX, Math.min(AIM.maxX, x));
  }

  // Ask for a shot; it fires as soon as the pitchers are ready.
  requestFire() {
    if (!this.canFire()) return false;
    this.pendingShot = true;
    return true;
  }

  pitcherPos(i) {
    const side = i === 0 ? -1 : 1;
    return { x: side * PITCHER.x, y: PITCHER.y, z: PITCHER.z, side };
  }

  // Muzzle position and launch velocity for pitcher i aimed at its aim x.
  _launch(i, noise = 0.12) {
    const r = this.rng;
    const p = this.pitcherPos(i);
    const tx = this.aim.x[i] + r.range(-noise, noise);
    const tgt = stagePoint(tx, LANDING.s + r.range(-noise, noise), 0.12);
    const dx = tgt.x - p.x, dz = tgt.z - p.z;
    const hd = Math.hypot(dx, dz) || 1;
    const m = { x: p.x + (dx / hd) * PITCHER.barrel, y: p.y + 0.15, z: p.z + (dz / hd) * PITCHER.barrel };
    const dist = Math.hypot(tgt.x - m.x, tgt.z - m.z);
    const T = 0.42 + 0.035 * dist;
    const g = WORLD.gravity;
    const v = { x: (tgt.x - m.x) / T, y: (tgt.y - m.y) / T - 0.5 * g * T, z: (tgt.z - m.z) / T };
    return { m, v, tx };
  }

  _fire(i, kind, free = false) {
    const { m, v, tx } = this._launch(i);
    const r = this.rng;
    const slot = this.world.spawn(kind, m.x, m.y, m.z, this._tilt(0.5), v,
      { x: r.range(-2, 2), y: (i === 0 ? 1 : -1) * r.range(12, 18), z: r.range(-2, 2) });
    if (slot >= 0) this.world.flags[slot] |= FLAG_FLIGHT;
    this.emit('fire', { pitcher: i, x: tx, kind, free });
    return slot;
  }

  _takeShot() {
    if (!this.canFire() || this.world.count >= MAX_BODIES) return false;
    const r = this.rng;
    const s = this.stats;
    if (this.mode === 'run') {
      if (this.night.dropsLeft > 0) this.night.dropsLeft -= 1;
      else { this.bank -= 1; this.night.fromBank += 1; this._checkQuota(); }
      this.night.grace = GRACE_SECONDS;
      this.run.dropped += 1;
    } else {
      this.bank -= 1;
      this.freeStats.dropped += 1;
    }
    this.jpFrac += 1 / 2;
    while (this.jpFrac >= 1) { this.jpFrac -= 1; this.jpPool += 1; }
    const u = r();
    const kind = u < s.obanChance ? KIND.OBAN : u < s.obanChance + s.goldChance ? KIND.GOLD : KIND.SILVER;
    const i = this.nextPitcher;
    this.nextPitcher ^= 1;
    this._fire(i, kind);
    if (s.twinChance && r() < s.twinChance) {
      this._pushRain({ at: this.world.time + 0.12, kind: KIND.SILVER, pitcher: i ^ 1 });
      this.emit('twin', {});
    }
    return true;
  }

  _pitcherTick(dt) {
    const s = this.stats;
    for (let i = 0; i < 2; i++) {
      const d = this.aim.target - this.aim.x[i];
      const step = s.turnSpeed * dt;
      this.aim.x[i] += Math.abs(d) <= step ? d : Math.sign(d) * step;
    }
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.pendingShot && this.cooldown <= 0) {
      this.pendingShot = false;
      if (this._takeShot()) this.cooldown = s.fireInterval;
    }
  }

  useTalisman(index) {
    const id = this.talismans[index];
    if (!id) return false;
    if (this.mode === 'run' && this.phase !== 'night') return false;
    this.talismans.splice(index, 1);
    this._applyTalisman(id);
    this.emit('talisman', { id });
    return true;
  }

  _applyTalisman(id) {
    const s = this.stats;
    switch (id) {
      case 'quake': this.quake(1.0 * s.quakePower); break;
      case 'gust': this.gust(); break;
      case 'gold': for (let i = 0; i < 3; i++) this._pushRain({ at: this.world.time + i * 0.25, kind: KIND.GOLD, table: true }); break;
      case 'ball': this.spawnBall(); break;
      case 'rain': this.queueRain(15, KIND.SILVER); break;
      case 'double': this.timers.double = 20; break;
      case 'spin': for (let i = 0; i < 3; i++) this._addStock(true); break;
      case 'fever': this._startFever(); break;
      default: break;
    }
  }

  quake(power = 1) {
    const w = this.world, r = this.rng;
    for (let i = 0; i < w.highWater; i++) {
      if (w.kind[i] < 0 || (w.flags[i] & FLAG_CAUGHT)) continue;
      const y = w.pos[i * 3 + 1];
      if (y > 3 || y < -0.5) continue;
      const m = w.mass(i);
      w.impulse(i, r.range(-1, 1) * m * 1.6 * power, r.range(1.2, 2.6) * m * power, r.range(-0.2, 1.4) * m * 1.6 * power);
    }
    this.emit('quake', { power });
  }

  gust() {
    const w = this.world, r = this.rng;
    for (let i = 0; i < w.highWater; i++) {
      if (w.kind[i] < 0) continue;
      const y = w.pos[i * 3 + 1], z = w.pos[i * 3 + 2];
      if (y > 1.6 || y < -0.3 || z < FRONT_Z - 2.8 || z > FRONT_Z) continue;
      const m = w.mass(i);
      w.impulse(i, r.range(-0.3, 0.3) * m, r.range(0.8, 1.6) * m, r.range(3.2, 5) * m);
    }
    this.emit('gust', {});
  }

  spawnBall() {
    const r = this.rng;
    const x = r.range(-HALF_W + 1.5, HALF_W - 1.5);
    this.world.spawn(KIND.BALL, x, 3.2, -6.2, null, { x: 0, y: -1, z: 1 });
    this.emit('ball', { x });
  }

  _pushRain(d) {
    let i = this.rain.length;
    while (i > 0 && this.rain[i - 1].at > d.at) i--;
    this.rain.splice(i, 0, d);
  }

  queueRain(n, kind = KIND.SILVER, delay = 0) {
    const t0 = this.world.time + delay;
    for (let i = 0; i < n; i++) this.rain.push({ at: t0 + i * 0.06, kind });
    this.rain.sort((a, b) => a.at - b.at);
    this.emit('rain', { n, kind });
  }

  // --- simulation tick -------------------------------------------------------

  update(dt) {
    this.time += dt;
    const w = this.world;
    const r = this.rng;
    const s = this.stats;

    // Fever speeds the pusher up so the pile pours over the edge.
    w.pusherSpeed = s.speed * (this.fever > 0 ? 1.7 : 1);

    // Spawn queued medals.
    while (this.rain.length && this.rain[0].at <= w.time) {
      const d = this.rain.shift();
      if (w.count >= MAX_BODIES) continue;
      if (d.pitcher !== undefined) {
        this._fire(d.pitcher, d.kind, true);
      } else if (d.table) {
        w.spawn(d.kind, r.range(-HALF_W + 1, HALF_W - 1), 2.6, r.range(-6.6, -5.6), this._tilt(0.6));
      } else if (d.stage) {
        const p = stagePoint(r.range(AIM.minX, AIM.maxX), LANDING.s, 0.6);
        w.spawn(d.kind, p.x, p.y, p.z, this._tilt(0.4));
      } else {
        w.spawn(d.kind, r.range(RAIN.minX, RAIN.maxX), RAIN.y + r.range(0, 1.5), r.range(RAIN.minZ, RAIN.maxZ),
          this._tilt(1.2), { x: 0, y: -4, z: 0 }, { x: r.range(-6, 6), y: r.range(-4, 4), z: r.range(-6, 6) });
      }
    }

    if (this.phase === 'night' || this.phase === 'free') this._pitcherTick(dt);
    this._landings();
    this._collect(false);
    this._boxTick(dt);
    this._unjam(dt);
    this._magnet(dt);
    this._slotTick(dt);
    this._timers(dt);
    if (this.mode === 'run' && this.phase === 'night') this._nightTick(dt);
  }

  // A lobbed medal lands on the felt strip, which soaks up most of its speed
  // so it starts sliding from where it was aimed.
  _landings() {
    const w = this.world;
    for (let i = 0; i < w.highWater; i++) {
      if (w.kind[i] < 0 || !(w.flags[i] & FLAG_FLIGHT)) continue;
      const y = w.pos[i * 3 + 1], z = w.pos[i * 3 + 2];
      const vy = w.vel[i * 3 + 1];
      if (w.age[i] > 3 || y < STAGE.lip.y - 1) { w.flags[i] &= ~FLAG_FLIGHT; continue; }
      if (z < STAGE.top.z || z > STAGE.lip.z) continue;
      if (vy < 0 && y - stageSurfaceY(z) < 0.4) {
        w.flags[i] &= ~FLAG_FLIGHT;
        const vx = w.vel[i * 3], vz = w.vel[i * 3 + 2];
        w.setVelocity(i, vx * 0.06, vy * 0.2, vz * 0.1 + STAGE_COS * 0.6);
        w.setSpin(i, 0, 0, 0);
        this.emit('landed', { x: w.pos[i * 3], z });
      }
    }
  }

  // The offering box moves to the rail position whose opening covers the
  // most value about to fall: medals already falling (if it can still get
  // under them) and medals near the edge, weighted by how close they are.
  _boxTick(dt) {
    const w = this.world;
    const s = this.stats;
    const g = WORLD.gravity;
    const boxX = w.boxX;
    const half = w.boxWidth / 2;
    const pts = this._boxPts || (this._boxPts = []);
    pts.length = 0;
    for (let i = 0; i < w.highWater; i++) {
      const k = w.kind[i];
      if (k < 0 || (w.flags[i] & FLAG_CAUGHT)) continue;
      const x = w.pos[i * 3], y = w.pos[i * 3 + 1], z = w.pos[i * 3 + 2];
      if (z < FRONT_Z - 1.4 || y > 1.4 || y < BOX_RIM_Y - 0.2 || Math.abs(x) > HALF_W + 0.3) continue;
      const falling = z > FRONT_Z - 0.05 && y < 0.05;
      if (!falling && y < -0.1) continue; // dropping down a side gutter
      const value = this._valueOf(k);
      if (falling) {
        const vy = w.vel[i * 3 + 1];
        const drop = Math.max(0, y - BOX_RIM_Y);
        const eta = (vy + Math.sqrt(Math.max(0, vy * vy - 2 * g * drop))) / -g;
        const tx = x + w.vel[i * 3] * eta;
        pts.push(tx, value * 6, eta);
      } else {
        const vz = Math.max(0, w.vel[i * 3 + 2]);
        pts.push(x, value * Math.exp(-(FRONT_Z - z) * this.boxSharp) * (1 + vz * 2), 99);
      }
    }
    let target = this.boxFocus;
    if (pts.length) {
      const lim = HALF_W + 0.3 - half;
      let best = -Infinity;
      for (let cx = -lim; cx <= lim + 1e-6; cx += 0.25) {
        const travel = Math.abs(cx - boxX) / s.boxSpeed;
        let score = -0.12 * Math.abs(cx - boxX);
        for (let j = 0; j < pts.length; j += 3) {
          const px = pts[j];
          if (Math.abs(px - cx) > half - 0.25) continue;
          // A falling medal only counts if the box can arrive in time.
          if (pts[j + 2] < 99 && travel > pts[j + 2] + 0.05) continue;
          score += pts[j + 1];
        }
        if (score > best) { best = score; target = cx; }
      }
    }
    this.boxFocus = target;
    const d = w.clampBoxX(target) - boxX;
    const maxStep = s.boxSpeed * dt;
    const next = boxX + (Math.abs(d) <= maxStep ? d : Math.sign(d) * maxStep);
    this.boxV = (next - boxX) / dt;
    w.setBoxTarget(next);
  }

  _timers(dt) {
    const t = this.timers;
    const s = this.stats;
    if (t.double > 0) t.double = Math.max(0, t.double - dt);
    if (this.phase !== 'night' && this.phase !== 'free') return;
    if (s.tremor) {
      t.tremor -= dt;
      if (t.tremor <= 0) { t.tremor = s.tremor; this.quake(0.55); }
    }
    if (s.foxfire) {
      t.foxfire -= dt;
      if (t.foxfire <= 0) { t.foxfire = s.foxfire; this._pushRain({ at: this.world.time, kind: KIND.GOLD, stage: true }); this.emit('foxfire', {}); }
    }
  }

  _nightTick(dt) {
    const n = this.night;
    n.time += dt;
    // Once the night's medals are gone the night ends after a calm spell
    // with no new shots (shooting from the bank resets the countdown).
    const out = n.dropsLeft <= 0;
    const busy = this.rain.length > 0 || this.slot.spinning || this.slot.queue.length > 0 || this.fever > 0;
    if (out && !busy) {
      n.grace -= dt;
      if (n.grace <= 0) this._dawn();
    } else {
      n.grace = GRACE_SECONDS;
    }
  }

  // Stage vibrator: medals that stop on the stage get nudged downhill so
  // the stage never clogs.
  _unjam(dt) {
    this.jamT += dt;
    if (this.jamT < 0.25) return;
    const step = this.jamT;
    this.jamT = 0;
    const w = this.world, r = this.rng;
    for (let i = 0; i < w.highWater; i++) {
      if (w.kind[i] < 0) continue;
      const y = w.pos[i * 3 + 1], z = w.pos[i * 3 + 2];
      if (z > STAGE.lip.z - 0.15 || z < STAGE.top.z - 0.5 || y < STAGE.lip.y - 0.2) { this.stuck[i] = 0; continue; }
      const vx = w.vel[i * 3], vy = w.vel[i * 3 + 1], vz = w.vel[i * 3 + 2];
      const slow = !w.awake[i] || vx * vx + vy * vy + vz * vz < 0.09;
      this.stuck[i] = slow ? this.stuck[i] + step : 0;
      if (this.stuck[i] > 0.75) {
        this.stuck[i] = 0;
        const m = w.mass(i);
        const k = r.range(1.2, 2.2) * m;
        w.impulse(i, r.range(-0.9, 0.9) * m, -STAGE_SIN * k + STAGE_COS * 0.9 * m, STAGE_COS * k + STAGE_SIN * 0.9 * m);
      }
    }
  }

  _magnet(dt) {
    const s = this.stats;
    if (!s.magnet) return;
    const w = this.world;
    for (let i = 0; i < w.highWater; i++) {
      if (w.kind[i] < 0) continue;
      const y = w.pos[i * 3 + 1], z = w.pos[i * 3 + 2];
      if (y > 0.9 || y < -0.2 || z < FRONT_Z - 1.1 || z > FRONT_Z + 0.2) continue;
      w.impulse(i, 0, 0, w.mass(i) * 1.1 * s.magnet * dt);
    }
  }

  _valueOf(kind) {
    const s = this.stats;
    if (kind === KIND.BALL) return s.ballValue;
    if (kind === KIND.OBAN) return s.obanValue;
    if (kind === KIND.GOLD) return s.goldValue;
    return 1;
  }

  // Medals passing the torii, landing in the box, or lost in the pit.
  _collect(silent) {
    const w = this.world;
    if (this.phase === 'idle' || this.phase === 'over' || this.phase === 'clear') silent = true;
    const s = this.stats;
    const gap = s.checkerHalfGap;
    const toriiX = w.toriiX;
    const boxX = w.boxX, boxHalf = w.boxWidth / 2;
    for (let i = 0; i < w.highWater; i++) {
      const k = w.kind[i];
      if (k < 0 || !w.awake[i]) continue;
      const f = w.flags[i];
      if (f & FLAG_CAUGHT) continue;
      const x = w.pos[i * 3], y = w.pos[i * 3 + 1], z = w.pos[i * 3 + 2];
      if (!(f & FLAG_CHECKED) && z > CHECKER_Z && y > CHECKER_Y - 0.6 && k !== KIND.BALL) {
        w.flags[i] |= FLAG_CHECKED;
        if (!silent && Math.abs(x - toriiX) < gap) this._checker(x);
      }
      // Inside the offering box?
      if (y < BOX_RIM_Y - 0.05 && y > BOX.floorY - 0.1 && Math.abs(x - boxX) < boxHalf + 0.05 && Math.abs(z - BOX.z) < BOX.depth / 2 + 0.05) {
        if (silent) { w.remove(i); continue; }
        w.flags[i] |= FLAG_CAUGHT;
        this.caught.push({ slot: i, body: w.bodies[i], t: this.time });
        const value = this._valueOf(k);
        if (this.night) this.night.caught += 1;
        this.run.caught += 1;
        if (k === KIND.BALL) this._ballPayout(x, value);
        else this._credit(value, x, k);
        continue;
      }
      if (y < PIT_Y || y > 25 || Math.abs(x) > 16 || z < -20 || z > 16) {
        const front = z > FRONT_Z - 0.3 && Math.abs(x) < HALF_W + 0.4;
        w.remove(i);
        if (silent) continue;
        if (front) this._missed(x, k);
        else this._lost(x, z, k);
      }
    }
    // Caught medals rest in the box for a moment, then vanish.
    if (this.caught.length) {
      const keep = [];
      for (const c of this.caught) {
        if (w.bodies[c.slot] !== c.body) continue;
        if (this.time - c.t > 1.1 || keep.length > 30) w.remove(c.slot);
        else keep.push(c);
      }
      this.caught = keep;
    }
  }

  _credit(value, x, kind) {
    const s = this.stats;
    if (this.timers.double > 0) value *= 2;
    this.bank += value;
    if (this.mode === 'run') {
      this.run.paid += value;
      if (this.night && this.phase === 'night') {
        this.night.paid += value;
        this._checkQuota();
      }
    } else {
      this.freeStats.paid += value;
    }
    if (s.refillEvery) {
      this.timers.refill += value;
      while (this.timers.refill >= s.refillEvery) {
        this.timers.refill -= s.refillEvery;
        this._pushRain({ at: this.world.time + 0.2, kind: KIND.SILVER, table: true });
      }
    }
    if (s.malletEvery) {
      this.timers.mallet += value;
      while (this.timers.mallet >= s.malletEvery) {
        this.timers.mallet -= s.malletEvery;
        this._pushRain({ at: this.world.time + 0.3, kind: KIND.GOLD, stage: true });
        this.emit('mallet', {});
      }
    }
    this.emit('payout', { value, x, kind });
  }

  _checkQuota() {
    const n = this.night;
    const met = this.netOf(n) >= n.quota;
    if (met && !n.metOnce) {
      n.metOnce = true;
      this.emit('quotaMet', n);
    }
    n.cleared = met;
  }

  _ballPayout(x, value) {
    this._credit(value, x, KIND.BALL);
    this._addStock(true);
    this.emit('ballPayout', { value, x });
  }

  // A medal went over the front edge but missed the box.
  _missed(x, kind) {
    const s = this.stats;
    if (this.night) this.night.missed += 1;
    this.run.missed += 1;
    if (kind !== KIND.BALL && s.cashback && this.rng() < s.cashback) {
      this.bank += 1;
      this.emit('cashback', { x });
    } else {
      this.emit('missed', { x, kind });
    }
  }

  _lost(x, z, kind) {
    const s = this.stats;
    if (kind !== KIND.BALL && s.sideRefund && this.rng() < s.sideRefund) {
      this.bank += 1;
      this.emit('refund', { x, z });
    } else {
      this.emit('lost', { x, z, kind });
    }
  }

  _checker(x) {
    const added = this._addStock(false);
    if (this.fever > 0) this._addStock(false);
    this.emit('checker', { x, stock: this.slot.queue.length, added });
  }

  // --- slot ------------------------------------------------------------------

  _drawOutcome(fever) {
    const s = this.stats;
    const r = this.rng;
    const table = fever ? FEVER_TABLE : SLOT_TABLE;
    const p = {
      seven: table.seven * s.jpLuck * s.slotLuck,
      moon: table.moon * s.moonLuck * s.slotLuck,
      rabbit: table.rabbit * s.slotLuck,
      dango: table.dango * s.slotLuck,
      sakura: table.sakura * s.slotLuck,
      star: table.star * s.slotLuck,
    };
    let u = r();
    for (const id of Object.keys(p)) {
      if (u < p[id]) return id;
      u -= p[id];
    }
    return null;
  }

  // Outcomes are drawn when a hold is added, so its lamp colour can hint at
  // what is coming (保留変化).
  _rollEntry(fever) {
    const outcome = this._drawOutcome(fever);
    const tier = outcome ? OUTCOME_TIER[outcome] : 0;
    const w = LAMP_WEIGHTS[tier];
    let u = this.rng() * w.reduce((a, b) => a + b, 0);
    let c = 0;
    for (; c < w.length; c++) { u -= w[c]; if (u <= 0) break; }
    return { outcome, color: LAMP_COLORS[Math.min(c, LAMP_COLORS.length - 1)] };
  }

  _addStock(force) {
    const q = this.slot.queue;
    const max = this.stats.stockMax;
    if (!force && q.length >= max) return null;
    const e = this._rollEntry(this.fever > 0);
    q.push(e);
    this.emit('stock', { color: e.color, count: q.length });
    return e;
  }

  _startFever() {
    const first = this.fever <= 0;
    if (first) this.feverChain = 0;
    else this.feverChain += 1;
    // A hit during fever refills the spins (連チャン), up to FEVER_CHAIN_MAX times in a row.
    if (first || this.feverChain <= FEVER_CHAIN_MAX) this.fever = Math.max(this.fever, this.stats.feverSpins);
    // Holds already waiting get re-drawn with fever odds (big ones are kept).
    this.slot.queue = this.slot.queue.map((e) => (e.outcome && OUTCOME_TIER[e.outcome] >= 3 ? e : this._rollEntry(true)));
    for (let i = this.slot.queue.length; i < 2; i++) this.slot.queue.push(this._rollEntry(true));
    if (first) this.run.fevers += 1;
    this.emit('fever', { spins: this.fever, first });
  }

  _slotTick(dt) {
    const sl = this.slot;
    if (!sl.spinning) {
      if (sl.pause > 0) { sl.pause -= dt; return; }
      const active = this.phase === 'night' || this.phase === 'free';
      if (active && sl.queue.length > 0) this._startSpin();
      else if (active && this.fever > 0) {
        // Fever keeps the reels turning even without holds.
        sl.queue.push(this._rollEntry(true));
        this._startSpin();
      }
      return;
    }
    sl.t += dt;
    for (let i = 0; i < 3; i++) {
      if (!sl.stopped[i] && sl.t >= sl.stopAt[i]) {
        sl.stopped[i] = true;
        this.emit('reelStop', { reel: i, reach: sl.reach && i === 1, presentation: sl.presentation });
      }
    }
    if (!sl.revealed && sl.t >= sl.revealAt) {
      sl.revealed = true;
      this.emit(sl.presentation === 'revival' ? 'revival' : 'slip', { outcome: sl.outcome });
    }
    if (sl.t >= sl.endAt) {
      sl.spinning = false;
      sl.pause = this.fever > 0 ? 0.2 : 0.35;
      this._applyOutcome(sl.outcome);
    }
  }

  _startSpin() {
    const sl = this.slot;
    const r = this.rng;
    const entry = sl.queue.shift();
    const inFever = this.fever > 0;
    if (inFever) this.fever -= 1;
    sl.spinning = true;
    sl.t = 0;
    sl.stopped = [false, false, false];
    sl.outcome = entry.outcome;
    sl.color = entry.color;
    sl.inFever = inFever;
    const ids = SYMBOLS.map((x) => x.id);
    const tier = entry.outcome ? OUTCOME_TIER[entry.outcome] : 0;
    const presentation = weightedPick(r, PRESENTATION_WEIGHTS[tier]);
    sl.presentation = presentation;
    sl.revealed = true;
    sl.fakeThird = null;
    if (entry.outcome) {
      const k = ids.indexOf(entry.outcome);
      sl.symbols = [k, k, k];
    } else if (presentation === 'plain') {
      let a, b, c;
      do { a = r.int(ids.length); b = r.int(ids.length); c = r.int(ids.length); } while (a === b);
      sl.symbols = [a, b, c];
    } else {
      const a = r.int(ids.length);
      let c = r.int(ids.length - 1);
      if (c >= a) c += 1;
      sl.symbols = [a, a, c];
    }
    sl.reach = presentation !== 'plain';
    const quick = inFever || sl.queue.length >= 3 ? 0.72 : 1;
    switch (presentation) {
      case 'plain': sl.stopAt = [0.7, 1.05, 1.4].map((v) => v * quick); break;
      case 'reach': sl.stopAt = [0.7 * quick, 1.05 * quick, 2.8 * quick]; break;
      case 'super':
        sl.stopAt = [0.7, 1.05, 5.0];
        if (entry.outcome && r() < 0.4) {
          // Stops one short, then slips into place.
          sl.fakeThird = (sl.symbols[2] + ids.length - 1) % ids.length;
          sl.revealed = false;
          sl.revealAt = 5.45;
        }
        break;
      case 'revival': {
        sl.stopAt = [0.7, 1.05, 5.0];
        sl.fakeThird = (sl.symbols[2] + 1 + r.int(ids.length - 1)) % ids.length;
        sl.revealed = false;
        sl.revealAt = 6.5;
        break;
      }
      case 'premium': sl.stopAt = [3.2, 3.2, 3.2]; break;
      default: sl.stopAt = [0.7, 1.05, 1.4];
    }
    sl.endAt = Math.max(sl.stopAt[2], sl.revealed ? 0 : sl.revealAt) + 0.45;
    this.emit('spin', { presentation, reach: sl.reach, color: sl.color, fever: inFever, stock: sl.queue.length });
  }

  _applyOutcome(outcome) {
    const s = this.stats;
    this.slot.lastWin = outcome;
    if (!outcome) { this.emit('slotResult', { outcome: null }); return; }
    if (s.winRain) this.queueRain(s.winRain, KIND.SILVER, 0.2);
    const boost = this.fever > 0 || this.slot.inFever ? 1.5 : 1;
    let detail = {};
    switch (outcome) {
      case 'seven': {
        const amount = Math.round(this.jpPool * s.jpMult);
        detail = { amount };
        const gold = amount > 70 ? Math.floor((amount - 50) / s.goldValue) : 0;
        const silver = amount - gold * s.goldValue;
        this.queueRain(Math.max(0, silver), KIND.SILVER, 0.6);
        for (let i = 0; i < gold; i++) this.rain.push({ at: this.world.time + 0.7 + i * 0.1, kind: KIND.GOLD });
        this.rain.sort((a, b) => a.at - b.at);
        this.jpPool = JP_BASE;
        if (this.mode === 'run') this.run.jackpots += 1; else this.freeStats.jackpots += 1;
        this.emit('jackpot', { amount });
        this._startFever();
        break;
      }
      case 'moon':
        this.spawnBall();
        this._startFever();
        break;
      case 'rabbit': {
        const n = Math.round(16 * boost);
        this.queueRain(n, KIND.SILVER, 0.3);
        detail = { amount: n };
        break;
      }
      case 'dango': {
        const n = Math.round(6 * s.dangoMult * boost);
        this.queueRain(n, KIND.SILVER, 0.3);
        detail = { amount: n };
        break;
      }
      case 'sakura':
        if (this.mode === 'run' && this.night) {
          this.night.dropsLeft += 3;
          this.night.dropsTotal += 3;
          detail = { drops: 3 };
        } else {
          this.queueRain(5, KIND.SILVER, 0.3);
          detail = { amount: 5 };
        }
        break;
      case 'star': {
        const golds = boost > 1 ? 3 : 2;
        for (let i = 0; i < golds; i++) this.rain.push({ at: this.world.time + 0.3 + i * 0.15, kind: KIND.GOLD });
        if (s.starRain) this.queueRain(s.starRain, KIND.SILVER, 0.5);
        this.rain.sort((a, b) => a.at - b.at);
        detail = { gold: golds, amount: s.starRain };
        break;
      }
      default: break;
    }
    this.emit('slotResult', { outcome, ...detail });
  }

  // --- persistence -----------------------------------------------------------

  serialize() {
    return {
      v: 2,
      mode: this.mode,
      phase: this.phase,
      bank: this.bank,
      charms: this.charms,
      talismans: this.talismans,
      jpPool: this.jpPool,
      jpFrac: this.jpFrac,
      nightIndex: this.nightIndex,
      night: this.night,
      shop: this.shop,
      run: this.run,
      freeStats: this.freeStats,
      stock: this.slot.queue.length + (this.slot.spinning ? 1 : 0),
      fever: this.fever,
      rng: this.rng.state(),
      rain: this.rain.length,
      // Medals resting in the box were already paid; restoring them would pay twice.
      field: this.world.snapshot((i) => this.world.flags[i] & FLAG_CAUGHT),
    };
  }

  deserialize(d) {
    this.mode = d.mode;
    this.phase = d.phase;
    this.bank = d.bank;
    this.charms = d.charms || [];
    this.talismans = d.talismans || [];
    this.jpPool = d.jpPool || JP_BASE;
    this.jpFrac = d.jpFrac || 0;
    this.nightIndex = d.nightIndex || 0;
    this.night = d.night;
    this.shop = d.shop;
    this.run = { ...this.run, ...(d.run || {}) };
    this.freeStats = d.freeStats || this.freeStats;
    this.pendingShot = false;
    this.cooldown = 0;
    this.feverChain = 0;
    this.fever = d.fever || 0;
    this.rng.setState(d.rng || 1);
    this.slot.spinning = false;
    this.slot.queue = [];
    this.rain = [];
    this.caught = [];
    this.world.restore(d.field);
    const night = this.night;
    const omen = night?.omen ? OMENS.find((o) => o.id === night.omen.id) : null;
    const boss = night && NIGHTS[this.nightIndex]?.boss ? BOSSES[NIGHTS[this.nightIndex].boss] : null;
    this._recomputeStats((s) => {
      if (this.phase === 'night') {
        if (omen) omen.apply(s);
        if (boss) boss.apply(s);
      }
    });
    for (let i = 0; i < (d.stock || 0); i++) this._addStock(true);
    if (d.rain) this.queueRain(d.rain);
    if (night) {
      night.grace = GRACE_SECONDS;
      night.caught ||= 0;
      night.missed ||= 0;
    }
  }
}
