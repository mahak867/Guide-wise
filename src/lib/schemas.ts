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
  if (overlappingRepeat(src)) return "repeats a choice whose options can match the same text, which can stall a review";
  return null;
}

/**
 * True when a repeated group offers a choice of options that are not plain, distinct words, such as "(a|a)*" or
 * "(\w|\d)+". Each repetition can then match the same text more than one way, and a failing match tries every
 * combination: "(a|a)*$" takes several seconds on 27 letters. A choice of distinct words ("(free|guaranteed)+") is safe.
 */
function overlappingRepeat(src: string): boolean {
  const open: number[] = [];
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") { i++; continue; }
    if (inClass) { if (c === "]") inClass = false; continue; }
    if (c === "[") { inClass = true; continue; }
    if (c === "(") { open.push(i); continue; }
    if (c !== ")" || !open.length) continue;
    const start = open.pop()!;
    const next = src.slice(i + 1, i + 8);
    if (!/^(?:[*+]|\{\d*,(?:\d{2,}|[2-9])?\}|\{\d{2,}\}|\{[2-9]\})/.test(next)) continue; // "?" and {0,1} do not repeat
    const options = topLevelOptions(src.slice(start + 1, i).replace(/^\?(?::|<[\w$]+>|[=!]|<[=!])/, ""));
    if (options.length < 2) continue;
    const words = options.map((o) => o.replace(/\\([.\-/&'])/g, "$1"));
    if (words.some((w) => !/^[\p{L}\p{N} .\-/&']+$/u.test(w))) return true;
    const lower = words.map((w) => w.toLowerCase());
    if (lower.some((a, x) => lower.some((b, y) => x !== y && b.startsWith(a)))) return true;
  }
  return false;
}

function topLevelOptions(body: string): string[] {
  const out: string[] = [];
  let depth = 0, inClass = false, last = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\") { i++; continue; }
    if (inClass) { if (c === "]") inClass = false; continue; }
    if (c === "[") inClass = true;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "|" && depth === 0) { out.push(body.slice(last, i)); last = i + 1; }
  }
  out.push(body.slice(last));
  return out;
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

/**
 * Why a logo value cannot be stored, or null. A logo is a PNG or WebP data URL under 400,000 characters whose bytes
 * really are a PNG or WebP image (bug hunt, 20 Nov: "data:image/png;base64,notbase64!!!" was accepted through the API,
 * and every creative was then reported as missing the logo), or one of the demo's own /brand/*.png files.
 */
export function logoProblem(l: unknown): string | null {
  if (typeof l !== "string") return "The logo must be a PNG or WebP image under 300 KB.";
  if (/^\/brand\/[\w.-]+\.png$/.test(l)) return null;
  const m = /^data:image\/(png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(l);
  if (!m || l.length > 400_000) return "The logo must be a PNG or WebP image under 300 KB.";
  const bytes = Buffer.from(m[2].slice(0, 32), "base64");
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = bytes.length >= 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
  if (m[1] === "png" ? !png : !webp) return `That file is not a real ${m[1] === "png" ? "PNG" : "WebP"} image. Export the logo again as a PNG and upload it.`;
  return null;
}
