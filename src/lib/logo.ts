// Finds the Brand Kit logo inside a creative, with no AI: masked normalised cross-correlation over a range of sizes and
// proportions, searched coarse-to-fine, on grey values and, for a recoloured logo, on colour edges. Pure functions on
// pixels, so the same code runs in the browser (on canvas pixels) and in tests (on decoded PNGs).

import { dominantFromPixels } from "./colours";

export interface Gray { w: number; h: number; d: Float32Array }
/** A logo template: grey values plus a mask of its opaque pixels (transparent areas are ignored). */
export interface Template extends Gray { m: Uint8Array }
export interface LogoMatch {
  found: boolean;
  /** Best correlation, 0 to 1. A match needs MATCH_AT or more. */
  score: number;
  /** Where the best match sits, as fractions of the image width and height. */
  box?: { x: number; y: number; w: number; h: number };
  /** Share of the clear-space band around the logo taken up by other content, 0 to 1. */
  crowd?: number;
  /** Width-to-height proportion of the match against the logo file's own: 1 is true, 1.1 is 10% wider than it should be. */
  stretch?: number;
  /** "edges" when only edge matching found it: the shapes match but the colours or tones do not. */
  by?: "edges";
  /** The logo file's main colours and the colours measured in the same places on the creative. The server judges the difference. */
  colours?: { expected: string; found: string; share: number }[];
}

export const MATCH_AT = 0.7;
/** Default clear space: a margin of a quarter of the logo's height on every side. */
export const CLEAR_SPACE = 0.25;

/** RGBA pixels to grey (Rec. 709 luma). Alpha below half counts as transparent in the mask. */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Template {
  const d = new Float32Array(w * h);
  const m = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < w * h; i += 4, j++) {
    d[j] = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    m[j] = rgba[i + 3] >= 128 ? 1 : 0;
  }
  return { w, h, d, m };
}

/** Area-average resize (bilinear when enlarging). The mask follows the same rule, then is rounded. */
export function resize<T extends Gray>(src: T, w: number, h: number): T {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const d = new Float32Array(w * h);
  const hasMask = "m" in src;
  const m = new Uint8Array(w * h);
  const sx = src.w / w, sy = src.h / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * sy, y1 = y0 + sy;
    for (let x = 0; x < w; x++) {
      const x0 = x * sx, x1 = x0 + sx;
      let sum = 0, area = 0, ms = 0;
      for (let yy = Math.floor(y0); yy < Math.min(src.h, Math.ceil(y1)); yy++) {
        const fy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        for (let xx = Math.floor(x0); xx < Math.min(src.w, Math.ceil(x1)); xx++) {
          const a = (Math.min(x1, xx + 1) - Math.max(x0, xx)) * fy;
          if (a <= 0) continue;
          const k = yy * src.w + xx;
          sum += src.d[k] * a;
          if (hasMask) ms += (src as unknown as Template).m[k] * a;
          area += a;
        }
      }
      d[y * w + x] = area ? sum / area : 0;
      if (hasMask) m[y * w + x] = area && ms / area >= 0.5 ? 1 : 0;
    }
  }
  return (hasMask ? { w, h, d, m } : { w, h, d }) as T;
}

interface Prepared { w: number; h: number; xs: Int32Array; vals: Float32Array; n: number; mean: number; norm: number }

function prepare(t: Template): Prepared | null {
  const xs: number[] = [], vals: number[] = [];
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const k = y * t.w + x;
    if (t.m[k]) { xs.push(y * 65536 + x); vals.push(t.d[k]); }
  }
  const n = vals.length;
  if (n < 12) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  let ss = 0;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) { v[i] = vals[i] - mean; ss += v[i] * v[i]; }
  if (ss < 1e-6) return null; // a flat logo has nothing to match on
  return { w: t.w, h: t.h, xs: Int32Array.from(xs), vals: v, n, mean, norm: Math.sqrt(ss) };
}

/** Correlation of the template's opaque pixels with the image at (ox, oy). Inverted logos count too. */
function nccAt(img: Gray, p: Prepared, ox: number, oy: number): number {
  let si = 0, si2 = 0, sit = 0;
  for (let i = 0; i < p.n; i++) {
    const c = p.xs[i];
    const v = img.d[(oy + (c >> 16)) * img.w + ox + (c & 0xffff)];
    si += v; si2 += v * v; sit += v * p.vals[i];
  }
  const varI = si2 - (si * si) / p.n;
  if (varI < 1e-3) return 0;
  return Math.abs(sit / (Math.sqrt(varI) * p.norm));
}

interface Hit { score: number; x: number; y: number; w: number; h: number }

function scan(img: Gray, p: Prepared, x0 = 0, y0 = 0, x1 = img.w - p.w, y1 = img.h - p.h): Hit {
  let best: Hit = { score: 0, x: 0, y: 0, w: p.w, h: p.h };
  for (let y = Math.max(0, y0); y <= Math.min(y1, img.h - p.h); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(x1, img.w - p.w); x++) {
      const s = nccAt(img, p, x, y);
      if (s > best.score) best = { score: s, x, y, w: p.w, h: p.h };
    }
  }
  return best;
}

/** Width / height factors tried at the fine pass: a logo squashed or stretched by up to 15% is still found, and measured. */
export const STRETCHES = [0.85, 0.875, 0.9, 0.925, 0.95, 0.975, 1, 1.025, 1.05, 1.075, 1.1, 1.125, 1.15];

interface Found extends Hit { stretch: number; fineW: number; fineH: number }

/**
 * The search itself, on any single-channel feature (grey values or edge strength).
 * Coarse pass on a 120-pixel-wide copy at the logo's own proportions, then a fine pass at 360 pixels around the
 * three best candidates, trying sizes 6% either side and the stretch factors above.
 */
function search(coarse: Gray, fine: Gray, tpl: (w: number, h: number) => Template, aspect: number, stretches: number[]): Found {
  const cands: (Hit & { f: number })[] = [];
  for (let f = 0.04; f <= 0.45; f *= 1.12) {
    const tw = Math.round(f * coarse.w), th = Math.round(tw * aspect);
    if (tw < 5 || th < 5 || tw > coarse.w || th > coarse.h) continue;
    const p = prepare(tpl(tw, th));
    if (!p) continue;
    cands.push({ ...scan(coarse, p), f });
  }
  cands.sort((a, b) => b.score - a.score);
  const k = fine.w / coarse.w;
  let best: Found = { score: 0, x: 0, y: 0, w: 0, h: 0, stretch: 1, fineW: fine.w, fineH: fine.h };
  for (const c of cands.slice(0, 3)) {
    for (const g of [1 / 1.06, 1, 1.06]) {
      const base = c.f * g * fine.w;
      for (const s of stretches) {
        const tw = Math.round(base * s), th = Math.round(base * aspect);
        if (tw > fine.w || th > fine.h || tw < 5 || th < 5) continue;
        const p = prepare(tpl(tw, th));
        if (!p) continue;
        const cx = Math.round(c.x * k), cy = Math.round(c.y * k), r = Math.ceil(k) + 3;
        const h = scan(fine, p, cx - r, cy - r, cx + r, cy + r);
        // A stretched fit has to beat the true proportions clearly, so a clean logo is never called stretched.
        const score = s === 1 ? h.score : h.score - 0.01;
        if (score > best.score) best = { ...h, score, stretch: s, fineW: fine.w, fineH: fine.h };
      }
    }
  }
  return best;
}

function done(best: Found, fine: Gray, clear: number, edge: boolean): LogoMatch {
  const score = Math.round(best.score * 1000) / 1000;
  if (score < (edge ? EDGE_MATCH_AT : MATCH_AT)) return { found: false, score };
  return {
    found: true, score,
    box: { x: best.x / fine.w, y: best.y / fine.h, w: best.w / fine.w, h: best.h / fine.h },
    crowd: crowding(fine, best, clear),
    stretch: Math.round(best.stretch * 1000) / 1000,
    ...(edge ? { by: "edges" as const } : {}),
  };
}

/** Search a greyscale image for the logo between 4% and 45% of the image width. */
export function findLogo(image: Gray, logo: Template, clear = CLEAR_SPACE): LogoMatch {
  const COARSE = 120, FINE = 360;
  const coarse = resize(image, COARSE, (image.h * COARSE) / image.w);
  const fineW = Math.min(FINE, image.w);
  const fine = resize(image, fineW, (image.h * fineW) / image.w);
  return done(search(coarse, fine, (w, h) => resize(logo, w, h), logo.h / logo.w, STRETCHES), fine, clear, false);
}

// --- colour images: edges and colours ---

/** Colour planes of an RGBA image, 0 to 255. With alpha, colours are premultiplied and alpha is a fourth plane. */
export interface Planes { w: number; h: number; p: Float32Array[] }
export interface Rgba { data: Uint8ClampedArray | Uint8Array; w: number; h: number }

export function toPlanes(img: Rgba, withAlpha: boolean): Planes {
  const n = img.w * img.h;
  const p = Array.from({ length: withAlpha ? 4 : 3 }, () => new Float32Array(n));
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const a = withAlpha ? img.data[i + 3] / 255 : 1;
    p[0][j] = img.data[i] * a; p[1][j] = img.data[i + 1] * a; p[2][j] = img.data[i + 2] * a;
    if (withAlpha) p[3][j] = 255 * a;
  }
  return { w: img.w, h: img.h, p };
}

function resizePlanes(pl: Planes, w: number, h: number): Planes {
  const p = pl.p.map((d) => resize({ w: pl.w, h: pl.h, d }, w, h));
  return { w: p[0].w, h: p[0].h, p: p.map((x) => x.d) };
}

/**
 * Edge strength: the largest central-difference gradient over the colour planes. A recoloured logo keeps its edges
 * even when its new colours have the same brightness (where grey matching sees nothing).
 */
export function edgeMap(pl: Planes): Gray {
  const { w, h } = pl;
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = Math.max(0, x - 1), xr = Math.min(w - 1, x + 1), yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
    let m = 0;
    for (const c of pl.p) {
      const gx = c[y * w + xr] - c[y * w + xl], gy = c[yd * w + x] - c[yu * w + x];
      const g = gx * gx + gy * gy;
      if (g > m) m = g;
    }
    d[y * w + x] = Math.sqrt(m);
  }
  return { w, h, d };
}

/** Edge matching needs a higher bar than grey matching: edge maps are sparse, and sparse maps correlate by chance more easily. */
export const EDGE_MATCH_AT = 0.6;

/**
 * The logo's main colours and the colours found in the same places on the creative.
 * Sampled only inside each colour area of the logo (away from its anti-aliased edges).
 */
export function logoColours(image: Rgba, logo: Rgba, box: { x: number; y: number; w: number; h: number }): { expected: string; found: string; share: number }[] {
  const lw = logo.w, lh = logo.h, ld = logo.data;
  const near = (i: number, c: number[]) => ld[i + 3] >= 250 && Math.abs(ld[i] - c[0]) + Math.abs(ld[i + 1] - c[1]) + Math.abs(ld[i + 2] - c[2]) < 48;
  const tops = dominantFromPixels(ld).filter((c) => c.share >= 0.1).slice(0, 2);
  const out: { expected: string; found: string; share: number }[] = [];
  const step = Math.max(1, Math.floor(Math.min(lw, lh) / 80));
  for (const t of tops) {
    const c = [1, 3, 5].map((i) => parseInt(t.hex.slice(i, i + 2), 16));
    let n = 0, r = 0, g = 0, b = 0;
    for (let y = 2; y < lh - 2; y += step) for (let x = 2; x < lw - 2; x += step) {
      const i = (y * lw + x) * 4;
      if (!near(i, c) || !near(i - 8, c) || !near(i + 8, c) || !near(i - 8 * lw, c) || !near(i + 8 * lw, c)) continue;
      const ix = Math.floor((box.x + (x / lw) * box.w) * image.w), iy = Math.floor((box.y + (y / lh) * box.h) * image.h);
      if (ix < 0 || iy < 0 || ix >= image.w || iy >= image.h) continue;
      const k = (iy * image.w + ix) * 4;
      r += image.data[k]; g += image.data[k + 1]; b += image.data[k + 2]; n++;
    }
    if (n < 10) continue;
    out.push({ expected: t.hex, found: hexOf(r / n, g / n, b / n), share: t.share });
  }
  return out;
}

const hexOf = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

/**
 * The full search used by the app, on colour pixels: grey matching first; if that finds nothing, matching on edges,
 * which survives a recolour. A found logo also reports its stretch and its colours against the Brand Kit file.
 */
export function findLogoRgba(image: Rgba, logo: Rgba, clear = CLEAR_SPACE): LogoMatch {
  const gray = toGray(image.data, image.w, image.h);
  let match = findLogo(gray, toGray(logo.data, logo.w, logo.h), clear);
  if (!match.found) {
    const COARSE = 120, FINE = 360;
    const pl = toPlanes(image, false);
    const coarse = edgeMap(resizePlanes(pl, COARSE, (image.h * COARSE) / image.w));
    const fineW = Math.min(FINE, image.w);
    const fineGray = resize(gray, fineW, (image.h * fineW) / image.w);
    const fine = edgeMap(resizePlanes(pl, fineW, fineGray.h));
    const lp = toPlanes(logo, true);
    const tpl = (w: number, h: number): Template => ({ ...edgeMap(resizePlanes(lp, w, h)), m: new Uint8Array(Math.round(w) * Math.round(h)).fill(1) });
    const e = done(search(coarse, fine, tpl, logo.h / logo.w, STRETCHES), fineGray, clear, true);
    // Keep the better-supported answer: an edge match only replaces a miss.
    if (e.found) match = e; else match = { found: false, score: Math.max(match.score, e.score) };
  }
  if (match.found && match.box) match.colours = logoColours(image, logo, match.box);
  return match;
}

/**
 * Clear space: the band around the logo, a set share of its height wide, should be plain background.
 * Returns the share of band pixels that differ clearly from the band's typical value. The image edge counts as clear.
 */
export function crowding(img: Gray, b: { x: number; y: number; w: number; h: number }, clear = CLEAR_SPACE): number {
  const m = Math.max(1, Math.round(b.h * clear));
  const vals: number[] = [];
  for (let y = b.y - m; y < b.y + b.h + m; y++) {
    if (y < 0 || y >= img.h) continue;
    for (let x = b.x - m; x < b.x + b.w + m; x++) {
      if (x < 0 || x >= img.w) continue;
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) continue;
      vals.push(img.d[y * img.w + x]);
    }
  }
  if (!vals.length) return 0;
  const sorted = [...vals].sort((a, c) => a - c);
  const median = sorted[sorted.length >> 1];
  const busy = vals.filter((v) => Math.abs(v - median) > 40).length;
  return Math.round((busy / vals.length) * 1000) / 1000;
}
