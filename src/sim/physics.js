// Rapier wrapper for the medal pusher. Runs in the browser and in Node
// (tools/sim-test.mjs drives it headlessly for tuning).
import {
  COIN, GOLD_COIN, OBAN, BALL, WORLD, PUSHER, MAT, STAGE, BOX, HALF_W,
  PIN_MOTION, TORII_MOTION, BELL, BOSS, stagePoint, stagePins,
} from './config.js';
import { buildMachineParts, checkerPostPos, quatX, CHECKER_POST_S } from './machine.js';

export const KIND = { SILVER: 0, GOLD: 1, BALL: 2, OBAN: 3 };

const COIN_SPECS = { [KIND.SILVER]: COIN, [KIND.GOLD]: GOLD_COIN, [KIND.OBAN]: OBAN };

export class PhysicsWorld {
  constructor(RAPIER, { capacity = 1200, onImpact = null } = {}) {
    this.R = RAPIER;
    this.capacity = capacity;
    this.onImpact = onImpact;

    const R = RAPIER;
    this.world = new R.World({ x: 0, y: WORLD.gravity, z: 0 });
    this.world.timestep = WORLD.fixedDt;
    this.world.numSolverIterations = WORLD.solverIterations;
    this.events = new R.EventQueue(true);

    // Per-slot state. A slot holds one dynamic body (medal or ball).
    this.bodies = new Array(capacity).fill(null);
    this.kind = new Int8Array(capacity).fill(-1);
    this.awake = new Uint8Array(capacity);
    this.pos = new Float32Array(capacity * 3);
    this.quat = new Float32Array(capacity * 4);
    this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity);
    this.flags = new Uint8Array(capacity); // free for game logic
    this.impactSpeed = new Float32Array(capacity);
    this.free = [];
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
    this.count = 0;
    this.highWater = 0;
    this.colliderSlot = new Map(); // collider handle -> slot
    this.colliderMat = new Map(); // static collider handle -> MAT

    this.time = 0;
    this.pusherStroke = 1; // multiplier on the stroke length
    this.pusherSpeed = 1; // multiplier on the stroke rate
    this.pusherFront = PUSHER.frontMin;
    this.phase = 0;
    this.lastStepMs = 0;

    // Moving parts: pin rows, torii and the offering box.
    this.pinRowOffset = PIN_MOTION.map(() => 0);
    this.pinSpeed = 1;
    this.toriiX = 0;
    this.toriiSpeed = 1;
    this.checkerHalfGap = STAGE.checkerHalfGap;
    this.boxX = 0;
    this.boxTargetX = 0;
    this.boxWidth = BOX.baseWidth;
    this.bellX = 0;
    this.bellSpeed = 1;
    this.bellRadius = BELL.radius;
    this.bossX = 0;
    this.bossOn = false;
    this._moverT = 0;
    // Medals touching a hit target this step: [target name, medal slot, ...].
    this.hits = [];
    this.hitTargets = new Map(); // collider handle -> target name

    this._buildStatic();
    this._buildPusher();
    this._buildPins();
    this._buildTorii();
    this._buildBell();
    this._buildBoss();
    this._buildBox();
  }

  _buildStatic() {
    const R = this.R;
    this.ground = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    this.parts = buildMachineParts();
    this.named = {};
    for (const p of this.parts) {
      const desc = p.shape === 'box'
        ? R.ColliderDesc.cuboid(p.half[0], p.half[1], p.half[2])
        : R.ColliderDesc.cylinder(p.halfHeight, p.radius);
      desc.setTranslation(p.pos[0], p.pos[1], p.pos[2])
        .setRotation({ x: p.quat[0], y: p.quat[1], z: p.quat[2], w: p.quat[3] })
        .setFriction(p.friction)
        .setRestitution(p.restitution);
      // Slick parts keep their own low friction whatever touches them.
      if (p.slick) desc.setFrictionCombineRule(R.CoefficientCombineRule.Min);
      const c = this.world.createCollider(desc, this.ground);
      this.colliderMat.set(c.handle, p.mat);
      (this.named[p.name] ||= []).push(c);
      if (p.enabled === false) c.setEnabled(false);
    }
  }

  _buildPusher() {
    const R = this.R;
    this.pusher = this.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(0, PUSHER.height / 2, PUSHER.frontMin - PUSHER.depth / 2));
    const c = this.world.createCollider(
      R.ColliderDesc.cuboid(PUSHER.halfWidth, PUSHER.height / 2, PUSHER.depth / 2)
        .setFriction(PUSHER.friction).setRestitution(0.05), this.pusher);
    this.colliderMat.set(c.handle, MAT.PUSHER);
  }

  _kinematic(x, y, z, q) {
    const desc = this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z);
    if (q) desc.setRotation(q);
    return this.world.createRigidBody(desc);
  }

  _buildPins() {
    const R = this.R;
    const qa = quatX(STAGE.angle);
    const q = { x: qa[0], y: qa[1], z: qa[2], w: qa[3] };
    this.pins = [];
    const rows = [...new Set(stagePins().map((p) => p.s))];
    for (const p of stagePins()) {
      const w = stagePoint(p.x, p.s, STAGE.pinHeight / 2);
      const body = this._kinematic(w.x, w.y, w.z, q);
      const c = this.world.createCollider(
        R.ColliderDesc.cylinder(STAGE.pinHeight / 2, STAGE.pinRadius)
          .setFriction(0.05).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0.4), body);
      this.colliderMat.set(c.handle, MAT.PIN);
      (this.named.pin ||= []).push(c);
      this.pins.push({ body, base: w, row: rows.indexOf(p.s), x: w.x });
    }
  }

  _buildTorii() {
    const R = this.R;
    this.toriiPosts = [-1, 1].map((side) => {
      const p = checkerPostPos(side, this.checkerHalfGap, 0);
      const body = this._kinematic(p.x, p.y, p.z);
      const c = this.world.createCollider(
        R.ColliderDesc.cylinder(0.5, STAGE.checkerPostRadius)
          .setFriction(0.05).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0.3), body);
      this.colliderMat.set(c.handle, MAT.PIN);
      return { body, side };
    });
  }

  // Collider on a kinematic body whose contacts with medals are reported in
  // `hits` (collision events are enabled on it even when sound is off).
  _hitCollider(desc, body, name, mat) {
    desc.setActiveEvents(this.R.ActiveEvents.COLLISION_EVENTS);
    const c = this.world.createCollider(desc, body);
    this.colliderMat.set(c.handle, mat);
    this.hitTargets.set(c.handle, name);
    return c;
  }

  _bellPos() {
    const w = stagePoint(this.bellX, CHECKER_POST_S + BELL.ds, 0);
    return { x: w.x, y: w.y + BELL.lift, z: w.z };
  }

  _buildBell() {
    const R = this.R;
    if (!this.bell) this.bell = this._kinematic(this.bellX, 0, 0);
    if (this.bellCollider) {
      this.hitTargets.delete(this.bellCollider.handle);
      this.world.removeCollider(this.bellCollider, false);
    }
    this.bellCollider = this._hitCollider(
      R.ColliderDesc.ball(this.bellRadius).setFriction(0.1).setRestitution(0.55), this.bell, 'bell', MAT.BELL);
    this.bell.setTranslation(this._bellPos(), true);
  }

  setBell(radius, speed) {
    this.bellSpeed = speed;
    if (Math.abs(radius - this.bellRadius) < 1e-3) return;
    this.bellRadius = radius;
    this._buildBell();
  }

  bossPos(x = this.bossX) {
    return stagePoint(x, BOSS.s, BOSS.lift);
  }

  _buildBoss() {
    const R = this.R;
    this.boss = this._kinematic(0, -20, 0);
    this.bossCollider = this._hitCollider(
      R.ColliderDesc.ball(BOSS.radius).setFriction(0.2).setRestitution(0.45), this.boss, 'boss', MAT.BOSS);
    this.bossCollider.setEnabled(false);
  }

  // Show or hide the boss; the game moves it with setBossX.
  setBoss(on) {
    this.bossOn = on;
    this.bossCollider.setEnabled(on);
    this.boss.setTranslation(on ? this.bossPos() : { x: 0, y: -20, z: 0 }, true);
  }

  setBossX(x) {
    this.bossX = x;
  }

  // The offering box is an open-top kinematic box; rebuilt when resized.
  _buildBox() {
    const R = this.R;
    if (!this.box) this.box = this._kinematic(this.boxX, BOX.floorY, BOX.z);
    for (const c of this.boxColliders || []) this.world.removeCollider(c, false);
    const w = this.boxWidth / 2, d = BOX.depth / 2, t = BOX.wall, hgt = BOX.height;
    const parts = [
      [w + t, t / 2, d + t, 0, -t / 2, 0], // floor
      [w + t, hgt / 2, t / 2, 0, hgt / 2, -d - t / 2], // back
      [w + t, hgt / 2, t / 2, 0, hgt / 2, d + t / 2], // front
      [t / 2, hgt / 2, d, -w - t / 2, hgt / 2, 0], // left
      [t / 2, hgt / 2, d, w + t / 2, hgt / 2, 0], // right
    ];
    this.boxColliders = parts.map(([hx, hy, hz, x, y, z]) => {
      const c = this.world.createCollider(
        R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.6).setRestitution(0.05), this.box);
      this.colliderMat.set(c.handle, MAT.BOX);
      return c;
    });
  }

  setBoxWidth(width) {
    if (Math.abs(width - this.boxWidth) < 1e-3) return;
    this.boxWidth = width;
    this.boxX = this.clampBoxX(this.boxX);
    this._buildBox();
  }

  // Box centre limits so its walls stay under the field.
  clampBoxX(x) {
    const lim = HALF_W + 0.3 - this.boxWidth / 2;
    return Math.max(-lim, Math.min(lim, x));
  }

  setBoxTarget(x) {
    this.boxTargetX = this.clampBoxX(x);
  }

  _moveMovers(dt) {
    this._moverT += dt;
    const t = this._moverT;
    PIN_MOTION.forEach((m, i) => {
      this.pinRowOffset[i] = m.amp * Math.sin(2 * Math.PI * (t * this.pinSpeed / m.period + m.phase));
    });
    for (const p of this.pins) {
      p.x = p.base.x + this.pinRowOffset[p.row];
      p.body.setNextKinematicTranslation({ x: p.x, y: p.base.y, z: p.base.z });
    }
    this.toriiX = TORII_MOTION.amp * Math.sin(2 * Math.PI * t * this.toriiSpeed / TORII_MOTION.period);
    for (const post of this.toriiPosts) {
      post.body.setNextKinematicTranslation(checkerPostPos(post.side, this.checkerHalfGap, this.toriiX));
    }
    this.box.setNextKinematicTranslation({ x: this.boxTargetX, y: BOX.floorY, z: BOX.z });
    this.boxX = this.boxTargetX;
    // The bell swings like a pendulum hung from the torii's top beam.
    this.bellX = this.toriiX + BELL.amp * Math.sin(2 * Math.PI * t * this.bellSpeed / BELL.period);
    this.bell.setNextKinematicTranslation(this._bellPos());
    if (this.bossOn) this.boss.setNextKinematicTranslation(this.bossPos());
  }

  // --- machine tweaks used by charms ---------------------------------------

  setEnabled(name, on) {
    for (const c of this.named[name] || []) c.setEnabled(on);
  }

  setPinBounce(restitution) {
    for (const c of this.named.pin || []) c.setRestitution(restitution);
  }

  setCheckerHalfGap(halfGap) {
    this.checkerHalfGap = halfGap;
  }

  // --- dynamic bodies -----------------------------------------------------

  spawn(kind, x, y, z, q = null, v = null, w = null) {
    if (this.free.length === 0) return -1;
    const R = this.R;
    const slot = this.free.pop();
    const desc = R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setCcdEnabled(true)
      .setSoftCcdPrediction(WORLD.softCcd);
    if (q) desc.setRotation(q);
    if (v) desc.setLinvel(v.x, v.y, v.z);
    if (w) desc.setAngvel(w);
    let cdesc;
    if (kind === KIND.BALL) {
      desc.setLinearDamping(0.05).setAngularDamping(0.4);
      cdesc = R.ColliderDesc.ball(BALL.radius).setDensity(BALL.density)
        .setFriction(BALL.friction).setRestitution(BALL.restitution);
    } else {
      const spec = COIN_SPECS[kind];
      desc.setLinearDamping(COIN.linearDamping).setAngularDamping(COIN.angularDamping);
      cdesc = R.ColliderDesc.cylinder(spec.halfHeight, spec.radius).setDensity(spec.density)
        .setFriction(COIN.friction).setRestitution(COIN.restitution);
    }
    if (this.onImpact) cdesc.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    const body = this.world.createRigidBody(desc);
    const col = this.world.createCollider(cdesc, body);
    body.userData = col.handle;
    this.bodies[slot] = body;
    this.colliderSlot.set(col.handle, slot);
    this.kind[slot] = kind;
    this.awake[slot] = 1;
    this.age[slot] = 0;
    this.flags[slot] = 0;
    this.impactSpeed[slot] = 0;
    const p = slot * 3, r = slot * 4;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.vel[p] = v ? v.x : 0; this.vel[p + 1] = v ? v.y : 0; this.vel[p + 2] = v ? v.z : 0;
    this.quat[r] = q ? q.x : 0; this.quat[r + 1] = q ? q.y : 0; this.quat[r + 2] = q ? q.z : 0; this.quat[r + 3] = q ? q.w : 1;
    this.count++;
    if (slot + 1 > this.highWater) this.highWater = slot + 1;
    return slot;
  }

  remove(slot) {
    const body = this.bodies[slot];
    if (!body) return;
    this.colliderSlot.delete(body.userData);
    this.world.removeRigidBody(body);
    this.bodies[slot] = null;
    this.kind[slot] = -1;
    this.awake[slot] = 0;
    this.free.push(slot);
    this.count--;
    while (this.highWater > 0 && this.kind[this.highWater - 1] < 0) this.highWater--;
  }

  clearDynamic() {
    for (let i = 0; i < this.highWater; i++) if (this.kind[i] >= 0) this.remove(i);
    this.free.length = 0;
    for (let i = this.capacity - 1; i >= 0; i--) this.free.push(i);
    this.highWater = 0;
  }

  impulse(slot, ix, iy, iz) {
    const b = this.bodies[slot];
    if (b) b.applyImpulse({ x: ix, y: iy, z: iz }, true);
  }

  mass(slot) {
    const b = this.bodies[slot];
    return b ? b.mass() : 0;
  }

  setVelocity(slot, vx, vy, vz) {
    const b = this.bodies[slot];
    if (!b) return;
    b.setLinvel({ x: vx, y: vy, z: vz }, true);
    this.vel[slot * 3] = vx; this.vel[slot * 3 + 1] = vy; this.vel[slot * 3 + 2] = vz;
  }

  setSpin(slot, wx, wy, wz) {
    const b = this.bodies[slot];
    if (b) b.setAngvel({ x: wx, y: wy, z: wz }, true);
  }

  // --- simulation ---------------------------------------------------------

  pusherFrontAt(phase) {
    const t = (1 - Math.cos(phase * Math.PI * 2)) / 2;
    const stroke = (PUSHER.frontMax - PUSHER.frontMin) * this.pusherStroke;
    return PUSHER.frontMin + stroke * t;
  }

  step() {
    const dt = WORLD.fixedDt;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.phase = (this.phase + (dt * this.pusherSpeed) / PUSHER.period) % 1;
    const front = this.pusherFrontAt(this.phase);
    this.pusher.setNextKinematicTranslation({ x: 0, y: PUSHER.height / 2, z: front - PUSHER.depth / 2 });
    this._moveMovers(dt);
    this.world.step(this.events);
    this.time += dt;
    this.pusherFront = front;
    this._readBack(dt);
    this._drainEvents();
    if (t0) this.lastStepMs = performance.now() - t0;
  }

  _readBack(dt) {
    const pos = this.pos, quat = this.quat, vel = this.vel, dv = this.impactSpeed;
    const g = WORLD.gravity * dt;
    for (let i = 0; i < this.highWater; i++) {
      if (this.kind[i] < 0) continue;
      this.age[i] += dt;
      const b = this.bodies[i];
      if (b.isSleeping()) {
        this.awake[i] = 0; dv[i] = 0;
        vel[i * 3] = 0; vel[i * 3 + 1] = 0; vel[i * 3 + 2] = 0;
        continue;
      }
      this.awake[i] = 1;
      const t = b.translation();
      const r = b.rotation();
      const v = b.linvel();
      const p3 = i * 3, p4 = i * 4;
      // Velocity change this step beyond what gravity alone would add.
      const ax = v.x - vel[p3], ay = v.y - vel[p3 + 1] - g, az = v.z - vel[p3 + 2];
      dv[i] = Math.sqrt(ax * ax + ay * ay + az * az);
      pos[p3] = t.x; pos[p3 + 1] = t.y; pos[p3 + 2] = t.z;
      vel[p3] = v.x; vel[p3 + 1] = v.y; vel[p3 + 2] = v.z;
      quat[p4] = r.x; quat[p4 + 1] = r.y; quat[p4 + 2] = r.z; quat[p4 + 3] = r.w;
    }
  }

  _drainEvents() {
    const dv = this.impactSpeed;
    this.hits.length = 0;
    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const s1 = this.colliderSlot.get(h1);
      const s2 = this.colliderSlot.get(h2);
      const target = this.hitTargets.get(h1) || this.hitTargets.get(h2);
      if (target) {
        const slot = s1 !== undefined ? s1 : s2;
        if (slot !== undefined) this.hits.push(target, slot);
      }
      if (!this.onImpact) return;
      const sp1 = s1 !== undefined ? dv[s1] : 0;
      const sp2 = s2 !== undefined ? dv[s2] : 0;
      const speed = Math.max(sp1, sp2);
      if (speed < 1.2) return;
      const src = sp1 >= sp2 ? s1 : s2;
      const m1 = s1 !== undefined ? this._matOfSlot(s1) : (this.colliderMat.get(h1) || MAT.METAL);
      const m2 = s2 !== undefined ? this._matOfSlot(s2) : (this.colliderMat.get(h2) || MAT.METAL);
      this.onImpact(m1, m2, speed, this.pos[src * 3], this.pos[src * 3 + 1], this.pos[src * 3 + 2]);
      dv[src] = 0; // report each medal's impact once per step
    });
  }

  _matOfSlot(slot) {
    const k = this.kind[slot];
    return k === KIND.GOLD || k === KIND.OBAN ? MAT.GOLD : k === KIND.BALL ? MAT.BALL : MAT.COIN;
  }

  // --- save / load --------------------------------------------------------

  snapshot(skip = null) {
    const r = (v) => Math.round(v * 1000) / 1000;
    const bodies = [];
    for (let i = 0; i < this.highWater; i++) {
      if (this.kind[i] < 0 || (skip && skip(i))) continue;
      const p = i * 3, q = i * 4;
      bodies.push([this.kind[i], r(this.pos[p]), r(this.pos[p + 1]), r(this.pos[p + 2]),
        r(this.quat[q]), r(this.quat[q + 1]), r(this.quat[q + 2]), r(this.quat[q + 3])]);
    }
    return { phase: r(this.phase), bodies };
  }

  restore(snap) {
    this.clearDynamic();
    this.phase = snap.phase || 0;
    this.pusherFront = this.pusherFrontAt(this.phase);
    this.pusher.setTranslation({ x: 0, y: PUSHER.height / 2, z: this.pusherFront - PUSHER.depth / 2 }, true);
    for (const [k, x, y, z, qx, qy, qz, qw] of snap.bodies) {
      const n = Math.hypot(qx, qy, qz, qw) || 1;
      this.spawn(k, x, y, z, { x: qx / n, y: qy / n, z: qz / n, w: qw / n });
    }
  }

  activeCount() {
    let n = 0;
    for (let i = 0; i < this.highWater; i++) if (this.kind[i] >= 0 && this.awake[i]) n++;
    return n;
  }
}
