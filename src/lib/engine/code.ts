import type { Fact, Finding, Kit, Rule } from "../types";
import { findEmails, findPhones } from "./redact";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Sentence (or clause) containing position i - used to scope subject keywords to a claim. */
export function sentenceAt(text: string, i: number): { start: number; end: number; text: string } {
  let start = i;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) start--;
  let end = i;
  while (end < text.length && !/[.!?\n]/.test(text[end])) end++;
  return { start, end, text: text.slice(start, end) };
}

function base(rule: Rule, check: Finding["check_type"]): Omit<Finding, "quote" | "message"> {
  return {
    rule_id: rule.id,
    check_type: check,
    severity: rule.severity,
    level: rule.status === "enforced" ? "violation" : "suggestion",
    risk: rule.risk,
    rule_text: `${rule.id} · ${rule.title}: ${rule.description}`,
    fix_status: "none",
    precedent: rule.precedent ?? null,
  };
}

function safeRegex(src: string): RegExp | null {
  try {
    return new RegExp(src, "gi");
  } catch {
    return null;
  }
}

function factFix(factId: string | undefined, facts: Fact[]): { fix: string; note: string; fact_id: string } | null {
  const f = facts.find((x) => x.id === factId);
  if (!f) return null;
  const t = today();
  if ((f.valid_from && f.valid_from > t) || (f.valid_until && f.valid_until < t)) return null;
  return {
    fix: f.statement,
    fact_id: f.id,
    note: `Strongest claim the Facts Register can prove (${f.id}${f.valid_until ? `, valid until ${f.valid_until}` : ""}).`,
  };
}

/** Pattern hits for one rule. Works for code pattern rules and as the pre-filter of judgment rules. */
export function patternHits(rule: Rule, text: string, facts: Fact[]): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const entry of rule.config.patterns ?? []) {
    const src = typeof entry === "string" ? entry : entry.re;
    const own = typeof entry === "string" ? null : entry;
    const re = safeRegex(src);
    if (!re) continue;
    for (const m of text.matchAll(re)) {
      const quote = m[0].trim();
      if (!quote || seen.has(quote)) continue;
      seen.add(quote);
      const ff = factFix(own?.factId ?? (own?.fix === undefined ? rule.config.fixFactId : undefined), facts);
      let fixed = ff?.fix ?? own?.fix ?? rule.config.fixText ?? null;
      // Keep the sentence closed when the quoted words carried its end punctuation.
      if (fixed && /[.!?]$/.test(quote) && quote.length > 3 && !/[.!?]$/.test(fixed)) fixed += ".";
      out.push({
        ...base(rule, rule.kind === "judgment" ? (rule.category === "tone" ? "voice" : "claims") : "code"),
        quote,
        message: rule.description,
        fix: fixed,
        fix_note: ff?.note ?? (fixed !== null ? "Approved wording from the Brand Kit for this rule." : null),
        fact_id: ff?.fact_id ?? null,
      });
    }
  }
  return out;
}

function termHits(rule: Rule, text: string): Finding[] {
  const out: Finding[] = [];
  for (const term of rule.config.avoid ?? []) {
    const re = new RegExp(`(?<![A-Za-z])${esc(term)}(?![A-Za-z])`, "gi");
    const seen = new Set<string>();
    for (const m of text.matchAll(re)) {
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      out.push({
        ...base(rule, "code"),
        quote: m[0],
        message: `"${m[0]}" is not the preferred term. The Brand Kit says to use "${rule.config.prefer}".`,
        fix: rule.config.prefer ?? null,
        fix_note: "Preferred term from the Brand Kit.",
      });
    }
  }
  return out;
}

function contactHits(rule: Rule, text: string, kit: Kit): Finding[] {
  const approved = kit.contacts.map((c) => c.value.toLowerCase());
  const out: Finding[] = [];
  const email = kit.contacts.find((c) => c.value.includes("@"));
  const phone = kit.contacts.find((c) => !c.value.includes("@"));
  for (const e of new Set(findEmails(text))) {
    if (approved.includes(e.toLowerCase())) continue;
    out.push({
      ...base(rule, "code"),
      quote: e,
      message: `${e} is a personal address, not an approved contact. It is also removed before any AI call.`,
      fix: email?.value ?? null,
      fix_note: email ? `Approved contact: ${email.label}.` : null,
    });
  }
  for (const p of new Set(findPhones(text))) {
    if (approved.some((a) => a.replace(/\D/g, "").endsWith(p.replace(/\D/g, "").slice(-10)))) continue;
    out.push({
      ...base(rule, "code"),
      quote: p,
      message: `${p} is not an approved contact number.`,
      fix: phone?.value ?? null,
      fix_note: phone ? `Approved contact: ${phone.label}.` : null,
    });
  }
  return out;
}

/** A numeric claim as typed fields. Extracted by code here, or by the AI in AI mode; compared by code either way. */
export interface NumberClaim {
  quote: string; // exact words in the draft
  value: number;
  index: number;
}

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

export function parseNumber(raw: string): number | null {
  const s = raw.toLowerCase().replace(/[₹,\s]|rs\.?/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)(k|lakhs?|lacs?|crores?|cr)?/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (m[2] === "k") v *= 1e3;
  else if (m[2]?.startsWith("la")) v *= 1e5;
  else if (m[2]?.startsWith("cr")) v *= 1e7;
  return v;
}

// Phone numbers and email addresses are contact details, not claims.
const CONTACT_SPANS = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function extractNumberClaims(text: string): NumberClaim[] {
  const out: NumberClaim[] = [];
  const masked: [number, number][] = [...text.matchAll(CONTACT_SPANS)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
  const re = /(?:₹|rs\.?\s?)?\s?\d[\d,]*(?:\.\d+)?\s?(?:k\b|lakhs?\b|lacs?\b|crores?\b|cr\b)?\s?[+%]?/gi;
  for (const m of text.matchAll(re)) {
    const quote = m[0].trim();
    const idx = (m.index ?? 0) + m[0].indexOf(quote);
    const before = text.slice(Math.max(0, idx - 12), idx).toLowerCase();
    const after = text.slice(idx + quote.length, idx + quote.length + 14).toLowerCase();
    const value = parseNumber(quote);
    if (value === null) continue;
    if (masked.some(([s0, e0]) => idx >= s0 && idx < e0)) continue;
    const bare = /^\d+$/.test(quote);
    if (/(air|rank|#|no\.)\s*$/.test(before)) continue; // ranks belong to the student rule
    if (/^#/.test(text.slice(Math.max(0, idx - 1), idx))) continue;
    if (bare && value >= 1990 && value <= 2100) continue; // years
    if (bare && new RegExp(`^\\s*(${MONTHS})\\b`).test(after)) continue; // "1 December"
    if (bare && new RegExp(`(${MONTHS})\\s*$`).test(before)) continue; // "December 1"
    if (bare && /^\s*(am|pm|st|nd|rd|th)\b|^:\d/.test(after)) continue;
    if (bare && value < 10) continue; // "2 batches" - too small to be a marketable claim
    if (/[\d@._-]$/.test(before.slice(-1)) || /^[\d@]/.test(after)) continue; // part of a phone/email/id
    out.push({ quote, value, index: idx });
  }
  return out;
}

const has = (hay: string, kws: string[]) => kws.some((k) => new RegExp(`(?<![a-z])${esc(k.toLowerCase())}`, "i").test(hay));

/** Compare numeric claims with the Facts Register. The AI never decides whether two numbers match. */
export function claimHits(rule: Rule, text: string, facts: Fact[], claims: NumberClaim[], skipQuotes: string[]): Finding[] {
  const out: Finding[] = [];
  const t = today();
  const numericFacts = facts.filter((f) => f.kind === "fact" && f.value !== null);
  const seen = new Set<string>();
  for (const c of claims) {
    if (seen.has(c.quote) || skipQuotes.some((q) => q.includes(c.quote))) continue;
    seen.add(c.quote);
    const sent = sentenceAt(text, c.index);
    const sameValue = numericFacts.filter((f) => Number(f.value) === c.value);
    const b = base(rule, "claims");
    const subjectMatch = sameValue.find((f) => has(sent.text, f.keywords));
    const f = subjectMatch ?? sameValue[0];
    if (f) {
      if (f.valid_from && f.valid_from > t) {
        const alt = f.meta.embargo_text;
        out.push({
          ...b, severity: "critical", risk: "high", fact_id: f.id,
          quote: alt && sent.text.trim().length <= 160 ? sent.text.trim() : c.quote,
          message: `Embargoed fact. ${f.id} ("${f.statement}") is not valid until ${f.valid_from}, so ${c.quote} can't be published yet.`,
          fix: alt ?? null,
          fix_note: alt ? `Holding line approved for use until ${f.valid_from}.` : `Remove the figure, or publish on or after ${f.valid_from}.`,
        });
        continue;
      }
      if (f.valid_until && f.valid_until < t) {
        out.push({
          ...b, severity: "major", fact_id: f.id, quote: c.quote,
          message: `Outdated fact. ${f.id} ("${f.statement}") expired on ${f.valid_until}. Ask ${f.owner || "the owner"} for the current figure.`,
          fix: null,
        });
        continue;
      }
      if (!subjectMatch) {
        out.push({
          ...b, severity: "critical", risk: "high", fact_id: f.id,
          quote: sent.text.trim().length <= 160 ? sent.text.trim() : c.quote,
          message: `Contradicts an approved fact. The draft uses ${c.quote} for something else; ${f.id} says: "${f.statement}".`,
          fix: f.statement, fix_note: `Wording of approved fact ${f.id}.`,
        });
        continue;
      }
      if (f.disclosure && f.disclosure_keywords.length && !has(text, f.disclosure_keywords)) {
        out.push({
          ...b, severity: "major", risk: "high", fact_id: f.id, quote: c.quote,
          message: `Missing disclosure. ${f.id} must appear with: "${f.disclosure}".`,
          fix: null, fix_note: `Add: ${f.disclosure}`,
        });
      }
      continue;
    }
    const sameSubject = numericFacts.find((x) => has(sent.text, x.keywords) && (!x.valid_from || x.valid_from <= t) && (!x.valid_until || x.valid_until >= t));
    if (sameSubject) {
      out.push({
        ...b, severity: "critical", risk: "high", fact_id: sameSubject.id, quote: c.quote,
        message: `Contradicts an approved fact. The draft says ${c.quote}; ${sameSubject.id} says: "${sameSubject.statement}".`,
        fix: null, fix_note: `Use the figure in ${sameSubject.id}.`,
      });
    } else {
      out.push({
        ...b, severity: "major", level: "suggestion", quote: c.quote,
        message: `No approved fact supports ${c.quote}. Add it to the Facts Register with evidence, or remove it.`,
        fix: null,
      });
    }
  }
  return out;
}

/** A ranked student shown in an ad needs a course and a consent record dated after the result. */
function studentHits(rule: Rule, text: string, facts: Fact[]): Finding[] {
  const out: Finding[] = [];
  const students = facts.filter((f) => f.kind === "student");
  const re = /([A-Z][a-z]+)\s*[,(-]?\s*(?:AIR|All India Rank|Rank)\s*#?\s*(\d+)/g;
  for (const m of text.matchAll(re)) {
    const name = m[1].toLowerCase();
    const rec = students.find((s) => (s.meta.name ?? "").toLowerCase().split(/\s+/).includes(name));
    const b = base(rule, "code");
    const problems: string[] = [];
    if (!rec) problems.push("no student record in the register");
    else {
      if (!rec.meta.course) problems.push("no course on record");
      if (!rec.meta.consent_date) problems.push("no written consent on record");
      else if (rec.meta.result_date && rec.meta.consent_date < rec.meta.result_date) problems.push("consent is dated before the result");
      if (rec.meta.course && !text.toLowerCase().includes(rec.meta.course.toLowerCase())) problems.push(`the course ("${rec.meta.course}") is not shown beside the name`);
    }
    if (!problems.length) continue;
    const canFix = rec?.meta.course && rec.meta.consent_date && !(rec.meta.result_date && rec.meta.consent_date < rec.meta.result_date);
    out.push({
      ...b, quote: m[0], fact_id: rec?.id ?? null,
      message: `Student result shown without what the coaching guidelines require: ${problems.join("; ")}.`,
      fix: canFix ? `${rec!.meta.name} (AIR ${m[2]}, ${rec!.meta.course})` : null,
      fix_note: canFix ? `Course added from student record ${rec!.id}.` : "Hold this name until a course and a consent record dated after the result are on file.",
    });
  }
  return out;
}

export function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  // A tone hit that sits inside a stronger finding's quote adds nothing for the reader.
  findings = findings.filter((f) => !(f.check_type === "voice" && findings.some((o) => o !== f && o.quote !== f.quote && o.quote.includes(f.quote))));
  return findings.filter((f) => {
    const k = `${f.rule_id}|${f.quote}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** One code rule against the text. Also the function the rule-test run calls. */
const DEVANAGARI = /[\u0900-\u097F]/;

/** A results claim must carry the approved disclaimer, written in the claim's own script. */
function disclaimerHits(rule: Rule, text: string, kit: Kit): Finding[] {
  const d = kit.disclaimers.find((x) => x.id === rule.config.fixFactId) ?? kit.disclaimers[0];
  if (!d) return [];
  let trigger: RegExpMatchArray | null = null;
  for (const entry of rule.config.patterns ?? []) {
    let re: RegExp | null = null;
    try { re = new RegExp(typeof entry === "string" ? entry : entry.re, "i"); } catch { re = null; } // non-global: keeps .index
    const m = re ? text.match(re) : null;
    if (m && (trigger === null || (m.index ?? 0) < (trigger.index ?? 0))) trigger = m;
  }
  if (!trigger) return [];
  const has = text.toLowerCase().includes(d.text.toLowerCase().replace(/\.$/, ""));
  const claimHindi = DEVANAGARI.test(sentenceAt(text, trigger.index ?? 0).text);
  if (has && !claimHindi) return [];
  if (has && claimHindi && DEVANAGARI.test(d.text)) return [];
  const s = sentenceAt(text, trigger.index ?? 0);
  // Quote the sentence with its closing punctuation, so the fix can add the disclaimer after it cleanly.
  const tail = text.slice(s.end).match(/^[.!?]+/)?.[0] ?? "";
  const quote = (s.text + tail).trim();
  const sentence = /[.!?]$/.test(quote) ? quote.replace(/[!?]+$/, ".").replace(/\.{2,}$/, ".") : quote + ".";
  return [{
    ...base(rule, "code"), quote,
    message: has
      ? `The claim is written in Hindi but disclaimer ${d.id} appears only in English. The coaching guidelines expect the disclaimer in the same language as the claim.`
      : `This mentions results ("${trigger[0]}") without disclaimer ${d.id}: "${d.text}"`,
    fix: has ? null : `${sentence} ${d.text}`,
    fix_note: has ? `Add a Hindi version of ${d.id} beside the claim; ask compliance for the approved translation.` : `Approved disclaimer ${d.id} from the Brand Kit, added after the claim.`,
  }];
}

export function runCodeRule(rule: Rule, text: string, facts: Fact[], kit: Kit, claims?: NumberClaim[], skipQuotes: string[] = []): Finding[] {
  switch (rule.category) {
    case "disclaimer": return disclaimerHits(rule, text, kit);
    case "term": return termHits(rule, text);
    case "contact": return contactHits(rule, text, kit);
    case "claims": return claimHits(rule, text, facts, claims ?? extractNumberClaims(text), skipQuotes);
    case "student": return studentHits(rule, text, facts);
    default: return patternHits(rule, text, facts);
  }
}

/** Every deterministic check: code rules, plus the pattern pre-filter of judgment rules. */
export function runCodeChecks(text: string, rules: Rule[], facts: Fact[], kit: Kit, claims?: NumberClaim[]): Finding[] {
  const out: Finding[] = [];
  const ordered = [...rules].sort((a, b) => (a.category === "claims" ? 1 : 0) - (b.category === "claims" ? 1 : 0));
  for (const rule of ordered) {
    if (rule.kind === "judgment") out.push(...patternHits(rule, text, facts));
    else out.push(...runCodeRule(rule, text, facts, kit, claims, out.map((f) => f.quote)));
  }
  return dedupe(out);
}
