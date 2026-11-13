import type { Fact, Finding, Kit, Rule } from "../types";
import { runCodeChecks } from "./code";

export interface DraftImage {
  name: string;
  alt: string;
  dataUrl?: string;
  w?: number;
  h?: number;
  colours: { hex: string; share: number }[];
  ocr: string;
  ocr_ok?: boolean;
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
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

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

export function contrastHits(rule: Rule, colours: DraftImage["colours"], location: string, label: string): Finding[] {
  const main = colours.filter((c) => c.share >= 0.05).slice(0, 3);
  if (main.length < 2) return [];
  const bg = main[0];
  const out: Finding[] = [];
  for (const fg of main.slice(1)) {
    const r = contrast(bg.hex, fg.hex);
    if (r >= 4.5) continue;
    out.push({
      ...base(rule, location), quote: fg.hex,
      message: `${label}: ${fg.hex} on the main background ${bg.hex} has a contrast ratio of ${r.toFixed(1)}:1. Text in these colours would fall below the WCAG minimum of 4.5:1 for body text.`,
      fix_note: "Darken or lighten one of the two colours until the ratio is at least 4.5:1. This check measures the image's main colours, so confirm by eye where the text sits.",
    });
    break;
  }
  return out;
}

export function altHits(rule: Rule, alt: string, location: string, label: string): Finding[] {
  if (alt.trim().length >= 8) return [];
  return [{
    ...base(rule, location), quote: `${label}: alt text`,
    message: `${label} has ${alt.trim() ? "alt text that is too short to describe it" : "no alt text"}. Screen-reader users get nothing from it, and claims inside the image are invisible to them.`,
    fix_note: "Describe what the image shows and repeat any text in it, in one or two sentences.",
  }];
}

/** Visual checks plus every text rule run on the words found inside the image. */
export function runVisualChecks(images: DraftImage[], rules: Rule[], facts: Fact[], kit: Kit): Finding[] {
  const out: Finding[] = [];
  images.forEach((img, i) => {
    const location = `image:${i + 1}`;
    const label = `Image ${i + 1}`;
    for (const rule of rules) {
      if (rule.category === "visual-palette") out.push(...paletteHits(rule, img.colours, kit, location, label));
      if (rule.category === "visual-contrast") out.push(...contrastHits(rule, img.colours, location, label));
      if (rule.category === "visual-alt") out.push(...altHits(rule, img.alt ?? "", location, label));
    }
    if (img.ocr?.trim()) {
      const textRules = rules.filter((r) => !r.category.startsWith("visual-"));
      for (const f of runCodeChecks(img.ocr, textRules, facts, kit)) {
        out.push({
          ...f, location, check_type: f.check_type === "code" ? "visual" : f.check_type,
          message: `In the text of ${label.toLowerCase()}: ${f.message}`,
          // A fix cannot be applied to pixels; it is shown as the wording to use in the design.
          fix_note: f.fix ? `Change the wording in the design to: "${f.fix}"` : f.fix_note ?? null,
          fix: null,
        });
      }
    }
  });
  return out;
}
