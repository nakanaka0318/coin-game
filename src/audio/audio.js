// Synthesised sound: medal clinks, koto plucks (Karplus-Strong), taiko,
// slot reels and fanfares. No audio files are loaded.
import { MAT } from '../sim/config.js';

// Miyako-bushi scale (E F A B C), the sound of a koto.
const SCALE = [0, 1, 5, 7, 8];
const BASE_HZ = 329.63; // E4

function noteHz(step) {
  const oct = Math.floor(step / SCALE.length);
  const deg = ((step % SCALE.length) + SCALE.length) % SCALE.length;
  return BASE_HZ * Math.pow(2, oct + SCALE[deg] / 12);
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.volume = 0.8;
    this.lastImpact = 0;
    this.impactBudget = 0;
    this.voices = 0;
    this.payoutChain = 0;
    this.payoutChainT = 0;
    this.spinTimer = null;
  }

  // Must be called from a user gesture.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.32 : 0;
    this.music.connect(this.master);
    this._buildBuffers();
    this._startMusic();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.2);
  }

  _buffer(seconds, fill) {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * seconds), sr);
    fill(buf.getChannelData(0), sr);
    return buf;
  }

  _buildBuffers() {
    const rnd = Math.random;
    // Medal on medal: bright inharmonic partials.
    this.clinks = [];
    for (let v = 0; v < 6; v++) {
      const f = 3000 + v * 260 + rnd() * 200;
      const parts = [[1, 1, 18], [2.71, 0.5, 26], [5.13, 0.32, 34], [8.02, 0.18, 46]];
      this.clinks.push(this._buffer(0.32, (d, sr) => {
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          let s = 0;
          for (const [m, a, decay] of parts) s += Math.sin(2 * Math.PI * f * m * t) * a * Math.exp(-t * decay);
          d[i] = s * 0.5 * Math.min(1, t * 4000);
        }
      }));
    }
    // Medal on metal plate: lower ring plus a click.
    this.plates = [];
    for (let v = 0; v < 4; v++) {
      const f = 1250 + v * 170;
      this.plates.push(this._buffer(0.45, (d, sr) => {
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const ring = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 11) + 0.4 * Math.sin(2 * Math.PI * f * 2.43 * t) * Math.exp(-t * 16);
          const click = (rnd() * 2 - 1) * Math.exp(-t * 300);
          d[i] = (ring * 0.45 + click * 0.5) * Math.min(1, t * 3000);
        }
      }));
    }
    // Dull knock for wood and the pusher.
    this.knock = this._buffer(0.18, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += ((rnd() * 2 - 1) - lp) * 0.08;
        d[i] = (lp * 2 + Math.sin(2 * Math.PI * 180 * t) * 0.6) * Math.exp(-t * 30);
      }
    });
    // Taiko drum.
    this.taiko = this._buffer(0.9, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = 62 + 50 * Math.exp(-t * 18);
        lp += ((rnd() * 2 - 1) - lp) * 0.04;
        d[i] = (Math.sin(2 * Math.PI * f * t) * 0.9 + lp * 0.8 * Math.exp(-t * 25)) * Math.exp(-t * 4.5);
      }
    });
    // Noise for rumbles and swishes.
    this.noise = this._buffer(1.5, (d) => { for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; });
    // Temple bell (rin) for the checker.
    this.rin = this._buffer(2.2, (d, sr) => {
      const parts = [[1, 1, 1.6], [2.76, 0.6, 2.4], [5.4, 0.35, 4], [8.9, 0.2, 6]];
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        let s = 0;
        for (const [m, a, decay] of parts) s += Math.sin(2 * Math.PI * 1320 * m * t + Math.sin(t * 7) * 0.4) * a * Math.exp(-t * decay);
        d[i] = s * 0.35 * Math.min(1, t * 2000);
      }
    });
    this.koto = new Map();
  }

  _kotoBuffer(hz) {
    const key = Math.round(hz);
    if (this.koto.has(key)) return this.koto.get(key);
    const sr = this.ctx.sampleRate;
    const buf = this._buffer(1.8, (d) => {
      const period = Math.max(2, Math.round(sr / hz));
      const ring = new Float32Array(period);
      for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
      let idx = 0;
      for (let i = 0; i < d.length; i++) {
        const next = (idx + 1) % period;
        d[i] = ring[idx];
        ring[idx] = (ring[idx] + ring[next]) * 0.5 * 0.9965;
        idx = next;
      }
    });
    this.koto.set(key, buf);
    return buf;
  }

  _play(buffer, { gain = 1, rate = 1, pan = 0, when = 0, dest = null } = {}) {
    if (!this.ctx || !this.enabled) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = src.connect(g);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node = node.connect(p);
    }
    node.connect(dest || this.sfx);
    this.voices++;
    src.onended = () => { this.voices--; };
    src.start(ctx.currentTime + when);
    return src;
  }

  _tone(freq, dur, { type = 'sine', gain = 0.2, when = 0, slide = 0, pan = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o.connect(g);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(this.sfx);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  pluck(step, { gain = 0.5, when = 0, dest = null } = {}) {
    if (!this.ctx) return;
    this._play(this._kotoBuffer(noteHz(step)), { gain, when, dest });
  }

  // --- game sounds -----------------------------------------------------------

  impact(m1, m2, speed, x) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    this.impactBudget = Math.min(6, this.impactBudget + (now - this.lastImpact) * 30);
    this.lastImpact = now;
    if (this.impactBudget < 1 || this.voices > 28) return;
    this.impactBudget -= 1;
    const loud = Math.min(1, (speed - 1) / 9);
    const pan = x / 8;
    const coin = (m) => m === MAT.COIN || m === MAT.GOLD;
    const other = coin(m1) ? m2 : m1;
    if (m1 === MAT.BALL || m2 === MAT.BALL) {
      this._play(this.knock, { gain: 0.5 * loud + 0.1, rate: 0.6, pan });
    } else if (coin(m1) && coin(m2)) {
      const b = this.clinks[(Math.random() * this.clinks.length) | 0];
      this._play(b, { gain: 0.06 + loud * 0.32, rate: 0.9 + Math.random() * 0.25, pan });
    } else if (other === MAT.METAL || other === MAT.PIN) {
      const b = this.plates[(Math.random() * this.plates.length) | 0];
      this._play(b, { gain: 0.06 + loud * 0.3, rate: other === MAT.PIN ? 1.6 : 0.95 + Math.random() * 0.1, pan });
    } else {
      this._play(this.knock, { gain: 0.05 + loud * 0.2, rate: 1 + Math.random() * 0.3, pan });
    }
  }

  drop(x) {
    this._play(this.plates[1], { gain: 0.18, rate: 1.4, pan: x / 8 });
    this._tone(1800, 0.06, { type: 'triangle', gain: 0.05, slide: 1.6 });
  }

  payout(value, x) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.payoutChain = now - this.payoutChainT < 0.9 ? this.payoutChain + 1 : 0;
    this.payoutChainT = now;
    const step = 7 + Math.min(this.payoutChain, 10);
    this.pluck(step, { gain: 0.32 });
    this._play(this.clinks[2], { gain: 0.22, rate: 1.25, pan: x / 8 });
    if (value >= 3) {
      this.pluck(step + 2, { gain: 0.3, when: 0.07 });
      this.pluck(step + 4, { gain: 0.3, when: 0.14 });
    }
  }

  lost(x) {
    this._tone(220, 0.25, { type: 'sine', gain: 0.07, slide: 0.5, pan: x / 8 });
  }

  checker() {
    this._play(this.rin, { gain: 0.38 });
    this.pluck(10, { gain: 0.3, when: 0.05 });
  }

  spinStart(reach) {
    if (!this.ctx) return;
    this.stopSpin();
    let n = 0;
    this.spinTimer = setInterval(() => {
      this._play(this.knock, { gain: 0.05, rate: 2.6 + (n++ % 2) * 0.3 });
    }, 80);
    if (reach) this.reachArmed = true;
  }

  reelStop(reel, reach) {
    this._play(this.taiko, { gain: 0.25, rate: 1.9 + reel * 0.15 });
    if (reel === 2) this.stopSpin();
    if (reach) {
      this._tone(220, 1.6, { type: 'sawtooth', gain: 0.05, slide: 2.2 });
      this._play(this.taiko, { gain: 0.5, rate: 1.1 });
    }
  }

  stopSpin() {
    if (this.spinTimer) clearInterval(this.spinTimer);
    this.spinTimer = null;
  }

  win(kind) {
    const seqs = {
      sakura: [5, 7, 9],
      dango: [5, 7, 9, 10],
      star: [7, 9, 10, 12],
      rabbit: [5, 7, 9, 10, 12],
      moon: [7, 9, 10, 12, 14, 15],
    };
    const seq = seqs[kind] || [5, 7, 9];
    seq.forEach((s, i) => this.pluck(s, { gain: 0.42, when: i * 0.09 }));
    this._play(this.rin, { gain: 0.18, rate: 1.5, when: seq.length * 0.09 });
  }

  jackpot() {
    const seq = [5, 7, 9, 10, 12, 14, 15, 17, 19, 17, 19, 20];
    seq.forEach((s, i) => this.pluck(s, { gain: 0.45, when: i * 0.085 }));
    for (let i = 0; i < 6; i++) this._play(this.taiko, { gain: 0.6, rate: i % 2 ? 1.25 : 1, when: i * 0.22 });
    this._play(this.rin, { gain: 0.5, when: 1.1 });
    this._play(this.rin, { gain: 0.4, rate: 1.5, when: 1.3 });
  }

  quake() {
    if (!this.ctx) return;
    const src = this._play(this.noise, { gain: 0.0 });
    if (!src) return;
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 140;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);
    src.disconnect();
    src.connect(f).connect(g).connect(this.sfx);
    this._play(this.taiko, { gain: 0.7, rate: 0.6 });
  }

  gust() {
    if (!this.ctx) return;
    const src = this._play(this.noise, { gain: 0 });
    if (!src) return;
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    src.disconnect();
    src.connect(f).connect(g).connect(this.sfx);
  }

  nightStart(index) {
    const motif = [0, 2, 3, 5, 3 + (index % 3)];
    motif.forEach((s, i) => this.pluck(s + 5, { gain: 0.45, when: i * 0.22 }));
    this._play(this.taiko, { gain: 0.6, rate: 1, when: 0 });
  }

  quotaMet() {
    [10, 12, 14, 15].forEach((s, i) => this.pluck(s, { gain: 0.42, when: i * 0.07 }));
    this._play(this.rin, { gain: 0.35, rate: 1.26, when: 0.3 });
  }

  fail() {
    [5, 3, 1, 0].forEach((s, i) => this.pluck(s, { gain: 0.42, when: i * 0.28 }));
    this._play(this.taiko, { gain: 0.6, rate: 0.7, when: 1.1 });
  }

  buy() {
    this._play(this.clinks[1], { gain: 0.3, rate: 1 });
    this._play(this.clinks[3], { gain: 0.3, rate: 1.2, when: 0.06 });
    this.pluck(12, { gain: 0.3, when: 0.05 });
  }

  click() {
    this._play(this.knock, { gain: 0.12, rate: 2.2 });
  }

  // Quiet generative koto music with a slow taiko pulse.
  _startMusic() {
    const ctx = this.ctx;
    const beat = 0.62;
    let next = ctx.currentTime + 0.5;
    let step = 5;
    let bar = 0;
    const tick = () => {
      if (!this.ctx) return;
      while (next < ctx.currentTime + 1.2) {
        const when = next - ctx.currentTime;
        if (this.musicOn) {
          if (Math.random() < 0.62) {
            step += [-2, -1, -1, 1, 1, 2, 0][(Math.random() * 7) | 0];
            step = Math.max(2, Math.min(12, step));
            this._play(this._kotoBuffer(noteHz(step)), { gain: 0.42, when, dest: this.music });
            if (Math.random() < 0.18) this._play(this._kotoBuffer(noteHz(step + 2)), { gain: 0.3, when: when + beat / 2, dest: this.music });
          }
          if (bar % 8 === 0) this._play(this._kotoBuffer(noteHz(step - 5)), { gain: 0.5, when, dest: this.music });
          if (bar % 4 === 0) this._play(this.taiko, { gain: 0.32, rate: 1.05, when, dest: this.music });
        }
        bar++;
        next += beat;
      }
    };
    this.musicTimer = setInterval(tick, 250);
  }
}
