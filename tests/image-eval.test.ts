// Image evaluation: generated creatives with planted colour, contrast, logo and text-size errors, and clean ones, scored
// with the same code the app runs (colours.ts, logo.ts, regions.ts, visual.ts). Run: npx vitest run tests/image-eval.test.ts
// The first 20 creatives use flat bars for text. The 8 after them carry real text (rendered by sharp from SVG) and are
// read by the same OCR engine the browser uses (tesseract.js, English data from node_modules), so text size and
// per-line contrast are measured on real OCR boxes.
import { afterAll, describe, expect, it } from "vitest";
import sharp, { type OverlayOptions } from "sharp";
import { createWorker, type Worker } from "tesseract.js";
import { dominantFromPixels } from "../src/lib/colours";
import { findLogoRgba, type Rgba } from "../src/lib/logo";
import { linesFromOcr, OCR_PARAMS } from "../src/lib/regions";
import { contrastHits, legibilityHits, logoHits, paletteHits } from "../src/lib/engine/visual";
import { SEED_KIT, SEED_RULES } from "../src/lib/seed";

const rule = (id: string) => SEED_RULES.find((r) => r.id === id)!;
type Check = "palette" | "contrast" | "logo" | "legibility";
type LogoVariant = "red" | "same-brightness" | { w: number; h: number };
type Case = {
  name: string; bg: string; text: string; logo?: number; crowd?: boolean; expect: Check[];
  /** Real text lines (font size in pixels on the 1080-pixel creative); turns on OCR and the text-size check. */
  words?: { text: string; size: number; y: number }[];
  variant?: LogoVariant;
};
// White text contrast, WCAG formula, computed separately: red #E53935 4.23, blue #1E88E5 3.68, orange #FF6D00 2.82 (all below 4.5,
// so they are planted contrast errors too); purple #6A1B9A 9.39, pink #D81B60 4.95, teal 6.39, ink 16.52 (pass).
const HEAD = [
  { text: "December batch starts", size: 60, y: 420 },
  { text: "Join the JEE programme in Chennai", size: 40, y: 520 },
];
const CASES: Case[] = [
  { name: "clean teal", bg: "#0F6B5F", text: "#FFFFFF", logo: 110, expect: [] },
  { name: "clean ink", bg: "#16211F", text: "#FFFFFF", logo: 120, expect: [] },
  { name: "clean mist", bg: "#EEF3F1", text: "#16211F", logo: 100, expect: [] },
  { name: "clean white", bg: "#FFFFFF", text: "#0F6B5F", logo: 96, expect: [] },
  { name: "clean teal, big logo", bg: "#0F6B5F", text: "#FFFFFF", logo: 180, expect: [] },
  { name: "off-palette red", bg: "#E53935", text: "#FFFFFF", logo: 110, expect: ["palette", "contrast"] },
  { name: "off-palette blue", bg: "#1E88E5", text: "#FFFFFF", logo: 110, expect: ["palette", "contrast"] },
  { name: "off-palette purple", bg: "#6A1B9A", text: "#FFFFFF", logo: 110, expect: ["palette"] },
  { name: "off-palette orange", bg: "#FF6D00", text: "#FFFFFF", logo: 110, expect: ["palette", "contrast"] },
  { name: "off-palette pink", bg: "#D81B60", text: "#FFFFFF", logo: 110, expect: ["palette"] },
  { name: "low contrast marigold", bg: "#F2A541", text: "#FFFFFF", logo: 110, expect: ["contrast"] },
  { name: "low contrast teal on ink", bg: "#16211F", text: "#0F6B5F", logo: 110, expect: ["contrast"] },
  { name: "low contrast mist on white", bg: "#FFFFFF", text: "#F2A541", logo: 110, expect: ["contrast"] },
  { name: "logo missing (teal)", bg: "#0F6B5F", text: "#FFFFFF", expect: ["logo"] },
  { name: "logo missing (ink)", bg: "#16211F", text: "#FFFFFF", expect: ["logo"] },
  { name: "logo too small", bg: "#0F6B5F", text: "#FFFFFF", logo: 34, expect: ["logo"] },
  { name: "logo too small (mist)", bg: "#EEF3F1", text: "#16211F", logo: 36, expect: ["logo"] },
  { name: "logo crowded", bg: "#0F6B5F", text: "#FFFFFF", logo: 120, crowd: true, expect: ["logo"] },
  { name: "logo crowded (ink)", bg: "#16211F", text: "#FFFFFF", logo: 120, crowd: true, expect: ["logo"] },
  { name: "red and no logo", bg: "#E53935", text: "#FFFFFF", expect: ["palette", "contrast", "logo"] },
  // Real text, read by OCR.
  { name: "text: correct logo", bg: "#0F6B5F", text: "#FFFFFF", logo: 130, words: [...HEAD, { text: "Fees as listed on the website", size: 24, y: 960 }], expect: [] },
  { name: "text: correct logo, 18px small print (ink)", bg: "#16211F", text: "#FFFFFF", logo: 130, words: [...HEAD, { text: "Seats are limited at every centre", size: 18, y: 960 }], expect: [] },
  { name: "text: logo recoloured red", bg: "#0F6B5F", text: "#FFFFFF", logo: 130, variant: "red", words: HEAD, expect: ["logo"] },
  { name: "text: logo recoloured, same brightness", bg: "#0F6B5F", text: "#FFFFFF", logo: 130, variant: "same-brightness", words: HEAD, expect: ["logo"] },
  { name: "text: logo stretched 15% wide", bg: "#0F6B5F", text: "#FFFFFF", logo: 130, variant: { w: 150, h: 130 }, words: HEAD, expect: ["logo"] },
  { name: "text: logo squashed 13% narrow (ink)", bg: "#16211F", text: "#FFFFFF", logo: 130, variant: { w: 130, h: 150 }, words: HEAD, expect: ["logo"] },
  { name: "text: 14px small print", bg: "#0F6B5F", text: "#FFFFFF", logo: 130, words: [...HEAD, { text: "Scholarship test on Sunday at all centres", size: 14, y: 960 }], expect: ["legibility"] },
  { name: "text: 14px small print (ink)", bg: "#16211F", text: "#FFFFFF", logo: 130, words: [...HEAD, { text: "Results based on the 2025 batch at Chennai", size: 14, y: 980 }], expect: ["legibility"] },
];

const MARK = "public/brand/preppath-mark.png";

/** The Brand Kit mark with its marigold replaced: by red, or by a dark red of the same brightness as the ink line. */
async function variantLogo(v: LogoVariant, width: number): Promise<Buffer> {
  if (typeof v === "object") return sharp(MARK).resize({ width: v.w, height: v.h, fit: "fill" }).png().toBuffer();
  const to = v === "red" ? [229, 57, 53] : [138, 0, 0];
  const { data, info } = await sharp(MARK).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (Math.hypot(data[i] - 242, data[i + 1] - 165, data[i + 2] - 65) < 60) { data[i] = to[0]; data[i + 1] = to[1]; data[i + 2] = to[2]; }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).resize({ width }).png().toBuffer();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

async function render(c: Case): Promise<Rgba> {
  const rect = (w: number, h: number, colour: string) => sharp({ create: { width: w, height: h, channels: 4, background: colour } }).png().toBuffer();
  const size = c.words ? 1080 : 800;
  const layers: OverlayOptions[] = c.words
    ? [{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">${c.words.map((w) => `<text x="80" y="${w.y}" font-family="DejaVu Sans, sans-serif" font-size="${w.size}" fill="${c.text}">${esc(w.text)}</text>`).join("")}</svg>`), left: 0, top: 0 }]
    : [
      { input: await rect(560, 90, c.text), left: 60, top: 300 }, { input: await rect(480, 70, c.text), left: 60, top: 420 },
      { input: await rect(360, 50, c.text), left: 60, top: 520 }, { input: await rect(300, 40, c.text), left: 60, top: 700 },
    ];
  if (c.logo) {
    const at = c.words ? 80 : 60;
    const input = c.variant ? await variantLogo(c.variant, c.logo) : await sharp(MARK).resize({ width: c.logo }).png().toBuffer();
    layers.push({ input, left: at, top: at });
    if (c.crowd) layers.push({ input: await rect(220, c.logo, c.text), left: at + c.logo + 4, top: at });
  }
  const { data, info } = await sharp({ create: { width: size, height: size, channels: 4, background: c.bg } }).composite(layers).raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), w: info.width, h: info.height };
}

async function small(img: Rgba) {
  const { data } = await sharp(Buffer.from(img.data), { raw: { width: img.w, height: img.h, channels: 4 } }).resize(80, 80).raw().toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}

describe("image evaluation", async () => {
  const logo: Rgba = await (async () => { const { data, info } = await sharp(MARK).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8Array(data), w: info.width, h: info.height }; })();
  let worker: Worker | null = null;
  afterAll(async () => { await worker?.terminate(); });

  it("catches planted colour, contrast, logo and text-size errors with few false alarms", async () => {
    worker = await createWorker("eng", 1, { langPath: "node_modules/@tesseract.js-data/eng/4.0.0_best_int", gzip: true, cacheMethod: "none" });
    await worker.setParameters(OCR_PARAMS);
    let planted = 0, caught = 0, falseAlarms = 0, checks = 0;
    const rows: string[] = [];
    for (const c of CASES) {
      const img = await render(c);
      const colours = dominantFromPixels(await small(img));
      const match = findLogoRgba(img, logo);
      let lines;
      if (c.words) {
        const png = await sharp(Buffer.from(img.data), { raw: { width: img.w, height: img.h, channels: 4 } }).png().toBuffer();
        const { data } = await worker.recognize(png, {}, { text: true, blocks: true });
        lines = linesFromOcr((data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)), img.data, img.w, img.h);
      }
      const got = new Set<Check>();
      if (paletteHits(rule("VIS-PAL"), colours, SEED_KIT, "image:1", "Image").length) got.add("palette");
      if (contrastHits(rule("VIS-CON"), colours, "image:1", "Image", lines).length) got.add("contrast");
      if (logoHits(rule("VIS-LOGO"), match, "image:1", "Image").length) got.add("logo");
      if (lines && legibilityHits(rule("VIS-TEXT"), { w: img.w, h: img.h, lines }, "image:1", "Image").length) got.add("legibility");
      // The text-size check only counts where there is real text to read.
      for (const k of (["palette", "contrast", "logo", "legibility"] as const).filter((k) => k !== "legibility" || c.words)) {
        checks++;
        const want = c.expect.includes(k), has = got.has(k);
        if (want) { planted++; if (has) caught++; else rows.push(`missed ${k}: ${c.name}`); }
        else if (has) { falseAlarms++; rows.push(`false alarm ${k}: ${c.name}`); }
      }
    }
    const clean = checks - planted;
    console.log(`image eval: ${CASES.length} creatives, ${planted} planted errors, ${caught} caught (${Math.round((caught / planted) * 100)}%), ${falseAlarms} false alarms in ${clean} clean checks${rows.length ? "\n  " + rows.join("\n  ") : ""}`);
    expect(caught / planted).toBeGreaterThanOrEqual(0.85);
    expect(falseAlarms).toBeLessThanOrEqual(2);
  }, 120_000);
});
