// Where a problem sits in a creative. Pure functions on RGBA pixels, run in the browser on canvas pixels and in tests on
// decoded PNGs: the contrast of each line of text read by OCR, and the areas each dominant colour covers.
// Boxes are fractions of the image width and height (x, y, w, h from the top left), so they fit any display size.

import type { PSM } from "tesseract.js";
import type { LogoMatch } from "./logo";
import type { Finding } from "./types";

export interface Box { x: number; y: number; w: number; h: number }
/** A line of text read by OCR, where it sits, and its measured colours. */
export interface TextLine {
  text: string;
  /** OCR confidence, 0 to 100. */
  conf: number;
  box: Box;
  /** WCAG contrast ratio of the text colour against the background right around the line. */
  contrast?: number;
  fg?: string;
  bg?: string;
}
/** A connected area of one dominant colour. */
export interface ColourArea { hex: string; share: number; box: Box }

const hexOf = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function lin(c: number) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG 2.2 contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };

/**
 * Measure one line of text: the background is the median colour of a thin band just outside the line's box, the text
 * colour the mean of the quarter of pixels inside the box that differ most from it (the solid strokes, not their
 * anti-aliased edges). Null when nothing inside the box stands out from the background.
 */
export function lineContrast(data: Uint8ClampedArray | Uint8Array, w: number, h: number, box: Box): { contrast: number; fg: string; bg: string } | null {
  const x0 = Math.max(0, Math.floor(box.x * w)), y0 = Math.max(0, Math.floor(box.y * h));
  const x1 = Math.min(w, Math.ceil((box.x + box.w) * w)), y1 = Math.min(h, Math.ceil((box.y + box.h) * h));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  const m = Math.max(2, Math.round((y1 - y0) * 0.2));
  const ring: number[][] = [[], [], []];
  for (let y = y0 - m; y < y1 + m; y++) {
    if (y < 0 || y >= h) continue;
    for (let x = x0 - m; x < x1 + m; x++) {
      if (x < 0 || x >= w || (x >= x0 && x < x1 && y >= y0 && y < y1)) continue;
      const k = (y * w + x) * 4;
      ring[0].push(data[k]); ring[1].push(data[k + 1]); ring[2].push(data[k + 2]);
    }
  }
  if (!ring[0].length) return null;
  const bg = ring.map(median);
  const diff: { d: number; k: number }[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const k = (y * w + x) * 4;
    const d = Math.abs(data[k] - bg[0]) + Math.abs(data[k + 1] - bg[1]) + Math.abs(data[k + 2] - bg[2]);
    if (d > 24) diff.push({ d, k });
  }
  if (diff.length < Math.max(4, (x1 - x0) * (y1 - y0) * 0.02)) return null;
  diff.sort((a, b) => b.d - a.d);
  const top = diff.slice(0, Math.max(3, Math.round(diff.length / 4)));
  const fg = [0, 1, 2].map((c) => top.reduce((s, p) => s + data[p.k + c], 0) / top.length);
  const fgHex = hexOf(fg[0], fg[1], fg[2]), bgHex = hexOf(bg[0], bg[1], bg[2]);
  return { contrast: Math.round(contrastRatio(fgHex, bgHex) * 100) / 100, fg: fgHex, bg: bgHex };
}

/**
 * Where each dominant colour sits: every pixel is given to the nearest dominant colour (if it is close to one), then
 * connected areas are found. Returns up to three areas per colour, each at least 1% of the image, largest first.
 * Meant for a small copy of the image (about 80 pixels across).
 */
export function colourAreas(data: Uint8ClampedArray | Uint8Array, w: number, h: number, colours: { hex: string }[]): ColourArea[] {
  const cols = colours.map((c) => rgbOf(c.hex));
  const label = new Int8Array(w * h).fill(-1);
  for (let j = 0; j < w * h; j++) {
    const k = j * 4;
    if (data[k + 3] < 128) continue;
    let best = -1, bd = 60;
    cols.forEach((c, i) => {
      const d = Math.hypot(data[k] - c[0], data[k + 1] - c[1], data[k + 2] - c[2]);
      if (d < bd) { bd = d; best = i; }
    });
    label[j] = best;
  }
  const seen = new Uint8Array(w * h);
  const out: ColourArea[] = [];
  const min = Math.max(4, w * h * 0.01);
  const stack: number[] = [];
  colours.forEach((c, ci) => {
    const found: ColourArea[] = [];
    for (let s = 0; s < w * h; s++) {
      if (seen[s] || label[s] !== ci) continue;
      let n = 0, minX = w, minY = h, maxX = 0, maxY = 0;
      stack.push(s); seen[s] = 1;
      while (stack.length) {
        const p = stack.pop()!;
        const x = p % w, y = (p - x) / w;
        n++;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (!seen[q] && label[q] === ci) { seen[q] = 1; stack.push(q); }
        }
      }
      if (n >= min) found.push({ hex: c.hex, share: Math.round((n / (w * h)) * 1000) / 1000, box: { x: minX / w, y: minY / h, w: (maxX - minX + 1) / w, h: (maxY - minY + 1) / h } });
    }
    out.push(...found.sort((a, b) => b.share - a.share).slice(0, 3));
  });
  return out;
}

/**
 * Estimated type size in pixels on a 1080-pixel-wide post. An OCR box runs from the top of the tallest letter to the
 * bottom of the lowest, so its height depends on the letters in the line: capitals, digits and letters like b, d, h
 * reach about 0.72 of the type size above the baseline (only x-height letters about 0.5), and g, j, p, q, y reach about
 * 0.22 below it. This is an estimate for a typical typeface, not a measurement of the font.
 */
export function textPx(line: Pick<TextLine, "text" | "box">, imgW: number, imgH: number): number {
  const tall = /[A-Z0-9bdfhklt]/.test(line.text) ? 0.72 : 0.5;
  const low = /[gjpqy]/.test(line.text) ? 0.22 : 0;
  return Math.round(((line.box.h * imgH * (1080 / imgW)) / (tall + low)) * 10) / 10;
}

/**
 * OCR settings shared by the browser and the image evaluation: sparse text (Tesseract's page mode 11) instead of
 * tesseract.js's default of one uniform block (mode 6). A creative is scattered text. In single-block mode a line of
 * small print far from the headline was dropped entirely (so its size could never be checked), and on the demo
 * creative "Rohan, AIR 23" in a white box was read as "Rehan AIR 25"; automatic layout (mode 3) dropped that line.
 * Sparse mode read every line of the three demo creatives.
 */
export const OCR_PARAMS = { tessedit_pageseg_mode: "11" as PSM.SPARSE_TEXT };

/** OCR output lines (tesseract.js blocks) to stored lines: normalised boxes, each with its contrast measured on the same pixels. */
export function linesFromOcr(raw: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[], data: Uint8ClampedArray | Uint8Array, w: number, h: number): TextLine[] {
  return raw.map((l) => ({ text: l.text.replace(/\s+/g, " ").trim(), conf: Math.round(l.confidence), bbox: l.bbox })).filter((l) => l.text).slice(0, 40).map((l) => {
    const box = { x: l.bbox.x0 / w, y: l.bbox.y0 / h, w: (l.bbox.x1 - l.bbox.x0) / w, h: (l.bbox.y1 - l.bbox.y0) / h };
    return { text: l.text, conf: l.conf, box, ...(lineContrast(data, w, h, box) ?? {}) };
  });
}

/** A sensible box: inside the image and not empty. */
export function validBox(b: unknown): Box | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  const n = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0));
  const x = n(o.x), y = n(o.y), w = Math.min(n(o.w), 1 - x), h = Math.min(n(o.h), 1 - y);
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/**
 * Where a finding on an image sits, worked out from what the browser measured: the logo box for a logo finding, the
 * largest area of a colour for a colour finding, the line that holds the quoted words for a text finding. Null when
 * the finding is about the whole image (alt text, people) or nothing was measured. Findings are stored without their
 * region, so the review page calls this again with the stored image. `index` is the image's position, from 0.
 */
export function regionFor(img: { logo?: LogoMatch | null; lines?: TextLine[]; areas?: ColourArea[] }, index: number, f: Pick<Finding, "quote" | "region">): Box | null {
  if (f.region) return f.region;
  if (f.quote === `Image ${index + 1}: logo`) return img.logo?.found && img.logo.box ? img.logo.box : null;
  if (/^#[0-9A-F]{6}$/.test(f.quote)) return (img.areas ?? []).filter((a) => a.hex === f.quote).sort((a, b) => b.share - a.share)[0]?.box ?? null;
  const q = f.quote.toLowerCase();
  const lines = img.lines ?? [];
  const line = lines.find((l) => l.text.toLowerCase().includes(q)) ?? lines.find((l) => l.text.length >= 4 && q.includes(l.text.toLowerCase()));
  return line?.box ?? null;
}

/** What the image inspector draws: one entry per marked area, with the findings that point at it. */
export interface InspectorRegion {
  key: string;
  kind: "text" | "colour" | "logo";
  box: Box;
  /** Short label drawn on the image, e.g. "3.1:1 · ~14px", "#E53935" or "Logo · 12% wide". */
  label: string;
  /** One sentence for the list and for screen readers. */
  summary: string;
  /** The findings at this area (their messages). Empty for the logo box when nothing is wrong with it. */
  messages: string[];
  /** Logo only: the clear-space band, as a box around the logo. */
  clear?: Box;
}

export interface InspectorImage {
  w?: number;
  h?: number;
  logo?: LogoMatch | null;
  lines?: TextLine[];
  areas?: ColourArea[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * The regions to draw for one image: every finding on it that has a place (failing text lines with their contrast
 * and size, off-palette colour areas with their hex), plus the logo box with its size and clear space whenever the
 * logo was found. `findings` may hold the whole draft's findings; only those at image:index+1 are used.
 */
export function inspectorRegions(img: InspectorImage, index: number, findings: Pick<Finding, "quote" | "region" | "message" | "location" | "rule_id">[], opts: { minPx?: number; minContrast?: number; clear?: number } = {}): InspectorRegion[] {
  const minPx = opts.minPx ?? 16, minContrast = opts.minContrast ?? 4.5, clear = opts.clear ?? 0.25;
  const mine = findings.filter((f) => f.location === `image:${index + 1}`);
  const out = new Map<string, InspectorRegion>();
  const logoQuote = `Image ${index + 1}: logo`;
  const logo = img.logo?.found && img.logo.box ? img.logo.box : null;
  if (logo) {
    const aspect = img.w && img.h ? img.h / img.w : 1;
    const my = logo.h * clear, mx = my * aspect;
    const cl = { x: Math.max(0, logo.x - mx), y: Math.max(0, logo.y - my), w: 0, h: 0 };
    cl.w = Math.min(1, logo.x + logo.w + mx) - cl.x; cl.h = Math.min(1, logo.y + logo.h + my) - cl.y;
    const crowd = img.logo!.crowd ?? 0;
    out.set("logo", {
      key: "logo", kind: "logo", box: logo, clear: cl,
      label: `Logo · ${pct(logo.w)} wide`,
      summary: `Logo found at ${pct(logo.w)} of the image width; ${crowd > 0.1 ? `${pct(crowd)} of its clear space is taken by other content` : "its clear space is free"}.`,
      messages: [],
    });
  }
  for (const f of mine) {
    const box = regionFor(img, index, f);
    if (!box) continue;
    if (f.quote === logoQuote) {
      const r = out.get("logo");
      if (r) r.messages.push(f.message);
      continue;
    }
    if (/^#[0-9A-F]{6}$/.test(f.quote)) {
      const key = `colour:${f.quote}`;
      const r = out.get(key) ?? { key, kind: "colour" as const, box, label: f.quote, summary: `Area of ${f.quote}, a colour outside the brand palette.`, messages: [] };
      r.messages.push(f.message);
      out.set(key, r);
      continue;
    }
    const key = `text:${box.x.toFixed(4)},${box.y.toFixed(4)}`;
    const line = (img.lines ?? []).find((l) => l.box.x === box.x && l.box.y === box.y && l.box.w === box.w && l.box.h === box.h);
    const parts: string[] = [];
    if (line?.contrast !== undefined && line.contrast < minContrast) parts.push(`${line.contrast.toFixed(1)}:1`);
    const px = line && img.w && img.h ? textPx(line, img.w, img.h) : null;
    if (px !== null && px < minPx) parts.push(`~${Math.round(px)}px`);
    const r = out.get(key) ?? {
      key, kind: "text" as const, box, label: parts.join(" · ") || "Text",
      summary: `Text "${(line?.text ?? f.quote).slice(0, 60)}"${line?.contrast !== undefined ? `, contrast ${line.contrast.toFixed(1)}:1` : ""}${px !== null ? `, about ${Math.round(px)}px at 1080 wide` : ""}.`,
      messages: [],
    };
    r.messages.push(f.message);
    out.set(key, r);
  }
  // Text first (most often the problem), then colours, then the logo.
  const order = { text: 0, colour: 1, logo: 2 };
  return [...out.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.box.y - b.box.y);
}
