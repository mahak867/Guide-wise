import { patternHits, phraseRe, runCodeRule, sentenceAt } from "./engine/code";
import { runRuleTests, type TestRun } from "./engine/ruletest";
import { RuleConfig, firstIssue, flagsNothing, patternProblem } from "./schemas";
import type { Fact, Kit, Rule } from "./types";

/*
 * Guideline Health, the part done by code. The AI drafts clearer wording, two test sentences and, for a check that
 * reaches too far, a change to the check itself. Code then decides whether the amendment may be saved:
 *  - both test sentences must be new, and the pass sentence must come from (or stay close to) the dismissed text;
 *  - a config change is limited to exceptions, capitals allowed, and narrower patterns, and must validate;
 *  - every test, old and new, must pass on the amended rule;
 *  - the dismissed text is re-checked by code, and the amendment is said to resolve the dismissals only if none of it
 *    is still flagged.
 */

export interface ConfigChange { except: string[]; allow: string[]; narrow: { from: string; to: string }[] }
export interface AmendProposal { description: string; guidance: string; flag_example: string; pass_example: string; what_changed: string; config_change: ConfigChange }
export interface Dismissed { quote: string; sentence: string; reason: string }

// Plain punctuation only: models like to return curly quotes and non-breaking hyphens.
export const clip = (v: unknown, n: number) => String(v ?? "").replace(/[‐-–]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, " ").trim().slice(0, n);
const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => clip(x, 120)).filter(Boolean).slice(0, n) : []);

/** A proposal from the AI or from the page, cleaned and bounded. */
export function cleanProposal(p: Partial<Record<keyof AmendProposal, unknown>> | null | undefined): AmendProposal {
  const c = (p?.config_change ?? {}) as Partial<Record<keyof ConfigChange, unknown>>;
  return {
    description: clip(p?.description, 1000), guidance: clip(p?.guidance, 1000),
    flag_example: clip(p?.flag_example, 600), pass_example: clip(p?.pass_example, 600), what_changed: clip(p?.what_changed, 400),
    config_change: {
      except: list(c.except, 10), allow: list(c.allow, 10).map((a) => a.toUpperCase()),
      narrow: (Array.isArray(c.narrow) ? c.narrow : []).slice(0, 5).map((x: { from?: unknown; to?: unknown }) => ({ from: String(x?.from ?? "").trim(), to: String(x?.to ?? "").trim() })).filter((x) => x.from && x.to),
    },
  };
}

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter((w) => w.length > 1);
export const sameText = (a: string, b: string) => words(a).join(" ") === words(b).join(" ");
/** Whether a test sentence is taken from, or stays close to, a dismissed sentence: most of the shorter one's words are shared. */
export function closeTo(a: string, b: string): boolean {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return false;
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared / Math.min(A.size, B.size) >= 0.6;
}

/** The amended config, a plain-words list of what changed in the check, and anything that makes the change unacceptable. */
export function applyConfigChange(rule: Rule, change: ConfigChange): { config: Rule["config"]; changes: string[]; problems: string[] } {
  const config: Rule["config"] = { ...rule.config };
  const changes: string[] = [];
  const problems: string[] = [];
  const hasCodeCheck = rule.kind === "code" || !!rule.config.patterns?.length;
  const flagged = [...(rule.config.avoid ?? []), ...(rule.config.names ?? [])].map((w) => w.toLowerCase());

  const except = change.except.filter((e) => !(rule.config.except ?? []).some((x) => sameText(x, e)));
  if (except.length && !hasCodeCheck) problems.push("An exception was proposed, but this rule has no code check to apply it to; the AI check follows the wording and guidance instead.");
  else for (const e of except) {
    if (words(e).length < 2) problems.push(`The exception "${e}" is a single word. An exception must give the context (two or more words) in which the rule's words are allowed.`);
    else if (flagged.includes(e.toLowerCase())) problems.push(`The exception "${e}" is a word the rule flags, so it would switch the rule off.`);
    else { config.except = [...(config.except ?? []), e]; changes.push(`Not flagged inside "${e}"`); }
  }

  const allow = change.allow.filter((a) => !(rule.config.allow ?? []).includes(a));
  if (allow.length && rule.category !== "caps") problems.push("Words allowed in capitals were proposed, but this is not a rule about capitals.");
  else for (const a of allow) {
    if (!/^[A-Z0-9][A-Z0-9&-]{1,19}$/.test(a)) problems.push(`"${a}" cannot be added to the words allowed in capitals (use one word in capitals, like NCERT).`);
    else { config.allow = [...(config.allow ?? []), a]; changes.push(`Allowed in capitals: ${a}`); }
  }

  for (const n of change.narrow) {
    const i = (config.patterns ?? []).findIndex((p) => (typeof p === "string" ? p : p.re) === n.from);
    const why = patternProblem(n.to);
    if (i < 0) problems.push(`The pattern "${n.from.slice(0, 60)}" to narrow is not one of this rule's patterns.`);
    else if (why) problems.push(`The narrower pattern "${n.to.slice(0, 60)}" ${why}.`);
    else {
      const pats = [...(config.patterns ?? [])];
      const old = pats[i];
      pats[i] = typeof old === "string" ? n.to : { ...old, re: n.to };
      config.patterns = pats;
      changes.push(`Pattern "${n.from}" narrowed to "${n.to}"`);
    }
  }

  const parsed = RuleConfig.safeParse(config);
  if (!parsed.success) problems.push(`The amended check is not valid (${firstIssue(parsed.error)}).`);
  const empty = flagsNothing({ kind: rule.kind, category: rule.category, config });
  if (empty) problems.push(`The amended check would be empty: ${empty}.`);
  return { config, changes, problems };
}

/** The test sentences must be new, and the pass sentence must come from what reviewers dismissed. */
export function testProblems(rule: Rule, p: AmendProposal, dismissed: string[]): string[] {
  const out: string[] = [];
  const repeats = (t: string) => rule.tests.some((x) => sameText(x.text, t));
  if (!p.flag_example) out.push("The amendment has no new sentence that should be flagged.");
  else if (repeats(p.flag_example)) out.push(`The sentence that should be flagged ("${p.flag_example}") repeats one of the rule's existing tests, so it adds nothing.`);
  if (!p.pass_example) out.push("The amendment has no new sentence that should pass.");
  else if (repeats(p.pass_example)) out.push(`The sentence that should pass ("${p.pass_example}") repeats one of the rule's existing tests, so it adds nothing.`);
  else if (dismissed.length && !dismissed.some((d) => closeTo(d, p.pass_example))) out.push(`The sentence that should pass ("${p.pass_example}") is not taken from the text reviewers dismissed, so it does not test the case they raised.`);
  if (p.flag_example && p.pass_example && sameText(p.flag_example, p.pass_example)) out.push("The two new test sentences are the same.");
  return out;
}

/** Whether code still flags this text under the rule: the whole check for a code rule, the code patterns for an AI rule. */
export function codeFlags(rule: Rule, text: string, facts: Fact[], kit: Kit): boolean {
  return (rule.kind === "code" ? runCodeRule(rule, text, facts, kit) : patternHits(rule, text, facts)).length > 0;
}

export interface AmendCheck {
  proposal: AmendProposal;
  amended: Rule;
  /** New tests actually added. */
  added: Rule["tests"];
  /** The check's config changes, in plain words. */
  changes: string[];
  /** Why the amendment cannot be saved (besides failing tests). */
  problems: string[];
  run: TestRun;
  /** Each dismissed sentence, re-checked by code on the amended rule. */
  dismissed: { text: string; still_flagged: boolean }[];
  /** True only when no dismissed sentence is still flagged by the amended check (and the amendment can be saved). */
  resolves: boolean;
  /** How the dismissed text was re-checked: by the whole check, or only by an AI rule's code patterns. */
  checked_by: "code" | "code patterns";
}

/** Build the amended rule, run every test on it, and re-check the dismissed text. Nothing is saved here. */
export async function checkAmendment(rule: Rule, raw: Parameters<typeof cleanProposal>[0], dismissed: Dismissed[], facts: Fact[], kit: Kit): Promise<AmendCheck> {
  const proposal = cleanProposal(raw);
  const sentences = [...new Set(dismissed.map((d) => d.sentence).filter(Boolean))];
  const problems: string[] = [];
  if (proposal.description.length < 10) problems.push("The amended wording is missing.");
  const { config, changes, problems: cfg } = applyConfigChange(rule, proposal.config_change);
  problems.push(...cfg, ...testProblems(rule, proposal, sentences));
  const added = [{ text: proposal.flag_example, expect: "flag" as const }, { text: proposal.pass_example, expect: "pass" as const }]
    .filter((t) => t.text && !rule.tests.some((x) => sameText(x.text, t.text)));
  const amended: Rule = {
    ...rule, description: proposal.description || rule.description,
    config: { ...config, ...(proposal.guidance ? { guidance: proposal.guidance } : {}) },
    // Old tests are kept, and the new ones always fit.
    tests: [...rule.tests.slice(0, 20 - added.length), ...added],
  };
  const run = await runRuleTests(amended, facts, kit);
  const checked = sentences.map((text) => ({ text, still_flagged: codeFlags(amended, text, facts, kit) }));
  return {
    proposal, amended, added, changes, problems, run, dismissed: checked,
    resolves: !problems.length && run.passed && checked.length > 0 && checked.every((d) => !d.still_flagged),
    checked_by: rule.kind === "code" ? "code" : "code patterns",
  };
}

/** The sentence a dismissed finding sat in, from the draft's text; the quote itself if it is no longer there. */
export function dismissedSentence(text: string, quote: string): string {
  const m = quote.trim() ? text.match(phraseRe(quote, "i")) : null;
  if (!m || m.index === undefined) return quote.trim();
  const s = sentenceAt(text, m.index);
  // Keep the whole quote and the sentence's closing marks ("Happy Diwali!!").
  const end = Math.max(s.end, m.index + m[0].length);
  const tail = text.slice(end).match(/^[.!?]+/)?.[0] ?? "";
  return (text.slice(s.start, end) + tail).trim().slice(0, 600);
}
