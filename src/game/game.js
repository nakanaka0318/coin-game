// Game rules on top of the physics world: drops, payouts, the torii
// checker and slot, and the roguelike run (nights, quotas, shop).
// Has no DOM or rendering dependencies so it can be simulated headlessly.
import { KIND } from '../sim/physics.js';
import {
  HALF_W, FRONT_Z, KILL_Y, DROP, RAIN, STAGE, PUSHER, stagePoint,
} from '../sim/config.js';
import { CHECKER_POST_S } from '../sim/machine.js';
import {
  BASE_STATS, NIGHTS, BOSSES, OMENS, CHARMS, TALISMANS, SYMBOLS, SLOT_TABLE,
  RARITY_WEIGHT, MAX_CHARMS, EXTRA_DROPS,
} from './data.js';
import { makeRng } from './rng.js';

const FLAG_CHECKED = 1;
const FLAG_DROPPED = 2; // inserted by the player this night
const MAX_BODIES = 950;
const GRACE_SECONDS = 8;
const JP_BASE = 30;

const CHECKER_Z = stagePoint(0, CHECKER_POST_S, 0).z;
const STAGE_SIN = Math.sin(STAGE.angle);
const STAGE_COS = Math.cos(STAGE.angle);
const CHECKER_Y = stagePoint(0, CHECKER_POST_S, 0).y;

export const charmById = Object.fromEntries(CHARMS.map((c) => [c.id, c]));
export const talismanById = Object.fromEntries(TALISMANS.map((t) => [t.id, t]));

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
    this.stats = { ...BASE_STATS };
    this.jpPool = JP_BASE;
    this.jpFrac = 0;
    this.slot = { stock: 0, spinning: false, t: 0, symbols: [0, 1, 2], outcome: null, stopAt: [0, 0, 0], reach: false, pause: 0, lastWin: null };
    this.rain = [];
    this.timers = { tremor: 0, foxfire: 0, double: 0, mallet: 0 };
    this.night = null;
    this.nightIndex = 0;
    this.shop = null;
    this.run = { paid: 0, dropped: 0, jackpots: 0, bestPayout: 0, seed: 0 };
    this.freeStats = { paid: 0, dropped: 0, jackpots: 0 };
    this.time = 0;
    this.stuck = new Float32Array(world.capacity);
    this.jamT = 0;
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

  newRun(seed) {
    this.rng = makeRng(seed);
    this.mode = 'run';
    this.bank = 5;
    this.charms = [];
    this.talismans = ['quake'];
    this.jpPool = JP_BASE;
    this.jpFrac = 0;
    this.run = { paid: 0, dropped: 0, jackpots: 0, bestPayout: 0, seed: this.rng.state() };
    this.slot.stock = 0;
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
    this.slot.stock = 0;
    this.slot.spinning = false;
    this._recomputeStats();
    if (this.world.count < 50) this.resetField();
    this.emit('free');
  }

  _recomputeStats(extra = null) {
    const s = { ...BASE_STATS };
    for (const id of this.charms) charmById[id]?.apply(s);
    if (extra) extra(s);
    this.stats = s;
    const w = this.world;
    w.pusherStroke = s.stroke;
    w.pusherSpeed = s.speed;
    w.setCheckerHalfGap(s.checkerHalfGap);
    w.setPinBounce(s.pinBounce);
    w.setEnabled('sideGuard', !!s.sideGuards);
    w.setEnabled('wallFront', !s.shortWalls);
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
      omen: omen ? { id: omen.id, name: omen.name, desc: omen.desc, good: omen.good } : null,
      boss: boss ? { name: boss.name, desc: boss.desc } : null,
      grace: GRACE_SECONDS,
      cleared: false,
      time: 0,
    };
    this.timers.tremor = this.stats.tremor || 0;
    this.timers.foxfire = this.stats.foxfire || 0;
    this.timers.double = 0;
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
      this.emit('gameOver', { night: n, run: this.run });
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
      this.emit('runClear', { night: n, run: this.run, reward });
      return;
    }
    this.phase = 'dawn';
    this.emit('nightEnd', { night: n, reward });
  }

  openShop() {
    this.phase = 'shop';
    this.shop = { charms: [], talismans: [], rerollCost: 2 };
    this._stockShop();
    this.emit('shop', this.shop);
  }

  _stockShop() {
    const r = this.rng;
    const pool = CHARMS.filter((c) => !this.charms.includes(c.id));
    const picks = [];
    for (let i = 0; i < 3 && pool.length; i++) {
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

  reroll() {
    if (this.phase !== 'shop' || this.bank < this.shop.rerollCost) return false;
    this.bank -= this.shop.rerollCost;
    this.shop.rerollCost += 1;
    this._stockShop();
    this.emit('shop', this.shop);
    return true;
  }

  canBuy(item, type) {
    if (item.sold || this.bank < item.price) return false;
    if (type === 'charm') return this.charms.length < MAX_CHARMS;
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
  canDrop() {
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

  drop(x) {
    if (!this.canDrop() || this.world.count >= MAX_BODIES) return false;
    const r = this.rng;
    const s = this.stats;
    x = Math.max(DROP.minX, Math.min(DROP.maxX, x));
    if (this.mode === 'run') {
      if (this.night.dropsLeft > 0) this.night.dropsLeft -= 1;
      else { this.bank -= 1; this.night.fromBank += 1; this._checkQuota(); }
      this.night.grace = GRACE_SECONDS;
      this.run.dropped += 1;
    } else {
      this.bank -= 1;
      this.freeStats.dropped += 1;
    }
    this.jpFrac += 1 / 3;
    while (this.jpFrac >= 1) { this.jpFrac -= 1; this.jpPool += 1; }
    const gold = r() < s.goldChance;
    this._spawnDrop(x, gold ? KIND.GOLD : KIND.SILVER);
    if (s.twinChance && r() < s.twinChance) {
      const x2 = Math.max(DROP.minX, Math.min(DROP.maxX, x + (r() < 0.5 ? -0.8 : 0.8)));
      this.rain.push({ at: this.world.time + 0.14, kind: KIND.SILVER, x: x2, y: DROP.y, z: DROP.z, dropLike: true });
      this.emit('twin', { x: x2 });
    }
    this.emit('drop', { x, gold });
    return true;
  }

  _spawnDrop(x, kind) {
    const r = this.rng;
    const slot = this.world.spawn(kind, x + r.range(-0.05, 0.05), DROP.y, DROP.z,
      this._tilt(0.35), { x: r.range(-0.5, 0.5), y: -3, z: r.range(-0.3, 0.3) }, { x: r.range(-3, 3), y: r.range(-2, 2), z: r.range(-3, 3) });
    if (slot >= 0) this.world.flags[slot] |= FLAG_DROPPED;
    return slot;
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
      case 'gold': for (let i = 0; i < 3; i++) this.rain.push({ at: this.world.time + i * 0.25, kind: KIND.GOLD, table: true }); break;
      case 'ball': this.spawnBall(); break;
      case 'rain': this.queueRain(15, KIND.SILVER); break;
      case 'double': this.timers.double = 20; break;
      case 'spin': this.slot.stock += 3; break;
      default: break;
    }
  }

  quake(power = 1) {
    const w = this.world, r = this.rng;
    for (let i = 0; i < w.highWater; i++) {
      if (w.kind[i] < 0) continue;
      const y = w.pos[i * 3 + 1];
      if (y > 3) continue;
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
      if (y > 1.6 || z < FRONT_Z - 2.8 || z > FRONT_Z) continue;
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

  queueRain(n, kind = KIND.SILVER, delay = 0) {
    const t0 = this.world.time + delay;
    for (let i = 0; i < n; i++) this.rain.push({ at: t0 + i * 0.07, kind });
    this.emit('rain', { n, kind });
  }

  // --- simulation tick -------------------------------------------------------

  update(dt) {
    this.time += dt;
    const w = this.world;
    const r = this.rng;
    const s = this.stats;

    // Spawn queued medals.
    while (this.rain.length && this.rain[0].at <= w.time) {
      const d = this.rain.shift();
      if (w.count >= MAX_BODIES) {
        this._credit(d.kind === KIND.GOLD ? s.goldValue : 1, 0, d.kind);
        continue;
      }
      if (d.dropLike) {
        this._spawnDrop(d.x, d.kind);
      } else if (d.table) {
        w.spawn(d.kind, r.range(-HALF_W + 1, HALF_W - 1), 2.6, r.range(-6.6, -5.6), this._tilt(0.6));
      } else if (d.stage) {
        w.spawn(d.kind, r.range(DROP.minX, DROP.maxX), DROP.y, DROP.z, this._tilt(0.4));
      } else {
        w.spawn(d.kind, r.range(RAIN.minX, RAIN.maxX), RAIN.y + r.range(0, 1.5), r.range(RAIN.minZ, RAIN.maxZ),
          this._tilt(1.2), { x: 0, y: -4, z: 0 }, { x: r.range(-6, 6), y: r.range(-4, 4), z: r.range(-6, 6) });
      }
    }

    this._collect(false);
    this._unjam(dt);
    this._magnet(dt);
    this._slotTick(dt);
    this._timers(dt);
    if (this.mode === 'run' && this.phase === 'night') this._nightTick(dt);
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
      if (t.foxfire <= 0) { t.foxfire = s.foxfire; this.rain.push({ at: this.world.time, kind: KIND.GOLD, stage: true }); this.emit('foxfire', {}); }
    }
  }

  _nightTick(dt) {
    const n = this.night;
    n.time += dt;
    // Once the night's medals are gone the night ends after a calm spell
    // with no new drops (dropping from the bank resets the countdown).
    const out = n.dropsLeft <= 0;
    const busy = this.rain.length > 0 || this.slot.spinning || this.slot.stock > 0;
    if (out && !busy) {
      n.grace -= dt;
      if (n.grace <= 0) this._dawn();
    } else if (!out || busy) {
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

  // Detect medals leaving the field, and medals passing the torii.
  _collect(silent) {
    const w = this.world;
    const s = this.stats;
    const gap = s.checkerHalfGap;
    for (let i = 0; i < w.highWater; i++) {
      const k = w.kind[i];
      if (k < 0 || !w.awake[i]) continue;
      const x = w.pos[i * 3], y = w.pos[i * 3 + 1], z = w.pos[i * 3 + 2];
      if (!(w.flags[i] & FLAG_CHECKED) && z > CHECKER_Z && y > CHECKER_Y - 0.6 && k !== KIND.BALL) {
        w.flags[i] |= FLAG_CHECKED;
        if (!silent && Math.abs(x) < gap) this._checker(x);
      }
      if (y < KILL_Y || y > 25 || Math.abs(x) > 14 || z < -20 || z > 14) {
        const front = z > FRONT_Z - 0.3 && Math.abs(x) < HALF_W + 0.25 && y < 5;
        w.remove(i);
        if (silent) continue;
        if (front) {
          if (k === KIND.BALL) this._ballPayout(x);
          else this._credit(k === KIND.GOLD ? s.goldValue : 1, x, k);
        } else {
          this._lost(x, z, k);
        }
      }
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
      this.timers.refill = (this.timers.refill || 0) + value;
      while (this.timers.refill >= s.refillEvery) {
        this.timers.refill -= s.refillEvery;
        this.rain.push({ at: this.world.time + 0.2, kind: KIND.SILVER, table: true });
      }
    }
    if (s.malletEvery) {
      this.timers.mallet += value;
      while (this.timers.mallet >= s.malletEvery) {
        this.timers.mallet -= s.malletEvery;
        this.rain.push({ at: this.world.time + 0.3, kind: KIND.GOLD, stage: true });
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

  _ballPayout(x) {
    this._credit(this.stats.ballValue, x, KIND.BALL);
    this.slot.stock = Math.min(this.stats.stockMax, this.slot.stock + 1);
    this.emit('ballPayout', { value: this.stats.ballValue, x });
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
    const s = this.slot;
    const max = this.stats.stockMax;
    if (s.stock < max) s.stock += 1;
    this.emit('checker', { x, stock: s.stock });
  }

  // --- slot ------------------------------------------------------------------

  _drawOutcome() {
    const s = this.stats;
    const r = this.rng;
    const p = {
      seven: SLOT_TABLE.seven * s.jpLuck * s.slotLuck,
      moon: SLOT_TABLE.moon * s.moonLuck * s.slotLuck,
      rabbit: SLOT_TABLE.rabbit * s.slotLuck,
      dango: SLOT_TABLE.dango * s.slotLuck,
      sakura: SLOT_TABLE.sakura * s.slotLuck,
      star: SLOT_TABLE.star * s.slotLuck,
    };
    let u = r();
    for (const id of Object.keys(p)) {
      if (u < p[id]) return id;
      u -= p[id];
    }
    return null;
  }

  _slotTick(dt) {
    const sl = this.slot;
    if (!sl.spinning) {
      if (sl.pause > 0) { sl.pause -= dt; return; }
      if (sl.stock > 0 && (this.phase === 'night' || this.phase === 'free')) this._startSpin();
      return;
    }
    sl.t += dt;
    for (let i = 0; i < 3; i++) {
      if (!sl.stopped[i] && sl.t >= sl.stopAt[i]) {
        sl.stopped[i] = true;
        this.emit('reelStop', { reel: i, symbol: sl.symbols[i], reach: sl.reach && i === 1 });
      }
    }
    if (sl.t >= sl.stopAt[2] + 0.45) {
      sl.spinning = false;
      sl.pause = 0.35;
      this._applyOutcome(sl.outcome);
    }
  }

  _startSpin() {
    const sl = this.slot;
    const r = this.rng;
    sl.stock -= 1;
    sl.spinning = true;
    sl.t = 0;
    sl.stopped = [false, false, false];
    const outcome = this._drawOutcome();
    sl.outcome = outcome;
    const ids = SYMBOLS.map((x) => x.id);
    if (outcome) {
      const k = ids.indexOf(outcome);
      sl.symbols = [k, k, k];
      sl.reach = true;
    } else if (r() < 0.32) {
      const a = r.int(ids.length);
      let c = r.int(ids.length - 1);
      if (c >= a) c += 1;
      sl.symbols = [a, a, c];
      sl.reach = true;
    } else {
      let a, b, c;
      do { a = r.int(ids.length); b = r.int(ids.length); c = r.int(ids.length); } while ((a === b && b === c) || a === b);
      sl.symbols = [a, b, c];
      sl.reach = false;
    }
    const quick = sl.stock >= 3 ? 0.7 : 1;
    const bigReach = sl.reach && (outcome === 'seven' || outcome === 'moon' || sl.symbols[0] === 0);
    sl.stopAt = [0.9 * quick, 1.35 * quick, (sl.reach ? (bigReach ? 4.2 : 2.9) : 1.8) * quick];
    sl.bigReach = bigReach;
    this.emit('spin', { reach: sl.reach, bigReach, stock: sl.stock });
  }

  _applyOutcome(outcome) {
    const s = this.stats;
    this.slot.lastWin = outcome;
    if (!outcome) { this.emit('slotResult', { outcome: null }); return; }
    if (s.winRain) this.queueRain(s.winRain, KIND.SILVER, 0.2);
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
        break;
      }
      case 'moon': this.spawnBall(); break;
      case 'rabbit': this.queueRain(12, KIND.SILVER, 0.3); detail = { amount: 12 }; break;
      case 'dango': {
        const n = 4 * s.dangoMult;
        this.queueRain(n, KIND.SILVER, 0.3);
        detail = { amount: n };
        break;
      }
      case 'sakura':
        if (this.mode === 'run' && this.night) {
          this.night.dropsLeft += 2;
          this.night.dropsTotal += 2;
          detail = { drops: 2 };
        } else {
          this.queueRain(3, KIND.SILVER, 0.3);
          detail = { amount: 3 };
        }
        break;
      case 'star':
        this.rain.push({ at: this.world.time + 0.3, kind: KIND.GOLD });
        if (s.starRain) this.queueRain(s.starRain, KIND.SILVER, 0.5);
        detail = { gold: 1, amount: s.starRain };
        break;
      default: break;
    }
    this.emit('slotResult', { outcome, ...detail });
  }

  // --- persistence -----------------------------------------------------------

  serialize() {
    return {
      v: 1,
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
      stock: this.slot.stock + (this.slot.spinning ? 1 : 0),
      rng: this.rng.state(),
      rain: this.rain.length,
      field: this.world.snapshot(),
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
    this.run = d.run || this.run;
    this.freeStats = d.freeStats || this.freeStats;
    this.slot.stock = d.stock || 0;
    this.slot.spinning = false;
    this.rng.setState(d.rng || 1);
    this.rain = [];
    if (d.rain) this.queueRain(d.rain);
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
    if (night) night.grace = GRACE_SECONDS;
  }
}
