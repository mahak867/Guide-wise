// Where the problem is: line contrast, colour areas, text size, regions on findings, the verifier, and the inspector.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { colourAreas, contrastRatio, inspectorRegions, lineContrast, regionFor, textPx, type TextLine } from "../src/lib/regions";
import { contrastHits, legibilityHits, logoHits, parseTextSizeTest, runVisualChecks, type DraftImage } from "../src/lib/engine/visual";
import { verify } from "../src/lib/engine/verify";
import { runRuleTests } from "../src/lib/engine/ruletest";
import { cleanImages } from "../src/lib/workflow";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";
import { ImageInspector } from "../src/components/ImageInspector";

const rule = (id: string) => SEED_RULES.find((r) => r.id === id)!;

/** A flat image with a solid block of "text" colour inside a box. */
function block(w: number, h: number, bg: number[], fg: number[], box: { x: number; y: number; w: number; h: number }) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inBox = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h && (x + y) % 3 !== 0; // strokes with gaps
    const c = inBox ? fg : bg;
    d.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
  }
  return d;
}

describe("line contrast", () => {
  it("measures text against the background around its line", () => {
    const d = block(200, 100, [242, 165, 65], [255, 255, 255], { x: 20, y: 40, w: 120, h: 20 });
    const r = lineContrast(d, 200, 100, { x: 0.1, y: 0.4, w: 0.6, h: 0.2 })!;
    expect(r.bg).toBe("#F2A541");
    expect(r.fg).toBe("#FFFFFF");
    expect(r.contrast).toBeCloseTo(contrastRatio("#FFFFFF", "#F2A541"), 1);
    expect(r.contrast).toBeLessThan(4.5);
  });

  it("is null when nothing in the box stands out", () => {
    const d = block(100, 100, [15, 107, 95], [15, 107, 95], { x: 10, y: 10, w: 50, h: 20 });
    expect(lineContrast(d, 100, 100, { x: 0.1, y: 0.1, w: 0.5, h: 0.2 })).toBeNull();
  });
});

describe("colour areas", () => {
  it("boxes each connected area of a dominant colour", () => {
    const d = block(80, 80, [15, 107, 95], [229, 57, 53], { x: 40, y: 0, w: 40, h: 40 });
    // Solid red quarter (no stroke gaps): redraw it.
    for (let y = 0; y < 40; y++) for (let x = 40; x < 80; x++) d.set([229, 57, 53, 255], (y * 80 + x) * 4);
    const areas = colourAreas(d, 80, 80, [{ hex: "#0F6B5F" }, { hex: "#E53935" }]);
    const red = areas.find((a) => a.hex === "#E53935")!;
    expect(red.box).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    expect(red.share).toBeCloseTo(0.25, 2);
    expect(areas.find((a) => a.hex === "#0F6B5F")!.share).toBeCloseTo(0.75, 2);
  });
});

describe("text size", () => {
  it("estimates type size from the line box and the letters in it", () => {
    // 72px type, capitals and ascenders, no descenders: a box of about 0.72 x 72 = 52px on a 1080 image.
    expect(textPx({ text: "December batch starts", box: { x: 0, y: 0, w: 0.5, h: 52 / 1080 } }, 1080, 1080)).toBeCloseTo(72, 0);
    // With descenders the box is taller for the same size.
    expect(textPx({ text: "Join the JEE programme", box: { x: 0, y: 0, w: 0.5, h: 38 / 1080 } }, 1080, 1080)).toBeCloseTo(40, 0);
    // Scaled to a 1080-pixel-wide post: the same box on a 540-wide image is twice the size.
    expect(textPx({ text: "Terms apply", box: { x: 0, y: 0, w: 0.5, h: 10 / 540 } }, 540, 540)).toBeCloseTo(20 / 0.94, 0);
  });

  it("flags lines below 16px with their box, and passes larger ones", () => {
    const lines: TextLine[] = [
      { text: "December batch starts", conf: 95, box: { x: 0.07, y: 0.35, w: 0.6, h: 47 / 1080 } },
      { text: "Results based on the 2025 batch", conf: 92, box: { x: 0.07, y: 0.9, w: 0.4, h: 10 / 1080 } },
      { text: "~~", conf: 30, box: { x: 0.5, y: 0.5, w: 0.01, h: 0.005 } },
    ];
    const hits = legibilityHits(rule("VIS-TEXT"), { w: 1080, h: 1080, lines }, "image:1", "Image 1");
    expect(hits).toHaveLength(1);
    expect(hits[0].quote).toBe("Results based on the 2025 batch");
    expect(hits[0].region).toEqual(lines[1].box);
    expect(hits[0].message).toMatch(/about 14px .* minimum is 16px/);
    expect(legibilityHits(rule("VIS-TEXT"), parseTextSizeTest("text: 20px"), "image:1", "T")).toEqual([]);
    expect(legibilityHits(rule("VIS-TEXT"), parseTextSizeTest("text: 12px"), "image:1", "T")).toHaveLength(1);
  });
});

describe("per-line contrast", () => {
  const lines: TextLine[] = [
    { text: "Fee 12,999", conf: 90, box: { x: 0.1, y: 0.2, w: 0.5, h: 0.05 }, contrast: 2.1, fg: "#FFFFFF", bg: "#F2A541" },
    { text: "Starts 5 January", conf: 90, box: { x: 0.1, y: 0.3, w: 0.5, h: 0.05 }, contrast: 6.4, fg: "#FFFFFF", bg: "#0F6B5F" },
  ];
  it("names each line below 4.5:1 with its box and colours", () => {
    const hits = contrastHits(rule("VIS-CON"), [{ hex: "#0F6B5F", share: 0.9 }], "image:1", "Image 1", lines);
    expect(hits).toHaveLength(1);
    expect(hits[0].quote).toBe("Fee 12,999");
    expect(hits[0].region).toEqual(lines[0].box);
    expect(hits[0].message).toContain("2.1:1 (text #FFFFFF on #F2A541)");
  });
  it("falls back to the main colours when no line was measured", () => {
    expect(contrastHits(rule("VIS-CON"), [{ hex: "#F2A541", share: 0.6 }, { hex: "#FFFFFF", share: 0.4 }], "image:1", "Image 1")[0].quote).toBe("#FFFFFF");
  });
});

describe("logo findings", () => {
  const base = { found: true, score: 0.9, box: { x: 0.05, y: 0.05, w: 0.12, h: 0.12 }, crowd: 0 };
  it("reports a recoloured logo with the colour found and the one expected", () => {
    const hits = logoHits(rule("VIS-LOGO"), { ...base, stretch: 1, colours: [{ expected: "#F2A541", found: "#E53935", share: 0.86 }, { expected: "#16211F", found: "#16211F", share: 0.13 }] }, "image:1", "Image 1");
    expect(hits).toHaveLength(1);
    expect(hits[0].message).toMatch(/found but recoloured: its dominant colour is #E53935, expected #F2A541/);
    expect(hits[0].region).toEqual(base.box);
  });
  it("reports a stretched logo by how much, and not one within 8%", () => {
    expect(logoHits(rule("VIS-LOGO"), { ...base, stretch: 1.125 }, "image:1", "Image 1")[0].message).toMatch(/stretched by 13%: it is wider/);
    expect(logoHits(rule("VIS-LOGO"), { ...base, stretch: 0.875 }, "image:1", "Image 1")[0].message).toMatch(/stretched by 13%: it is narrower/);
    expect(logoHits(rule("VIS-LOGO"), { ...base, stretch: 0.975, colours: [{ expected: "#F2A541", found: "#F0A441", share: 0.86 }] }, "image:1", "Image 1")).toEqual([]);
  });
  it("seed rules pass their own tests, including the new logo and text-size tests", async () => {
    for (const id of ["VIS-LOGO", "VIS-TEXT", "VIS-CON"]) {
      const run = await runRuleTests(rule(id), SEED_FACTS, SEED_KIT);
      expect(run.results.filter((r) => !r.ok)).toEqual([]);
    }
  });
});

const IMAGE: DraftImage = {
  name: "creative.png", alt: "A creative with the December batch dates", dataUrl: "data:image/jpeg;base64,AAAA", w: 1080, h: 1080,
  colours: [{ hex: "#E53935", share: 0.8 }, { hex: "#FFFFFF", share: 0.2 }],
  ocr: "100% selection guaranteed\nResults based on the 2025 batch",
  lines: [
    { text: "100% selection guaranteed", conf: 95, box: { x: 0.07, y: 0.3, w: 0.8, h: 0.08 }, contrast: 4.23, fg: "#FFFFFF", bg: "#E53935" },
    { text: "Results based on the 2025 batch", conf: 92, box: { x: 0.07, y: 0.9, w: 0.4, h: 10 / 1080 }, contrast: 4.23, fg: "#FFFFFF", bg: "#E53935" },
  ],
  areas: [{ hex: "#E53935", share: 0.8, box: { x: 0, y: 0, w: 1, h: 1 } }],
  logo: { found: true, score: 0.95, box: { x: 0.05, y: 0.05, w: 0.12, h: 0.12 }, crowd: 0, stretch: 1.15 },
};

describe("findings carry their region, and stay grounded", () => {
  const findings = runVisualChecks([IMAGE], SEED_RULES, SEED_FACTS, SEED_KIT);
  it("puts a region on every finding that has a place, and none on alt text", () => {
    const by = (pred: (f: (typeof findings)[number]) => boolean) => findings.filter(pred);
    expect(by((f) => f.rule_id === "VIS-PAL")[0].region).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(by((f) => f.rule_id === "VIS-LOGO")[0].region).toEqual(IMAGE.logo!.box);
    expect(by((f) => f.rule_id === "VIS-TEXT")[0].region).toEqual(IMAGE.lines![1].box);
    expect(by((f) => f.rule_id === "VIS-CON").map((f) => f.region)).toEqual([IMAGE.lines![0].box, IMAGE.lines![1].box]);
    // A text rule on words in the image points at the line they were read from.
    const banned = by((f) => f.location === "image:1" && /guarantee/i.test(f.quote) && !f.rule_id.startsWith("VIS"));
    expect(banned.length).toBeGreaterThan(0);
    expect(banned[0].region).toEqual(IMAGE.lines![0].box);
  });
  it("every visual finding passes the verifier", () => {
    const { kept, dropped } = verify("", findings.map((f) => ({ ...f })), SEED_RULES, SEED_FACTS, [IMAGE]);
    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(findings.length);
  });
  it("the verifier grounds a quote on an OCR line, and drops a region outside the image", () => {
    const f = { ...findings.find((x) => x.rule_id === "VIS-TEXT")!, region: { x: 0.9, y: 0.9, w: 0.5, h: 0.5 } };
    const img = { ...IMAGE, ocr: "" };
    const { kept } = verify("", [f], SEED_RULES, SEED_FACTS, [img]);
    expect(kept).toHaveLength(1);
    expect(kept[0].region).toBeNull();
    expect(verify("", [{ ...f, quote: "words not in the image" }], SEED_RULES, SEED_FACTS, [img]).kept).toEqual([]);
  });
  it("works the region out again for a stored finding (regions are not stored)", () => {
    expect(regionFor(IMAGE, 0, { quote: "#E53935" })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(regionFor(IMAGE, 0, { quote: "Image 1: logo" })).toEqual(IMAGE.logo!.box);
    expect(regionFor(IMAGE, 0, { quote: "selection guaranteed" })).toEqual(IMAGE.lines![0].box);
    expect(regionFor(IMAGE, 0, { quote: "Image 1: alt text" })).toBeNull();
  });
});

describe("browser input is cleaned", () => {
  it("keeps lines, areas and the logo's stretch and colours, and drops bad values", () => {
    const [img] = cleanImages([{
      ...IMAGE,
      lines: [...IMAGE.lines!, { text: "", box: { x: 0, y: 0, w: 1, h: 1 } }, { text: "x", box: { x: 2, y: 0, w: 0, h: 0 } }, { text: "ok", conf: 400, box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, contrast: 99, fg: "red", bg: "#000000" }],
      areas: [...IMAGE.areas!, { hex: "blue", box: { x: 0, y: 0, w: 1, h: 1 } }],
      logo: { ...IMAGE.logo, colours: [{ expected: "#F2A541", found: "#E53935", share: 0.86 }, { expected: "<b>", found: "#000000" }], stretch: 9 },
    }]);
    expect(img.lines).toHaveLength(3);
    expect(img.lines![2]).toEqual({ text: "ok", conf: 100, box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } });
    expect(img.areas).toHaveLength(1);
    expect(img.logo!.colours).toEqual([{ expected: "#F2A541", found: "#E53935", share: 0.86 }]);
    expect(img.logo!.stretch).toBeUndefined();
  });
});

describe("image inspector", () => {
  const findings = runVisualChecks([IMAGE], SEED_RULES, SEED_FACTS, SEED_KIT).map(({ region: _r, ...f }) => f); // as stored
  it("lists failing text with its ratio and size, the off-palette area with its hex, and the logo with size and clear space", () => {
    const regions = inspectorRegions(IMAGE, 0, findings);
    expect(regions.map((r) => r.label)).toEqual(["4.2:1", "4.2:1 · ~14px", "#E53935", "Logo · 12% wide"]);
    const logo = regions.find((r) => r.kind === "logo")!;
    expect(logo.messages.join(" ")).toMatch(/stretched by 15%/);
    expect(logo.clear!.x).toBeCloseTo(0.02, 3);
    expect(logo.clear!.w).toBeCloseTo(0.18, 3);
  });
  it("renders the image, outlines, a legend and a keyboard-reachable list that describes them", () => {
    const html = renderToStaticMarkup(createElement(ImageInspector, { image: IMAGE, index: 0, findings }));
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
    expect((html.match(/<button/g) ?? []).length).toBe(4);
    expect(html).toContain("Text below the contrast or size minimum");
    expect(html).toContain("Colour outside the brand palette");
    expect(html).toMatch(/creative\.png: 4 areas with a problem, 2 text lines, 1 off-palette colour area; logo at 12% of the width\./);
    expect(html).toContain("~14px");
  });
  it("draws nothing for another image's findings", () => {
    expect(inspectorRegions({ ...IMAGE, logo: null }, 1, findings)).toEqual([]);
  });
});

describe("real pixels", () => {
  it("measures white text on brand marigold as below 4.5:1 on a rendered line", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="#F2A541"/><text x="20" y="120" font-family="DejaVu Sans, sans-serif" font-size="48" fill="#FFFFFF">Starts 5 January</text></svg>`;
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const r = lineContrast(new Uint8Array(data), info.width, info.height, { x: 20 / 600, y: 82 / 200, w: 400 / 600, h: 48 / 200 })!;
    expect(r.bg).toBe("#F2A541");
    expect(r.contrast).toBeGreaterThan(1.8);
    expect(r.contrast).toBeLessThan(2.2); // white on #F2A541 is 2.0:1
  });
});
