"use client";
import { dominantFromPixels } from "./colours";
import { findLogoRgba, type LogoMatch, type Rgba } from "./logo";
import { colourAreas, linesFromOcr, OCR_PARAMS, type ColourArea, type TextLine } from "./regions";
// Runs in the browser: shrink the image, measure its dominant colours and where they sit, find the logo, and read any
// text in it (OCR) with where each line sits and its contrast. The server then judges all of it against the Brand Kit.

export interface ImageInput {
  name: string;
  alt: string;
  dataUrl: string; // downscaled JPEG, kept with the draft
  w: number;
  h: number;
  colours: { hex: string; share: number }[];
  ocr: string;
  ocr_ok: boolean;
  /** Where the Brand Kit logo was found, if the kit has one. */
  logo?: LogoMatch | null;
  /** Each line OCR read: its text, box and measured contrast. */
  lines?: TextLine[];
  /** Where each dominant colour sits. */
  areas?: ColourArea[];
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("That file could not be read as an image."));
    img.src = src;
  });
}

/** Dominant colours of an image, and where each sits, measured on an 80-pixel copy (see colours.ts and regions.ts). */
export function dominantColours(img: HTMLImageElement): { colours: { hex: string; share: number }[]; areas: ColourArea[] } {
  const { data, w, h } = rgba(img, 80, false);
  const colours = dominantFromPixels(data);
  return { colours, areas: colourAreas(data, w, h, colours) };
}

function rgba(img: HTMLImageElement, max: number, flatten: boolean): Rgba & { canvas: HTMLCanvasElement } {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  if (flatten) { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, canvas: c };
}

let workerPromise: Promise<import("tesseract.js").Worker> | null = null;
async function ocr(src: string): Promise<{ text: string; lines: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }> {
  if (!workerPromise) {
    // Served from our own site (public/ocr), so it works where third-party CDNs are blocked.
    workerPromise = import("tesseract.js").then(async (t) => {
      const w = await t.createWorker("eng", 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr", langPath: "/ocr", gzip: true });
      await w.setParameters(OCR_PARAMS);
      return w;
    });
  }
  const worker = await workerPromise;
  const { data } = await worker.recognize(src, {}, { text: true, blocks: true });
  const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
  return { text: data.text.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim(), lines };
}

const logoCache = new Map<string, Promise<Rgba | null>>();
function logoPixels(src: string): Promise<Rgba | null> {
  if (!logoCache.has(src)) logoCache.set(src, load(src).then((i) => rgba(i, 400, false)).catch(() => null));
  return logoCache.get(src)!;
}

/** Search the image for the Brand Kit logo (plain code in the browser, no AI). */
async function locateLogo(px: Rgba, logoSrc?: string | null, clear?: number): Promise<LogoMatch | null> {
  if (!logoSrc) return null;
  const tpl = await logoPixels(logoSrc);
  if (!tpl) return null;
  return findLogoRgba(px, tpl, clear);
}

export async function analyseImage(file: Blob, name: string, onStep?: (s: string) => void, logoSrc?: string | null): Promise<ImageInput> {
  if (file.size > 8 * 1024 * 1024) throw new Error(`${name} is larger than 8 MB.`);
  const url = URL.createObjectURL(file);
  try {
    const img = await load(url);
    onStep?.("Measuring colours…");
    const { colours, areas } = dominantColours(img);
    const px = rgba(img, 1100, true);
    const small = { dataUrl: px.canvas.toDataURL("image/jpeg", 0.82), w: px.w, h: px.h };
    onStep?.("Looking for the logo…");
    const logo = await locateLogo(px, logoSrc).catch(() => null);
    onStep?.("Reading text in the image…");
    let text = "";
    let lines: TextLine[] = [];
    let ok = true;
    try {
      const read = await Promise.race([
        ocr(small.dataUrl),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 45000)),
      ]);
      text = read.text;
      // Each line's box on the same pixels OCR read, and its contrast measured there.
      lines = linesFromOcr(read.lines, px.data, px.w, px.h);
    } catch {
      ok = false;
      workerPromise = null; // let the next image try again
    }
    return { name, alt: "", colours, areas, ocr: text, ocr_ok: ok, logo, lines, ...small };
  } finally {
    URL.revokeObjectURL(url);
  }
}
