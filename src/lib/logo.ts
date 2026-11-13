// Finds the Brand Kit logo inside a creative, with no AI: masked normalised cross-correlation
// over a range of sizes, searched coarse-to-fine. Pure functions on greyscale pixels, so the same
// code runs in the browser (on canvas pixels) and in tests (on decoded PNGs).

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

/**
 * Search for the logo between 4% and 45% of the image width.
 * Coarse pass on a 120-pixel-wide copy, then a fine pass at 360 pixels around the three best candidates.
 */
export function findLogo(image: Gray, logo: Template, clear = CLEAR_SPACE): LogoMatch {
  const aspect = logo.h / logo.w;
  const COARSE = 120, FINE = 360;
  const coarse = resize(image, COARSE, (image.h * COARSE) / image.w);
  const cands: (Hit & { f: number })[] = [];
  for (let f = 0.04; f <= 0.45; f *= 1.12) {
    const tw = Math.round(f * COARSE), th = Math.round(tw * aspect);
    if (tw < 5 || th < 5 || tw > coarse.w || th > coarse.h) continue;
    const p = prepare(resize(logo, tw, th));
    if (!p) continue;
    cands.push({ ...scan(coarse, p), f });
  }
  cands.sort((a, b) => b.score - a.score);
  const fineW = Math.min(FINE, image.w);
  const fine = resize(image, fineW, (image.h * fineW) / image.w);
  const k = fine.w / coarse.w;
  let best: Hit = { score: 0, x: 0, y: 0, w: 0, h: 0 };
  for (const c of cands.slice(0, 3)) {
    for (const g of [1 / 1.06, 1, 1.06]) {
      const tw = Math.round(c.f * g * fine.w), th = Math.round(tw * aspect);
      if (tw > fine.w || th > fine.h) continue;
      const p = prepare(resize(logo, tw, th));
      if (!p) continue;
      const cx = Math.round(c.x * k), cy = Math.round(c.y * k), r = Math.ceil(k) + 2;
      const h = scan(fine, p, cx - r, cy - r, cx + r, cy + r);
      if (h.score > best.score) best = h;
    }
  }
  const score = Math.round(best.score * 1000) / 1000;
  if (score < MATCH_AT) return { found: false, score };
  return {
    found: true, score,
    box: { x: best.x / fine.w, y: best.y / fine.h, w: best.w / fine.w, h: best.h / fine.h },
    crowd: crowding(fine, best, clear),
  };
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
