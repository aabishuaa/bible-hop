// Paper, made in the browser: kraft grain, cream parchment with a faint blackletter watermark,
// torn edges, and the printed pages that fly past during a hop.
import { CREAM, TIER_COLOR } from '../theme.ts';
import type { FlipTier } from '../theme.ts';
import { ICON_PATHS } from '../ui/icon-paths.ts';

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, string>();

/** A tile of kraft paper: flecks and short fibres on warm brown. The tile is large and its
 *  blotches faint, so the repeat can't be picked out even on a wide screen. */
export function kraftTile(): string {
  const hit = cache.get('kraft');
  if (hit) return hit;
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ad8650';
  g.fillRect(0, 0, s, s);
  const r = rng(7);
  for (let i = 0; i < 40; i++) {
    const x = r() * s, y = r() * s, rad = 30 + r() * 80;
    const dark = r() > 0.5;
    const a = 0.025 + r() * 0.02;
    for (const [dx, dy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s], [s, s], [-s, -s], [s, -s], [-s, s]]) {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      grad.addColorStop(0, dark ? `rgba(96,64,24,${a})` : `rgba(226,190,130,${a})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    }
  }
  for (let i = 0; i < 6600; i++) {
    const x = r() * s, y = r() * s;
    g.fillStyle = r() > 0.5 ? `rgba(70,45,15,${0.05 + r() * 0.12})` : `rgba(240,210,160,${0.05 + r() * 0.12})`;
    g.fillRect(x, y, 1 + r() * 1.2, 1 + r() * 1.2);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 380; i++) {
    const x = r() * s, y = r() * s, a = r() * Math.PI, len = 4 + r() * 16;
    g.strokeStyle = r() > 0.45 ? `rgba(80,52,20,${0.06 + r() * 0.1})` : `rgba(235,205,150,${0.06 + r() * 0.1})`;
    g.lineWidth = 0.5 + r() * 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 4, y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 4, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  const url = c.toDataURL('image/png');
  cache.set('kraft', url);
  return url;
}

/** Fine, even film grain (no blotches, so it has no pattern to repeat), laid over the leather. */
export function grainUrl(): string {
  const hit = cache.get('grain');
  if (hit) return hit;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const img = g.createImageData(s, s);
  const r = rng(23);
  for (let i = 0; i < s * s; i++) {
    const v = r();
    const light = v > 0.5;
    img.data[i * 4] = light ? 255 : 20;
    img.data[i * 4 + 1] = light ? 236 : 8;
    img.data[i * 4 + 2] = light ? 200 : 0;
    img.data[i * 4 + 3] = Math.floor(Math.abs(v - 0.5) * 2 * 19);
  }
  g.putImageData(img, 0, 0);
  const url = c.toDataURL('image/png');
  cache.set('grain', url);
  return url;
}

let grain: HTMLCanvasElement | null = null;
function grainTile(): HTMLCanvasElement {
  if (grain) return grain;
  const s = 180;
  grain = document.createElement('canvas');
  grain.width = grain.height = s;
  const g = grain.getContext('2d')!;
  const img = g.createImageData(s, s);
  const r = rng(11);
  for (let i = 0; i < s * s; i++) {
    const v = r();
    const dark = v < 0.5;
    img.data[i * 4] = dark ? 110 : 255;
    img.data[i * 4 + 1] = dark ? 80 : 248;
    img.data[i * 4 + 2] = dark ? 40 : 225;
    img.data[i * 4 + 3] = Math.floor(Math.abs(v - 0.5) * 2 * 26);
  }
  g.putImageData(img, 0, 0);
  return grain;
}

/** Old print for the watermark, set in blackletter like an early English Bible. */
const WATERMARK = [
  'In the beginning was the Word, and the Word was with God,',
  'and the Word was God. The same was in the beginning with God.',
  'Thy word is a lamp unto my feet, and a light unto my path.',
  'The grass withereth, the flower fadeth: but the word of our God',
  'shall stand for ever. Heaven and earth shall pass away,',
  'but my words shall not pass away. Man shall not live by bread alone,',
  'but by every word that proceedeth out of the mouth of God.',
  'Seek ye first the kingdom of God, and his righteousness;',
  'and all these things shall be added unto you. Ask, and it shall',
  'be given you; seek, and ye shall find; knock, and it shall be opened.',
  'The Lord is my shepherd; I shall not want. He maketh me to lie',
  'down in green pastures: he leadeth me beside the still waters.',
  'For God so loved the world, that he gave his only begotten Son,',
  'that whosoever believeth in him should not perish, but have',
  'everlasting life. Be still, and know that I am God.',
  'Trust in the Lord with all thine heart; and lean not unto',
  'thine own understanding. In all thy ways acknowledge him,',
  'and he shall direct thy paths. I am the way, the truth, and the life.',
];

export interface PageOptions {
  w: number;
  h: number;
  dpr: number;
  /** Which edge the book's spine is on; the paper darkens into the fold there. */
  spine: 'left' | 'right' | 'none';
  watermark?: boolean;
  seed?: number;
}

/** A page of the old Bible the game is played in. */
export function paintPage(canvas: HTMLCanvasElement, o: PageOptions): void {
  const { w, h, dpr } = o;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = CREAM;
  g.fillRect(0, 0, w, h);
  const r = rng(o.seed ?? 3);
  // soft mottling, as on aged paper
  for (let i = 0; i < 14; i++) {
    const x = r() * w, y = r() * h, rad = (0.18 + r() * 0.4) * Math.max(w, h);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, r() > 0.45 ? 'rgba(214,178,118,0.10)' : 'rgba(255,250,236,0.20)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
  if (o.watermark !== false) {
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-0.34);
    const size = Math.max(26, Math.min(58, Math.min(w, h) * 0.085));
    g.font = `${size}px "UnifrakturMaguntia", "Old English Text MT", serif`;
    g.fillStyle = 'rgba(160,122,70,0.095)';
    g.textBaseline = 'middle';
    const lineH = size * 1.42;
    const span = Math.hypot(w, h);
    const lines = Math.ceil(span / lineH) + 2;
    for (let i = 0; i < lines; i++) {
      const text = WATERMARK[(i + (o.seed ?? 0)) % WATERMARK.length] + '  ' + WATERMARK[(i + 5) % WATERMARK.length];
      g.fillText(text, -span / 2 - ((i * 97) % 160), (i - lines / 2) * lineH);
    }
    g.restore();
  }
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.8;
  g.fillStyle = g.createPattern(grainTile(), 'repeat')!;
  g.fillRect(0, 0, w, h);
  g.restore();
  // the fold of the open book
  if (o.spine !== 'none') {
    const left = o.spine === 'left';
    const width = Math.min(90, w * 0.16);
    const fold = g.createLinearGradient(left ? 0 : w, 0, left ? width : w - width, 0);
    fold.addColorStop(0, 'rgba(96,62,22,0.34)');
    fold.addColorStop(0.25, 'rgba(120,84,36,0.13)');
    fold.addColorStop(1, 'rgba(120,84,36,0)');
    g.fillStyle = fold;
    g.fillRect(left ? 0 : w - width, 0, width, h);
    const lift = g.createLinearGradient(left ? width * 0.9 : w - width * 0.9, 0, left ? width * 2.2 : w - width * 2.2, 0);
    lift.addColorStop(0, 'rgba(255,252,240,0.30)');
    lift.addColorStop(1, 'rgba(255,252,240,0)');
    g.fillStyle = lift;
    g.fillRect(left ? width * 0.6 : w - width * 2.4, 0, width * 1.8, h);
    // the far edge curls away slightly
    const far = g.createLinearGradient(left ? w : 0, 0, left ? w - 28 : 28, 0);
    far.addColorStop(0, 'rgba(120,84,36,0.14)');
    far.addColorStop(1, 'rgba(120,84,36,0)');
    g.fillStyle = far;
    g.fillRect(left ? w - 28 : 0, 0, 28, h);
  }
}

const leafCache = new Map<string, HTMLCanvasElement>();

/** A printed page seen in passing: two columns of small type, washed in the color of the hop. */
export function leafTexture(tier: FlipTier, w: number, h: number, variant = 0, plain = false): HTMLCanvasElement {
  const scale = Math.min(1, 720 / Math.max(w, h));
  const tw = Math.round(w * scale), th = Math.round(h * scale);
  const key = `${tier}|${tw}|${th}|${variant}|${plain}`;
  const hit = leafCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  paintPage(c, { w: tw, h: th, dpr: 1, spine: 'left', watermark: false, seed: 20 + variant });
  const g = c.getContext('2d')!;
  const color = TIER_COLOR[tier];
  const r = rng(101 + variant * 13);
  const margin = tw * 0.1, top = th * 0.1, gap = tw * 0.06;
  const colW = (tw - margin * 2 - gap) / 2;
  const lineH = Math.max(5, th / 52);
  g.lineCap = 'round';
  // running head
  g.strokeStyle = 'rgba(70,45,28,0.5)';
  g.lineWidth = Math.max(1.4, lineH * 0.34);
  g.beginPath();
  g.moveTo(tw / 2 - tw * 0.13, top - lineH * 2.4);
  g.lineTo(tw / 2 + tw * 0.13, top - lineH * 2.4);
  g.stroke();
  g.strokeStyle = 'rgba(70,45,28,0.25)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(margin, top - lineH);
  g.lineTo(tw - margin, top - lineH);
  g.stroke();
  for (let col = 0; col < 2; col++) {
    const x0 = margin + col * (colW + gap);
    let y = top + lineH;
    let para = 3 + Math.floor(r() * 5);
    while (y < th - top) {
      const last = para === 0;
      const indent = para === 3 + 99 ? 0 : 0;
      const len = last ? colW * (0.3 + r() * 0.5) : colW * (0.9 + r() * 0.1);
      g.strokeStyle = `rgba(62,40,26,${0.34 + r() * 0.14})`;
      g.lineWidth = Math.max(1.1, lineH * 0.3);
      g.beginPath();
      g.moveTo(x0 + indent, y);
      g.lineTo(x0 + len, y);
      g.stroke();
      // a verse number here and there, in the color of the hop
      if (r() < 0.16) {
        g.fillStyle = color;
        g.globalAlpha = 0.75;
        g.beginPath();
        g.arc(x0 - lineH * 0.7, y, lineH * 0.28, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
      y += lineH;
      if (last) {
        y += lineH * 0.6;
        para = 3 + Math.floor(r() * 6);
      } else para--;
    }
  }
  // the hop's color washes over the page, with its emblem pressed into the paper
  if (plain) {
    leafCache.set(key, c);
    return c;
  }
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color;
  g.globalAlpha = tier === 'crumb' ? 0.2 : 0.3;
  g.fillRect(0, 0, tw, th);
  g.restore();
  const emblem = ICON_PATHS[tier === 'home' ? 'home' : tier];
  if (emblem) {
    const size = Math.min(tw, th) * 0.5;
    g.save();
    g.translate(tw / 2 - size / 2, th / 2 - size / 2);
    g.scale(size / 24, size / 24);
    g.globalAlpha = 0.2;
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = 1.5;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (const p of emblem) {
      const path = new Path2D(p.d);
      if (p.fill) g.fill(path);
      else g.stroke(path);
    }
    g.restore();
  }
  leafCache.set(key, c);
  return c;
}

/**
 * A torn edge, as a CSS clip-path. `side` is the edge that is torn; `depth` is how far the tear
 * wanders, in pixels. The same seed always tears the same way.
 */
export function tornClip(side: 'top' | 'bottom', depth: number, seed: number, steps = 46): string {
  const r = rng(seed);
  const pts: string[] = [];
  let drift = r() * depth * 0.5;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 100 + (i > 0 && i < steps ? (r() - 0.5) * (60 / steps) : 0);
    drift += (r() - 0.5) * depth * 0.5;
    drift = Math.max(0, Math.min(depth, drift));
    const jag = drift + (r() - 0.5) * depth * 0.28;
    const d = Math.max(0, Math.min(depth, jag)).toFixed(1);
    pts.push(side === 'bottom' ? `${x.toFixed(2)}% calc(100% - ${d}px)` : `${x.toFixed(2)}% ${d}px`);
  }
  return side === 'bottom' ? `polygon(0 0, 100% 0, ${pts.reverse().join(', ')})` : `polygon(${pts.join(', ')}, 100% 100%, 0 100%)`;
}

/** A torn corner piece running diagonally, for the title page. */
export function tornCorner(corner: 'tl' | 'br', seed: number, steps = 40): string {
  const r = rng(seed);
  const pts: string[] = [];
  let drift = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    drift += (r() - 0.5) * 3.2;
    drift = Math.max(-4, Math.min(4, drift));
    const wob = drift + (r() - 0.5) * 1.6;
    // a gentle S-curve from one side of the box to the other
    const base = 100 - (t * 100 + Math.sin(t * Math.PI) * 14);
    const x = t * 100;
    const y = Math.max(0, Math.min(100, base + wob));
    pts.push(corner === 'tl' ? `${x.toFixed(2)}% ${y.toFixed(2)}%` : `${(100 - x).toFixed(2)}% ${(100 - y).toFixed(2)}%`);
  }
  return corner === 'tl' ? `polygon(0 0, ${pts.reverse().join(', ')})` : `polygon(100% 100%, ${pts.reverse().join(', ')})`;
}
