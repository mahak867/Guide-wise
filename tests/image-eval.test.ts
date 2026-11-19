// Image evaluation: generated creatives with planted colour, contrast and logo errors, and clean ones, scored with the
// same code the app runs (colours.ts, logo.ts, visual.ts). Run: npx vitest run tests/image-eval.test.ts
import { describe, expect, it } from "vitest";
import sharp, { type OverlayOptions } from "sharp";
import { dominantFromPixels } from "../src/lib/colours";
import { findLogo, toGray } from "../src/lib/logo";
import { contrastHits, logoHits, paletteHits } from "../src/lib/engine/visual";
import { SEED_KIT, SEED_RULES } from "../src/lib/seed";

const rule = (id: string) => SEED_RULES.find((r) => r.id === id)!;
type Case = { name: string; bg: string; text: string; logo?: number; crowd?: boolean; expect: ("palette" | "contrast" | "logo")[] };
// White text contrast, WCAG formula, computed separately: red #E53935 4.23, blue #1E88E5 3.68, orange #FF6D00 2.82 (all below 4.5,
// so they are planted contrast errors too); purple #6A1B9A 9.39, pink #D81B60 4.95, teal 6.39, ink 16.52 (pass).
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
];

async function render(c: Case) {
  const rect = (w: number, h: number, colour: string) => sharp({ create: { width: w, height: h, channels: 4, background: colour } }).png().toBuffer();
  const layers: OverlayOptions[] = [
    { input: await rect(560, 90, c.text), left: 60, top: 300 }, { input: await rect(480, 70, c.text), left: 60, top: 420 },
    { input: await rect(360, 50, c.text), left: 60, top: 520 }, { input: await rect(300, 40, c.text), left: 60, top: 700 },
  ];
  if (c.logo) {
    layers.push({ input: await sharp("public/brand/preppath-mark.png").resize({ width: c.logo }).png().toBuffer(), left: 60, top: 60 });
    if (c.crowd) layers.push({ input: await rect(220, c.logo, c.text), left: 60 + c.logo + 4, top: 60 });
  }
  const { data, info } = await sharp({ create: { width: 800, height: 800, channels: 4, background: c.bg } }).composite(layers).raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), w: info.width, h: info.height };
}

async function small(img: { data: Uint8Array; w: number; h: number }) {
  const { data } = await sharp(Buffer.from(img.data), { raw: { width: img.w, height: img.h, channels: 4 } }).resize(80, 80).raw().toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}

describe("image evaluation", async () => {
  const logo = await (async () => { const { data, info } = await sharp("public/brand/preppath-mark.png").ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return toGray(new Uint8Array(data), info.width, info.height); })();
  it("catches planted colour, contrast and logo errors with few false alarms", async () => {
    let planted = 0, caught = 0, falseAlarms = 0, checks = 0;
    const rows: string[] = [];
    for (const c of CASES) {
      const img = await render(c);
      const colours = dominantFromPixels(await small(img));
      const match = findLogo(toGray(img.data, img.w, img.h), logo);
      const got = new Set<string>();
      if (paletteHits(rule("VIS-PAL"), colours, SEED_KIT, "image:1", "Image").length) got.add("palette");
      if (contrastHits(rule("VIS-CON"), colours, "image:1", "Image").length) got.add("contrast");
      if (logoHits(rule("VIS-LOGO"), match, "image:1", "Image").length) got.add("logo");
      for (const k of ["palette", "contrast", "logo"] as const) {
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
  }, 60_000);
});
