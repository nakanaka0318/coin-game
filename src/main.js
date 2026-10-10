// Boot and main loop: loads the physics engine, wires the game rules to
// rendering, sound, input and saving.
import './styles.css';
import * as THREE from 'three';
import { PhysicsWorld, KIND } from './sim/physics.js';
import { WORLD, DROP, FRONT_Z, HALF_W, STAGE, stagePoint, COIN } from './sim/config.js';
import initialField from './sim/initial-field.json';
import { Game, charmById, talismanById } from './game/game.js';
import { NIGHTS } from './game/data.js';
import { SceneView } from './render/scene.js';
import { Cabinet } from './render/cabinet.js';
import { CoinRenderer } from './render/coins.js';
import { LcdDisplay } from './render/lcd.js';
import { Sparkles } from './render/fx.js';
import { makeMoon } from './render/textures.js';
import { AudioEngine } from './audio/audio.js';
import { UI } from './ui/ui.js';

const STORE_KEY = 'moon-rabbit-pusher:v1';
const PAGES_URL = 'https://nakanaka0318.github.io/coin-game/';

// --- storage (all access guarded: storage can be missing or throw) ---------
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveStore(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}

const isTouch = matchMedia('(pointer: coarse)').matches;
const store = loadStore();
const settings = Object.assign({ sound: true, music: true, quality: isTouch ? 'medium' : 'high' }, store.settings);
const record = Object.assign({ best: 0, clears: 0, bestJp: 0 }, store.record);

const loading = document.getElementById('loading');
const loadingMsg = document.getElementById('loading-msg');

async function loadRapier() {
  if (typeof WebAssembly !== 'object') throw new Error('WebAssembly unavailable');
  const simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  const mod = simd
    ? await import('@dimforge/rapier3d-simd-compat')
    : await import('@dimforge/rapier3d-compat');
  const R = mod.default;
  await R.init();
  return R;
}

function showFatal(err) {
  console.error(err);
  loading.hidden = false;
  loading.innerHTML = '';
  const box = document.createElement('div');
  box.innerHTML = `<div>月兎プッシャー</div><p>物理エンジン (WebAssembly) を起動できませんでした。最新のブラウザで、またはこちらのページで遊べます。</p><p><a href="${PAGES_URL}" target="_blank" rel="noopener">${PAGES_URL}</a></p>`;
  loading.append(box);
}

let RAPIER;
try {
  RAPIER = await loadRapier();
} catch (err) {
  showFatal(err);
  throw err;
}

// --- world ---------------------------------------------------------------
const audio = new AudioEngine();
audio.enabled = settings.sound;
audio.musicOn = settings.music;
let impactsOn = false;
const world = new PhysicsWorld(RAPIER, {
  onImpact: (m1, m2, speed, x) => { if (impactsOn) audio.impact(m1, m2, speed, x); },
});

const canvas = document.getElementById('view');
const view = new SceneView(canvas, settings.quality);
const lcd = new LcdDisplay();
const cabinet = new Cabinet(view.scene, world.parts, lcd.texture);
const coins = new CoinRenderer(view.scene, 1200);
coins.setShadows(settings.quality !== 'low');
const sparkles = new Sparkles(view.scene);

// Drop rail with a ghost medal showing where the next medal falls.
const aim = { x: 0, target: 0, visible: true };
const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, HALF_W * 2, 12),
  new THREE.MeshStandardMaterial({ color: 0xe8b955, metalness: 1, roughness: 0.3 }));
rail.rotation.z = Math.PI / 2;
rail.position.set(0, DROP.y + 0.75, DROP.z);
view.scene.add(rail);
const ghost = new THREE.Group();
const ghostCoin = new THREE.Mesh(new THREE.CylinderGeometry(COIN.radius, COIN.radius, COIN.halfHeight * 2, 32),
  new THREE.MeshBasicMaterial({ color: 0xffe7a3, transparent: true, opacity: 0.55, depthWrite: false }));
ghostCoin.rotation.x = Math.PI / 2;
const ghostClip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.3),
  new THREE.MeshStandardMaterial({ color: 0xd9452e, metalness: 0.3, roughness: 0.4 }));
ghostClip.position.y = 0.72;
const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 3.2),
  new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
beam.position.y = -1.9;
ghost.add(ghostCoin, ghostClip, beam);
ghost.position.set(0, DROP.y, DROP.z);
view.scene.add(ghost);

const game = new Game(world, { emit: onGameEvent, initialField });

// --- UI ----------------------------------------------------------------------
const ui = new UI(document.getElementById('ui'), {
  newRun: () => startRun(),
  continueRun: () => continueSaved(),
  freePlay: () => startFree(),
  backToTitle: () => showTitle(),
  dawn: () => game.callDawn(),
  borrow: () => { game.bank += 50; game.freeStats.borrowed = (game.freeStats.borrowed || 0) + 50; audio.buy(); ui.toast('50枚借りた'); },
  view: () => view.cycleView(),
  menu: () => openMenu(),
  useTalisman: (i) => game.useTalisman(i),
  buy: (it, type) => { if (game.buy(it, type)) audio.buy(); },
  sell: (i) => { game.sellCharm(i); audio.click(); },
  reroll: () => { if (game.reroll()) audio.click(); },
  leaveShop: () => { audio.click(); game.leaveShop(); persist(); },
  settings: (s) => applySettings(s),
  drawTitleMoon: (c) => {
    const ctx = c.getContext('2d');
    const img = makeMoon(440).image;
    ctx.drawImage(img, 0, 0, c.width, c.height);
  },
});

function applySettings(s) {
  Object.assign(settings, s);
  audio.setEnabled(settings.sound);
  audio.setMusic(settings.music);
  if (view.quality !== settings.quality) {
    view.setQuality(settings.quality);
    coins.setShadows(settings.quality !== 'low');
  }
  persist();
}

function persist() {
  const data = { settings, record };
  if ((game.mode === 'run' && ['night', 'dawn', 'shop'].includes(game.phase)) || game.mode === 'free') {
    data.save = game.serialize();
  }
  saveStore(data);
}

function showTitle() {
  game.mode = 'idle';
  game.phase = 'idle';
  const saved = loadStore().save;
  ui.showTitle({ hasSave: !!saved, record, settings });
  view.setView('overview');
}

function startRun() {
  audio.unlock();
  ui.hideAll();
  impactsOn = false;
  game.newRun();
  impactsOn = true;
  persist();
}

function startFree() {
  audio.unlock();
  ui.hideAll();
  const saved = loadStore().save;
  if (saved && saved.mode === 'free') {
    game.deserialize(saved);
    game.newFreePlay();
  } else {
    game.bank = Math.max(game.bank, 50);
    game.resetField();
    game.newFreePlay();
  }
  impactsOn = true;
  ui.toast('フリープレイ ・ ノルマなしで遊べる');
  persist();
}

function continueSaved() {
  audio.unlock();
  const saved = loadStore().save;
  if (!saved) { startRun(); return; }
  ui.hideAll();
  game.deserialize(saved);
  impactsOn = true;
  if (game.mode === 'free') { game.newFreePlay(); return; }
  if (game.phase === 'dawn') ui.showDawn(game.night, game.night.reward, game.bank, () => game.openShop());
  else if (game.phase === 'shop') ui.showShop(game);
  else ui.toast(`第${game.night.index + 1}夜 ${game.night.name} を再開`);
}

let paused = false;
function openMenu() {
  if (ui.anyScreen() && !paused) return;
  paused = true;
  ui.showMenu({
    settings,
    mode: game.mode,
    onResume: () => { paused = false; ui.hideAll(); },
    onTitle: () => { paused = false; persist(); showTitle(); },
    onRestart: () => { paused = false; startRun(); },
  });
}

// --- game events → feedback ------------------------------------------------
function screenOf(x, y, z) {
  return view.worldToScreen(x, y, z);
}

const SLOT_NAMES = { seven: '7揃い', moon: '満月揃い', rabbit: '兎揃い', dango: '団子揃い', sakura: '桜揃い', star: '星揃い' };
const SLOT_COLORS = { seven: '#ff5a3c', moon: '#ffe7a3', rabbit: '#ffc2d4', dango: '#b8f0a0', sakura: '#f7a8c0', star: '#ffd34a' };

function onGameEvent(type, d) {
  switch (type) {
    case 'drop': audio.drop(d.x); break;
    case 'payout': {
      const p = screenOf(Math.max(-HALF_W, Math.min(HALF_W, d.x)), 0.4, FRONT_Z);
      const kind = d.kind === KIND.BALL ? 'ball' : d.kind === KIND.GOLD ? 'gold' : '';
      ui.pop(`+${d.value}`, p.x, p.y, kind);
      sparkles.burst(d.x, 0.1, FRONT_Z + 0.2, { count: d.value > 1 ? 18 : 7, color: d.kind === KIND.GOLD ? 0xffc23a : 0xfff1c0, speed: 2, up: 3.5 });
      audio.payout(d.value, d.x);
      break;
    }
    case 'lost': {
      const p = screenOf(d.x, 0.2, Math.min(FRONT_Z, d.z));
      ui.pop('落', p.x, p.y, 'lost');
      audio.lost(d.x);
      break;
    }
    case 'refund': ui.toast('鏡餅がメダルを1枚取り戻した', 'good'); break;
    case 'checker': {
      cabinet.checkerHit();
      audio.checker();
      const c = stagePoint(0, STAGE.length - 0.3, 1);
      sparkles.burst(0, c.y, c.z, { count: 26, color: 0xffd27a, speed: 3, up: 4 });
      const p = screenOf(0, c.y + 1.4, c.z);
      ui.pop('抽選 +1', p.x, p.y);
      break;
    }
    case 'spin': audio.spinStart(d.reach); break;
    case 'reelStop': lcd.onReelStop(d.reel); audio.reelStop(d.reel, d.reach); break;
    case 'slotResult': {
      if (!d.outcome) { audio.stopSpin(); break; }
      audio.win(d.outcome);
      let sub = '';
      if (d.outcome === 'moon') sub = '月玉が降ってくる';
      else if (d.outcome === 'sakura' && d.drops) sub = `今夜のメダル +${d.drops}`;
      else if (d.outcome === 'star') sub = d.amount ? `金メダル + 銀${d.amount}枚` : '金メダル1枚';
      else if (d.amount) sub = `メダル ${d.amount}枚`;
      if (d.outcome !== 'seven') {
        lcd.message(SLOT_NAMES[d.outcome], { sub, color: SLOT_COLORS[d.outcome] });
        cabinet.flash(SLOT_COLORS[d.outcome], 1.6);
      }
      break;
    }
    case 'jackpot': {
      audio.jackpot();
      lcd.message('JACKPOT', { sub: `${d.amount}枚`, color: '#ffd34a', seconds: 4.5, big: true });
      cabinet.flash('#ffd34a', 6, 'jackpot');
      view.addShake(0.6);
      ui.toast(`ジャックポット ${d.amount}枚!`, 'big');
      for (let i = 0; i < 6; i++) setTimeout(() => sparkles.burst((Math.random() - 0.5) * 9, 6 + Math.random() * 2, Math.random() * 3 - 1, { count: 40, color: [0xffd34a, 0xff6b4a, 0xf4a3b8][i % 3], speed: 5, up: 3, life: 1.3, size: 0.5 }), i * 260);
      if (d.amount > record.bestJp) record.bestJp = d.amount;
      break;
    }
    case 'ball': ui.toast('月玉が出た! 手前に落とせば大当たり', 'good'); break;
    case 'ballPayout': {
      ui.toast(`月玉 払い出し +${d.value}枚・抽選+1`, 'big');
      cabinet.flash('#fff3c4', 2.5);
      audio.win('moon');
      break;
    }
    case 'quotaMet': {
      audio.quotaMet();
      ui.toast('ノルマ達成! 夜明けにしてもいいし、まだ稼いでもいい', 'good');
      cabinet.flash('#8fe0a8', 1.8);
      break;
    }
    case 'nightStart': {
      record.best = Math.max(record.best, d.index + 1);
      ui.showIntro(d, () => { audio.nightStart(d.index); });
      view.setView('overview');
      persist();
      break;
    }
    case 'nightEnd': {
      audio.quotaMet();
      ui.showDawn(d.night, d.reward, game.bank, () => { audio.click(); game.openShop(); });
      persist();
      break;
    }
    case 'shop': ui.showShop(game); break;
    case 'gameOver': {
      audio.fail();
      const saved = loadStore();
      delete saved.save;
      saveStore({ ...saved, settings, record });
      ui.showOver(game, () => startRun(), () => showTitle());
      break;
    }
    case 'runClear': {
      record.clears += 1;
      record.best = NIGHTS.length;
      audio.jackpot();
      saveStore({ settings, record });
      ui.showClear(game, () => startRun(), () => { game.bank = Math.max(game.bank, 50); startFree(); }, () => showTitle());
      break;
    }
    case 'quake': view.addShake(0.9 * Math.min(1.5, d.power)); audio.quake(); break;
    case 'gust': audio.gust(); sparkles.burst(0, 0.6, FRONT_Z - 1.2, { count: 40, color: 0xbfe8ff, speed: 4, up: 1.5 }); break;
    case 'talisman': ui.toast(`${talismanById[d.id].name}!`); break;
    case 'twin': ui.toast('双子月 ・ おまけの1枚', 'good'); break;
    case 'mallet': ui.toast('打ち出の小槌 ・ 金メダル!', 'good'); break;
    case 'foxfire': ui.toast('狐火 ・ 金メダルが現れた', 'good'); break;
    case 'bought': if (d.type === 'charm') ui.toast(`${charmById[d.id].name} を手に入れた`, 'good'); break;
    case 'stats': {
      cabinet.setPartVisible('sideGuard', !!d.sideGuards);
      cabinet.setPartVisible('wallFront', !d.shortWalls);
      cabinet.setToriiHalfGap(d.checkerHalfGap);
      break;
    }
    default: break;
  }
}

// --- input ---------------------------------------------------------------------
const pointer = { down: false, id: null, holdT: 0, repeatT: 0 };
const keys = new Set();

function aimFromScreen(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, view.camera);
  const t = (DROP.z - ray.ray.origin.z) / ray.ray.direction.z;
  if (!isFinite(t) || t <= 0) return;
  aim.target = Math.max(DROP.minX, Math.min(DROP.maxX, ray.ray.origin.x + ray.ray.direction.x * t));
}

function tryDrop() {
  if (ui.anyScreen() || paused) return false;
  const ok = game.drop(aim.x);
  if (!ok && game.mode === 'run' && game.phase === 'night' && game.night.dropsLeft <= 0 && game.bank <= 0) ui.toast('メダルがもうない', 'bad');
  return ok;
}

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (ui.anyScreen()) return;
  pointer.down = true;
  pointer.id = e.pointerId;
  pointer.holdT = 0;
  pointer.repeatT = 0.42;
  canvas.setPointerCapture(e.pointerId);
  aimFromScreen(e.clientX, e.clientY);
  aim.x = aim.target;
  tryDrop();
});
canvas.addEventListener('pointermove', (e) => aimFromScreen(e.clientX, e.clientY));
const release = (e) => { if (e.pointerId === pointer.id) { pointer.down = false; pointer.id = null; } };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('keydown', (e) => {
  if (e.repeat && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); return; }
  audio.unlock();
  const k = e.key.toLowerCase();
  if (k === 'escape') {
    if (paused) { paused = false; ui.hideAll(); } else if (!ui.anyScreen() && game.phase !== 'idle') openMenu();
    return;
  }
  if (ui.anyScreen()) return;
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    keys.add('drop');
    pointer.repeatT = 0.42;
    tryDrop();
  } else if (k === 'arrowleft' || k === 'a') keys.add('left');
  else if (k === 'arrowright' || k === 'd') keys.add('right');
  else if (k === 'v') view.cycleView();
  else if (k === 'm') applySettings({ sound: !settings.sound });
  else if (['1', '2', '3'].includes(k)) game.useTalisman(Number(k) - 1);
});
addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (e.code === 'Space' || e.code === 'Enter') keys.delete('drop');
  if (k === 'arrowleft' || k === 'a') keys.delete('left');
  if (k === 'arrowright' || k === 'd') keys.delete('right');
});
addEventListener('blur', () => { keys.clear(); pointer.down = false; });
addEventListener('resize', () => view.resize());
addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// --- loop ------------------------------------------------------------------
let last = performance.now();
let acc = 0;
let saveT = 0;
const stats = window.__stats = { steps: 0, frames: 0, stepMs: 0 };

function frame() {
  const now = performance.now();
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  stats.frames++;

  // Aim movement and auto-drop while held.
  if (keys.has('left')) aim.target = Math.max(DROP.minX, aim.target - 7 * dt);
  if (keys.has('right')) aim.target = Math.min(DROP.maxX, aim.target + 7 * dt);
  aim.x += (aim.target - aim.x) * Math.min(1, dt * 18);
  if ((pointer.down || keys.has('drop')) && !ui.anyScreen()) {
    pointer.repeatT -= dt;
    if (pointer.repeatT <= 0) { pointer.repeatT = 0.26; tryDrop(); }
  }

  if (!paused) {
    acc += dt;
    let n = 0;
    while (acc >= WORLD.fixedDt && n < 4) {
      world.step();
      game.update(WORLD.fixedDt);
      acc -= WORLD.fixedDt;
      n++;
      stats.steps++;
    }
    if (n === 4) acc = 0;
    stats.stepMs = world.lastStepMs;
  }

  ghost.position.x = aim.x;
  ghost.position.y = DROP.y + Math.sin(now / 300) * 0.05;
  ghost.visible = game.canDrop() && !ui.anyScreen();

  coins.update(world);
  cabinet.update(dt, world.pusherFront, cabinet.flashKind === 'jackpot' && cabinet.flashTimer > 0);
  sparkles.setScale(view.renderer.domElement.height * 0.9);
  sparkles.update(dt);
  lcd.draw(dt, game);
  ui.update(game);
  view.render(dt);

  saveT += dt;
  if (saveT > 10) { saveT = 0; persist(); }
  requestAnimationFrame(frame);
}

// Attract mode behind the title: the baked pile with the pusher running.
game.resetField();
loading.hidden = true;
showTitle();
requestAnimationFrame(frame);

// Fonts may arrive after the first draw of canvas textures.
if (document.fonts) document.fonts.ready.then(() => { lcd.redrawSymbols(); });

window.__game = game;
window.__view = view;
window.__ready = true;
