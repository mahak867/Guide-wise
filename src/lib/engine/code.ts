import type { Fact, Finding, Kit, Rule } from "../types";
import { findEmails, findPhones } from "./redact";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A literal phrase as a loose pattern: any run of spaces matches any whitespace, and case is ignored. */
export function phraseRe(phrase: string, flags = "gi"): RegExp {
  return new RegExp(esc(phrase.trim()).replace(/\s+/g, "\\s+"), flags);
}

/**
 * A rule's exceptions (config.except): phrases in which its words are allowed, e.g. "cheap tricks" for the
 * "affordable, not cheap" rule. A finding is dropped only when every place its quote occurs sits inside an
 * exception, so the same word elsewhere in the text is still flagged.
 */
export function dropExcepted<T extends { quote: string }>(rule: Rule, text: string, findings: T[]): T[] {
  const except = (rule.config.except ?? []).filter((e) => e.trim());
  if (!except.length || !findings.length) return findings;
  const spans: [number, number][] = [];
  for (const e of except) for (const m of text.matchAll(phraseRe(e))) spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  if (!spans.length) return findings;
  const find = (hay: string, q: string) => { const at: number[] = []; for (let i = hay.indexOf(q); i >= 0; i = hay.indexOf(q, i + 1)) at.push(i); return at; };
  return findings.filter((f) => {
    const q = f.quote.trim();
    if (!q) return true;
    // Findings quote the text as written ("Cheap" and "cheap" are separate findings); an AI quote may differ in case.
    const at = find(text, q).length ? find(text, q) : find(text.toLowerCase(), q.toLowerCase());
    return !at.length || !at.every((i) => spans.some(([a, b]) => i >= a && i + q.length <= b));
  });
}

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
  return dropExcepted(rule, text, out);
}

function termHits(rule: Rule, text: string): Finding[] {
  const out: Finding[] = [];
  for (const term of rule.config.avoid ?? []) {
    // A hyphen or space in the term also matches the look-alike hyphens and spaces that editors insert.
    const loose = esc(term).replace(/\\?-/g, "[-\u2010\u2011\u2012\u2013]").replace(/ /g, "[ \u00A0]");
    const re = new RegExp(`(?<![A-Za-z])${loose}(?![A-Za-z])`, "gi");
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
  /** "ai" when the AI identified it as a claim; code-found figures must also look like a claim. */
  source?: "ai" | "code";
}

// Words that make a figure a claim the reader is asked to believe, rather than a page number or a count in passing.
const CLAIM_NOUNS = /^[\s\w-]{0,24}?\b(students?|selections?|selected|toppers?|ranks?|rankers|results?|years?|centres?|centers?|branches|cities|teachers?|faculty|mentors?|batches|courses?|learners?|aspirants?|parents?|reviews?|ratings?|stars?|seats?|qualified|cleared|success|placements?|alumni|members|customers|users|families|schools|colleges)\b/i;
const CLAIM_LEAD = /\b(over|more than|nearly|almost|up to|upto|above|at least|top|record|only|just|trusted by|join)\s*$/i;

/** Does this figure read as a claim? Units, +, % and currency say so; otherwise the words around it must. */
export function claimLike(text: string, c: NumberClaim): boolean {
  if (c.source === "ai") return true;
  if (/[+%₹]|lakh|lac|crore|\bcr\b|\bk\b|rs\.?/i.test(c.quote)) return true;
  const after = text.slice(c.index + c.quote.length, c.index + c.quote.length + 40);
  const before = text.slice(Math.max(0, c.index - 24), c.index);
  return CLAIM_NOUNS.test(after) || CLAIM_LEAD.test(before);
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
const CONTACT_SPANS = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g; // bounded: an unbounded run made long words take quadratic time

export function extractNumberClaims(text: string): NumberClaim[] {
  const out: NumberClaim[] = [];
  const masked: [number, number][] = [...text.matchAll(CONTACT_SPANS)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
  const re = /(?:₹|rs\.?\s?)?\s?\d[\d,]*(?:\.\d+)?\s?(?:k\b|lakhs?\b|lacs?\b|crores?\b|cr\b)?\s?[+%]?/gi;
  for (const m of text.matchAll(re)) {
    const quote = m[0].trim().replace(/[,.]+$/, ""); // "2025," is a year followed by a comma
    const idx = (m.index ?? 0) + m[0].indexOf(quote);
    const before = text.slice(Math.max(0, idx - 12), idx).toLowerCase();
    const after = text.slice(idx + quote.length, idx + quote.length + 14).toLowerCase();
    const value = parseNumber(quote);
    if (value === null) continue;
    if (masked.some(([s0, e0]) => idx >= s0 && idx < e0)) continue;
    if (/[A-Za-z]/.test(text[idx - 1] ?? "") && !/^(?:₹|rs)/i.test(quote)) continue; // part of a code or name: EARLY10, Class12
    const bare = /^\d+$/.test(quote);
    if (/(air|rank|#|no\.)\s*$/.test(before)) continue; // ranks belong to the student rule
    if (/^#/.test(text.slice(Math.max(0, idx - 1), idx))) continue;
    if (bare && value >= 1990 && value <= 2100) continue; // years
    if (bare && new RegExp(`^\\s*(${MONTHS})\\b`).test(after)) continue; // "1 December"
    if (bare && new RegExp(`(${MONTHS})\\s*$`).test(before)) continue; // "December 1"
    if (bare && /^\s*(am|pm|st|nd|rd|th)\b|^:\d/.test(after)) continue;
    if (bare && /\b(first|next|last)\s*$/.test(before)) continue; // "the first 50 students" caps an offer; it is not a count of students taught
    if (bare && value < 10) continue; // "2 batches" - too small to be a marketable claim
    if (/[\d@._-]$/.test(before.slice(-1)) || /^[\d@]/.test(after)) continue; // part of a phone/email/id
    out.push({ quote, value, index: idx });
  }
  return out;
}

const has = (hay: string, kws: string[]) => kws.some((k) => new RegExp(`(?<![a-z])${esc(k.toLowerCase())}`, "i").test(hay));

/**
 * The words a figure counts: what follows it up to the next figure or clause break, plus a few words before it.
 * "Join 2,000+ students, 300+ teachers" gives "students" for 2,000+ and "teachers" for 300+.
 */
export function subjectWindow(text: string, c: NumberClaim): string {
  const after = text.slice(c.index + c.quote.length, c.index + c.quote.length + 48).split(/[\d.;!?,]|\band\b/)[0];
  const before = text.slice(Math.max(0, c.index - 28), c.index).split(/[\d.;!?,]/).pop() ?? "";
  return `${before} ${after}`;
}

/**
 * The fact that replaces an expired one (meta.superseded_by), followed along a chain of replacements
 * to the first that is valid today. Null when there is none, or the chain loops.
 */
export function successor(f: Fact, facts: Fact[], t = today()): Fact | null {
  const seen = new Set([f.id]);
  let id = f.meta?.superseded_by;
  while (id && !seen.has(id)) {
    seen.add(id);
    const next = facts.find((x) => x.id === id && x.kind === "fact");
    if (!next) return null;
    if ((!next.valid_from || next.valid_from <= t) && (!next.valid_until || next.valid_until >= t)) return next;
    id = next.meta?.superseded_by;
  }
  return null;
}

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
    const near = subjectWindow(text, c);
    const subjectMatch = sameValue.find((f) => has(near, f.keywords));
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
        const next = successor(f, facts, t);
        if (next) {
          const whole = sent.text.trim().length <= 160;
          out.push({
            ...b, severity: "major", fact_id: f.id, quote: whole ? sent.text.trim() : c.quote,
            message: `Outdated fact. ${f.id} ("${f.statement}") expired on ${f.valid_until}. Use ${next.id} instead: "${next.statement}".`,
            fix: whole ? next.statement : null,
            fix_note: `${next.id} replaces ${f.id} in the Facts Register${next.valid_until ? ` (valid until ${next.valid_until})` : ""}.${whole ? "" : ` Rewrite the sentence with: "${next.statement}".`}`,
          });
          continue;
        }
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
    const sameSubject = numericFacts.find((x) => has(near, x.keywords) && (!x.valid_from || x.valid_from <= t) && (!x.valid_until || x.valid_until >= t));
    if (sameSubject) {
      out.push({
        ...b, severity: "critical", risk: "high", fact_id: sameSubject.id, quote: c.quote,
        message: `Contradicts an approved fact. The draft says ${c.quote}; ${sameSubject.id} says: "${sameSubject.statement}".`,
        fix: null, fix_note: `Use the figure in ${sameSubject.id}.`,
      });
    } else if (claimLike(text, c)) {
      out.push({
        ...b, severity: "minor", level: "suggestion", quote: c.quote,
        message: `No approved fact supports ${c.quote}. Add it to the Facts Register with evidence, or remove it.`,
        fix: null,
      });
    }
  }
  // Many unsupported figures in one place are one problem, not many: keep the first and list the rest.
  const unsupported = out.filter((f) => f.message.startsWith("No approved fact supports"));
  if (unsupported.length > 2) {
    const [first, ...rest] = unsupported;
    first.message = `${unsupported.length} figures have no approved fact behind them: ${unsupported.map((f) => f.quote).join(", ")}. Add them to the Facts Register with evidence, or remove them.`;
    return out.filter((f) => !rest.includes(f));
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

/** Brand names written with the wrong capitals or spacing ("Preppath", "Prep Path"). Web and email addresses are left alone. */
function brandNameHits(rule: Rule, text: string): Finding[] {
  const out: Finding[] = [];
  for (const name of rule.config.names ?? []) {
    const parts = name.split(/(?<=[a-z])(?=[A-Z])|\s+/).filter(Boolean).map(esc);
    if (!parts.length) continue;
    const re = new RegExp(`(?<![\\w@./-])${parts.join("[\\s-]?")}(?![\\w-]|\\.[a-z])`, "gi");
    const seen = new Set<string>();
    for (const m of text.matchAll(re)) {
      if (m[0] === name || seen.has(m[0])) continue;
      seen.add(m[0]);
      out.push({
        ...base(rule, "code"), quote: m[0],
        message: `"${m[0]}" should be written "${name}", exactly as in the Brand Kit.`,
        fix: name, fix_note: "Brand name as registered in the Brand Kit.",
      });
    }
  }
  return out;
}

/** Words in capitals for emphasis ("SELECTION GUARANTEED"). Short acronyms and the allowed list (JEE, NEET) pass. */
function capsHits(rule: Rule, text: string): Finding[] {
  const allow = new Set((rule.config.allow ?? []).map((a) => a.toUpperCase()));
  const shouting = (w: string) => w.replace(/[^A-Z]/g, "").length >= 4 && !allow.has(w.replace(/['’]S$/, ""));
  const out: Finding[] = [];
  for (const m of text.matchAll(/(?<![\w@.])[A-Z][A-Z'’]+(?:[\s-]+[A-Z][A-Z'’]+)*(?![\w])/g)) {
    const words = m[0].split(/([\s-]+)/);
    if (!words.some((w, i) => i % 2 === 0 && shouting(w))) continue;
    const before = text.slice(0, m.index).trimEnd();
    const startOfSentence = !before || /[.!?\n:]$/.test(before);
    const fixed = words.map((w, i) => (i % 2 || !shouting(w) ? w : w.toLowerCase())).join("");
    out.push({
      ...base(rule, "code"), quote: m[0],
      message: `"${m[0]}" is set in capitals for emphasis. The brand voice does not shout.`,
      fix: startOfSentence ? fixed.charAt(0).toUpperCase() + fixed.slice(1) : fixed,
      fix_note: "Same words in sentence case. Acronyms in the rule's allowed list are kept.",
    });
  }
  return out;
}

/** Text past a channel's visible limit, e.g. ad text hidden behind "See more". */
function lengthHits(rule: Rule, text: string): Finding[] {
  const max = rule.config.maxChars ?? 0;
  const body = text.trim();
  if (!max || body.length <= max) return [];
  const cut = body.lastIndexOf(" ", max) > max * 0.6 ? body.lastIndexOf(" ", max) : max;
  const rest = body.slice(cut).trim();
  const quote = rest.length > 70 ? rest.slice(0, rest.lastIndexOf(" ", 70) > 20 ? rest.lastIndexOf(" ", 70) : 70) : rest;
  return [{
    ...base(rule, "code"), quote,
    message: `This text is ${body.length} characters; only the first ${max} show before it is cut off. Everything from "${quote}" onwards is hidden until the reader taps.`,
    fix: null,
    fix_note: `Put the offer, the call to action and any required disclaimer in the first ${max} characters, or shorten the text.`,
  }];
}

/** Sentences too long to read comfortably on a phone. */
function readabilityHits(rule: Rule, text: string): Finding[] {
  const max = rule.config.maxWords ?? 30;
  const out: Finding[] = [];
  for (const m of text.matchAll(/[^.!?\n]+[.!?]*/g)) {
    const s = m[0].trim();
    const words = s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    if (words <= max) continue;
    out.push({
      ...base(rule, "code"), quote: s,
      message: `This sentence has ${words} words. Sentences over ${max} words are hard to follow on a phone screen.`,
      fix: null, fix_note: "Split it into two or three sentences, one idea each.",
    });
  }
  return out;
}

const HIDDEN = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/;
/** Invisible characters (zero-width spaces, direction overrides, soft hyphens) can hide a banned phrase from every other check. */
function hiddenHits(rule: Rule, text: string): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/\S+/g)) {
    if (!HIDDEN.test(m[0]) || seen.has(m[0])) continue;
    seen.add(m[0]);
    const clean = m[0].replace(new RegExp(HIDDEN.source, "g"), "");
    const n = m[0].length - clean.length;
    out.push({
      ...base(rule, "code"), quote: m[0],
      message: clean
        ? `"${clean}" contains ${n} invisible character${n > 1 ? "s" : ""}. They do not show on screen but can hide a word from the checks, or change how text is read aloud.`
        : `${n} invisible character${n > 1 ? "s" : ""} here. They do not show on screen but can hide words from the checks.`,
      fix: clean, fix_note: "Same text with the invisible characters removed. The checks run again on the result.",
    });
  }
  return out;
}

/**
 * A trigger needs one of the required words somewhere in the same text: paid content needs "#ad",
 * an offer needs an end date or "T&C apply". With `append`, the fix adds those words after the sentence.
 */
function requiresHits(rule: Rule, text: string): Finding[] {
  const present = (rule.config.requires ?? []).some((src) => {
    try { return new RegExp(src, "i").test(text); } catch { return false; }
  });
  if (present) return [];
  const missing = rule.config.missing ?? "the required words";
  const out: Finding[] = [];
  const sentences = new Set<number>();
  for (const entry of rule.config.patterns ?? []) {
    const re = safeRegex(typeof entry === "string" ? entry : entry.re);
    if (!re) continue;
    for (const m of text.matchAll(re)) {
      const word = m[0].trim();
      if (!word) continue;
      const s = sentenceAt(text, m.index ?? 0);
      if (sentences.has(s.start)) continue; // one finding per sentence
      sentences.add(s.start);
      const b = base(rule, "code");
      if (rule.config.append) {
        // One label fixes the whole post, so one finding is enough.
        if (out.length) continue;
        const quote = (s.text + (text.slice(s.end).match(/^[.!?]+/)?.[0] ?? "")).trim();
        out.push({
          ...b, quote,
          message: rule.config.message ? `${rule.config.message} The text has no ${missing}.` : `"${word}" reads as paid or partner content, but the post has no ${missing}.`,
          fix: `${quote} ${rule.config.append}`,
          fix_note: `Adds ${rule.config.append} after the sentence. A label at the start of the post is clearer still.`,
        });
      } else {
        out.push({
          ...b, quote: word,
          message: rule.config.message ? `${rule.config.message} The text has no ${missing}.` : `"${word}" is an offer, but the text gives no ${missing}. A reader cannot tell when it ends or what it excludes.`,
          fix: null,
          fix_note: `Add ${missing}, in the same text as the offer.`,
        });
      }
    }
  }
  return out.sort((a, b) => text.indexOf(a.quote) - text.indexOf(b.quote));
}

/** Another coaching institute named in our copy. Comparative claims are the brand manager's decision. */
function competitorHits(rule: Rule, text: string): Finding[] {
  const out: Finding[] = [];
  for (const name of rule.config.names ?? []) {
    const parts = name.trim().split(/\s+/).filter(Boolean).map(esc);
    if (!parts.length) continue;
    const re = new RegExp(`(?<![\\w@./-])${parts.join("[\\s-]*")}(?![\\w-])`, "gi");
    const seen = new Set<string>();
    for (const m of text.matchAll(re)) {
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      out.push({
        ...base(rule, "code"), quote: m[0],
        message: `"${m[0]}" is another coaching institute. Naming a competitor makes this a comparative claim, which needs the brand manager's approval and evidence on file.`,
        fix: null,
        fix_note: "Remove the name, or ask the brand manager to approve the comparison with evidence.",
      });
    }
  }
  return out;
}

/** "Click here", "tap here" and "read more" that do not say where they lead. Screen readers list links out of context. */
function linkTextHits(rule: Rule, text: string): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/\b(?:click|tap)\s+here\b|\bread\s+more\b/gi)) {
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 60);
    // "Click here to download the timetable", "Read more about the crash course": the words say what it is.
    if (/^[^\w.!?\n]{0,8}(?:to|for|about|on)\s+\S/i.test(after)) continue;
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    out.push({
      ...base(rule, "code"), quote: m[0],
      message: `"${m[0]}" does not say what it leads to. Screen readers often read links on their own, and a reader skimming the post cannot tell what they get.`,
      fix: null,
      fix_note: "Say what the link gives the reader, for example \"Download the December timetable\" or \"See the fees at preppath.in/fees\".",
    });
  }
  return out;
}

// Words for splitting lower-case hashtags into their parts. Three letters or more, so short words cannot carve up a longer one.
const HASHTAG_WORDS = (
  "jee neet iit nit aiims cbse icse kcet bitsat upsc main mains advanced exam exams prep preparation path academy coaching class classes " +
  "classroom batch batches crash course courses test tests mock series paper papers result results topper toppers student students " +
  "dropper droppers aspirant aspirants study studies tips tip day days daily week weekly month life success story stories journey goal goals " +
  "dream dreams college colleges school doctor doctors engineer engineers engineering medical year plan hard work smart revision revise " +
  "physics chemistry maths math biology science online offline live doubt doubts session sessions mentor mentors faculty teacher teachers " +
  "new december january february march april june july august september october november morning night motivation focus practice " +
  "adaptive learn learning ready rank ranks seat seats admission admissions open fee fees free scholarship family parents talk talks " +
  "india chennai delhi mumbai bangalore kota hyderabad pune kolkata"
).split(" ");

/** Split a run of lower-case letters into known words, fewest words first. Ambiguous splits give no fix. */
function splitWords(run: string, dict: Set<string>): { words: string[] | null; ambiguous: boolean } {
  const n = run.length;
  const best: { count: number; ways: number; prev: number }[] = Array.from({ length: n + 1 }, () => ({ count: Infinity, ways: 0, prev: -1 }));
  best[0] = { count: 0, ways: 1, prev: -1 };
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(0, i - 20); j <= i - 3; j++) {
      if (best[j].count === Infinity || !dict.has(run.slice(j, i))) continue;
      const c = best[j].count + 1;
      if (c < best[i].count) best[i] = { count: c, ways: best[j].ways, prev: j };
      else if (c === best[i].count) best[i].ways = Math.min(2, best[i].ways + best[j].ways);
    }
  }
  if (best[n].count === Infinity) return { words: null, ambiguous: false };
  const words: string[] = [];
  for (let i = n; i > 0; i = best[i].prev) words.unshift(run.slice(best[i].prev, i));
  return { words, ambiguous: best[n].ways > 1 };
}

/** A hashtag of several words in lower case (#jeepreparation) is read by screen readers as one long word. */
function hashtagHits(rule: Rule, text: string, skipQuotes: string[]): Finding[] {
  const dict = new Set([...HASHTAG_WORDS, ...(rule.config.words ?? []).map((w) => w.toLowerCase())]);
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/(?<![\w&#/])#([a-z0-9]+)(?![\w])/g)) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    // Another rule already flags words inside this tag (e.g. the brand name in #preppath): its fix comes first.
    if (skipQuotes.some((q) => q && m[0].toLowerCase().includes(q.toLowerCase()))) continue;
    const runs = m[1].match(/[a-z]+|\d+/g) ?? [];
    let words = 0, ambiguous = false, unknown = false;
    const fixed = runs.map((r) => {
      if (/^\d/.test(r)) return r;
      const s = splitWords(r, dict);
      if (!s.words) { unknown = true; return r; }
      words += s.words.length;
      ambiguous ||= s.ambiguous;
      return s.words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
    }).join("");
    if (unknown || words < 2) continue; // a single word, or one we cannot split safely
    out.push({
      ...base(rule, "code"), quote: m[0],
      message: `"${m[0]}" runs ${words} words together in lower case. Screen readers read it as one long word; a capital at the start of each word fixes that.`,
      fix: ambiguous ? null : `#${fixed}`,
      fix_note: ambiguous ? "Capitalise the first letter of each word." : "Same hashtag with a capital at the start of each word (CamelCase).",
    });
  }
  return out;
}

// One emoji, counted as the reader sees it: a flag, a skin tone or a joined sequence counts once.
const EMOJI = /[\u{1F1E6}-\u{1F1FF}]{2}|(?:[\u{1F000}-\u{1FAFF}]|[☀-➿]|[⬀-⯿])️?(?:[\u{1F3FB}-\u{1F3FF}]|‍(?:[\u{1F000}-\u{1FAFF}]|[☀-➿])️?)*/gu;

/** Stacked "!!" or "?!", and more emoji than the rule allows. */
function excessHits(rule: Rule, text: string, skipQuotes: string[]): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/[!?]{2,}/g)) {
    // Another rule (the tone rule on "!!") already flags these characters with its own fix.
    if (seen.has(m[0]) || skipQuotes.some((q) => q && (q === m[0] || m[0].includes(q) || q.includes(m[0])))) continue;
    seen.add(m[0]);
    out.push({
      ...base(rule, "code"), quote: m[0],
      message: `"${m[0]}" stacks punctuation. One mark reads as calm and sure; several read as hype.`,
      fix: m[0].includes("?") ? "?" : ".",
      fix_note: "A single mark.",
    });
  }
  const max = rule.config.maxEmoji ?? 3;
  const emoji = [...text.matchAll(EMOJI)];
  if (emoji.length > max) {
    // Quote from the first emoji to the last (or from the first extra one, if that is too long to read),
    // and offer the same words with the extra emoji taken out.
    const last = emoji[emoji.length - 1];
    const end = (last.index ?? 0) + last[0].length;
    const from = end - (emoji[0].index ?? 0) <= 160 ? 0 : max;
    const start = emoji[from].index ?? 0;
    const span = text.slice(start, end);
    const short = span.length <= 160;
    let fixed = "";
    if (short) {
      let kept = from;
      fixed = span.replace(EMOJI, (e) => (kept++ < max ? e : "")).replace(/[ \t]{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
    }
    out.push({
      ...base(rule, "code"), quote: short ? span : emoji[max][0],
      message: `${emoji.length} emoji in one post. More than ${max} crowd the message, and screen readers read each one aloud by name.`,
      fix: fixed || null,
      fix_note: fixed ? `Keeps the first ${max} emoji and removes the rest.` : `Keep ${max} emoji at most.`,
    });
  }
  return out;
}

export function runCodeRule(rule: Rule, text: string, facts: Fact[], kit: Kit, claims?: NumberClaim[], skipQuotes: string[] = []): Finding[] {
  return dropExcepted(rule, text, codeRuleHits(rule, text, facts, kit, claims, skipQuotes));
}

function codeRuleHits(rule: Rule, text: string, facts: Fact[], kit: Kit, claims: NumberClaim[] | undefined, skipQuotes: string[]): Finding[] {
  switch (rule.category) {
    case "requires": return requiresHits(rule, text);
    case "competitor": return competitorHits(rule, text);
    case "link-text": return linkTextHits(rule, text);
    case "hashtag": return hashtagHits(rule, text, skipQuotes);
    case "excess": return excessHits(rule, text, skipQuotes);
    case "hidden": return hiddenHits(rule, text);
    case "brand-name": return brandNameHits(rule, text);
    case "caps": return capsHits(rule, text);
    case "length": return lengthHits(rule, text);
    case "readability": return readabilityHits(rule, text);
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
    // Only a finding that is itself about the claim (e.g. a guarantee) suppresses the number check on those words.
    // Style checks that overlap older rules (stacked "!!", the brand name in a hashtag) step aside for any earlier finding.
    else out.push(...runCodeRule(rule, text, facts, kit, claims, out.filter((f) => f.check_type === "claims" || rule.category === "hashtag" || rule.category === "excess").map((f) => f.quote)));
  }
  return dedupe(out);
}
