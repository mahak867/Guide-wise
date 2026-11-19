"use client";
import { dominantFromPixels } from "./colours";
import { findLogo, toGray, type LogoMatch, type Template } from "./logo";
// Runs in the browser: shrink the image, measure its dominant colours, and read any text in it (OCR).
// The server then checks the colours against the palette and the text against every rule and fact.

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
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("That file could not be read as an image."));
    img.src = src;
  });
}

/** Dominant colours of an image, measured on an 80-pixel copy (see colours.ts). */
export function dominantColours(img: HTMLImageElement): { hex: string; share: number }[] {
  const size = 80;
  const c = document.createElement("canvas");
  const scale = Math.min(1, size / Math.max(img.width, img.height));
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return dominantFromPixels(ctx.getImageData(0, 0, c.width, c.height).data);
}

function shrink(img: HTMLImageElement, max = 1100): { dataUrl: string; w: number; h: number } {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL("image/jpeg", 0.82), w: c.width, h: c.height };
}

let workerPromise: Promise<import("tesseract.js").Worker> | null = null;
async function ocr(src: string): Promise<string> {
  if (!workerPromise) {
    // Served from our own site (public/ocr), so it works where third-party CDNs are blocked.
    workerPromise = import("tesseract.js").then((t) =>
      t.createWorker("eng", 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr", langPath: "/ocr", gzip: true }),
    );
  }
  const worker = await workerPromise;
  const { data } = await worker.recognize(src);
  return data.text.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

function pixels(img: HTMLImageElement, max: number, flatten: boolean): Template {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  if (flatten) { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return toGray(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
}

const logoCache = new Map<string, Promise<Template | null>>();
function logoTemplate(src: string): Promise<Template | null> {
  if (!logoCache.has(src)) logoCache.set(src, load(src).then((i) => pixels(i, 400, false)).catch(() => null));
  return logoCache.get(src)!;
}

/** Search the image for the Brand Kit logo (plain code in the browser, no AI). */
async function locateLogo(img: HTMLImageElement, logoSrc?: string | null, clear?: number): Promise<LogoMatch | null> {
  if (!logoSrc) return null;
  const tpl = await logoTemplate(logoSrc);
  if (!tpl) return null;
  return findLogo(pixels(img, 1100, true), tpl, clear);
}

export async function analyseImage(file: Blob, name: string, onStep?: (s: string) => void, logoSrc?: string | null): Promise<ImageInput> {
  if (file.size > 8 * 1024 * 1024) throw new Error(`${name} is larger than 8 MB.`);
  const url = URL.createObjectURL(file);
  try {
    const img = await load(url);
    onStep?.("Measuring colours…");
    const colours = dominantColours(img);
    const small = shrink(img);
    onStep?.("Looking for the logo…");
    const logo = await locateLogo(img, logoSrc).catch(() => null);
    onStep?.("Reading text in the image…");
    let text = "";
    let ok = true;
    try {
      text = await Promise.race([
        ocr(small.dataUrl),
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), 45000)),
      ]);
    } catch {
      ok = false;
      workerPromise = null; // let the next image try again
    }
    return { name, alt: "", colours, ocr: text, ocr_ok: ok, logo, ...small };
  } finally {
    URL.revokeObjectURL(url);
  }
}
