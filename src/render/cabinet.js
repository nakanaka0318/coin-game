// Visual cabinet: field, pusher, stage, torii checker, backboard with LCD,
// moon and lanterns. Collider geometry comes from sim/machine.js so the
// meshes match what the physics sees.
import * as THREE from 'three';
import {
  HALF_W, FRONT_Z, SIDE_WALL_END_Z, PUSHER, STAGE, BACK_WALL, BOX, PITCHER, LANDING, WORLD, BOSS, FLIGHT, STAGE_LOWER,
  stagePoint,
} from '../sim/config.js';
import { checkerPostPos, quatX, CHECKER_POST_S } from '../sim/machine.js';
import {
  PALETTE, makeSeigaiha, makeStageArt, makeMoon, makeLantern, makeCanvas, makeWoodTexture,
  makeBossFace, makeGlowSprite,
} from './textures.js';

const lacquer = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12, ...extra,
});

export class Cabinet {
  constructor(scene, world, lcdTexture) {
    this.world = world;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;
    this.lamps = [];
    this.lanterns = [];
    this.flashTimer = 0;
    this.flashColor = new THREE.Color(PALETTE.gold);
    this.attract = 0;
    this.partMeshes = {};

    const mats = this.mats = {
      lacquer: lacquer(0x1a1f52),
      lacquerDark: lacquer(0x0d1030),
      vermilion: lacquer(0xd9452e),
      black: lacquer(0x15121a),
      gold: new THREE.MeshStandardMaterial({ color: 0xe8b955, metalness: 1, roughness: 0.28 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 1, roughness: 0.12 }),
      pit: new THREE.MeshBasicMaterial({ color: 0x020205 }),
    };
    const woodTex = makeWoodTexture();
    mats.wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.6, metalness: 0.05, color: 0xc58a55 });
    mats.boxFront = new THREE.MeshStandardMaterial({ map: this._boxFrontTexture(), roughness: 0.55, metalness: 0.05 });

    const fieldTex = makeSeigaiha(1024, { scale: 64, alpha: 0.42 });
    fieldTex.repeat.set((HALF_W * 2) / 17, 18 / 17);
    mats.field = new THREE.MeshStandardMaterial({ map: fieldTex, metalness: 0.55, roughness: 0.42, color: 0xbfc6ff });
    const pusherTex = makeSeigaiha(512, { bg: '#20255e', line: '#cfd6ff', alpha: 0.32, scale: 40 });
    pusherTex.repeat.set((PUSHER.halfWidth * 2) / 9, PUSHER.depth / 9);
    mats.pusherTop = new THREE.MeshStandardMaterial({ map: pusherTex, metalness: 0.6, roughness: 0.35 });
    // The stage box spans s from -0.4 (into the back board) to the lip; the
    // texture's top row is the back of the stage.
    const span = STAGE.length + 0.4;
    const f = (sv) => (sv + 0.4) / span;
    const stageArt = makeStageArt(1024, 512, [f(LANDING.sMin), f(LANDING.sMax), f(LANDING.s)]);
    mats.stage = new THREE.MeshStandardMaterial({
      map: stageArt, emissiveMap: stageArt, emissive: 0xffffff, emissiveIntensity: 0.18,
      roughness: 0.78, metalness: 0, envMapIntensity: 0.25, color: 0xb8bcd8,
    });

    for (const p of world.parts) this._partMesh(p);
    this._buildFrame();
    this._buildPusher();
    this._buildPins();
    this._buildTorii();
    this._buildBell();
    this._buildBoss();
    this._buildBackboard(lcdTexture);
    this._buildLamps();
    this._buildBox();
    this._buildPitchers();
    this._buildAimMarkers();
  }

  _buildPins() {
    const g = new THREE.CylinderGeometry(STAGE.pinRadius, STAGE.pinRadius, STAGE.pinHeight, 18);
    const capGeo = new THREE.SphereGeometry(STAGE.pinRadius * 1.25, 14, 10);
    const qa = quatX(STAGE.angle);
    this.pinMeshes = this.world.pins.map((p) => {
      const mesh = new THREE.Mesh(g, this.mats.chrome);
      mesh.quaternion.set(qa[0], qa[1], qa[2], qa[3]);
      mesh.position.copy(p.base);
      mesh.castShadow = true;
      const cap = new THREE.Mesh(capGeo, this.mats.gold);
      cap.position.y = STAGE.pinHeight / 2;
      mesh.add(cap);
      this.group.add(mesh);
      return mesh;
    });
  }

  // Offering box (賽銭箱): open-top wooden box riding a rail under the edge.
  _buildBox() {
    if (this.boxGroup) this.group.remove(this.boxGroup);
    const w = this.world.boxWidth / 2, d = BOX.depth / 2, t = BOX.wall, hgt = BOX.height;
    const g = this.boxGroup = new THREE.Group();
    const wood = this.mats.wood;
    const add = (sx, sy, sz, x, y, z, mat = wood) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    add((w + t) * 2, t, (d + t) * 2, 0, -t / 2, 0);
    add((w + t) * 2, hgt, t, 0, hgt / 2, -d - t / 2);
    add((w + t) * 2, hgt, t, 0, hgt / 2, d + t / 2, [wood, wood, wood, wood, this.mats.boxFront, wood]);
    add(t, hgt, d * 2, -w - t / 2, hgt / 2, 0);
    add(t, hgt, d * 2, w + t / 2, hgt / 2, 0);
    // Gold rim along the top edges.
    const rim = this.mats.gold;
    add((w + t) * 2 + 0.06, 0.07, 0.07, 0, hgt + 0.02, -d - t / 2, rim);
    add((w + t) * 2 + 0.06, 0.07, 0.07, 0, hgt + 0.02, d + t / 2, rim);
    add(0.07, 0.07, (d + t) * 2, -w - t / 2, hgt + 0.02, 0, rim);
    add(0.07, 0.07, (d + t) * 2, w + t / 2, hgt + 0.02, 0, rim);
    // Glow inside, flashes when a medal lands.
    this.boxGlow = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, d * 2),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.boxGlow.rotation.x = -Math.PI / 2;
    this.boxGlow.position.y = 0.02;
    g.add(this.boxGlow);
    g.position.set(this.world.boxX, BOX.floorY, BOX.z);
    this.group.add(g);
    this.boxBuiltWidth = this.world.boxWidth;
  }

  boxCatch() {
    this.boxFlash = 1;
  }

  _buildPitchers() {
    const m = this.mats;
    this.pitchers = [-1, 1].map((side) => {
      const root = new THREE.Group();
      root.position.set(side * PITCHER.x, PITCHER.y, PITCHER.z);
      root.scale.setScalar(1.35);
      // Mount on the wall.
      const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.25, 24), m.gold);
      mount.rotation.z = Math.PI / 2;
      mount.position.x = side * 0.15;
      root.add(mount);
      const yaw = new THREE.Group();
      root.add(yaw);
      const pitch = new THREE.Group();
      yaw.add(pitch);
      // Drum body with gold bands, barrel along local +z.
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.62, 28), m.vermilion);
      drum.rotation.x = Math.PI / 2;
      pitch.add(drum);
      for (const z of [-0.26, 0.26]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 8, 28), m.gold);
        band.position.z = z;
        pitch.add(band);
      }
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.8, 20, 1, true), m.black);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.6;
      pitch.add(barrel);
      const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 8, 20), m.gold);
      muzzleRing.position.z = 1.0;
      pitch.add(muzzleRing);
      const flash = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20),
        new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
      flash.position.z = 1.05;
      pitch.add(flash);
      root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(root);
      return { side, root, yaw, pitch, recoil: 0, flash };
    });
  }

  _buildAimMarkers() {
    const ring = (color, r) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(r * 0.72, r, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      const q = quatX(STAGE.angle);
      const tilt = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
      mesh.quaternion.copy(tilt).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
      this.group.add(mesh);
      return mesh;
    };
    this.reticle = ring(0xffe7a3, 0.6);
    this.reticleDot = ring(0xffe7a3, 0.14);
    this.aimRings = [ring(0x7fe3ff, 0.42), ring(0xff9ec4, 0.42)];
    // Arc preview for the pitcher that fires next.
    const pts = new Float32Array(24 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.arc = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xffe7a3, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.55, toneMapped: false }));
    this.arc.frustumCulled = false;
    this.group.add(this.arc);
  }

  // Muzzle point and launch velocity for a lob from pitcher pc to aimX
  // (the same ballistics as Game._launch, without the random spread).
  _lob(pc, aimX) {
    const tgt = stagePoint(aimX, LANDING.s, 0.12);
    const p = pc.root.position;
    const dx = tgt.x - p.x, dz = tgt.z - p.z, hd = Math.hypot(dx, dz) || 1;
    const m = { x: p.x + (dx / hd) * PITCHER.barrel, y: p.y + 0.15, z: p.z + (dz / hd) * PITCHER.barrel };
    const dist = Math.hypot(tgt.x - m.x, tgt.z - m.z);
    const T = FLIGHT.base + FLIGHT.perUnit * dist;
    const g = WORLD.gravity;
    const v = { x: (tgt.x - m.x) / T, y: (tgt.y - m.y) / T - 0.5 * g * T, z: (tgt.z - m.z) / T };
    return { m, v, T };
  }

  // Point the pitchers at their aim points and place the aim markers.
  updateAim(game, visible) {
    const markerAt = (mesh, x, lift = 0.02) => {
      const p = stagePoint(x, LANDING.s, lift);
      mesh.position.set(p.x, p.y, p.z);
    };
    this.reticle.visible = this.reticleDot.visible = visible;
    markerAt(this.reticle, game.aim.target, 0.03);
    markerAt(this.reticleDot, game.aim.target, 0.03);
    for (let i = 0; i < 2; i++) {
      const pc = this.pitchers[i];
      const aimX = game.aim.x[i];
      markerAt(this.aimRings[i], aimX, 0.025);
      this.aimRings[i].visible = visible;
      const { v } = this._lob(pc, aimX);
      pc.yaw.rotation.y = Math.atan2(v.x, v.z);
      pc.pitch.rotation.x = -Math.atan2(v.y, Math.hypot(v.x, v.z));
      pc.pitch.position.z = -pc.recoil * 0.25;
    }
    // Arc for the next shot.
    const { m, v, T } = this._lob(this.pitchers[game.nextPitcher], game.aim.x[game.nextPitcher]);
    const g = WORLD.gravity;
    const arr = this.arc.geometry.attributes.position.array;
    for (let k = 0; k < 24; k++) {
      const t = (k / 23) * T;
      arr[k * 3] = m.x + v.x * t;
      arr[k * 3 + 1] = m.y + v.y * t + 0.5 * g * t * t;
      arr[k * 3 + 2] = m.z + v.z * t;
    }
    this.arc.geometry.attributes.position.needsUpdate = true;
    this.arc.computeLineDistances();
    this.arc.visible = visible;
  }

  pitcherFired(i) {
    const pc = this.pitchers[i];
    pc.recoil = 1;
    pc.flash.material.opacity = 1;
  }

  _partMesh(p) {
    const m = this.mats;
    if (p.visual === false) return;
    let mesh;
    if (p.shape === 'box') {
      const g = new THREE.BoxGeometry(p.half[0] * 2, p.half[1] * 2, p.half[2] * 2);
      let mat = m.lacquer;
      if (p.name === 'floor') mat = [m.lacquerDark, m.lacquerDark, m.field, m.lacquerDark, m.gold, m.lacquerDark];
      else if (p.name === 'stage') mat = [m.gold, m.gold, m.stage, m.lacquerDark, m.gold, m.lacquerDark];
      else if (p.name === 'backWall') mat = [m.lacquer, m.lacquer, m.gold, m.lacquer, this._backWallMaterial(), m.lacquer];
      else if (p.name === 'sideGuard') mat = m.vermilion;
      else if (p.name === 'stageBack') mat = m.lacquerDark;
      mesh = new THREE.Mesh(g, mat);
    } else {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, p.halfHeight * 2, 20), m.chrome);
    }
    mesh.position.set(...p.pos);
    mesh.quaternion.set(...p.quat);
    (this.partMeshes[p.name] ||= []).push(mesh);
    mesh.castShadow = p.name !== 'floor' && p.name !== 'stageBack';
    mesh.receiveShadow = true;
    if (p.enabled === false) mesh.visible = false;
    this.group.add(mesh);
  }

  _boxFrontTexture() {
    const c = makeCanvas(512, 128);
    const ctx = c.getContext('2d');
    ctx.drawImage(makeWoodTexture().image, 0, 0, 512, 128);
    ctx.fillStyle = 'rgba(40,18,6,0.25)';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = '#f6e3b0';
    ctx.font = '400 74px "Dela Gothic One", "Hiragino Mincho ProN", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('賽 銭', 256, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  _backWallMaterial() {
    const c = makeCanvas(1024, 256);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#24296a');
    g.addColorStop(1, '#0d1030');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 1004, 236);
    ctx.fillStyle = 'rgba(240,201,106,0.85)';
    ctx.font = '700 64px "Dela Gothic One", "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('月 兎 屋', 512, 132);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  }

  _buildFrame() {
    const m = this.mats;
    const add = (geo, mat, pos, opts = {}) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos);
      mesh.receiveShadow = opts.receive !== false;
      mesh.castShadow = !!opts.cast;
      this.group.add(mesh);
      return mesh;
    };
    // Outer side panels of the cabinet.
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(0.9, 21, 20), m.lacquer, [side * (HALF_W + 1.35), 4, -4.5]);
      // Gold edge trim along the front of the panel.
      add(new THREE.BoxGeometry(0.95, 21, 0.18), m.gold, [side * (HALF_W + 1.35), 4, 5.55]);
      // Side drop pit (dark gutter beside the field, in front of the walls).
      add(new THREE.BoxGeometry(0.9, 0.1, FRONT_Z - SIDE_WALL_END_Z + 0.6), m.pit,
        [side * (HALF_W + 0.45), -3, (FRONT_Z + SIDE_WALL_END_Z) / 2 + 0.3], { receive: false });
      // Warning stripe on the floor edge where medals are lost.
      const stripe = add(new THREE.BoxGeometry(0.08, 0.02, FRONT_Z - SIDE_WALL_END_Z),
        new THREE.MeshBasicMaterial({ color: 0xff5a3c }), [side * (HALF_W - 0.04), 0.011, (FRONT_Z + SIDE_WALL_END_Z) / 2], { receive: false });
      stripe.userData.blink = true;
      this.lamps.push({ mesh: stripe, base: new THREE.Color(0xff5a3c), kind: 'stripe' });
      // Wall top LED strip.
      const strip = add(new THREE.BoxGeometry(0.1, 0.08, 14.6),
        new THREE.MeshBasicMaterial({ color: 0xf0c96a }), [side * (HALF_W + 0.02), 9.05 - STAGE_LOWER, -6.7], { receive: false });
      this.lamps.push({ mesh: strip, base: new THREE.Color(0xf0c96a), kind: 'strip' });
    }
    // Front edge trim.
    const lip = add(new THREE.CylinderGeometry(0.09, 0.09, HALF_W * 2, 16), m.gold, [0, -0.02, FRONT_Z]);
    lip.rotation.z = Math.PI / 2;
    // The well under the edge where the offering box rides: a dark pit with
    // a gold rail, and a low front panel below the box.
    const pitDepth = 3.2;
    add(new THREE.BoxGeometry(HALF_W * 2 + 2.7, 0.2, pitDepth + 1), m.pit, [0, -6.2, FRONT_Z + pitDepth / 2], { receive: false });
    add(new THREE.BoxGeometry(HALF_W * 2 + 2.7, 2.4, 0.4), m.lacquer, [0, BOX.floorY - 1.55, BOX.z + BOX.depth / 2 + 0.75]);
    add(new THREE.BoxGeometry(HALF_W * 2 + 2.7, 0.12, 0.42), m.gold, [0, BOX.floorY - 0.32, BOX.z + BOX.depth / 2 + 0.75]);
    const rail = add(new THREE.CylinderGeometry(0.07, 0.07, HALF_W * 2 + 1.6, 12), m.gold, [0, BOX.floorY - 0.22, BOX.z]);
    rail.rotation.z = Math.PI / 2;
    add(new THREE.BoxGeometry(HALF_W * 2 + 2.7, 0.25, 0.25), m.lacquerDark, [0, -0.85, FRONT_Z - 0.05]);
    // Roof with the title sign.
    add(new THREE.BoxGeometry(HALF_W * 2 + 2.7, 1.6, 4), m.lacquerDark, [0, 13.6 - STAGE_LOWER, -11.6]);
    const sign = add(new THREE.PlaneGeometry(HALF_W * 2 + 1, 1.25),
      new THREE.MeshBasicMaterial({ map: this._signTexture(), toneMapped: false }), [0, 13.6 - STAGE_LOWER, -9.58], { receive: false });
    this.sign = sign;
  }

  _signTexture() {
    const c = makeCanvas(1024, 112);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0a0c24';
    ctx.fillRect(0, 0, 1024, 112);
    ctx.shadowColor = '#ff7a4a';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffd9a0';
    ctx.font = '400 72px "Dela Gothic One", "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('月兎プッシャー', 512, 60);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  _buildPusher() {
    const m = this.mats;
    const g = new THREE.BoxGeometry(PUSHER.halfWidth * 2, PUSHER.height, PUSHER.depth);
    const front = new THREE.MeshStandardMaterial({ color: 0xe8b955, metalness: 1, roughness: 0.3, emissive: 0x3a2405 });
    this.pusher = new THREE.Mesh(g, [m.lacquer, m.lacquer, m.pusherTop, m.lacquer, front, m.lacquer]);
    this.pusher.castShadow = true;
    this.pusher.receiveShadow = true;
    this.group.add(this.pusher);
    // LED dots along the pusher face.
    const dotGeo = new THREE.CircleGeometry(0.07, 12);
    this.pusherDots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 23);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < 23; i++) {
      mtx.makeTranslation(-HALF_W + 0.5 + i * ((HALF_W * 2 - 1) / 22), 0, PUSHER.depth / 2 + 0.005);
      this.pusherDots.setMatrixAt(i, mtx);
      this.pusherDots.setColorAt(i, new THREE.Color(PALETTE.gold));
    }
    this.pusher.add(this.pusherDots);
  }

  _buildTorii() {
    const m = this.mats;
    const t = this.torii = new THREE.Group();
    const base = stagePoint(0, STAGE.length - 0.3, 0);
    t.position.set(0, base.y, base.z);
    this.group.add(t);
    const post = checkerPostPos(1, STAGE.checkerHalfGap);
    const px = post.x;
    const height = 1.75;
    this.toriiParts = { posts: [] };
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(STAGE.checkerPostRadius * 0.92, STAGE.checkerPostRadius, height, 20), m.vermilion);
      p.position.set(side * px, height / 2 - 0.05, 0);
      p.castShadow = true;
      t.add(p);
      this.toriiParts.posts.push(p);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.18, 20), m.black);
      foot.position.set(side * px, 0.05, 0);
      t.add(foot);
      this.toriiParts.posts.push(foot);
    }
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(px * 2 + 0.6, 0.12, 0.14), m.vermilion);
    nuki.position.y = height - 0.42;
    t.add(nuki);
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(px * 2 + 1.1, 0.16, 0.28), m.vermilion);
    kasagi.position.y = height - 0.02;
    t.add(kasagi);
    const shimaki = new THREE.Mesh(new THREE.BoxGeometry(px * 2 + 1.3, 0.1, 0.32), m.black);
    shimaki.position.y = height + 0.1;
    t.add(shimaki);
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.06), m.gold);
    plaque.position.set(0, height - 0.22, 0.06);
    t.add(plaque);
    this.toriiParts.beams = [nuki, kasagi, shimaki];
    t.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // Glow plane between the posts, flashes on a checker hit.
    this.toriiGlow = new THREE.Mesh(new THREE.PlaneGeometry(px * 2, height - 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.toriiGlow.position.set(0, (height - 0.5) / 2 + 0.05, 0);
    t.add(this.toriiGlow);
    this.toriiPostX = px;
  }

  // 鈴 hanging from the torii on a red and white rope.
  _buildBell() {
    const g = this.bellGroup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), this.mats.gold);
    g.add(body);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.08, 8, 36), this.mats.black);
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.3;
    g.add(band);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 2.06), this.mats.black);
    slot.position.y = -0.62;
    g.add(slot);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.08, 8, 16), this.mats.gold);
    loop.position.y = 1.08;
    g.add(loop);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(g);
    this.bellRope = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9452e, roughness: 0.75 }));
    this.bellRope.castShadow = true;
    this.group.add(this.bellRope);
    const hang = stagePoint(0, CHECKER_POST_S, 0);
    this.bellHang = { y: hang.y + 1.85, z: hang.z };
    this._ropeDir = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  _updateBell() {
    const w = this.world;
    const p = w._bellPos();
    const r = w.bellRadius;
    this.bellGroup.scale.setScalar(r);
    this.bellGroup.position.set(p.x, p.y, p.z);
    const top = { x: w.toriiX, y: this.bellHang.y, z: this.bellHang.z };
    const end = { x: p.x, y: p.y + r * 1.25, z: p.z };
    const d = this._ropeDir.set(end.x - top.x, end.y - top.y, end.z - top.z);
    const len = d.length();
    this.bellRope.position.set((top.x + end.x) / 2, (top.y + end.y) / 2, (top.z + end.z) / 2);
    this.bellRope.scale.y = len;
    this.bellRope.quaternion.setFromUnitVectors(this._up, d.multiplyScalar(-1 / len));
    this.bellGroup.rotation.z = Math.atan2(p.x - w.toriiX, top.y - p.y);
  }

  // Boss: a painted mask sprite with a glow behind it and a shadow on the stage.
  _buildBoss() {
    this.bossFaces = {};
    this.bossSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    this.bossSprite.scale.set(2.4, 2.4, 1);
    this.bossSprite.renderOrder = 2;
    this.bossHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowSprite(), color: 0xff5a3c, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.bossHalo.scale.set(4.2, 4.2, 1);
    this.bossShadow = new THREE.Mesh(new THREE.CircleGeometry(0.85, 28),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.bossShadow.rotation.x = STAGE.angle - Math.PI / 2;
    for (const o of [this.bossSprite, this.bossHalo, this.bossShadow]) {
      o.visible = false;
      this.group.add(o);
    }
    this.bossKey = null;
    this.bossFlash = 0;
    this.bossDying = 0;
  }

  bossHit() {
    this.bossFlash = 1;
  }

  bossDefeated() {
    this.bossDying = 1;
  }

  updateBoss(dt, boss) {
    const t = this.time;
    const sp = this.bossSprite;
    const alive = !!boss?.alive;
    if (this.bossDying > 0) this.bossDying = Math.max(0, this.bossDying - dt * 1.3);
    const show = alive || this.bossDying > 0;
    sp.visible = this.bossHalo.visible = this.bossShadow.visible = show;
    if (!show) return;
    if (boss && boss.key !== this.bossKey) {
      this.bossKey = boss.key;
      this.bossFaces[boss.key] ||= makeBossFace(boss.key);
      sp.material.map = this.bossFaces[boss.key];
      sp.material.needsUpdate = true;
      this.bossHalo.material.color.set(boss.key === 'tanuki' ? 0x9be070 : boss.key === 'tengu' ? 0xffd27a : 0xff5a3c);
    }
    const x = alive ? this.world.bossX : sp.position.x;
    const p = stagePoint(x, BOSS.s, BOSS.lift);
    const bob = Math.sin(t * 3) * 0.1;
    sp.position.set(p.x, p.y + 0.1 + bob, p.z);
    this.bossHalo.position.set(p.x, p.y + 0.1 + bob, p.z - 0.2);
    const sh = stagePoint(x, BOSS.s, 0.03);
    this.bossShadow.position.set(sh.x, sh.y, sh.z);
    if (this.bossFlash > 0) this.bossFlash = Math.max(0, this.bossFlash - dt * 5);
    const f = this.bossFlash;
    sp.material.color.setRGB(1, 1 - f * 0.6, 1 - f * 0.6);
    if (this.bossDying > 0) {
      const k = 1 - this.bossDying;
      sp.scale.setScalar(2.4 * (1 + k * 0.9));
      sp.material.opacity = this.bossDying;
      sp.material.rotation = k * 4;
      this.bossHalo.material.opacity = 0.9 * this.bossDying;
      this.bossShadow.material.opacity = 0.35 * this.bossDying;
    } else {
      const squash = 1 + f * 0.12;
      sp.scale.set(2.4 * squash, 2.4 / squash, 1);
      sp.material.opacity = 1;
      sp.material.rotation = Math.sin(t * 2.1) * 0.07;
      this.bossHalo.material.opacity = 0.35 + 0.15 * Math.sin(t * 4) + f * 0.4;
      this.bossShadow.material.opacity = 0.35;
    }
  }

  setToriiHalfGap(halfGap) {
    const px = checkerPostPos(1, halfGap).x;
    const scale = px / this.toriiPostX;
    for (const p of this.toriiParts.posts) p.position.x = Math.sign(p.position.x) * px;
    for (const b of this.toriiParts.beams) b.scale.x = scale;
    this.toriiGlow.scale.x = scale;
  }

  _buildBackboard(lcdTexture) {
    const m = this.mats;
    const z = STAGE.top.z + 0.01;
    // LCD screen in a gold frame.
    const w = 7.4, h = 3.7, cy = 8.65 - STAGE_LOWER;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, h + 0.5, 0.25), m.gold);
    frame.position.set(0, cy, z + 0.05);
    this.group.add(frame);
    this.lcd = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: lcdTexture, toneMapped: false, color: 0xd8d8d8 }));
    this.lcd.position.set(0, cy, z + 0.19);
    this.group.add(this.lcd);
    // Moon above the screen.
    this.moonMat = new THREE.MeshBasicMaterial({ map: makeMoon(), transparent: true, toneMapped: false, color: 0xdddddd });
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), this.moonMat);
    this.moon.position.set(0, 11.75 - STAGE_LOWER, z + 0.12);
    this.group.add(this.moon);
    const halo = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.4, 64),
      new THREE.MeshBasicMaterial({ color: 0xffd89a, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    halo.position.copy(this.moon.position);
    halo.position.z -= 0.01;
    this.group.add(halo);
    this.halo = halo;
    // Lanterns along the top.
    const chars = ['月', '見', '兎', '福', '満', '願'];
    const lanternGeo = new THREE.SphereGeometry(0.42, 24, 16);
    lanternGeo.scale(1, 1.35, 1);
    chars.forEach((ch, i) => {
      if (i === 2 || i === 3) return; // the moon sits in the middle
      const x = (i - 2.5) * 2.05;
      const mat = new THREE.MeshStandardMaterial({ map: makeLantern(ch), emissive: 0xff5a30, emissiveIntensity: 0.5, roughness: 0.8 });
      mat.emissiveMap = mat.map;
      const l = new THREE.Mesh(lanternGeo, mat);
      l.position.set(x, 11.6 - STAGE_LOWER, z + 0.9);
      l.rotation.y = Math.PI / 2 + 0.25 * Math.sign(-x);
      this.group.add(l);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 16), m.black);
      cap.position.set(x, 12.22 - STAGE_LOWER, z + 0.9);
      this.group.add(cap);
      const cap2 = cap.clone();
      cap2.position.y = 10.98 - STAGE_LOWER;
      this.group.add(cap2);
      this.lanterns.push({ mesh: l, mat, phase: i * 1.3 });
    });
  }

  _buildLamps() {
    // Row of round lamps on the back wall, lit up in sequence.
    const geo = new THREE.CircleGeometry(0.16, 20);
    const n = 13;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x553a20, toneMapped: false });
      const lamp = new THREE.Mesh(geo, mat);
      lamp.position.set(-HALF_W + 0.9 + i * ((HALF_W * 2 - 1.8) / (n - 1)), BACK_WALL.top - 0.32, BACK_WALL.front + 0.01);
      this.group.add(lamp);
      this.lamps.push({ mesh: lamp, base: new THREE.Color(0x553a20), kind: 'dot', index: i, count: n });
    }
  }

  setPartVisible(name, on) {
    for (const m of this.partMeshes[name] || []) m.visible = on;
  }

  // Visual cue for game events.
  flash(color = PALETTE.gold, seconds = 1.2, kind = 'normal') {
    this.flashColor.set(color);
    this.flashTimer = Math.max(this.flashTimer, seconds);
    this.flashKind = kind;
  }

  checkerHit() {
    this.toriiFlash = 1;
  }

  update(dt, pusherFront, jackpot = false, fever = false) {
    this.time += dt;
    const t = this.time;
    const w = this.world;
    this.pusher.position.set(0, PUSHER.height / 2, pusherFront - PUSHER.depth / 2);
    w.pins.forEach((p, i) => { this.pinMeshes[i].position.x = p.x; });
    this.torii.position.x = w.toriiX;
    this._updateBell();
    if (Math.abs(this.boxBuiltWidth - w.boxWidth) > 1e-3) this._buildBox();
    this.boxGroup.position.x = w.boxX;
    if (this.boxFlash > 0) this.boxFlash = Math.max(0, this.boxFlash - dt * 3);
    this.boxGlow.material.opacity = 0.08 + (this.boxFlash || 0) * 0.6;
    for (const pc of this.pitchers) {
      if (pc.recoil > 0) pc.recoil = Math.max(0, pc.recoil - dt * 6);
      pc.flash.material.opacity = Math.max(0, pc.flash.material.opacity - dt * 8);
    }
    if (fever) jackpot = true;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    const flashing = this.flashTimer > 0;
    const fast = flashing || jackpot;

    for (const l of this.lamps) {
      const mat = l.mesh.material;
      if (l.kind === 'dot') {
        const k = fast ? Math.floor(t * 14) : Math.floor(t * 3);
        const on = fast ? (k + l.index) % 2 === 0 : (k % l.count) === l.index || ((k + 6) % l.count) === l.index;
        mat.color.copy(on ? (flashing ? this.flashColor : new THREE.Color(0xffd27a)) : l.base);
      } else if (l.kind === 'strip') {
        const pulse = fast ? 0.5 + 0.5 * Math.sin(t * 20) : 0.75 + 0.25 * Math.sin(t * 1.4);
        mat.color.copy(flashing ? this.flashColor : l.base).multiplyScalar(pulse);
      } else if (l.kind === 'stripe') {
        mat.color.copy(l.base).multiplyScalar(0.55 + 0.45 * Math.abs(Math.sin(t * 2.2)));
      }
    }
    for (const l of this.lanterns) {
      const flicker = 0.45 + 0.1 * Math.sin(t * 7 + l.phase) + 0.05 * Math.sin(t * 13 + l.phase * 2);
      l.mat.emissiveIntensity = fast ? 0.6 + 0.6 * Math.abs(Math.sin(t * 9 + l.phase)) : flicker;
      l.mesh.rotation.z = Math.sin(t * 0.8 + l.phase) * 0.04;
    }
    const moonPulse = jackpot ? 0.85 + 0.15 * Math.sin(t * 10) : 0.86 + 0.04 * Math.sin(t * 0.7);
    this.moonMat.color.setScalar(moonPulse);
    this.halo.material.opacity = jackpot ? 0.35 + 0.2 * Math.sin(t * 10) : 0.16 + 0.04 * Math.sin(t * 0.7);
    // Pusher LEDs chase.
    const dots = this.pusherDots;
    const c = new THREE.Color();
    for (let i = 0; i < 23; i++) {
      const on = fast ? (Math.floor(t * 16) + i) % 3 === 0 : Math.abs(((t * 6) % 30) - i) < 2;
      c.set(on ? (flashing ? this.flashColor : 0xfff1c0) : 0x5a4420);
      dots.setColorAt(i, c);
    }
    dots.instanceColor.needsUpdate = true;
    if (this.toriiFlash > 0) this.toriiFlash = Math.max(0, this.toriiFlash - dt * 1.6);
    this.toriiGlow.material.opacity = (this.toriiFlash || 0) * 0.85;
  }
}
