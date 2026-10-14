// Procedural canvas textures: medal faces, field print, stage art, moon.
import * as THREE from 'three';

export const PALETTE = {
  indigo: '#151a45',
  indigoDeep: '#0a0d26',
  vermilion: '#d9452e',
  gold: '#f0c96a',
  goldDeep: '#b8862f',
  moon: '#f7ecc8',
  sakura: '#f4a3b8',
  ink: '#1b1424',
};

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Sitting rabbit silhouette, centred on (cx, cy), facing left. `s` is the
// overall size in pixels.
export function drawRabbit(ctx, cx, cy, s, { eye = true } = {}) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.ellipse(0.05, 0.16, 0.33, 0.25, 0, 0, Math.PI * 2); // body
  ctx.moveTo(-0.08, -0.12);
  ctx.arc(-0.24, -0.12, 0.17, 0, Math.PI * 2); // head
  ctx.moveTo(0.43, 0.12);
  ctx.arc(0.36, 0.12, 0.08, 0, Math.PI * 2); // tail
  ctx.fill();
  for (const [x, y, r] of [[-0.2, -0.42, 0.22], [-0.08, -0.4, 0.5]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, 0.06, 0.21, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(-0.22, 0.36, 0.11, 0.06, 0, 0, Math.PI * 2); // paw
  ctx.fill();
  if (eye) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(-0.3, -0.15, 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Rabbit pounding mochi, the classic figure seen in the moon.
export function drawMochiRabbit(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  // Mortar (usu)
  ctx.beginPath();
  ctx.moveTo(0.05, 0.18);
  ctx.lineTo(0.45, 0.18);
  ctx.lineTo(0.4, 0.45);
  ctx.lineTo(0.1, 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.25, 0.18, 0.21, 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pestle (kine)
  ctx.save();
  ctx.translate(0.0, -0.05);
  ctx.rotate(-0.6);
  ctx.fillRect(-0.02, -0.05, 0.04, 0.42);
  ctx.fillRect(-0.12, -0.12, 0.24, 0.09);
  ctx.restore();
  ctx.restore();
  drawRabbit(ctx, cx - s * 0.3, cy + s * 0.05, s * 0.75);
}

function heightToNormal(src, strength) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const d = img.data;
  const H = (x, y) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx / len * 0.5 + 0.5) * 255;
      d[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function blurCanvas(src, px) {
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(src, 0, 0);
  return c;
}

// Medal face: a height map (embossed design) turned into a normal map, plus
// a subtle colour map so the relief reads even under flat light.
export function makeCoinFace(kind, size = 256) {
  const hc = makeCanvas(size, size);
  const ctx = hc.getContext('2d');
  const c = size / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  // Raised rim
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(c, c, size * 0.5, 0, Math.PI * 2);
  ctx.arc(c, c, size * 0.43, 0, Math.PI * 2, true);
  ctx.fill();
  // Dotted ring
  ctx.fillStyle = '#bbb';
  const dots = 36;
  for (let i = 0; i < dots; i++) {
    const a = (i / dots) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * size * 0.385, c + Math.sin(a) * size * 0.385, size * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
  if (kind === 'oban') {
    // Hammered texture lines with the characters 小判.
    ctx.strokeStyle = '#777';
    ctx.lineWidth = size * 0.012;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(c - size * 0.33, c + i * size * 0.05);
      ctx.lineTo(c + size * 0.33, c + i * size * 0.05);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${size * 0.26}px "Dela Gothic One", "Hiragino Mincho ProN", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('小', c, c - size * 0.14);
    ctx.fillText('判', c, c + size * 0.15);
  } else if (kind === 'gold') {
    ctx.fillStyle = '#ddd';
    ctx.font = `900 ${size * 0.42}px "Dela Gothic One", "Hiragino Mincho ProN", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('福', c, c + size * 0.02);
  } else {
    // Crescent + rabbit
    ctx.fillStyle = '#999';
    ctx.beginPath();
    ctx.arc(c + size * 0.02, c, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(c + size * 0.11, c - size * 0.04, size * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0e0e0';
    drawRabbit(ctx, c + size * 0.06, c + size * 0.04, size * 0.36);
  }
  const blurred = blurCanvas(hc, size / 200);
  const normal = heightToNormal(blurred, kind === 'silver' ? 2.6 : 3.2);

  const color = makeCanvas(size, size);
  const cctx = color.getContext('2d');
  cctx.fillStyle = '#fff';
  cctx.fillRect(0, 0, size, size);
  if (kind === 'oban') {
    // Rainbow wheel under the relief.
    const slices = 72;
    for (let i = 0; i < slices; i++) {
      const a0 = (i / slices) * Math.PI * 2, a1 = ((i + 1.5) / slices) * Math.PI * 2;
      cctx.fillStyle = `hsl(${(i / slices) * 360}, 95%, 62%)`;
      cctx.beginPath();
      cctx.moveTo(c, c);
      cctx.arc(c, c, size * 0.75, a0, a1);
      cctx.closePath();
      cctx.fill();
    }
    const glow = cctx.createRadialGradient(c, c, 0, c, c, size * 0.5);
    glow.addColorStop(0, 'rgba(255,255,255,0.55)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = glow;
    cctx.fillRect(0, 0, size, size);
  }
  cctx.globalAlpha = kind === 'oban' ? 0.35 : 0.22;
  cctx.globalCompositeOperation = 'multiply';
  cctx.drawImage(blurred, 0, 0);
  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { normalMap: tex(normal, false), map: tex(color, true) };
}

// Rainbow band for the rim of the 小判, hue running around the edge.
export function makeRainbowStrip(w = 256, h = 8) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  for (let x = 0; x < w; x++) {
    ctx.fillStyle = `hsl(${(x / w) * 720 % 360}, 95%, 62%)`;
    ctx.fillRect(x, 0, 1, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Reeded edge for the medal rim.
export function makeReededEdge() {
  const c = makeCanvas(256, 8);
  const ctx = c.getContext('2d');
  for (let x = 0; x < 256; x++) {
    const v = 0.5 + 0.5 * Math.sin((x / 256) * Math.PI * 2 * 48);
    const g = Math.round(v * 255);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(x, 0, 1, 8);
  }
  const t = new THREE.CanvasTexture(heightToNormal(c, 1.5));
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Seigaiha (blue ocean waves) print in gold lines on lacquered indigo.
export function makeSeigaiha(size = 1024, { bg = PALETTE.indigo, line = PALETTE.gold, alpha = 0.55, scale = 64 } = {}) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  const R = scale;
  const rows = Math.ceil(size / (R / 2)) + 3;
  const cols = Math.ceil(size / R) + 2;
  for (let row = -1; row < rows; row++) {
    const y = row * (R / 2);
    const off = (row % 2) * (R / 2);
    for (let col = -1; col < cols; col++) {
      const x = col * R + off;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(x, y, R * 0.98, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.globalAlpha = alpha;
      for (let k = 1; k <= 4; k++) {
        ctx.lineWidth = k === 1 ? R * 0.05 : R * 0.035;
        ctx.beginPath();
        ctx.arc(x, y, R * (k / 4) * 0.92, Math.PI, 0);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Stage plate: night sky with drifting clouds and stars, plus a guide arc
// pointing at the torii checker at the lip.
export function makeStageArt(w = 1024, h = 512, felt = null) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0b0f2e');
  g.addColorStop(1, '#253074');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Stars
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,245,215,${0.25 + rnd() * 0.6})`;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, rnd() * 1.6 + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Clouds (stylised, Japanese suyari-gasumi bands)
  ctx.fillStyle = 'rgba(240,201,106,0.16)';
  for (const [y, x0, x1] of [[0.28, 0.02, 0.4], [0.5, 0.6, 0.98], [0.72, 0.1, 0.45]]) {
    const yy = y * h, r = h * 0.05;
    ctx.beginPath();
    ctx.roundRect(x0 * w, yy - r, (x1 - x0) * w, r * 2, r);
    ctx.fill();
  }
  // Felt landing strip where the pitchers' medals come down.
  if (felt) {
    const y0 = felt[0] * h, y1 = felt[1] * h;
    const fg = ctx.createLinearGradient(0, y0, 0, y1);
    fg.addColorStop(0, '#5a1420');
    fg.addColorStop(1, '#7a1d2a');
    ctx.fillStyle = fg;
    ctx.fillRect(0, y0, w, y1 - y0);
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = `rgba(255,${180 + rnd() * 60},${160 + rnd() * 60},${rnd() * 0.08})`;
      ctx.fillRect(rnd() * w, y0 + rnd() * (y1 - y0), 2, 2);
    }
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, y0); ctx.lineTo(w, y0);
    ctx.moveTo(0, y1); ctx.lineTo(w, y1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,201,106,0.35)';
    ctx.setLineDash([10, 10]);
    ctx.lineWidth = 2;
    const ya = felt[2] * h;
    ctx.beginPath();
    ctx.moveTo(0, ya); ctx.lineTo(w, ya);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Full moon with craters and the mochi rabbit.
export function makeMoon(size = 512) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const r = size / 2;
  const g = ctx.createRadialGradient(r * 0.85, r * 0.8, r * 0.1, r, r, r);
  g.addColorStop(0, '#fffaf0');
  g.addColorStop(0.7, '#f7e9bf');
  g.addColorStop(1, '#e8cf8a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(r, r, r * 0.98, 0, Math.PI * 2);
  ctx.fill();
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * 0.8;
    ctx.fillStyle = `rgba(190,160,100,${0.08 + rnd() * 0.12})`;
    ctx.beginPath();
    ctx.arc(r + Math.cos(a) * d, r + Math.sin(a) * d, rnd() * r * 0.13 + r * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(160,120,70,0.42)';
  drawMochiRabbit(ctx, r * 1.02, r * 0.98, r * 0.95);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Paper lantern with a single character.
export function makeLantern(char) {
  const c = makeCanvas(128, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, '#8a1d14');
  g.addColorStop(0.5, '#ff6b45');
  g.addColorStop(1, '#8a1d14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 256);
  ctx.strokeStyle = 'rgba(60,10,5,0.35)';
  ctx.lineWidth = 2;
  for (let y = 12; y < 256; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#1b0d08';
  ctx.font = '900 84px "Dela Gothic One", "Hiragino Mincho ProN", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, 64, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Soft round sprite for sparkles and bokeh.
export function makeGlowSprite(size = 64) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Arcade backdrop: blurred lights of other machines in a dark hall.
export function makeBackdrop(w = 1024, h = 512) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#05061a');
  g.addColorStop(1, '#14102e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cols = ['255,90,70', '255,200,100', '120,140,255', '255,140,190', '120,230,220'];
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w, y = h * (0.25 + rnd() * 0.6), r = 6 + rnd() * 34;
    const col = cols[Math.floor(rnd() * cols.length)];
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${col},${0.25 + rnd() * 0.35})`);
    rg.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Warm wood grain for the offering box.
export function makeWoodTexture(w = 256, h = 256) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a5a32';
  ctx.fillRect(0, 0, w, h);
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < h; y += 2) {
    const v = Math.sin(y * 0.09 + Math.sin(y * 0.013) * 3) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(${60 + v * 40},${32 + v * 20},${14 + v * 10},${0.25 + rnd() * 0.2})`;
    ctx.fillRect(0, y, w, 2);
  }
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(50,24,10,${0.15 + rnd() * 0.2})`;
    ctx.lineWidth = 1 + rnd() * 2;
    ctx.beginPath();
    const y = rnd() * h;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y + rnd() * 20 - 10, w * 0.7, y + rnd() * 20 - 10, w, y + rnd() * 10 - 5);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Boss faces, drawn as masks on a transparent 256px canvas.
export function makeBossFace(key) {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const ink = '#140c10';
  const blob = (x, y, rx, ry, fill, stroke = ink, lw = 5) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
  };
  const poly = (pts, fill, stroke = ink, lw = 4) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
  };
  const eye = (x, y, dir, iris = '#ffd23a') => {
    blob(x, y, 17, 13, iris, ink, 4);
    blob(x + dir * 3, y + 1, 6, 8, ink, null);
    ctx.lineWidth = 9;
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(x - dir * 24, y - 26);
    ctx.lineTo(x + dir * 18, y - 12);
    ctx.stroke();
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (key === 'oni') {
    // Wild hair behind the head.
    const hair = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI * (1.05 + i / 14 * 0.9);
      const r = i % 2 ? 108 : 86;
      hair.push([128 + Math.cos(a) * r, 128 + Math.sin(a) * r * 0.95]);
    }
    hair.push([214, 150], [42, 150]);
    poly(hair, '#1d1418', ink, 3);
    const g = ctx.createRadialGradient(110, 120, 20, 128, 140, 110);
    g.addColorStop(0, '#f2603f');
    g.addColorStop(1, '#a3241a');
    blob(128, 146, 84, 92, g);
    poly([[78, 74], [58, 8], [102, 66]], '#f4e7c4');
    poly([[178, 74], [198, 8], [154, 66]], '#f4e7c4');
    eye(98, 128, 1);
    eye(158, 128, -1);
    poly([[118, 150], [138, 150], [146, 176], [110, 176]], '#c23a24', ink, 4);
    // Grinning mouth with fangs.
    ctx.beginPath();
    ctx.moveTo(78, 192);
    ctx.quadraticCurveTo(128, 236, 178, 192);
    ctx.quadraticCurveTo(128, 210, 78, 192);
    ctx.fillStyle = '#3a0c0c';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = ink;
    ctx.stroke();
    poly([[92, 200], [100, 176], [108, 204]], '#fffaf0', ink, 3);
    poly([[164, 200], [156, 176], [148, 204]], '#fffaf0', ink, 3);
  } else if (key === 'tengu') {
    // Black feathered wings.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.32;
        const bx = 128 + side * 70, by = 120;
        poly([[bx, by], [bx + side * Math.cos(a) * 118, by + Math.sin(a) * 118 - 10],
          [bx + side * Math.cos(a + 0.22) * 100, by + Math.sin(a + 0.22) * 100]], i % 2 ? '#24202c' : '#36303e', ink, 3);
      }
    }
    const g = ctx.createRadialGradient(112, 110, 20, 128, 130, 100);
    g.addColorStop(0, '#e2483a');
    g.addColorStop(1, '#8e1c16');
    blob(128, 136, 72, 84, g);
    // Tokin cap.
    poly([[106, 54], [150, 54], [160, 34], [128, 18], [96, 34]], '#17131b', ink, 4);
    // White brows and beard.
    for (const side of [-1, 1]) {
      poly([[128 + side * 14, 104], [128 + side * 66, 86], [128 + side * 58, 112]], '#f6f1e6', ink, 3);
    }
    eye(100, 122, 1, '#ffe27a');
    eye(156, 122, -1, '#ffe27a');
    poly([[70, 182], [128, 246], [186, 182], [160, 196], [128, 212], [96, 196]], '#f6f1e6', ink, 3);
    // Long nose, pointing out at the viewer.
    const ng = ctx.createLinearGradient(128, 130, 128, 214);
    ng.addColorStop(0, '#d23b2e');
    ng.addColorStop(1, '#ff7a5e');
    ctx.beginPath();
    ctx.moveTo(114, 134);
    ctx.quadraticCurveTo(110, 200, 128, 222);
    ctx.quadraticCurveTo(146, 200, 142, 134);
    ctx.closePath();
    ctx.fillStyle = ng;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = ink;
    ctx.stroke();
  } else {
    // Tanuki with a leaf on its head.
    blob(66, 70, 26, 26, '#7a4a26');
    blob(190, 70, 26, 26, '#7a4a26');
    blob(66, 72, 13, 13, '#3a2214', null);
    blob(190, 72, 13, 13, '#3a2214', null);
    const g = ctx.createRadialGradient(118, 120, 20, 128, 140, 110);
    g.addColorStop(0, '#b07a46');
    g.addColorStop(1, '#6e4222');
    blob(128, 142, 92, 84, g);
    blob(128, 178, 50, 38, '#f1e2c4');
    poly([[56, 120], [104, 106], [112, 150], [70, 156]], '#2a1a12', null);
    poly([[200, 120], [152, 106], [144, 150], [186, 156]], '#2a1a12', null);
    blob(92, 132, 11, 12, '#fff8e6', null);
    blob(164, 132, 11, 12, '#fff8e6', null);
    blob(94, 134, 5, 6, ink, null);
    blob(162, 134, 5, 6, ink, null);
    blob(128, 164, 13, 9, ink, null);
    ctx.beginPath();
    ctx.moveTo(110, 186);
    ctx.quadraticCurveTo(128, 200, 146, 186);
    ctx.lineWidth = 5;
    ctx.strokeStyle = ink;
    ctx.stroke();
    // Leaf.
    ctx.save();
    ctx.translate(128, 52);
    ctx.rotate(-0.4);
    blob(0, 0, 18, 34, '#58b04a', ink, 4);
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(0, 34);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Daruma skin for a sphere: red lacquer, a white face with one painted eye,
// and a gold 福 on the back.
export function makeDarumaTexture(w = 512, h = 256) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#e8402c');
  g.addColorStop(1, '#9a1a10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Gold trim around the face and belly.
  ctx.strokeStyle = '#f0c96a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(w * 0.25, h * 0.47, 78, 62, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Face
  ctx.fillStyle = '#f6eed8';
  ctx.beginPath();
  ctx.ellipse(w * 0.25, h * 0.47, 72, 56, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b1424';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(w * 0.25 + s * 30, h * 0.44, 15, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#1b1424';
    ctx.beginPath();
    ctx.moveTo(w * 0.25 + s * 10, h * 0.3);
    ctx.quadraticCurveTo(w * 0.25 + s * 40, h * 0.22, w * 0.25 + s * 58, h * 0.32);
    ctx.stroke();
  }
  ctx.fillStyle = '#f6eed8';
  ctx.beginPath();
  ctx.ellipse(w * 0.25 + 30, h * 0.44, 8, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1b1424';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.25 - 26, h * 0.62);
  ctx.quadraticCurveTo(w * 0.25, h * 0.7, w * 0.25 + 26, h * 0.62);
  ctx.stroke();
  // 福 on the back
  ctx.fillStyle = '#f0c96a';
  ctx.font = `900 ${h * 0.42}px "Dela Gothic One", "Hiragino Mincho ProN", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('福', w * 0.75, h * 0.55);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Treasure chest side: dark red lacquer with gold bands and a lock plate.
export function makeChestTexture(size = 256, lock = false) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6e1a14';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < size; y += 16) ctx.fillRect(0, y, size, 2);
  ctx.fillStyle = '#e0b04a';
  ctx.fillRect(0, 0, size, size * 0.08);
  ctx.fillRect(0, size * 0.92, size, size * 0.08);
  ctx.fillRect(size * 0.18, 0, size * 0.1, size);
  ctx.fillRect(size * 0.72, 0, size * 0.1, size);
  if (lock) {
    ctx.fillStyle = '#ffd96a';
    ctx.fillRect(size * 0.4, size * 0.3, size * 0.2, size * 0.32);
    ctx.fillStyle = '#3a1a08';
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.42, size * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(size * 0.49, size * 0.43, size * 0.02, size * 0.1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
