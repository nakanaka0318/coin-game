// Rapier wrapper for the medal pusher. Runs in the browser and in Node
// (tools/sim-test.mjs drives it headlessly for tuning).
import { COIN, GOLD_COIN, BALL, WORLD, PUSHER, MAT } from './config.js';
import { buildMachineParts, checkerPostPos } from './machine.js';

export const KIND = { SILVER: 0, GOLD: 1, BALL: 2 };

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

    this._buildStatic();
    this._buildPusher();
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

  // --- machine tweaks used by charms ---------------------------------------

  setEnabled(name, on) {
    for (const c of this.named[name] || []) c.setEnabled(on);
  }

  setPinBounce(restitution) {
    for (const c of this.named.pin || []) c.setRestitution(restitution);
  }

  setCheckerHalfGap(halfGap) {
    const posts = this.named.checkerPost || [];
    posts.forEach((c, i) => c.setTranslation(checkerPostPos(i === 0 ? -1 : 1, halfGap)));
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
      const spec = kind === KIND.GOLD ? GOLD_COIN : COIN;
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
    this.world.step(this.events);
    this.time += dt;
    this.pusherFront = front;
    this._readBack(dt);
    if (this.onImpact) this._drainImpacts();
    else this.events.clear();
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

  _drainImpacts() {
    const dv = this.impactSpeed;
    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const s1 = this.colliderSlot.get(h1);
      const s2 = this.colliderSlot.get(h2);
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
    return k === KIND.GOLD ? MAT.GOLD : k === KIND.BALL ? MAT.BALL : MAT.COIN;
  }

  // --- save / load --------------------------------------------------------

  snapshot() {
    const r = (v) => Math.round(v * 1000) / 1000;
    const bodies = [];
    for (let i = 0; i < this.highWater; i++) {
      if (this.kind[i] < 0) continue;
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
