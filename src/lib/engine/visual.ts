import type { Fact, Finding, Kit, Rule } from "../types";
import type { LogoMatch } from "../logo";
import { contrastRatio, regionFor, textPx, type ColourArea, type TextLine } from "../regions";
import { runCodeChecks } from "./code";

export { regionFor };

export interface DraftImage {
  name: string;
  alt: string;
  dataUrl?: string;
  w?: number;
  h?: number;
  colours: { hex: string; share: number }[];
  ocr: string;
  ocr_ok?: boolean;
  /** Logo search result from the browser; missing when the Brand Kit has no logo. */
  logo?: LogoMatch | null;
  /** Lines OCR read, with their boxes and measured contrast (browser). Missing on images analysed before regions existed. */
  lines?: TextLine[];
  /** Where each dominant colour sits (browser). */
  areas?: ColourArea[];
  /** AI vision read of the creative: text OCR may miss, and people shown. Added by the server, never by the browser. */
  vision?: { text: string; people: { description: string; kind: string }[] } | null;
}

// --- colour science: sRGB -> CIELAB, CIEDE76 difference, WCAG contrast ---
function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function lin(c: number) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
export function lab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(lin);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
/** Whites, greys and blacks: low chroma. They are allowed beside any palette. */
export function isNeutral(hex: string): boolean {
  const [, a, b] = lab(hex);
  return Math.hypot(a, b) < 12;
}
export const contrast = contrastRatio;

const PALETTE_DE = 25; // beyond this, a colour reads as a different colour
const MIN_SHARE = 0.08;

function base(rule: Rule, location: string): Omit<Finding, "quote" | "message"> {
  return {
    rule_id: rule.id, check_type: "visual", severity: rule.severity,
    level: rule.status === "enforced" ? "violation" : "suggestion",
    risk: rule.risk, rule_text: `${rule.id} · ${rule.title}: ${rule.description}`,
    fix: null, fix_status: "none", precedent: rule.precedent ?? null, location,
  };
}

/** Parse test text like "#E53935 60%, #FFFFFF 40%" so visual rules can be tested like any other rule. */
export function parseColourTest(text: string): { hex: string; share: number }[] {
  return [...text.matchAll(/(#[0-9a-f]{6})\s*(\d+(?:\.\d+)?)%/gi)].map((m) => ({ hex: m[1].toUpperCase(), share: Number(m[2]) / 100 }));
}

export function paletteHits(rule: Rule, colours: DraftImage["colours"], kit: Kit, location: string, label: string): Finding[] {
  if (!kit.palette.length) return [];
  const out: Finding[] = [];
  for (const c of colours) {
    if (c.share < MIN_SHARE || isNeutral(c.hex)) continue;
    const near = kit.palette.map((p) => ({ p, d: deltaE(c.hex, p.hex) })).sort((a, b) => a.d - b.d)[0];
    if (near.d <= PALETTE_DE) continue;
    out.push({
      ...base(rule, location), quote: c.hex,
      message: `${label}: ${c.hex} covers ${Math.round(c.share * 100)}% of the image and is not a brand colour. The nearest is ${near.p.name} (${near.p.hex}), a colour difference of ${Math.round(near.d)} (brand colours are within ${PALETTE_DE}).`,
      fix_note: `Replace ${c.hex} with ${near.p.name} ${near.p.hex} in the design file.`,
    });
  }
  return out;
}

/** Lines OCR read with enough confidence to be judged: at least three letters, confidence 50 or more. */
export function readableLines(lines: TextLine[] | undefined): TextLine[] {
  return (lines ?? []).filter((l) => l.conf >= 50 && (l.text.match(/[A-Za-z]/g)?.length ?? 0) >= 3);
}

const MIN_CONTRAST = 4.5;

/**
 * Contrast. Where OCR found lines of text, each line is measured against the background right around it, and every
 * line below 4.5:1 is named with its box. Without lines (OCR off, or an image analysed before lines were stored),
 * the image's main colours are compared instead.
 */
export function contrastHits(rule: Rule, colours: DraftImage["colours"], location: string, label: string, lines?: TextLine[]): Finding[] {
  const measured = readableLines(lines).filter((l) => l.contrast !== undefined && l.fg && l.bg);
  if (measured.length) {
    return measured.filter((l) => l.contrast! < MIN_CONTRAST).sort((a, b) => a.contrast! - b.contrast!).slice(0, 3).map((l) => ({
      ...base(rule, location), quote: l.text, region: l.box,
      message: `${label}: the line "${l.text.slice(0, 80)}" measures ${l.contrast!.toFixed(1)}:1 (text ${l.fg} on ${l.bg}). WCAG asks for at least ${MIN_CONTRAST}:1 for body text.`,
      fix_note: `Darken or lighten the text or its background until the ratio is at least ${MIN_CONTRAST}:1. Measured on the pixels of this line.`,
    }));
  }
  const main = colours.filter((c) => c.share >= 0.05).slice(0, 3);
  if (main.length < 2) return [];
  const bg = main[0];
  const out: Finding[] = [];
  for (const fg of main.slice(1)) {
    // Two shades of the same surface (panels, gradients) are not text on a background.
    if (deltaE(bg.hex, fg.hex) < 12) continue;
    const r = contrast(bg.hex, fg.hex);
    if (r >= MIN_CONTRAST) continue;
    out.push({
      ...base(rule, location), quote: fg.hex,
      message: `${label}: ${fg.hex} on the main background ${bg.hex} has a contrast ratio of ${r.toFixed(1)}:1. Text in these colours would fall below the WCAG minimum of 4.5:1 for body text.`,
      fix_note: "Darken or lighten one of the two colours until the ratio is at least 4.5:1. This check measures the image's main colours, so confirm by eye where the text sits.",
    });
    break;
  }
  return out;
}

/**
 * Minimum text size. Each line's type size is estimated from its OCR box (see textPx in regions.ts) and scaled to a
 * 1080-pixel-wide post; lines below the minimum (16px unless the rule says otherwise) are named with their box.
 * Text too small for OCR to read at all cannot be measured, so it is not flagged here.
 */
export function legibilityHits(rule: Rule, img: Pick<DraftImage, "w" | "h" | "lines">, location: string, label: string): Finding[] {
  if (!img.w || !img.h) return [];
  const min = rule.config.minPx ?? 16;
  return readableLines(img.lines).map((l) => ({ l, px: textPx(l, img.w!, img.h!) })).filter((x) => x.px < min)
    .sort((a, b) => a.px - b.px).slice(0, 3).map(({ l, px }) => ({
      ...base(rule, location), quote: l.text, region: l.box,
      message: `${label}: the line "${l.text.slice(0, 80)}" is about ${Math.round(px)}px tall on a 1080-pixel-wide post (estimated from the text's height in the image). The minimum is ${min}px; smaller text is hard to read on a phone.`,
      fix_note: `Set this line at ${min}px or more at 1080 pixels wide, or move it to the caption.`,
    }));
}

export function altHits(rule: Rule, alt: string, location: string, label: string): Finding[] {
  if (alt.trim().length >= 8) return [];
  return [{
    ...base(rule, location), quote: `${label}: alt text`,
    message: `${label} has ${alt.trim() ? "alt text that is too short to describe it" : "no alt text"}. Screen-reader users get nothing from it, and claims inside the image are invisible to them.`,
    fix_note: "Describe what the image shows and repeat any text in it, in one or two sentences.",
  }];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
/** A logo whose proportions are off by this much or more is reported as stretched (the search measures in 2.5% steps). */
export const STRETCH_AT = 0.08;

/** The Brand Kit logo must appear, at a minimum width, with its clear space free of other content. */
export function logoHits(rule: Rule, logo: DraftImage["logo"], location: string, label: string): Finding[] {
  if (!logo) return [];
  const minWidth = rule.config.logo?.minWidth ?? 0.08;
  const quote = `${label}: logo`;
  if (!logo.found) {
    return [{
      ...base(rule, location), quote,
      message: `${label} does not carry the approved logo from the Brand Kit. The closest match scored ${logo.score.toFixed(2)}; the logo counts as present at 0.70 or more.`,
      fix_note: "Place the approved logo file from the Brand Kit, unaltered, in the design.",
    }];
  }
  const out: Finding[] = [];
  const region = logo.box ?? null;
  // Recoloured: a main colour of the logo file measured in the same place on the creative, more than a brand-colour difference away.
  const off = (logo.colours ?? []).map((c) => ({ ...c, d: deltaE(c.expected, c.found) })).filter((c) => c.d > PALETTE_DE).sort((a, b) => b.share - a.share)[0];
  if (off) {
    out.push({
      ...base(rule, location), quote, region,
      message: `The logo in ${label.toLowerCase()} was found but recoloured: its ${off.share >= 0.5 ? "dominant" : "second"} colour is ${off.found}, expected ${off.expected} (a colour difference of ${Math.round(off.d)}; brand colours are within ${PALETTE_DE}).`,
      fix_note: "Place the approved logo file from the Brand Kit in its own colours.",
    });
  }
  const st = logo.stretch ?? 1;
  if (Math.abs(st - 1) >= STRETCH_AT) {
    out.push({
      ...base(rule, location), quote, region,
      message: `The logo in ${label.toLowerCase()} is stretched by ${Math.round(Math.abs(st - 1) * 100)}%: it is ${st > 1 ? "wider" : "narrower"} for its height than the Brand Kit file.`,
      fix_note: "Scale the logo with its proportions locked (hold Shift while resizing), or place the file again.",
    });
  }
  const w = logo.box?.w ?? 0;
  if (w && w < minWidth) {
    out.push({
      ...base(rule, location), quote, region,
      message: `The logo in ${label.toLowerCase()} is ${pct(w)} of the image width. The brand guide's minimum is ${pct(minWidth)}.`,
      fix_note: `Scale the logo up to at least ${pct(minWidth)} of the width.`,
    });
  }
  if ((logo.crowd ?? 0) > 0.1) {
    out.push({
      ...base(rule, location), quote, region,
      message: `Other content sits inside the logo's clear space in ${label.toLowerCase()}: ${pct(logo.crowd!)} of the margin around it is not plain background. The margin should be free on every side.`,
      fix_note: "Move text and graphics away from the logo, keeping a margin of a quarter of the logo's height on every side.",
    });
  }
  return out;
}

/** Test text like "logo: missing", "logo: 6% wide", "logo: 14% wide, crowded", "logo: 12% wide, stretched 15%" or "logo: 12% wide, recoloured #E53935". */
export function parseLogoTest(text: string, kit?: Kit): DraftImage["logo"] {
  if (/missing|not found|none/i.test(text)) return { found: false, score: 0.3 };
  const w = Number(text.match(/(\d+(?:\.\d+)?)\s*%\s*wide/i)?.[1] ?? text.match(/(\d+(?:\.\d+)?)\s*%/)?.[1] ?? 12) / 100;
  const st = text.match(/stretched\s*(\d+(?:\.\d+)?)\s*%/i);
  const rc = text.match(/recolou?red\s*(#[0-9a-f]{6})/i);
  const expected = kit?.palette[0]?.hex ?? "#000000";
  return {
    found: true, score: 0.95, box: { x: 0.05, y: 0.05, w, h: w }, crowd: /crowd/i.test(text) ? 0.3 : 0,
    stretch: st ? 1 + Number(st[1]) / 100 : 1,
    colours: [{ expected, found: rc ? rc[1].toUpperCase() : expected, share: 0.8 }],
  };
}

/** Test text like "text: 12px" or "text: 20px": one line of that size on a 1080-pixel-wide post. */
export function parseTextSizeTest(text: string): Pick<DraftImage, "w" | "h" | "lines"> {
  const px = Number(text.match(/(\d+(?:\.\d+)?)\s*px/i)?.[1] ?? 24);
  // "Test line" has capitals and no descenders, so its box is 0.72 of the type size (see textPx).
  return { w: 1080, h: 1080, lines: [{ text: "Test line", conf: 90, box: { x: 0.1, y: 0.5, w: 0.3, h: (px * 0.72) / 1080 } }] };
}

/** People shown in a creative need a consent record before publication; code makes the finding, AI only saw them. */
export function peopleHits(rule: Rule, vision: DraftImage["vision"], location: string, label: string): Finding[] {
  if (!vision?.people?.length) return [];
  const n = vision.people.length;
  return [{
    ...base(rule, location), quote: `${label}: people`,
    message: `${label} shows ${n === 1 ? "a person" : `${n} people`} (${vision.people.map((p) => `${p.description}, ${p.kind}`).join("; ").slice(0, 200)}). Publishing a recognisable person, above all a student, needs their written consent on record.`,
    fix_note: "Check the student records for a dated consent covering this image, or replace the photo.",
  }];
}

/** Visual checks plus every text rule run on the words found inside the image. */
export function runVisualChecks(images: DraftImage[], rules: Rule[], facts: Fact[], kit: Kit): Finding[] {
  const all: Finding[] = [];
  images.forEach((img, i) => {
    const out: Finding[] = [];
    const location = `image:${i + 1}`;
    const label = `Image ${i + 1}`;
    for (const rule of rules) {
      if (rule.category === "visual-palette") out.push(...paletteHits(rule, img.colours, kit, location, label));
      if (rule.category === "visual-contrast") out.push(...contrastHits(rule, img.colours, location, label, img.lines));
      if (rule.category === "visual-legibility") out.push(...legibilityHits(rule, img, location, label));
      if (rule.category === "visual-alt") out.push(...altHits(rule, img.alt ?? "", location, label));
      if (rule.category === "visual-logo") out.push(...logoHits(rule, img.logo, location, label));
      if (rule.category === "visual-people") out.push(...peopleHits(rule, img.vision, location, label));
    }
    // Text read by OCR, plus any lines only AI vision could read (stylised or curved type).
    const extra = (img.vision?.text ?? "").split("\n").filter((l) => l.trim().length > 3 && !(img.ocr ?? "").toLowerCase().includes(l.trim().toLowerCase())).join("\n");
    const imageText = [img.ocr ?? "", extra].filter((x) => x.trim()).join("\n");
    if (imageText.trim()) {
      // Length and sentence-length rules are about body copy; text read from a design is laid out in lines.
      const textRules = rules.filter((r) => !r.category.startsWith("visual-") && r.category !== "length" && r.category !== "readability");
      for (const f of runCodeChecks(imageText, textRules, facts, kit)) {
        out.push({
          ...f, location, check_type: f.check_type === "code" ? "visual" : f.check_type,
          message: `In the text of ${label.toLowerCase()}: ${f.message}`,
          // A fix cannot be applied to pixels; it is shown as the wording to use in the design.
          fix_note: f.fix ? `Change the wording in the design to: "${f.fix}"` : f.fix_note ?? null,
          fix: null,
        });
      }
    }
    for (const f of out) if (f.region === undefined) f.region = regionFor(img, i, f);
    all.push(...out);
  });
  return all;
}
