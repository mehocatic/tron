export interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FlavourSpec {
  id: number;
  name: string;
  lines: string[];
  color: string;
  box: BoxRect;
  bit: number;
  ingredients: string;
}

export interface BitLayout {
  xPct: number;
  yPct: number;
  sizeU: number;
  rot: number;
  bit: number;
  hidePhone?: boolean;
}

export interface StepSpec {
  num: string;
  head: string;
  cap: string;
  ry: number;
}

export const SHEET_W = 2688;
export const SHEET_H = 1520;

export const SHEET_URL =
  'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261116_132032_30242d8c-5062-4d60-8a3d-238f0a2ff788.png&w=2200&q=85';

export const INTRO_VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20261116_131908_b6239896-c077-450c-ad91-575153973fcf.mp4';

export const FLAVORS: FlavourSpec[] = [
  {
    id: 0,
    name: 'Peanut Cocoa',
    lines: ['PEANUT', 'COCOA'],
    color: '#b79474',
    box: { x: 98, y: 145, w: 403, h: 849 },
    bit: 1,
    ingredients: 'Peanuts, oats, dates, cocoa, pea protein, sea salt.',
  },
  {
    id: 1,
    name: 'Berry Oat',
    lines: ['BERRY', 'OAT'],
    color: '#ab9ac4',
    box: { x: 620, y: 145, w: 402, h: 849 },
    bit: 0,
    ingredients: 'Oats, blueberries, raspberries, dates, pea protein, almonds.',
  },
  {
    id: 2,
    name: 'Salted Caramel',
    lines: ['SALTED', 'CARAMEL'],
    color: '#d1ad6c',
    box: { x: 1137, y: 145, w: 402, h: 849 },
    bit: 2,
    ingredients: 'Dates, cashews, oats, pea protein, sea salt, vanilla.',
  },
  {
    id: 3,
    name: 'Mint Chip',
    lines: ['MINT', 'CHIP'],
    color: '#94bdb4',
    box: { x: 1661, y: 145, w: 402, h: 849 },
    bit: 3,
    ingredients: 'Oats, dark chocolate, almonds, pea protein, peppermint oil.',
  },
  {
    id: 4,
    name: 'Strawberry',
    lines: ['STRAWBERRY'],
    color: '#d396a7',
    box: { x: 2184, y: 145, w: 403, h: 849 },
    bit: 4,
    ingredients: 'Oats, strawberries, dates, cashews, pea protein, lemon.',
  },
];

export const BITS: BoxRect[] = [
  { x: 650, y: 1090, w: 340, h: 305 }, // 0: blueberries and raspberry
  { x: 110, y: 1125, w: 280, h: 255 }, // 1: chocolate chunks and peanuts
  { x: 1175, y: 1110, w: 320, h: 285 }, // 2: salted caramel cube
  { x: 1680, y: 1085, w: 380, h: 305 }, // 3: mint leaves and dark chocolate
  { x: 2280, y: 1095, w: 250, h: 295 }, // 4: half strawberry
];

export const HERO_BITS: BitLayout[] = [
  { xPct: 0.12, yPct: 0.2, sizeU: 120, rot: -18, bit: 0 },
  { xPct: 0.86, yPct: 0.18, sizeU: 96, rot: 22, bit: 2, hidePhone: true },
  { xPct: 0.07, yPct: 0.74, sizeU: 84, rot: 12, bit: 3 },
  { xPct: 0.655, yPct: 0.15, sizeU: 78, rot: -10, bit: 4, hidePhone: true },
  { xPct: 0.205, yPct: 0.885, sizeU: 70, rot: 30, bit: 1, hidePhone: true },
];

export const INSIDE_STEPS: StepSpec[] = [
  {
    num: '01',
    head: 'REAL FOOD,\nFIRST',
    cap: 'Oats, nuts, fruit.\nNothing you can\'t say.',
    ry: 0,
  },
  {
    num: '02',
    head: 'PRESSED,\nNOT BAKED',
    cap: 'Real ingredients.\nClean energy.',
    ry: 180,
  },
  {
    num: '03',
    head: 'WRAPPED\nSAME DAY',
    cap: 'Cold-pressed at dawn.\nSealed by noon.',
    ry: 360,
  },
  {
    num: '04',
    head: 'BERRY\nOAT',
    cap: '12g plant protein.\nNo crash.',
    ry: 720,
  },
];

export const NUTRITION_ROWS: { label: string; value: string; bold: boolean }[] = [
  { label: 'Calories', value: '210', bold: true },
  { label: 'Protein', value: '12 g', bold: true },
  { label: 'Total fat', value: '9 g', bold: false },
  { label: 'Carbohydrate', value: '22 g', bold: false },
  { label: 'Fibre', value: '6 g', bold: false },
  { label: 'Sugars', value: '8 g', bold: false },
  { label: 'Salt', value: '0.2 g', bold: false },
];

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function modFlavour(index: number): number {
  return ((Math.round(index) % 5) + 5) % 5;
}

export function spriteStyle(box: BoxRect, pad: number): { backgroundSize: string; backgroundPosition: string } {
  const x = box.x - pad;
  const y = box.y - pad;
  const w = box.w + 2 * pad;
  const h = box.h + 2 * pad;
  const sx = (SHEET_W / w) * 100;
  const sy = (SHEET_H / h) * 100;
  const px = (x / (SHEET_W - w)) * 100;
  const py = (y / (SHEET_H - h)) * 100;
  return {
    backgroundSize: `${sx.toFixed(4)}% ${sy.toFixed(4)}%`,
    backgroundPosition: `${px.toFixed(4)}% ${py.toFixed(4)}%`,
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mixHexTowardInk(hex: string, ratioTowardInk = 0.78): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  // #1c1a1f = (28, 26, 31)
  const mr = Math.round(lerp(r, 28, ratioTowardInk));
  const mg = Math.round(lerp(g, 26, ratioTowardInk));
  const mb = Math.round(lerp(b, 31, ratioTowardInk));
  return `rgb(${mr}, ${mg}, ${mb})`;
}

/**
 * Solve cubic-bezier(p1x, p1y, p2x, p2y) for x = t in [0, 1].
 */
export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number): (t: number) => number {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleDX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;

  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 6; i++) {
      const xErr = sampleX(u) - t;
      const dx = sampleDX(u);
      if (Math.abs(xErr) < 1e-5) break;
      if (Math.abs(dx) < 1e-6) break;
      u -= xErr / dx;
    }
    u = clamp(u, 0, 1);
    return sampleY(u);
  };
}

export function sineEaseInOut(t: number): number {
  return -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;
}

export function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
