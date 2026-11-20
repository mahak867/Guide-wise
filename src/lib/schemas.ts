import { z } from "zod";

// Shared input validation for rules, facts and Brand Kit assets, so the API, the importer and the
// pages agree on what a valid rule or fact is. Anything that fails here is a 400, never stored.

/**
 * A pattern a manager may store. It must compile, stay short, and avoid nested quantifiers such as
 * "(a+)+", which can take exponential time on some inputs and stall a review.
 */
export function patternProblem(src: string): string | null {
  if (src.length > 300) return "is longer than 300 characters";
  try { new RegExp(src, "gi"); } catch { return "is not a valid pattern"; }
  if (/\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)[+*{]/.test(src)) return "repeats a group that already repeats, which can stall a review";
  return null;
}
const pattern = z.union([z.string(), z.object({ re: z.string(), fix: z.string().max(1000).optional(), factId: z.string().max(24).optional() })])
  .superRefine((p, ctx) => {
    const src = typeof p === "string" ? p : p.re;
    const why = patternProblem(src);
    if (why) ctx.addIssue({ code: "custom", message: `the pattern "${src.slice(0, 40)}" ${why}` });
  });

export const RuleConfig = z.object({
  avoid: z.array(z.string().min(1).max(120)).max(50).optional(),
  prefer: z.string().max(200).optional(),
  patterns: z.array(pattern).max(30).optional(),
  fixText: z.string().max(1000).optional(),
  fixFactId: z.string().max(24).optional(),
  guidance: z.string().max(1000).optional(),
  names: z.array(z.string().min(2).max(80)).max(10).optional(),
  allow: z.array(z.string().max(20)).max(50).optional(),
  maxChars: z.number().int().min(1).max(100000).optional(),
  maxWords: z.number().int().min(3).max(500).optional(),
  logo: z.object({ minWidth: z.number().min(0).max(1).optional(), clear: z.number().min(0).max(2).optional() }).optional(),
  channels: z.array(z.string().max(20)).max(10).optional(),
  requires: z.array(z.string().superRefine((src, ctx) => {
    const why = patternProblem(src);
    if (why) ctx.addIssue({ code: "custom", message: `the pattern "${src.slice(0, 40)}" ${why}` });
  })).max(30).optional(),
  missing: z.string().max(300).optional(),
  append: z.string().max(200).optional(),
  words: z.array(z.string().min(2).max(40)).max(500).optional(),
  maxEmoji: z.number().int().min(0).max(100).optional(),
  except: z.array(z.string().trim().min(3).max(120)).max(30).optional(),
  message: z.string().max(300).optional(),
}).passthrough();

/** Code checks that read their words, names or limits from the rule's own config; the rest use built-in lists or the Brand Kit. */
const NEEDS: Record<string, { key: "avoid" | "patterns" | "names" | "requires" | "maxChars"; what: string }[]> = {
  term: [{ key: "avoid", what: "no words to flag" }],
  pattern: [{ key: "patterns", what: "no phrases or patterns to flag" }],
  "brand-name": [{ key: "names", what: "no names to check" }],
  competitor: [{ key: "names", what: "no competitor names" }],
  requires: [{ key: "patterns", what: "no words that trigger it" }, { key: "requires", what: "no required words" }],
  disclaimer: [{ key: "patterns", what: "no words that trigger it" }],
  length: [{ key: "maxChars", what: "no character limit" }],
};
const BUILT_IN = new Set(["contact", "claims", "student", "caps", "readability", "link-text", "hashtag", "excess", "hidden", "consistency"]);

/**
 * Why a code rule's check could never flag anything, or null. A term rule with no words, or a pattern rule with no
 * patterns, would pass every test sentence that should pass and look healthy while checking nothing.
 */
export function flagsNothing(rule: { kind: string; category: string; config: Record<string, unknown> }): string | null {
  if (rule.kind !== "code" || BUILT_IN.has(rule.category) || rule.category.startsWith("visual-")) return null;
  const needs = NEEDS[rule.category] ?? NEEDS.pattern; // any other category runs as a pattern check
  for (const n of needs) {
    const v = rule.config[n.key];
    const empty = Array.isArray(v)
      ? !v.some((x) => (typeof x === "string" ? x : (x as { re?: string } | null)?.re ?? "").trim())
      : typeof v !== "number" || v <= 0;
    if (empty) return `its check has ${n.what}, so it could never flag anything`;
  }
  return null;
}

export const RuleId = z.string().regex(/^[A-Z0-9-]{1,24}$/, "use capital letters, digits and hyphens, up to 24 characters");
export const RuleIn = z.object({
  id: RuleId, kind: z.enum(["code", "judgment"]), category: z.string().min(1).max(40), title: z.string().min(1).max(200), description: z.string().max(1000).default(""),
  severity: z.enum(["critical", "major", "minor"]).default("major"), status: z.enum(["advisory", "enforced"]).default("advisory"),
  source: z.string().max(300).default("Imported"), risk: z.enum(["low", "high"]).default("low"),
  config: RuleConfig.default({}),
  tests: z.array(z.object({ text: z.string().min(1).max(600), expect: z.enum(["flag", "pass"]) })).max(20).default([]),
  precedent: z.object({ order: z.string(), note: z.string(), source: z.string() }).nullable().default(null),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use a date like 2026-03-31")
  .refine((s) => !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().startsWith(s), "is not a real date");
export const FactIn = z.object({
  id: RuleId, kind: z.enum(["fact", "student"]).default("fact"), statement: z.string().min(1).max(600),
  value: z.number().finite().nullable().default(null),
  keywords: z.array(z.string().max(80)).max(30).default([]), evidence: z.string().max(600).default(""), owner: z.string().max(200).default(""),
  valid_from: isoDate.nullable().default(null), valid_until: isoDate.nullable().default(null),
  disclosure: z.string().max(600).default(""), disclosure_keywords: z.array(z.string().max(80)).max(30).default([]),
  meta: z.record(z.string(), z.unknown()).default({}),
}).refine((f) => !f.valid_from || !f.valid_until || f.valid_from <= f.valid_until, { message: "the end date is before the start date" });

export const Palette = z.array(z.object({ name: z.string().min(1).max(60), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "use a colour like #0F6B5F") })).max(24);
export const Disclaimers = z.array(z.object({ id: z.string().min(1).max(24), text: z.string().min(1).max(600), when: z.string().max(300) })).max(40)
  .refine((d) => new Set(d.map((x) => x.id)).size === d.length, "two disclaimers have the same ID");
export const Contacts = z.array(z.object({ label: z.string().min(1).max(80), value: z.string().min(3).max(200) })).max(20);

/** First problem in a Zod error, as one readable sentence. */
export function firstIssue(e: z.ZodError): string {
  const i = e.issues[0];
  const where = i.path.join(".").replace(/_/g, " ");
  return where ? `${where}: ${i.message}` : i.message;
}
