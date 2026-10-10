// Boot and main loop: loads the physics engine, wires the game rules to
// rendering, sound, input and saving.
import './styles.css';
import * as THREE from 'three';
import { PhysicsWorld, KIND } from './sim/physics.js';
import { WORLD, FRONT_Z, HALF_W, STAGE, BOX, AIM, LANDING, stagePoint } from './sim/config.js';
import initialField from './sim/initial-field.json';
import { Game, charmById, talismanById, shrineById } from './game/game.js';
import { NIGHTS, shrinePrice } from './game/data.js';
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
document.documentElement.classList.toggle('touch', isTouch);
const store = loadStore();
const settings = Object.assign({ sound: true, quality: isTouch ? 'medium' : 'high' }, store.settings);
settings.vol = Object.assign({ master: 80, sfx: 80, bgm: 50 }, settings.vol);
if (settings.music === false) settings.vol.bgm = 0;
delete settings.music;
const record = Object.assign({ best: 0, clears: 0, bestJp: 0, shards: 0, earned: 0 }, store.record);
const meta = Object.assign({}, store.meta);

const loading = document.getElementById('loading');

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
audio.levels = { ...settings.vol };
let impactsOn = false;
const world = new PhysicsWorld(RAPIER, {
  onImpact: (m1, m2, speed, x) => { if (impactsOn) audio.impact(m1, m2, speed, x); },
});

const canvas = document.getElementById('view');
const view = new SceneView(canvas, settings.quality);
const lcd = new LcdDisplay();
const cabinet = new Cabinet(view.scene, world, lcd.texture);
const coins = new CoinRenderer(view.scene, 1200);
coins.setShadows(settings.quality !== 'low');
const sparkles = new Sparkles(view.scene);

const game = new Game(world, { emit: onGameEvent, initialField });
game.meta = meta;

// --- UI ----------------------------------------------------------------------
const ui = new UI(document.getElementById('ui'), {
  newRun: () => startRun(),
  continueRun: () => continueSaved(),
  freePlay: () => startFree(),
  backToTitle: () => showTitle(),
  openShrine: () => openShrine(),
  dawn: () => game.callDawn(),
  borrow: () => { game.bank += 50; game.freeStats.borrowed = (game.freeStats.borrowed || 0) + 50; audio.buy(); ui.toast('50枚借りた'); },
  view: () => view.cycleView(),
  menu: () => openMenu(),
  useTalisman: (i) => game.useTalisman(i),
  buy: (it, type) => { if (game.buy(it, type)) audio.buy(); },
  sell: (i) => { game.sellCharm(i); audio.click(); },
  reroll: () => { if (game.reroll()) audio.click(); },
  leaveShop: () => { audio.click(); game.leaveShop(); persist(); },
  settings: (s, live) => applySettings(s, !live),
  aimFraction: (f) => { audio.unlock(); game.setAim(AIM.minX + f * (AIM.maxX - AIM.minX)); },
  fireDown: () => { audio.unlock(); input.fireHeld.add('button'); if (canPlay()) game.requestFire(); },
  fireUp: () => { input.fireHeld.delete('button'); },
  drawTitleMoon: (c) => {
    const ctx = c.getContext('2d');
    const img = makeMoon(440).image;
    ctx.drawImage(img, 0, 0, c.width, c.height);
  },
});

function applySettings(s, save = true) {
  Object.assign(settings, s);
  audio.setEnabled(settings.sound);
  audio.setLevels(settings.vol);
  if (view.quality !== settings.quality) {
    view.setQuality(settings.quality);
    coins.setShadows(settings.quality !== 'low');
  }
  if (save) persist();
}

function persist() {
  const data = { settings, record, meta };
  if ((game.mode === 'run' && ['night', 'dawn', 'shop'].includes(game.phase)) || game.mode === 'free') {
    data.save = game.serialize();
  } else if (game.mode === 'idle') {
    const saved = loadStore().save;
    if (saved) data.save = saved;
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

function openShrine(back = showTitle) {
  const render = () => ui.showShrine(meta, record.shards, (id) => {
    const u = shrineById[id];
    const lv = meta[id] || 0;
    if (lv >= u.max) return;
    const price = shrinePrice(u.rank, lv);
    if (record.shards < price) return;
    record.shards -= price;
    meta[id] = lv + 1;
    audio.unlock();
    audio.buy();
    persist();
    render();
  }, () => back());
  render();
}

function startRun() {
  audio.unlock();
  ui.hideAll();
  impactsOn = false;
  game.meta = meta;
  game.newRun();
  impactsOn = true;
  persist();
}

function startFree() {
  audio.unlock();
  ui.hideAll();
  game.meta = meta;
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
  if (!saved || saved.v !== 2) { startRun(); return; }
  ui.hideAll();
  game.meta = meta;
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

function endRun(shards) {
  record.shards += shards;
  record.earned += shards;
  const saved = loadStore();
  delete saved.save;
  saveStore({ ...saved, settings, record, meta });
}

// --- game events → feedback ------------------------------------------------
function screenOf(x, y, z) {
  return view.worldToScreen(x, y, z);
}

const SLOT_NAMES = { seven: '7揃い', moon: '満月揃い', rabbit: '兎揃い', dango: '団子揃い', sakura: '桜揃い', star: '星揃い' };
const SLOT_COLORS = { seven: '#ff5a3c', moon: '#ffe7a3', rabbit: '#ffc2d4', dango: '#b8f0a0', sakura: '#f7a8c0', star: '#ffd34a' };
const LAMP_TOASTS = { red: ['赤保留!', ''], gold: ['金保留!!', 'good'], rainbow: ['虹保留!!! 確定', 'big'] };

function onGameEvent(type, d) {
  switch (type) {
    case 'fire': audio.fire(d.pitcher); cabinet.pitcherFired(d.pitcher); break;
    case 'landed': audio.landed(d.x); break;
    case 'payout': {
      const p = screenOf(world.boxX, BOX.floorY + BOX.height + 0.3, BOX.z);
      const kind = d.kind === KIND.BALL ? 'ball' : d.kind === KIND.GOLD || d.kind === KIND.OBAN ? 'gold' : '';
      ui.pop(`+${d.value}`, p.x + (Math.random() - 0.5) * 30, p.y, kind);
      sparkles.burst(world.boxX, BOX.floorY + BOX.height, BOX.z, { count: d.value > 1 ? 22 : 8, color: kind ? 0xffc23a : 0xfff1c0, speed: 2, up: 4 });
      cabinet.boxCatch();
      audio.boxCatch(d.value, world.boxX);
      audio.payout(d.value, world.boxX);
      break;
    }
    case 'missed': {
      const p = screenOf(Math.max(-HALF_W, Math.min(HALF_W, d.x)), BOX.floorY, BOX.z);
      ui.pop('外', p.x, p.y, 'lost');
      audio.missed(d.x);
      break;
    }
    case 'cashback': {
      const p = screenOf(Math.max(-HALF_W, Math.min(HALF_W, d.x)), BOX.floorY, BOX.z);
      ui.pop('返 +1', p.x, p.y, 'gold');
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
      const c = stagePoint(world.toriiX, STAGE.length - 0.3, 1);
      sparkles.burst(c.x, c.y, c.z, { count: 26, color: 0xffd27a, speed: 3, up: 4 });
      const p = screenOf(c.x, c.y + 1.4, c.z);
      ui.pop(d.added ? '保留 +1' : '保留満タン', p.x, p.y);
      break;
    }
    case 'stock': {
      audio.stock(d.color);
      const t = LAMP_TOASTS[d.color];
      if (t) ui.toast(t[0], t[1]);
      break;
    }
    case 'spin':
      audio.spinStart(d.reach);
      if (d.presentation === 'premium') {
        audio.premium();
        cabinet.flash('#ffffff', 3.4);
        ui.toast('全回転!!', 'big');
      }
      break;
    case 'reelStop':
      lcd.onReelStop(d.reel);
      audio.reelStop(d.reel, d.reach);
      if (d.reel === 1 && (d.presentation === 'super' || d.presentation === 'revival')) {
        const hot = ['red', 'gold', 'rainbow'].includes(game.slot.color);
        audio.superReach(hot);
        if (hot) cabinet.flash('#ff5a3c', 4);
      }
      break;
    case 'revival':
      lcd.onReelStop(2);
      lcd.message('復活!!', { color: '#ffd34a', seconds: 1.4, big: true });
      audio.revival();
      cabinet.flash('#ffd34a', 2);
      view.addShake(0.4);
      break;
    case 'slip':
      lcd.onReelStop(2);
      audio.reelStop(2, false);
      break;
    case 'slotResult': {
      if (!d.outcome) { audio.stopSpin(); break; }
      audio.win(d.outcome);
      let sub = '';
      if (d.outcome === 'moon') sub = '月玉 + フィーバー!';
      else if (d.outcome === 'sakura' && d.drops) sub = `今夜のメダル +${d.drops}`;
      else if (d.outcome === 'star') sub = d.amount ? `金メダル${d.gold}枚 + 銀${d.amount}枚` : `金メダル${d.gold}枚`;
      else if (d.amount) sub = `メダル ${d.amount}枚`;
      if (d.outcome !== 'seven') {
        lcd.message(SLOT_NAMES[d.outcome], { sub, color: SLOT_COLORS[d.outcome] });
        cabinet.flash(SLOT_COLORS[d.outcome], 1.6);
      }
      break;
    }
    case 'fever':
      if (d.first) {
        audio.fever();
        lcd.message('フィーバー!!', { sub: `${d.spins}回転`, color: '#ff6b4a', seconds: 2.4, big: true });
        ui.toast('満月フィーバー突入!', 'big');
        cabinet.flash('#ff6b4a', 3);
      } else {
        ui.toast(`フィーバー延長 残り${d.spins}`, 'good');
      }
      break;
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
    case 'ball': ui.toast('月玉が出た! お賽銭箱に入れば大当たり', 'good'); break;
    case 'ballPayout': {
      ui.toast(`月玉 +${d.value}枚・保留+1`, 'big');
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
      ui.showIntro(d, () => {
        audio.nightStart(d.index);
        if (d.replenished >= 8) ui.toast(`月兎が台にメダルを${d.replenished}枚補充した`);
      });
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
      endRun(d.shards);
      ui.showOver(game, d.shards, () => startRun(), () => showTitle(), () => openShrine());
      break;
    }
    case 'runClear': {
      record.clears += 1;
      record.best = NIGHTS.length;
      audio.jackpot();
      endRun(d.shards);
      ui.showClear(game, d.shards, () => startRun(), () => { game.bank = Math.max(game.bank, 50); startFree(); }, () => showTitle(), () => openShrine());
      break;
    }
    case 'quake': view.addShake(0.9 * Math.min(1.5, d.power)); audio.quake(); break;
    case 'gust': audio.gust(); sparkles.burst(0, 0.6, FRONT_Z - 1.2, { count: 40, color: 0xbfe8ff, speed: 4, up: 1.5 }); break;
    case 'talisman': ui.toast(`${talismanById[d.id].name}!`); break;
    case 'twin': break;
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
// One aim point on the felt strip; pitchers swing toward it. Fire while any
// fire source is held (mouse, touch, Space, the fire button).
const input = { fireHeld: new Set(), keys: new Set(), pointerId: null };
const AIM_Z = stagePoint(0, LANDING.s, 0).z;

function aimFromScreen(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, view.camera);
  const t = (AIM_Z - ray.ray.origin.z) / ray.ray.direction.z;
  if (!isFinite(t) || t <= 0) return;
  game.setAim(ray.ray.origin.x + ray.ray.direction.x * t);
}

function canPlay() {
  return !ui.anyScreen() && !paused && (game.phase === 'night' || game.phase === 'free');
}

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (!canPlay()) return;
  input.pointerId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  aimFromScreen(e.clientX, e.clientY);
  input.fireHeld.add('pointer');
  game.requestFire();
});
canvas.addEventListener('pointermove', (e) => {
  // Mouse hover aims; touch aims only while the finger is down.
  if (e.pointerType === 'mouse' || e.pointerId === input.pointerId) aimFromScreen(e.clientX, e.clientY);
});
const release = (e) => {
  if (e.pointerId === input.pointerId) { input.pointerId = null; input.fireHeld.delete('pointer'); }
};
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
    input.fireHeld.add('key');
    if (canPlay()) game.requestFire();
  } else if (k === 'arrowleft' || k === 'a') input.keys.add('left');
  else if (k === 'arrowright' || k === 'd') input.keys.add('right');
  else if (k === 'v') view.cycleView();
  else if (k === 'm') applySettings({ sound: !settings.sound });
  else if (['1', '2', '3'].includes(k)) game.useTalisman(Number(k) - 1);
});
addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (e.code === 'Space' || e.code === 'Enter') input.fireHeld.delete('key');
  if (k === 'arrowleft' || k === 'a') input.keys.delete('left');
  if (k === 'arrowright' || k === 'd') input.keys.delete('right');
});
addEventListener('blur', () => { input.keys.clear(); input.fireHeld.clear(); });
// Keep the picture clear of the HUD and the touch controls.
function updateInsets() {
  const narrow = innerWidth <= 760;
  view.setInsets(isTouch && narrow ? 118 : 0, isTouch ? (narrow ? 186 : 100) : 40, isTouch);
}
updateInsets();
addEventListener('resize', () => { updateInsets(); view.resize(); });
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

  if (input.keys.has('left')) game.setAim(game.aim.target - 8 * dt);
  if (input.keys.has('right')) game.setAim(game.aim.target + 8 * dt);
  // Holding fire queues the next shot just as the pitchers come ready, so
  // letting go never leaves a stray shot behind.
  if (!canPlay()) input.fireHeld.clear();
  else if (input.fireHeld.size && game.cooldown <= 0.02) game.requestFire();

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

  coins.update(world);
  cabinet.updateAim(game, canPlay() && game.canFire());
  cabinet.update(dt, world.pusherFront, cabinet.flashKind === 'jackpot' && cabinet.flashTimer > 0, game.fever > 0);
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
game._recomputeStats();
loading.hidden = true;
showTitle();
requestAnimationFrame(frame);

// Fonts may arrive after the first draw of canvas textures.
if (document.fonts) document.fonts.ready.then(() => { lcd.redrawSymbols(); });

window.__game = game;
window.__view = view;
window.__lcd = lcd;
window.__ready = true;
