import type { Fact, Finding, Rule } from "../types";
import type { DraftImage } from "./visual";
import { today } from "./code";

export interface Dropped {
  reason: string;
  quote: string;
  rule_id: string;
}

/**
 * "No source, no flag." Plain code decides whether a finding may be shown:
 * the quoted words must be in the draft, the rule must exist, and a cited fact must exist.
 * This confirms grounding, not correctness - a grounded finding can still be a wrong judgment,
 * which is why people can dismiss and why a human approves.
 */
export function verify(text: string, findings: Finding[], rules: Rule[], facts: Fact[], images: DraftImage[] = []): { kept: Finding[]; dropped: Dropped[] } {
  const kept: Finding[] = [];
  const dropped: Dropped[] = [];
  const t = today();
  for (const f of findings) {
    const drop = (reason: string) => dropped.push({ reason, quote: f.quote, rule_id: f.rule_id });
    if (!f.quote || !f.quote.trim()) { drop("no quoted words"); continue; }
    const imgIdx = f.location?.startsWith("image:") ? Number(f.location.slice(6)) - 1 : -1;
    if (imgIdx >= 0) {
      // An image finding must point at a colour measured in that image, its alt text, or words read from it.
      const img = images[imgIdx];
      const grounded = !!img && (
        img.colours.some((c) => c.hex === f.quote) ||
        f.quote === `Image ${imgIdx + 1}: alt text` ||
        (img.ocr ?? "").includes(f.quote)
      );
      if (!grounded) { drop("not found in the image it cites"); continue; }
    } else if (!text.includes(f.quote)) {
      // Recover harmless differences in case or spacing; otherwise the quote is invented.
      const re = new RegExp(f.quote.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "i");
      const m = text.match(re);
      if (!m) { drop("quote is not in the draft"); continue; }
      f.quote = m[0];
    }
    if (!rules.some((r) => r.id === f.rule_id)) { drop("cited rule does not exist"); continue; }
    if (f.fact_id) {
      const fact = facts.find((x) => x.id === f.fact_id);
      if (!fact) { drop("cited fact does not exist"); continue; }
      // A fix may only lean on a fact that is valid today.
      if (f.fix && f.fix.startsWith(fact.statement) && ((fact.valid_from && fact.valid_from > t) || (fact.valid_until && fact.valid_until < t))) {
        f.fix = null;
        f.fix_note = `Fact ${fact.id} is not valid today, so no fix is offered from it.`;
      }
    }
    kept.push(f);
  }
  return { kept, dropped };
}
