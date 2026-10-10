// The backboard LCD: three slot reels, stock lamps, jackpot pool and
// event messages, drawn on a canvas used as a texture.
import * as THREE from 'three';
import { SYMBOLS } from '../game/data.js';
import { makeCanvas, drawRabbit, PALETTE } from './textures.js';

const W = 1024, H = 512;
const REEL_W = 236, REEL_H = 270, REEL_Y = 118;
const REEL_X = [W / 2 - REEL_W * 1.5 - 22, W / 2 - REEL_W / 2, W / 2 + REEL_W / 2 + 22];
const SYM = 190; // symbol cell size
const STRIP = [0, 4, 3, 2, 5, 3, 1, 4, 3, 2, 5, 4];
const DIGITAL = '"DotGothic16", "Courier New", monospace';
const DISPLAY = '"Dela Gothic One", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

function drawSymbol(ctx, id, s) {
  const c = s / 2;
  ctx.save();
  switch (id) {
    case 'seven': {
      ctx.font = `400 ${s * 0.9}px ${DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = s * 0.07;
      ctx.strokeStyle = PALETTE.gold;
      ctx.strokeText('7', c, c + s * 0.04);
      const g = ctx.createLinearGradient(0, s * 0.1, 0, s * 0.9);
      g.addColorStop(0, '#ff8a6a');
      g.addColorStop(0.5, '#e8321e');
      g.addColorStop(1, '#8e1308');
      ctx.fillStyle = g;
      ctx.fillText('7', c, c + s * 0.04);
      break;
    }
    case 'moon': {
      const g = ctx.createRadialGradient(c * 0.85, c * 0.8, s * 0.05, c, c, s * 0.4);
      g.addColorStop(0, '#fffbe8');
      g.addColorStop(1, '#e8c66e');
      ctx.fillStyle = g;
      ctx.shadowColor = '#ffd27a';
      ctx.shadowBlur = s * 0.12;
      ctx.beginPath();
      ctx.arc(c, c, s * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(170,130,70,0.35)';
      for (const [x, y, r] of [[0.4, 0.38, 0.07], [0.6, 0.55, 0.09], [0.45, 0.65, 0.05], [0.62, 0.32, 0.04]]) {
        ctx.beginPath();
        ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'rabbit': {
      ctx.fillStyle = '#ffd9e4';
      ctx.beginPath();
      ctx.arc(c, c, s * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(80,20,60,0.5)';
      ctx.shadowBlur = s * 0.04;
      drawRabbit(ctx, c + s * 0.04, c + s * 0.06, s * 0.6);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#e8321e';
      ctx.beginPath();
      ctx.arc(c - s * 0.135, c - s * 0.03, s * 0.022, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'dango': {
      ctx.strokeStyle = '#c99a5b';
      ctx.lineWidth = s * 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c + s * 0.3, c + s * 0.38);
      ctx.lineTo(c - s * 0.32, c - s * 0.36);
      ctx.stroke();
      const cols = ['#f49ab3', '#fffaf0', '#9ccf7a'];
      for (let i = 0; i < 3; i++) {
        const t = -0.22 + i * 0.2;
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.arc(c + t * s * 1.0, c + t * s * 1.07, s * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(c + t * s - s * 0.04, c + t * s * 1.07 - s * 0.04, s * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'sakura': {
      ctx.translate(c, c);
      for (let i = 0; i < 5; i++) {
        ctx.rotate((Math.PI * 2) / 5);
        ctx.fillStyle = '#f7a8c0';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-s * 0.2, -s * 0.12, -s * 0.16, -s * 0.38, -s * 0.03, -s * 0.4);
        ctx.lineTo(0, -s * 0.34);
        ctx.lineTo(s * 0.03, -s * 0.4);
        ctx.bezierCurveTo(s * 0.16, -s * 0.38, s * 0.2, -s * 0.12, 0, 0);
        ctx.fill();
      }
      ctx.fillStyle = '#fff1a8';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'star': {
      ctx.translate(c, c);
      ctx.fillStyle = '#ffd34a';
      ctx.shadowColor = '#ffb020';
      ctx.shadowBlur = s * 0.1;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s * 0.4 : s * 0.17;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    default: break;
  }
  ctx.restore();
}

export class LcdDisplay {
  constructor() {
    this.canvas = makeCanvas(W, H);
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.symbols = SYMBOLS.map((sym) => {
      const c = makeCanvas(SYM, SYM);
      drawSymbol(c.getContext('2d'), sym.id, SYM);
      return c;
    });
    this.time = 0;
    this.messages = [];
    this.reelStopT = [0, 0, 0];
    this.display = [0, 3, 1];
    this.dirty = true;
    this.redrawSymbols = () => {
      this.symbols = SYMBOLS.map((sym) => {
        const c = makeCanvas(SYM, SYM);
        drawSymbol(c.getContext('2d'), sym.id, SYM);
        return c;
      });
      this.dirty = true;
    };
  }

  message(text, { sub = '', color = PALETTE.gold, seconds = 2.2, big = false } = {}) {
    this.messages.push({ text, sub, color, until: this.time + seconds, start: this.time, big });
    if (this.messages.length > 3) this.messages.shift();
    this.dirty = true;
  }

  onReelStop(reel) {
    this.reelStopT[reel] = this.time;
  }

  draw(dt, game) {
    this.time += dt;
    const sl = game.slot;
    const animating = sl.spinning || this.messages.length || game.timers.double > 0 || (this.jpFlash || 0) > 0;
    this._idleT = (this._idleT || 0) + dt;
    if (!animating && !this.dirty && this._idleT < 0.25) return;
    this._idleT = 0;
    this.dirty = false;
    const ctx = this.ctx;
    const t = this.time;

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b0f35');
    bg.addColorStop(1, '#1b1150');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(240,201,106,0.12)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(W / 2, H + 40, 120 + i * 70 + ((t * 30) % 70), Math.PI, 0);
      ctx.stroke();
    }

    // Header: jackpot pool and double timer
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, 92);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `400 34px ${DISPLAY}`;
    ctx.fillStyle = PALETTE.vermilion;
    ctx.fillText('JACKPOT', 36, 48);
    const labelW = ctx.measureText('JACKPOT').width;
    ctx.font = `400 60px ${DIGITAL}`;
    ctx.fillStyle = '#ffe7a3';
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 16;
    ctx.fillText(String(game.jpPool).padStart(4, '0'), 36 + labelW + 20, 50);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'right';
    if (game.timers.double > 0) {
      ctx.font = `400 34px ${DISPLAY}`;
      ctx.fillStyle = Math.floor(t * 4) % 2 ? '#ff9ec0' : '#ffffff';
      ctx.fillText(`払出2倍 ${Math.ceil(game.timers.double)}秒`, W - 36, 48);
    } else {
      ctx.font = `400 30px ${DISPLAY}`;
      ctx.fillStyle = 'rgba(255,240,210,0.75)';
      ctx.fillText('鳥居をくぐれば抽選', W - 36, 48);
    }

    // Reels
    for (let i = 0; i < 3; i++) this._drawReel(ctx, i, sl, t);

    // Stock lamps
    const max = Math.max(4, game.stats.stockMax);
    const lampY = REEL_Y + REEL_H + 52;
    const gap = 54;
    const x0 = W / 2 - ((max - 1) * gap) / 2;
    for (let i = 0; i < max; i++) {
      const on = i < sl.stock;
      ctx.beginPath();
      ctx.arc(x0 + i * gap, lampY, 17, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#ffcf5a' : 'rgba(255,255,255,0.12)';
      if (on) { ctx.shadowColor = '#ffb020'; ctx.shadowBlur = 18; }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.font = `400 26px ${DISPLAY}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,240,210,0.7)';
    ctx.fillText('保留', x0 - 100, lampY + 2);

    // Reach banner
    if (sl.spinning && sl.reach && sl.stopped && sl.stopped[1] && !sl.stopped[2]) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 14);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.font = `400 ${sl.bigReach ? 96 : 76}px ${DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#2a0a08';
      ctx.strokeText(sl.bigReach ? '激アツ!' : 'リーチ!', W / 2, REEL_Y + REEL_H / 2);
      ctx.fillStyle = sl.bigReach ? '#ff5a3c' : '#ffd27a';
      ctx.fillText(sl.bigReach ? '激アツ!' : 'リーチ!', W / 2, REEL_Y + REEL_H / 2);
      ctx.restore();
    }

    // Messages
    this.messages = this.messages.filter((m) => m.until > t);
    const m = this.messages[this.messages.length - 1];
    if (m) {
      const age = t - m.start;
      const k = Math.min(1, age * 6);
      ctx.save();
      ctx.fillStyle = `rgba(5,6,26,${0.72 * k})`;
      ctx.fillRect(0, REEL_Y - 10, W, REEL_H + 20);
      if (m.big) {
        ctx.translate(W / 2, REEL_Y + REEL_H / 2);
        ctx.rotate(t * 0.6);
        for (let i = 0; i < 16; i++) {
          ctx.rotate(Math.PI / 8);
          ctx.fillStyle = i % 2 ? 'rgba(255,210,122,0.22)' : 'rgba(255,90,60,0.18)';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-60, -700);
          ctx.lineTo(60, -700);
          ctx.fill();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      const scale = 0.7 + 0.3 * k + (m.big ? 0.05 * Math.sin(t * 10) : 0);
      ctx.translate(W / 2, REEL_Y + REEL_H / 2 - (m.sub ? 26 : 0));
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `400 ${m.big ? 120 : 84}px ${DISPLAY}`;
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#1a0805';
      ctx.strokeText(m.text, 0, 0);
      ctx.fillStyle = m.color;
      ctx.fillText(m.text, 0, 0);
      if (m.sub) {
        ctx.font = `400 44px ${DISPLAY}`;
        ctx.lineWidth = 8;
        ctx.strokeText(m.sub, 0, 92);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(m.sub, 0, 92);
      }
      ctx.restore();
    }
    this.texture.needsUpdate = true;
  }

  _drawReel(ctx, i, sl, t) {
    const x = REEL_X[i];
    const y = REEL_Y;
    ctx.save();
    ctx.fillStyle = '#e6dcc6';
    ctx.beginPath();
    ctx.roundRect(x, y, REEL_W, REEL_H, 18);
    ctx.fill();
    ctx.clip();
    const spinning = sl.spinning && sl.stopped && !sl.stopped[i];
    const cx = x + REEL_W / 2 - SYM / 2;
    const cy = y + REEL_H / 2 - SYM / 2;
    if (spinning) {
      const speed = 13;
      const p = (t * speed + i * 3.3) % STRIP.length;
      const base = Math.floor(p);
      const frac = p - base;
      ctx.globalAlpha = 0.85;
      for (let k = -2; k <= 2; k++) {
        const sym = STRIP[(base - k + STRIP.length * 4) % STRIP.length];
        const yy = cy + (k + frac) * SYM;
        ctx.drawImage(this.symbols[sym], cx, yy - 22, SYM, SYM + 44);
      }
      ctx.globalAlpha = 1;
    } else {
      const target = sl.stopped ? sl.symbols[i] : this.display[i];
      if (sl.stopped && sl.stopped[i]) this.display[i] = target;
      const since = t - this.reelStopT[i];
      const bounce = since < 0.25 ? Math.sin(since * Math.PI * 4) * 18 * (1 - since / 0.25) : 0;
      const idx = STRIP.indexOf(target);
      const above = STRIP[(idx + 1) % STRIP.length];
      const below = STRIP[(idx - 1 + STRIP.length) % STRIP.length];
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.symbols[above], cx, cy - SYM + bounce, SYM, SYM);
      ctx.drawImage(this.symbols[below], cx, cy + SYM + bounce, SYM, SYM);
      ctx.globalAlpha = 1;
      const win = !sl.spinning && sl.lastWin && SYMBOLS[target].id === sl.lastWin;
      if (win) {
        ctx.fillStyle = `rgba(255,210,122,${0.35 + 0.25 * Math.sin(t * 10)})`;
        ctx.fillRect(x, cy, REEL_W, SYM);
      }
      ctx.drawImage(this.symbols[target], cx, cy + bounce, SYM, SYM);
    }
    // Glass shading
    const g = ctx.createLinearGradient(0, y, 0, y + REEL_H);
    g.addColorStop(0, 'rgba(20,10,40,0.55)');
    g.addColorStop(0.25, 'rgba(20,10,40,0)');
    g.addColorStop(0.75, 'rgba(20,10,40,0)');
    g.addColorStop(1, 'rgba(20,10,40,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, REEL_W, REEL_H);
    ctx.restore();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(x, y, REEL_W, REEL_H, 18);
    ctx.stroke();
  }
}
