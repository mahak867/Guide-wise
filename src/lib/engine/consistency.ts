import type { Finding, Rule } from "../types";
import { extractNumberClaims, subjectWindow, type NumberClaim } from "./code";
import type { DraftImage } from "./visual";

// Cross-asset consistency: the same figure must read the same in the caption and in every creative.
// Plain code. It compares figures of the same kind (rupees, percentages, counts) that count the same thing.

type Unit = "₹" | "%" | "count";
interface Mention { claim: NumberClaim; unit: Unit; subject: Set<string>; where: string; location: string }

const STOP = new Set(["with", "from", "that", "this", "your", "have", "more", "than", "over", "only", "just", "into", "every", "each", "them", "their", "will", "been", "were", "what", "when", "join", "past", "upto", "about", "year", "years"]);
const unitOf = (quote: string): Unit => (/₹|rs/i.test(quote) ? "₹" : /%/.test(quote) ? "%" : "count");
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.replace(/(es|s)$/, "")));

function mentions(text: string, where: string, location: string): Mention[] {
  return extractNumberClaims(text).map((claim) => ({ claim, unit: unitOf(claim.quote), subject: words(subjectWindow(text, claim)), where, location }));
}

/** Parse rule-test text like "caption: Fee ₹39,999 for the batch | image: Batch fee ₹34,999". */
export function parseConsistencyTest(text: string): { text: string; images: DraftImage[] } {
  const parts = text.split("|").map((p) => p.trim());
  const body = parts.find((p) => /^caption:/i.test(p))?.replace(/^caption:\s*/i, "") ?? "";
  const images = parts.filter((p) => /^image:/i.test(p)).map((p, i) => ({ name: `test-${i + 1}`, alt: "", colours: [], ocr: p.replace(/^image:\s*/i, "") }));
  return { text: body, images };
}

export function consistencyHits(rule: Rule, text: string, images: DraftImage[]): Finding[] {
  const sources: Mention[][] = [mentions(text, "the caption", "text")];
  images.forEach((img, i) => { if (img.ocr?.trim()) sources.push(mentions(img.ocr, `image ${i + 1}`, `image:${i + 1}`)); });
  if (sources.length < 2) return [];
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (let j = 1; j < sources.length; j++) {
    for (let i = 0; i < j; i++) {
      for (const b of sources[j]) {
        for (const a of sources[i]) {
          if (a.unit !== b.unit || a.claim.value === b.claim.value) continue;
          const shared = [...b.subject].filter((w) => a.subject.has(w));
          // Rupee amounts also conflict when each side states exactly one: there is only one price being talked about.
          const lonePrice = a.unit === "₹" && sources[i].filter((m) => m.unit === "₹").length === 1 && sources[j].filter((m) => m.unit === "₹").length === 1;
          if (!shared.length && !lonePrice) continue;
          // The same value appearing elsewhere on the other side means this is a different figure, not a mismatch.
          if (sources[i].some((m) => m.unit === b.unit && m.claim.value === b.claim.value)) continue;
          const k = `${b.location}|${b.claim.quote}`;
          if (seen.has(k)) continue;
          seen.add(k);
          const about = shared.length ? ` for ${shared.slice(0, 2).join(" ")}` : "";
          out.push({
            rule_id: rule.id, check_type: "visual", location: b.location, severity: rule.severity,
            level: rule.status === "enforced" ? "violation" : "suggestion", risk: rule.risk,
            rule_text: `${rule.id} · ${rule.title}: ${rule.description}`,
            quote: b.claim.quote,
            message: `${b.where[0].toUpperCase()}${b.where.slice(1)} says "${b.claim.quote}"${about}, but ${a.where} says "${a.claim.quote}". A reader who sees both will not know which is true.`,
            fix: null, fix_note: "Check the figure against the Facts Register, then correct whichever one is wrong.",
            fix_status: "none", precedent: rule.precedent ?? null,
          });
        }
      }
    }
  }
  return out;
}
