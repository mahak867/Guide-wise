import { z } from "zod";
import { patternHits, runCodeRule } from "./engine/code";
import { redact, restore } from "./engine/redact";
import { runRuleTests, type TestRun } from "./engine/ruletest";
import { RuleConfig, firstIssue, flagsNothing, patternProblem } from "./schemas";
import type { Fact, Kit, Rule } from "./types";

/*
 * "Make this a rule": a reviewer selects words in a draft (or types a phrase) and Guidewise proposes a Brand Kit rule.
 * Everything that decides what the rule flags is done here, by code:
 *  - the selected words are a term rule (flag these words, optionally use a replacement), or, when they contain a
 *    number, a pattern rule in which each number may be any number ("100% selection" also flags "90% selection");
 *  - the selected words can instead be the preferred wording, with the words it replaces typed by the reviewer;
 *  - test sentences are made from the selected sentence (flag) and the same sentence without the words (pass),
 *    plus one more of each, and the rule's own check runs them before anything is saved;
 *  - a rule that repeats an existing rule's words is refused, naming that rule.
 * The AI may only suggest the title and description wording (see suggestRuleWording in engine/ai.ts), never the check.
 */

export const MakeRuleIn = z.object({
  text: z.string().transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(3, "select at least 3 characters").max(120, "select at most 120 characters (a word or a short phrase)")),
  sentence: z.string().max(600, "the sentence is longer than 600 characters").optional(),
  /** avoid: the selected words are what to flag. prefer: they are the preferred wording; `replacement` lists the words to flag. */
  as: z.enum(["avoid", "prefer"]).default("avoid"),
  /** avoid: the preferred replacement (optional). prefer: the words to flag, comma separated (required). */
  replacement: z.string().max(240, "the replacement is longer than 240 characters").optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
});
export type MakeRuleInput = z.input<typeof MakeRuleIn>;

export interface RuleProposal {
  rule: Rule;
  /** "term": words; "pattern": words with a number, where any number matches. */
  type: "term" | "pattern";
  /** What the check flags, in plain words, e.g. 'any "N% selection" (N is any number)'. */
  check: string;
  /** Existing rules that already flag the selected words in some form: a note, not a refusal. */
  covered_by: { id: string; title: string }[];
  /** The words the rule flags, as selected or typed (in a pattern, each number stands for any number). */
  words: string[];
  /** The suggested replacement, or "" for remove or reword. */
  replacement: string;
  /** Where the title and description came from. */
  wording: "template" | "ai" | "edited";
}

/** Who may add a rule made from words: reviewers and the brand manager. It is always saved as advisory. */
export const CAN_ADD_FROM_WORDS = ["manager", "brand", "compliance"] as const;
export const canAddFromWords = (role: string) => (CAN_ADD_FROM_WORDS as readonly string[]).includes(role);

export type ProposalResult = { ok: true; proposal: RuleProposal } | { ok: false; error: string; status: 400 | 409 };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** For comparing words: lower case, one kind of apostrophe and space, no closing punctuation. */
export const normWords = (s: string) => s.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").replace(/^[\s"'“”]+|[\s"'“”.,;:!?]+$/g, "").trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const NUMBER = /\d+(?:[.,]\d+)*/g;
/** Any number, bounded so it can never stall a check: "7", "100", "4,200", "2.5". */
const ANY_NUMBER = "\\d(?:[\\d,.]{0,8}\\d)?";
const EDGE = /[A-Za-z0-9]/;
const FALLBACK_PASS = "We will share the details on our website.";
/** A word to flag in both apostrophes, since the term check matches characters exactly: "India's" and "India’s". */
const withApostrophes = (words: string[]) => [...new Set(words.flatMap((w) => /['’]/.test(w) ? [w, w.replace(/['’]/g, (c) => (c === "'" ? "’" : "'"))] : [w]))];

/** A literal stretch of the selection as a pattern: any whitespace for spaces, either apostrophe. */
function literal(s: string): string {
  return esc(s).replace(/\s+/g, "\\s+").replace(/['’]/g, "['’]");
}

/**
 * The selected words as a pattern in which each number is any number, or null when they hold no number.
 * "100% selection" → (?<![A-Za-z0-9])\d(?:[\d,.]{0,8}\d)?%\s+selection(?![A-Za-z0-9])
 */
export function generalise(words: string): string | null {
  if (!/\d/.test(words)) return null;
  let out = "", last = 0;
  for (const m of words.matchAll(NUMBER)) {
    out += literal(words.slice(last, m.index)) + ANY_NUMBER;
    last = m.index! + m[0].length;
  }
  out += literal(words.slice(last));
  if (EDGE.test(words[0])) out = "(?<![A-Za-z0-9])" + out;
  if (EDGE.test(words[words.length - 1])) out += "(?![A-Za-z0-9])";
  return out;
}

/** The same words with each number changed (its last digit moved on by one), to show that any number is flagged. */
function otherNumber(words: string): string {
  return words.replace(NUMBER, (n) => n.slice(0, -1) + String((Number(n.slice(-1)) + 1) % 10));
}

/** A sentence with every match of `re` replaced (or removed), tidied so it still reads as a sentence. */
function replaceIn(sentence: string, re: RegExp, by: string): string {
  let s = sentence.replace(re, by);
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").replace(/[,;:]+([.!?])/g, "$1").replace(/^[\s.,;:!?–—-]+/, "").trim();
  return s.length >= 3 ? cap(s) : "";
}

/** Case-insensitive regex for a term as the term check matches it (letters on either side do not count). */
function termRe(term: string): RegExp {
  const loose = esc(term).replace(/\\?-/g, "[-\u2010\u2011\u2012\u2013]").replace(/ /g, "[ \u00A0]").replace(/['’]/g, "['’]");
  return new RegExp(`(?<![A-Za-z])${loose}(?![A-Za-z])`, "gi");
}

/** The next free ID of the form W-01 ("from words"). */
export function nextRuleId(rules: { id: string }[]): string {
  const taken = new Set(rules.map((r) => r.id));
  let n = 1;
  while (taken.has(`W-${String(n).padStart(2, "0")}`)) n++;
  return `W-${String(n).padStart(2, "0")}`;
}

/** The code rule that already uses these words, if any: as a word it flags, or as its preferred term. */
function duplicateOf(words: string[], prefer: string, rules: Rule[], generalised: string | null): string | null {
  const want = new Set(words.map(normWords));
  for (const r of rules) {
    for (const a of r.config.avoid ?? []) {
      if (want.has(normWords(a))) return `${r.id} ("${r.title}") already flags "${a}". Edit that rule instead of adding a second one.`;
    }
    if (prefer && r.config.prefer && normWords(r.config.prefer) === normWords(prefer) && r.category === "term") {
      return `${r.id} ("${r.title}") already makes "${r.config.prefer}" the preferred term. Add the words to that rule instead of adding a second one.`;
    }
    if (generalised && (r.config.patterns ?? []).some((p) => (typeof p === "string" ? p : p.re) === generalised)) {
      return `${r.id} ("${r.title}") already flags this pattern. Edit that rule instead of adding a second one.`;
    }
  }
  return null;
}

/** Existing rules whose own check already flags the selected words: worth knowing, but not a duplicate. */
function coveredBy(words: string, rules: Rule[]): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  for (const r of rules) {
    const hit = r.kind === "code" && r.category === "term" ? runCodeRule(r, words, [], { name: "", version: 1, palette: [], disclaimers: [], contacts: [] }).length
      : (r.kind === "judgment" || r.category === "pattern") && r.config.patterns?.length ? patternHits(r, words, []).length : 0;
    if (hit) out.push({ id: r.id, title: r.title });
  }
  return out.slice(0, 3);
}

/** Title and description from a template, used when the AI is off or its wording is not usable. */
export function templateWording(type: "term" | "pattern", shown: string, prefer: string, avoid: string[]): { title: string; description: string } {
  const list = avoid.map((a) => `"${a}"`).join(", ");
  if (type === "pattern") {
    return {
      title: (prefer ? `Say "${prefer}", not "${shown}"` : `Don't write "${shown}"`).slice(0, 200),
      description: `Don't write "${shown}", where N is any number.${prefer ? ` Write "${prefer}" instead.` : ""}`.slice(0, 1000),
    };
  }
  return {
    title: (prefer ? `Say "${prefer}", not ${list}` : `Don't say ${list}`).slice(0, 200),
    description: (prefer ? `Use "${prefer}" instead of ${list} in this brand's content.` : `Don't use ${list} in this brand's content. Remove the words or reword the sentence.`).slice(0, 1000),
  };
}

/**
 * The proposed rule for the selected words, with its test sentences, or why none can be made.
 * Nothing is saved and no AI is asked: run proposalTests to put the tests through the rule's own check.
 */
export function buildProposal(input: MakeRuleInput | Record<string, unknown>, rules: Rule[]): ProposalResult {
  const parsed = MakeRuleIn.safeParse(input);
  if (!parsed.success) return { ok: false, error: `That can't be made into a rule: ${firstIssue(parsed.error)}.`, status: 400 };
  const { text, as } = parsed.data;
  const replacement = (parsed.data.replacement ?? "").replace(/\s+/g, " ").trim();
  if (!/\p{L}/u.test(text)) return { ok: false, error: "Select some words, not only numbers or marks: a rule that flags every number would flag almost every post.", status: 400 };

  const sentenceIn = (parsed.data.sentence ?? "").replace(/\s+/g, " ").trim();
  let type: "term" | "pattern";
  let avoid: string[] = [];
  let prefer = "";
  let pattern: string | null = null;
  let typed: string[] = [text];

  if (as === "prefer") {
    prefer = text;
    avoid = [...new Set(replacement.split(",").map((w) => w.trim()).filter(Boolean))];
    if (!avoid.length) return { ok: false, error: `Type the words "${text}" should replace (comma separated), so the rule knows what to flag.`, status: 400 };
    const bad = avoid.find((w) => w.length < 2 || w.length > 120);
    if (bad) return { ok: false, error: `"${bad.slice(0, 40)}" can't be flagged: each word to flag must be 2 to 120 characters.`, status: 400 };
    if (avoid.length > 10) return { ok: false, error: "Type at most 10 words or phrases to flag.", status: 400 };
    const inside = avoid.find((w) => termRe(w).test(text));
    if (inside) return { ok: false, error: `The preferred wording "${text}" contains "${inside}", so the rule would flag its own replacement.`, status: 400 };
    typed = avoid;
    avoid = withApostrophes(avoid);
    type = "term";
  } else {
    pattern = generalise(text);
    type = pattern ? "pattern" : "term";
    prefer = replacement;
    if (replacement.length > 120) return { ok: false, error: "The replacement is longer than 120 characters.", status: 400 };
    if (pattern) {
      const why = patternProblem(pattern);
      if (why) return { ok: false, error: `Those words can't be made into a safe check: the pattern ${why}. Select fewer words or fewer numbers.`, status: 400 };
      if (replacement && new RegExp(pattern, "i").test(replacement)) return { ok: false, error: `The replacement "${replacement}" still matches the words it replaces.`, status: 400 };
    } else {
      // Either apostrophe matches: "India's" and "India’s" are the same words.
      avoid = withApostrophes([text]);
      if (replacement && termRe(text).test(replacement)) return { ok: false, error: `The replacement "${replacement}" contains "${text}", so the rule would flag its own fix.`, status: 400 };
    }
  }

  const dup = duplicateOf(as === "prefer" ? avoid : [text], as === "prefer" ? prefer : "", rules, pattern);
  if (dup) return { ok: false, error: `Not added: ${dup}`, status: 409 };

  const config: Rule["config"] = type === "pattern"
    ? { patterns: [prefer ? { re: pattern!, fix: prefer } : pattern!] }
    : { avoid, prefer };
  const valid = RuleConfig.safeParse(config);
  if (!valid.success) return { ok: false, error: `That rule's settings are not valid (${firstIssue(valid.error)}).`, status: 400 };
  const kind = "code" as const;
  const empty = flagsNothing({ kind, category: type, config });
  if (empty) return { ok: false, error: `That rule can't be made: ${empty}.`, status: 400 };

  // What the rule flags, as one regex over a sentence, for making the "should pass" versions.
  const flagRe = type === "pattern" ? new RegExp(pattern!, "gi") : new RegExp(avoid.map((a) => termRe(a).source).join("|"), "gi");
  const shown = type === "pattern" ? text.replace(NUMBER, "N") : text;
  const first = as === "prefer" ? avoid[0] : text;

  // Test sentences. The reviewer's sentence is used when it really holds the selected words.
  const own = sentenceIn && (as === "prefer" ? sentenceIn.toLowerCase().includes(text.toLowerCase()) : new RegExp(flagRe.source, "i").test(sentenceIn)) ? sentenceIn.slice(0, 600) : "";
  const tests: Rule["tests"] = [];
  const add = (t: string, expect: "flag" | "pass") => { if (t && t.length <= 600 && !tests.some((x) => x.text === t)) tests.push({ text: t, expect }); };
  if (as === "prefer") {
    // The reviewer's sentence holds the preferred words: it should pass, and the same sentence with a word to flag should not.
    const base = own || `New this month: ${text}.`;
    add(replaceIn(base, new RegExp(esc(text).replace(/\s+/g, "\\s+"), "gi"), first), "flag");
    add(base, "pass");
    add(`${cap(avoid[avoid.length - 1])}: join the new batch today.`, "flag");
    add(`${cap(text)}: join the new batch today.`, "pass");
  } else {
    // The reviewer's sentence holds the words: it should be flagged, and the same sentence without them (or with the replacement) should pass.
    add(own || `New this month: ${text}.`, "flag");
    add(own ? replaceIn(own, new RegExp(flagRe.source, "gi"), prefer) || FALLBACK_PASS : prefer ? `New this month: ${prefer}.` : FALLBACK_PASS, "pass");
    add(type === "pattern" ? `${cap(otherNumber(text))}: join the new batch today.` : `${cap(text)}: join the new batch today.`, "flag");
    // A near miss: the same words without their number (a pattern), the replacement, or a plain sentence.
    const nearMiss = type === "pattern" ? replaceIn(text.replace(NUMBER, ""), /[%#]+/g, "") : "";
    add(prefer ? `${cap(prefer)}: join the new batch today.` : nearMiss ? `${nearMiss}: see the details on our website.` : "Ask us about the new batch today.", "pass");
  }

  const t = templateWording(type, shown, prefer, typed);
  const title = (parsed.data.title ?? "").trim();
  const description = (parsed.data.description ?? "").trim();
  const rule: Rule = {
    id: nextRuleId(rules), kind, category: type,
    title: title || t.title, description: description || t.description,
    severity: "minor", status: "advisory", risk: "low",
    source: "Made from words a reviewer selected in a draft",
    config: valid.data as Rule["config"], tests, last_test: null, precedent: null,
  };
  const check = type === "pattern"
    ? `Flags "${shown}", where N is any number${prefer ? `; suggests "${prefer}"` : ""}.`
    : `Flags ${typed.map((a) => `"${a}"`).join(", ")}${prefer ? `; suggests "${prefer}"` : ""}.`;
  return { ok: true, proposal: { rule, type, check, words: typed, replacement: prefer, covered_by: as === "avoid" ? coveredBy(text, rules) : [], wording: title || description ? "edited" : "template" } };
}

/** The proposal's test sentences run through its own check, the same run that gates enforcing a rule. */
export async function proposalTests(p: RuleProposal, facts: Fact[], kit: Kit): Promise<TestRun> {
  return runRuleTests(p.rule, facts, kit);
}

/**
 * The AI's suggested title and description for the proposal, when they are usable; otherwise the proposal as it was.
 * Only the wording changes: the check, the words and the tests stay exactly as code made them. Personal data in the
 * selected words is masked before the call and put back in the answer.
 */
export async function withAiWording(
  p: RuleProposal,
  suggest: (q: { check: string; words: string; replacement: string; pattern: boolean }) => Promise<{ title: string; description: string }>,
): Promise<RuleProposal> {
  if (p.wording === "edited") return p;
  try {
    const { text: masked, map } = redact(`${p.words.join(", ")}\n${p.replacement}\n${p.check}`);
    const [words, replacement, check] = masked.split("\n");
    const out = await suggest({ check: check ?? "", words: words ?? "", replacement: replacement ?? "", pattern: p.type === "pattern" });
    const title = restore(out.title, map).replace(/\s+/g, " ").trim();
    const description = restore(out.description, map).replace(/\s+/g, " ").trim();
    // A placeholder left in the wording, or wording too short or long to be a rule, keeps the template.
    if (title.length < 3 || title.length > 120 || description.length < 10 || description.length > 600 || /\[(?:EMAIL|PHONE|CARD|ID)_\d+\]/.test(title + description)) return p;
    return { ...p, rule: { ...p.rule, title, description }, wording: "ai" };
  } catch {
    return p;
  }
}
