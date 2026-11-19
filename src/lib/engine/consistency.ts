import type { Finding, Rule } from "../types";
import { extractNumberClaims, subjectWindow, type NumberClaim } from "./code";
import type { DraftImage } from "./visual";

// Cross-asset consistency: a campaign must say the same thing everywhere. Plain code compares every pair of
// sources (the caption, each creative, each extra document): figures of the same kind for the same thing,
// dates for the same event, and promo codes.

export interface Source { where: string; location: string; text: string }
type Unit = "₹" | "%" | "count" | "date" | "code";
interface Mention { quote: string; value: string; unit: Unit; subject: Set<string>; src: Source }

const STOP = new Set(["with", "from", "that", "this", "your", "have", "more", "than", "over", "only", "just", "into", "every", "each", "them", "their", "will", "been", "were", "what", "when", "join", "past", "upto", "about", "year", "years", "date", "dates"]);
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.replace(/(es|s)$/, "")));
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const M = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

function dates(text: string): { quote: string; value: string; index: number }[] {
  const out: { quote: string; value: string; index: number }[] = [];
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${M}\\b|\\b${M}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "gi"))) {
    const day = Number(m[1] ?? m[4]);
    const mon = MONTHS.indexOf((m[2] ?? m[3]).slice(0, 3).toLowerCase()) + 1;
    if (day >= 1 && day <= 31 && mon) out.push({ quote: m[0], value: `${mon}-${day}`, index: m.index ?? 0 });
  }
  return out;
}
const CODE = /\b(?:code|coupon|promo(?:\s*code)?)\s*[:\-]?\s*["“]?([A-Z][A-Z0-9]{3,14})\b/g;

function mentions(src: Source): Mention[] {
  const out: Mention[] = [];
  for (const c of extractNumberClaims(src.text)) {
    out.push({ quote: c.quote, value: String(c.value), unit: /₹|rs/i.test(c.quote) ? "₹" : /%/.test(c.quote) ? "%" : "count", subject: words(subjectWindow(src.text, c)), src });
  }
  for (const d of dates(src.text)) {
    const fake: NumberClaim = { quote: d.quote, value: 0, index: d.index };
    out.push({ quote: d.quote, value: d.value, unit: "date", subject: words(subjectWindow(src.text, fake) + " " + src.text.slice(Math.max(0, d.index - 40), d.index)), src });
  }
  for (const m of src.text.matchAll(CODE)) out.push({ quote: m[1], value: m[1], unit: "code", subject: new Set(["code"]), src });
  return out;
}

/** Parse rule-test text like "caption: Fee ₹39,999 for the batch | image: Batch fee ₹34,999 | brochure: …". */
export function parseConsistencyTest(text: string): { text: string; images: DraftImage[]; assets: { name: string; text: string }[] } {
  const parts = text.split("|").map((p) => p.trim());
  const body = parts.find((p) => /^caption:/i.test(p))?.replace(/^caption:\s*/i, "") ?? "";
  const images = parts.filter((p) => /^image:/i.test(p)).map((p, i) => ({ name: `test-${i + 1}`, alt: "", colours: [], ocr: p.replace(/^image:\s*/i, "") }));
  const assets = parts.filter((p) => /^(brochure|landing|email|document):/i.test(p)).map((p) => ({ name: p.split(":")[0].toLowerCase(), text: p.replace(/^[a-z]+:\s*/i, "") }));
  return { text: body, images, assets };
}

export function sourcesOf(text: string, images: DraftImage[], assets: { name: string; text: string }[] = []): Source[] {
  const out: Source[] = [{ where: "the caption", location: "text", text }];
  images.forEach((img, i) => {
    const t = [img.ocr, img.vision?.text].filter(Boolean).join("\n");
    if (t.trim()) out.push({ where: `image ${i + 1}`, location: `image:${i + 1}`, text: t });
  });
  assets.forEach((a, i) => { if (a.text.trim()) out.push({ where: `the ${a.name}`, location: `asset:${i + 1}`, text: a.text }); });
  return out;
}

export function consistencyHits(rule: Rule, text: string, images: DraftImage[], assets: { name: string; text: string }[] = []): Finding[] {
  const sources = sourcesOf(text, images, assets).map(mentions);
  if (sources.length < 2) return [];
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (let j = 1; j < sources.length; j++) {
    for (let i = 0; i < j; i++) {
      for (const b of sources[j]) {
        for (const a of sources[i]) {
          if (a.unit !== b.unit || a.value === b.value) continue;
          const shared = [...b.subject].filter((w) => a.subject.has(w));
          // A unit each side states exactly once (one price, one start date, one promo code) is the same thing.
          const lone = sources[i].filter((m) => m.unit === a.unit).length === 1 && sources[j].filter((m) => m.unit === b.unit).length === 1 && a.unit !== "count" && a.unit !== "%";
          if (!shared.filter((w) => w !== "code").length && !lone) continue;
          if (sources[i].some((m) => m.unit === b.unit && m.value === b.value)) continue; // the same value appears there too
          const k = `${b.src.location}|${b.quote}`;
          if (seen.has(k)) continue;
          seen.add(k);
          const what = { "₹": "price", "%": "figure", count: "figure", date: "date", code: "promo code" }[a.unit];
          const about = shared.filter((w) => w !== "code").length ? ` for ${shared.filter((w) => w !== "code").slice(0, 2).join(" ")}` : "";
          out.push({
            rule_id: rule.id, check_type: "visual", location: b.src.location, severity: rule.severity,
            level: rule.status === "enforced" ? "violation" : "suggestion", risk: rule.risk,
            rule_text: `${rule.id} · ${rule.title}: ${rule.description}`,
            quote: b.quote,
            message: `${b.src.where[0].toUpperCase()}${b.src.where.slice(1)} gives the ${what} "${b.quote}"${about}, but ${a.src.where} says "${a.quote}". A reader who sees both will not know which is true.`,
            fix: null, fix_note: `Check the ${what} against the Facts Register or the offer terms, then correct whichever one is wrong.`,
            fix_status: "none", precedent: rule.precedent ?? null,
          });
        }
      }
    }
  }
  return out;
}
