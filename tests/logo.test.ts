import { describe, expect, it } from "vitest";
import sharp, { type OverlayOptions } from "sharp";
import { crowding, findLogo, findLogoRgba, toGray, type Rgba, type Template } from "../src/lib/logo";
import { logoHits } from "../src/lib/engine/visual";
import { SEED_RULES } from "../src/lib/seed";

async function load(path: string, max?: number): Promise<Template> {
  let s = sharp(path).ensureAlpha();
  if (max) s = s.resize({ width: max, fit: "inside" });
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  return toGray(new Uint8Array(data), info.width, info.height);
}

/** A synthetic creative: flat background, the logo pasted at (x, y) with width w, plus optional clutter. */
async function compose(bg: string, logoW: number, x: number, y: number, clutter?: { x: number; y: number; w: number; h: number }) {
  const logo = await sharp("public/brand/preppath-mark.png").resize({ width: logoW }).png().toBuffer();
  const layers: OverlayOptions[] = [{ input: logo, left: x, top: y }];
  if (clutter) {
    const box = await sharp({ create: { width: clutter.w, height: clutter.h, channels: 4, background: "#FFFFFF" } }).png().toBuffer();
    layers.push({ input: box, left: clutter.x, top: clutter.y });
  }
  const { data, info } = await sharp({ create: { width: 800, height: 800, channels: 4, background: bg } })
    .composite(layers).raw().toBuffer({ resolveWithObject: true });
  return toGray(new Uint8Array(data), info.width, info.height);
}

describe("logo check", async () => {
  const logo = await load("public/brand/preppath-mark.png");

  it("finds the mark on the corrected sample, with clear space", async () => {
    const r = findLogo(await load("public/sample-creative-fixed.png", 1100), logo);
    expect(r.found).toBe(true);
    expect(r.box!.x).toBeGreaterThan(0.05);
    expect(r.box!.x).toBeLessThan(0.1);
    expect(r.box!.w).toBeGreaterThan(0.1);
    expect(r.box!.w).toBeLessThan(0.14);
    expect(r.crowd!).toBeLessThan(0.1);
  });

  it("does not find it on the original sample, which has only the name in plain type", async () => {
    const r = findLogo(await load("public/sample-creative.png", 1100), logo);
    expect(r.found).toBe(false);
  });

  it("finds a small logo and reports its size", async () => {
    const r = findLogo(await compose("#16211F", 40, 600, 700), logo);
    expect(r.found).toBe(true);
    expect(r.box!.w).toBeGreaterThan(0.04);
    expect(r.box!.w).toBeLessThan(0.065);
  });

  it("measures crowding when other content sits inside the clear space", async () => {
    const r = findLogo(await compose("#0F6B5F", 160, 100, 100, { x: 265, y: 100, w: 200, h: 160 }), logo);
    expect(r.found).toBe(true);
    expect(r.crowd!).toBeGreaterThan(0.1);
  });

  it("treats the image edge as clear space", () => {
    const img = { w: 10, h: 10, d: new Float32Array(100).fill(80) };
    expect(crowding(img, { x: 0, y: 0, w: 4, h: 4 })).toBe(0);
  });
});

async function rgba(path: string | Buffer, max?: number): Promise<Rgba> {
  let s = sharp(path).ensureAlpha();
  if (max) s = s.resize({ width: max, fit: "inside" });
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), w: info.width, h: info.height };
}

/** The mark with its marigold replaced by another colour, and resized to w x h (fill: proportions not kept). */
async function variant(to: number[] | null, w: number, h: number): Promise<Buffer> {
  const { data, info } = await sharp("public/brand/preppath-mark.png").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (to) for (let i = 0; i < data.length; i += 4) {
    if (Math.hypot(data[i] - 242, data[i + 1] - 165, data[i + 2] - 65) < 60) { data[i] = to[0]; data[i + 1] = to[1]; data[i + 2] = to[2]; }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).resize({ width: w, height: h, fit: "fill" }).png().toBuffer();
}

async function scene(logo: Buffer, bg = "#0F6B5F"): Promise<Rgba> {
  const { data, info } = await sharp({ create: { width: 800, height: 800, channels: 4, background: bg } })
    .composite([{ input: logo, left: 80, top: 80 }]).raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), w: info.width, h: info.height };
}

describe("logo check: recoloured and stretched logos", async () => {
  const mark = await rgba("public/brand/preppath-mark.png");
  const rule = SEED_RULES.find((r) => r.id === "VIS-LOGO")!;
  const messages = (m: ReturnType<typeof findLogoRgba>) => logoHits(rule, m, "image:1", "Image 1").map((f) => f.message);

  it("a correct logo: found, true proportions, its own colours, no finding", async () => {
    const m = findLogoRgba(await scene(await variant(null, 110, 110)), mark);
    expect(m.found).toBe(true);
    expect(Math.abs(m.stretch! - 1)).toBeLessThan(0.05);
    expect(m.colours![0]).toMatchObject({ expected: "#F2A541" });
    expect(messages(m)).toEqual([]);
  });

  it("a logo recoloured red: found by grey matching, reported as recoloured", async () => {
    const m = findLogoRgba(await scene(await variant([229, 57, 53], 110, 110)), mark);
    expect(m.found).toBe(true);
    expect(m.by).toBeUndefined();
    expect(messages(m)).toEqual([expect.stringMatching(/recoloured: its dominant colour is #E53935, expected #F2A541/)]);
  });

  it("a logo recoloured to the same brightness as its line: grey matching sees nothing, edge matching finds it", async () => {
    const img = await scene(await variant([138, 0, 0], 110, 110));
    expect(findLogo(toGray(img.data, img.w, img.h), toGray(mark.data, mark.w, mark.h)).found).toBe(false);
    const m = findLogoRgba(img, mark);
    expect(m.found).toBe(true);
    expect(m.by).toBe("edges");
    expect(messages(m).join(" ")).toMatch(/recoloured: its dominant colour is #8[0-9A-F]0[0-9A-F]0[0-9A-F], expected #F2A541/);
  });

  it("a logo stretched 15% wider, or 13% narrower, is found and reported as stretched", async () => {
    const wide = findLogoRgba(await scene(await variant(null, 126, 110)), mark);
    expect(wide.stretch).toBeGreaterThan(1.08);
    expect(messages(wide)).toEqual([expect.stringMatching(/stretched by 1\d%: it is wider/)]);
    const narrow = findLogoRgba(await scene(await variant(null, 110, 126), "#16211F"), mark);
    expect(narrow.stretch).toBeLessThan(0.92);
    expect(messages(narrow)).toEqual([expect.stringMatching(/stretched by 1\d%: it is narrower/)]);
  });

  it("the demo creatives give the same answers through the colour path", async () => {
    const fixed = findLogoRgba(await rgba("public/sample-creative-fixed.png", 1100), mark);
    expect(fixed.found).toBe(true);
    expect(messages(fixed)).toEqual([]);
    expect(findLogoRgba(await rgba("public/sample-creative.png", 1100), mark).found).toBe(false);
  });
});
