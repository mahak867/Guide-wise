import { describe, expect, it } from "vitest";
import sharp, { type OverlayOptions } from "sharp";
import { crowding, findLogo, toGray, type Template } from "../src/lib/logo";

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
