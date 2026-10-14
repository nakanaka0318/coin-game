// The backboard LCD: three slot reels, stock lamps, jackpot pool and
// event messages, drawn on a canvas used as a texture.
import * as THREE from 'three';
import { SYMBOLS, BOARD, BOARD_SQUARES } from '../game/data.js';
import { makeCanvas, drawRabbit, drawMochiRabbit, PALETTE } from './textures.js';

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
    this._makeSymbols();
    this.time = 0;
    this.messages = [];
    this.reelStopT = [0, 0, 0];
    this.reelPos = [0, 3.3, 6.6];
    this.display = [0, 3, 1];
    this.dirty = true;
  }

  _makeSymbols() {
    this.symbols = SYMBOLS.map((sym) => {
      const c = makeCanvas(SYM, SYM);
      drawSymbol(c.getContext('2d'), sym.id, SYM);
      return c;
    });
  }

  redrawSymbols() {
    this._makeSymbols();
    this.dirty = true;
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
    const fever = game.fever > 0 || (sl.spinning && sl.inFever);
    const animating = sl.spinning || fever || this.messages.length || game.timers.double > 0 || sl.queue.some((e) => e.color !== 'white')
      || game.diceMode !== this.lastDice;
    this.lastDice = game.diceMode;
    this._idleT = (this._idleT || 0) + dt;
    if (!animating && !this.dirty && this._idleT < 0.25) return;
    const frameDt = this._idleT;
    this._idleT = 0;
    this.dirty = false;
    const ctx = this.ctx;
    const t = this.time;
    if (sl.kind === 'dice' || (game.diceMode && !sl.spinning)) {
      this._drawBoard(ctx, t, game, fever);
      this._messages(ctx, t);
      this.texture.needsUpdate = true;
      return;
    }
    const pres = sl.spinning ? sl.presentation : null;
    const crawling = (pres === 'super' || pres === 'revival') && sl.stopped[1] && !sl.stopped[2];

    // Reel motion: integrate speed so the third reel can slow to a crawl.
    for (let i = 0; i < 3; i++) {
      if (!sl.spinning || sl.stopped[i]) continue;
      let speed = 13;
      if (i === 2 && crawling) {
        const k = Math.min(1, (sl.t - sl.stopAt[1]) / (sl.stopAt[2] - sl.stopAt[1]));
        speed = 13 * Math.pow(1 - k, 1.6) + 1.3;
      }
      if (pres === 'premium') speed = 6;
      this.reelPos[i] = (this.reelPos[i] + speed * frameDt) % STRIP.length;
    }
    if (pres === 'premium') { this.reelPos[1] = this.reelPos[0]; this.reelPos[2] = this.reelPos[0]; }

    this._background(ctx, t, fever, pres, crawling, sl);
    this._header(ctx, t, game, fever);
    for (let i = 0; i < 3; i++) this._drawReel(ctx, i, sl, t, pres, crawling);
    this._lamps(ctx, t, game);
    this._banner(ctx, t, sl, pres, crawling);
    this._messages(ctx, t);
    this.texture.needsUpdate = true;
  }

  _background(ctx, t, fever, pres, crawling, sl) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    if (pres === 'premium') {
      const hue = (t * 120) % 360;
      bg.addColorStop(0, `hsl(${hue},70%,22%)`);
      bg.addColorStop(1, `hsl(${(hue + 120) % 360},70%,18%)`);
    } else if (fever) {
      bg.addColorStop(0, '#3a0a10');
      bg.addColorStop(1, '#6a2a08');
    } else if (crawling) {
      bg.addColorStop(0, '#050410');
      bg.addColorStop(1, '#1a0a20');
    } else {
      bg.addColorStop(0, '#0b0f35');
      bg.addColorStop(1, '#1b1150');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    if (fever || pres === 'premium') {
      ctx.save();
      ctx.translate(W / 2, H * 0.62);
      ctx.rotate(t * 0.5);
      for (let i = 0; i < 20; i++) {
        ctx.rotate(Math.PI / 10);
        ctx.fillStyle = i % 2 ? 'rgba(255,210,122,0.12)' : 'rgba(255,90,60,0.1)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-90, -800);
        ctx.lineTo(90, -800);
        ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.strokeStyle = 'rgba(240,201,106,0.12)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.arc(W / 2, H + 40, 120 + i * 70 + ((t * 30) % 70), Math.PI, 0);
        ctx.stroke();
      }
    }
    if (crawling) {
      // The moon rabbit pounds mochi in time with the crawling reel.
      const hot = sl.color === 'red' || sl.color === 'gold' || sl.color === 'rainbow';
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = hot ? '#ffcf8a' : '#fff4d8';
      ctx.beginPath();
      ctx.arc(150, 300, 120, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hot ? '#b33a1a' : '#8a6a40';
      const pound = Math.abs(Math.sin(t * (hot ? 7 : 4)));
      ctx.translate(0, -pound * 14);
      drawMochiRabbit(ctx, 160, 310, 150);
      ctx.restore();
    }
  }

  _header(ctx, t, game, fever) {
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
    if (fever) {
      ctx.font = `400 40px ${DISPLAY}`;
      ctx.fillStyle = Math.floor(t * 6) % 2 ? '#ffd34a' : '#ff6b4a';
      ctx.fillText(`フィーバー 残り${game.fever}`, W - 36, 48);
    } else if (game.timers.double > 0) {
      ctx.font = `400 34px ${DISPLAY}`;
      ctx.fillStyle = Math.floor(t * 4) % 2 ? '#ff9ec0' : '#ffffff';
      ctx.fillText(`払出2倍 ${Math.ceil(game.timers.double)}秒`, W - 36, 48);
    } else {
      ctx.font = `400 30px ${DISPLAY}`;
      ctx.fillStyle = 'rgba(255,240,210,0.75)';
      ctx.fillText('鳥居をくぐれば抽選', W - 36, 48);
    }
  }

  // --- 双六 board ---------------------------------------------------------------

  _squareRect(i) {
    const cw = W / 12, top = 6, rowH = 72, ch = 58;
    if (i < 12) return { x: i * cw, y: top, w: cw, h: rowH };
    if (i < 18) return { x: W - cw, y: 82 + (i - 12) * ch, w: cw, h: ch };
    if (i < 30) return { x: W - (i - 18 + 1) * cw, y: 434, w: cw, h: rowH };
    return { x: 0, y: 430 - (i - 30 + 1) * ch, w: cw, h: ch };
  }

  _drawBoard(ctx, t, game, fever) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, fever ? '#3a0a10' : '#0b2a1f');
    bg.addColorStop(1, fever ? '#6a2a08' : '#14381c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const sl = game.slot;
    const d = game.dice;
    const hotHold = sl.kind === 'dice' && d.hot;
    // Squares
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < BOARD.length; i++) {
      const sq = BOARD_SQUARES[BOARD[i]];
      const r = this._squareRect(i);
      ctx.fillStyle = sq.color;
      ctx.globalAlpha = sq.hot && !hotHold ? 0.55 : 0.92;
      ctx.beginPath();
      ctx.roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (sq.hot) {
        ctx.strokeStyle = hotHold ? `hsl(${(t * 300) % 360},90%,65%)` : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.fillStyle = ['rest', 'back', 'daruma', 'chest', 'fever'].includes(BOARD[i]) ? '#fff8ec' : '#1b1424';
      ctx.font = `400 ${sq.label.length > 1 ? 24 : 30}px ${DISPLAY}`;
      ctx.fillText(sq.label, r.x + r.w / 2, r.y + r.h / 2 + 2);
    }
    // Piece: the moon rabbit hops from square to square.
    const r = this._squareRect(d.pos);
    const hop = sl.kind === 'dice' && sl.t > d.tumble ? Math.abs(Math.sin(((sl.t - d.tumble) / d.step) * Math.PI)) * 14 : 0;
    ctx.save();
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffffff';
    drawRabbit(ctx, r.x + r.w / 2, r.y + r.h / 2 - 4 - hop, 52, { eye: true });
    ctx.restore();
    // Centre: title, jackpot pool, die and holds.
    ctx.textAlign = 'left';
    ctx.font = `400 40px ${DISPLAY}`;
    ctx.fillStyle = '#ffd27a';
    ctx.fillText('月兎双六', 116, 124);
    ctx.font = `400 22px ${DISPLAY}`;
    ctx.fillStyle = PALETTE.vermilion;
    ctx.fillText('JACKPOT', 118, 172);
    ctx.font = `400 40px ${DIGITAL}`;
    ctx.fillStyle = '#ffe7a3';
    ctx.fillText(String(game.jpPool).padStart(4, '0'), 228, 172);
    ctx.font = `400 22px ${DISPLAY}`;
    ctx.fillStyle = 'rgba(255,240,210,0.8)';
    ctx.fillText(`${d.laps}周`, 118, 214);
    ctx.font = `400 20px ${DISPLAY}`;
    ctx.fillStyle = 'rgba(255,240,210,0.6)';
    ctx.fillText('赤保留以上で 祭・大当 が開く', 118, 252);
    if (fever) {
      ctx.textAlign = 'right';
      ctx.font = `400 34px ${DISPLAY}`;
      ctx.fillStyle = Math.floor(t * 6) % 2 ? '#ffd34a' : '#ff6b4a';
      ctx.fillText(`フィーバー 残り${game.fever}`, W - 116, 124);
    }
    // Die
    const tumbling = sl.kind === 'dice' && sl.t < d.tumble;
    const face = tumbling ? 1 + (Math.floor(t * 18) % 6) : d.roll || 1;
    const cx = W / 2 + 150, cy = 228, s = 120;
    ctx.save();
    ctx.translate(cx, cy);
    if (tumbling) ctx.rotate(Math.sin(t * 20) * 0.4);
    ctx.fillStyle = '#fff8ec';
    ctx.shadowColor = sl.kind === 'dice' ? this._lampColor(sl.color, t) : 'rgba(0,0,0,0)';
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s / 2, s, s, 18);
    ctx.fill();
    ctx.shadowBlur = 0;
    const pips = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
      5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[face];
    for (const [px, py] of pips) {
      ctx.fillStyle = face === 1 ? '#d9452e' : '#1b1424';
      ctx.beginPath();
      ctx.arc(px * s * 0.27, py * s * 0.27, face === 1 ? s * 0.13 : s * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Holds
    const q = sl.queue;
    const max = Math.max(4, game.stats.stockMax, q.length);
    const gap = Math.min(46, 560 / max);
    const x0 = W / 2 - ((max - 1) * gap) / 2;
    for (let i = 0; i < max; i++) {
      const e = q[i];
      ctx.beginPath();
      ctx.arc(x0 + i * gap, 380, Math.min(15, gap * 0.34), 0, Math.PI * 2);
      if (e) {
        const col = this._lampColor(e.color, t);
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = e.color === 'white' ? 8 : 22;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  _lampColor(color, t) {
    switch (color) {
      case 'blue': return '#5aa8ff';
      case 'green': return '#5fe08a';
      case 'red': return '#ff4a3c';
      case 'gold': return Math.floor(t * 8) % 2 ? '#ffe27a' : '#ffb020';
      case 'rainbow': return `hsl(${(t * 400) % 360},90%,60%)`;
      default: return '#fff4dc';
    }
  }

  _lamps(ctx, t, game) {
    const q = game.slot.queue;
    const max = Math.max(4, game.stats.stockMax, q.length);
    const lampY = REEL_Y + REEL_H + 52;
    const gap = Math.min(54, 700 / max);
    const x0 = W / 2 - ((max - 1) * gap) / 2;
    for (let i = 0; i < max; i++) {
      const e = q[i];
      ctx.beginPath();
      ctx.arc(x0 + i * gap, lampY, Math.min(17, gap * 0.34), 0, Math.PI * 2);
      if (e) {
        const col = this._lampColor(e.color, t);
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = e.color === 'white' ? 10 : 26;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.font = `400 26px ${DISPLAY}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,240,210,0.7)';
    ctx.fillText('保留', x0 - 30, lampY + 2);
  }

  _banner(ctx, t, sl, pres, crawling) {
    if (!sl.spinning) return;
    let text = null, color = '#ffd27a', size = 76;
    if (pres === 'premium') {
      text = '全回転!!';
      color = `hsl(${(t * 300) % 360},90%,65%)`;
      size = 100;
    } else if (crawling) {
      const hot = sl.color === 'red' || sl.color === 'gold';
      text = sl.color === 'rainbow' ? '確定!!' : hot ? '激アツ!!' : 'スーパーリーチ';
      color = sl.color === 'rainbow' ? `hsl(${(t * 300) % 360},90%,65%)` : hot ? '#ff5a3c' : '#ffd27a';
      size = hot ? 92 : 70;
    } else if (sl.reach && sl.stopped[1] && !sl.stopped[2]) {
      text = 'リーチ!';
    } else if (!sl.revealed && sl.stopped[2]) {
      text = sl.presentation === 'revival' ? '…' : null;
      color = '#9aa0c0';
    }
    if (!text) return;
    // Pulse the size rather than the opacity so the text stays readable over busy reels.
    const pulse = 1 + 0.06 * Math.sin(t * 14);
    const top = text !== '…';
    const y = top ? 108 : REEL_Y + REEL_H / 2;
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(pulse, pulse);
    ctx.font = `400 ${size}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#1a0606';
    ctx.strokeText(text, 0, 0);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  _messages(ctx, t) {
    this.messages = this.messages.filter((m) => m.until > t);
    const m = this.messages[this.messages.length - 1];
    if (!m) return;
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

  _drawReel(ctx, i, sl, t, pres, crawling) {
    const x = REEL_X[i];
    const y = REEL_Y;
    ctx.save();
    ctx.fillStyle = crawling && i === 2 ? '#fff1d6' : '#e6dcc6';
    ctx.beginPath();
    ctx.roundRect(x, y, REEL_W, REEL_H, 18);
    ctx.fill();
    ctx.clip();
    const spinning = sl.spinning && !sl.stopped[i];
    const cx = x + REEL_W / 2 - SYM / 2;
    const cy = y + REEL_H / 2 - SYM / 2;
    if (spinning) {
      const p = this.reelPos[i];
      const base = Math.floor(p);
      const frac = p - base;
      const slow = (i === 2 && crawling) || pres === 'premium';
      ctx.globalAlpha = slow ? 1 : 0.85;
      for (let k = -2; k <= 2; k++) {
        const sym = STRIP[(base - k + STRIP.length * 4) % STRIP.length];
        const yy = cy + (k + frac) * SYM;
        if (slow) ctx.drawImage(this.symbols[sym], cx, yy, SYM, SYM);
        else ctx.drawImage(this.symbols[sym], cx, yy - 22, SYM, SYM + 44);
      }
      ctx.globalAlpha = 1;
    } else {
      let target = sl.spinning || sl.stopped[i] ? sl.symbols[i] : this.display[i];
      if (i === 2 && !sl.revealed && sl.fakeThird !== null) target = sl.fakeThird;
      this.display[i] = target;
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
    const g = ctx.createLinearGradient(0, y, 0, y + REEL_H);
    g.addColorStop(0, 'rgba(20,10,40,0.55)');
    g.addColorStop(0.25, 'rgba(20,10,40,0)');
    g.addColorStop(0.75, 'rgba(20,10,40,0)');
    g.addColorStop(1, 'rgba(20,10,40,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, REEL_W, REEL_H);
    ctx.restore();
    const glow = (pres === 'premium') || (crawling && i === 2);
    ctx.strokeStyle = glow ? `hsl(${(t * 300) % 360},90%,65%)` : PALETTE.gold;
    ctx.lineWidth = glow ? 8 : 5;
    ctx.beginPath();
    ctx.roundRect(x, y, REEL_W, REEL_H, 18);
    ctx.stroke();
  }
}
