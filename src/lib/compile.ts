import type { CompiledKit } from "./engine/ai";
import { runCodeRule } from "./engine/code";
import { redact, restore, type Redaction } from "./engine/redact";
import { RuleConfig, firstIssue, flagsNothing } from "./schemas";
import type { Kit, Rule } from "./types";

/*
 * Brand Kit compiler, the part done by code. The AI proposes rules from pasted guide text; code then
 *  - keeps personal data away from the AI (the guide is redacted) and puts it back in the AI's quotes,
 *  - drops any proposal whose quoted source is not in the guide ("no source, no rule"),
 *  - turns each proposal into the config the rule is saved with, validated by the same schema as any rule,
 *    and refuses a code rule that could flag nothing (with the reason as a warning),
 *  - adds contradiction warnings the AI missed (language, emoji, exclamation marks, capitals).
 */

export type CompiledRule = CompiledKit["rules"][number];
/** kind: what the warning is about. "dropped" and "check" are about a proposal, the others about the guide's own words. */
export interface CompileWarning { passage: string; problem: string; kind?: "vague" | "contradiction" | "dropped" | "check" }
export interface Proposal extends Omit<CompiledRule, "category" | "kind"> {
  kind: Rule["kind"];
  /** The category the rule is saved with ("required" becomes the code check "requires"). */
  category: string;
  /** The config the rule is saved with, exactly as proposed. */
  config: Rule["config"];
  /** Code rules: whether the check, run by code now, flags the flag example and passes the pass example. null for AI checks. */
  own_examples_ok: boolean | null;
  /** Set when the rule comes from one side of a contradiction found by code. */
  conflict?: string;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A literal phrase as a pattern: any run of spaces matches any whitespace. */
const literal = (s: string) => esc(s.trim()).replace(/\s+/g, "\\s+");
export const normQuote = (s: string) => s.toLowerCase().replace(/[“”"'‘’]/g, "").replace(/\s+/g, " ").trim();
const EMPTY_KIT: Kit = { name: "", version: 1, palette: [], disclaimers: [], contacts: [] };

/** Placeholders in everything the AI wrote are put back to the guide's own words, so quotes match the original text. */
export function restoreCompiled(out: CompiledKit, map: Redaction[]): CompiledKit {
  if (!map.length) return out;
  const r = (s: string) => restore(s, map);
  return {
    rules: out.rules.map((x) => ({
      ...x, title: r(x.title), description: r(x.description), avoid: x.avoid.map(r), prefer: r(x.prefer), required_phrase: r(x.required_phrase ?? ""),
      flag_example: r(x.flag_example), pass_example: r(x.pass_example), source_passage: r(x.source_passage),
    })),
    warnings: out.warnings.map((w) => ({ passage: r(w.passage), problem: r(w.problem) })),
  };
}

/** The kind, category and config a compiled proposal is saved with, or why it cannot be saved. */
export function proposalConfig(p: CompiledRule): { kind: Rule["kind"]; category: string; config: Rule["config"] } | { problem: string } {
  const words = [...new Set(p.avoid.map((w) => w.trim()).filter(Boolean))];
  const blanks = p.avoid.length - p.avoid.filter((w) => w.trim()).length;
  let out: { kind: Rule["kind"]; category: string; config: Rule["config"] };
  if (p.kind === "judgment" || p.category === "tone" || p.category === "claim") {
    out = { kind: "judgment", category: p.category === "claim" ? "claim" : "tone", config: {} };
  } else if (p.category === "required") {
    const line = (p.required_phrase ?? "").trim();
    if (!line) return { problem: "it was proposed as a required line but names no line to require" };
    out = {
      kind: "code", category: "requires",
      config: {
        // Words that make the line necessary; with none, every text needs it (one finding, on the first sentence).
        patterns: words.length ? words.map((w) => `(?<![A-Za-z])${literal(w)}(?:e?s)?(?![A-Za-z])`) : ["^\\s*\\S"],
        requires: [literal(line.replace(/[.\s]+$/, ""))],
        missing: `required line "${line}"`,
        append: line.slice(0, 200),
        message: (p.description.trim() || `This needs the line "${line}".`).slice(0, 300),
      },
    };
  } else if (p.category === "pattern") {
    out = { kind: "code", category: "pattern", config: { patterns: words.map(literal) } };
  } else {
    out = { kind: "code", category: "term", config: { avoid: words, prefer: p.prefer.trim() } };
  }
  const parsed = RuleConfig.safeParse(out.config);
  if (!parsed.success) return { problem: `its settings are not valid (${firstIssue(parsed.error)})` };
  const empty = flagsNothing({ ...out, config: parsed.data });
  if (empty) return { problem: blanks ? `${empty} (the AI proposed an empty word to flag)` : empty };
  return { ...out, config: parsed.data as Rule["config"] };
}

/** Whether a code rule flags its own flag example and passes its own pass example. */
function ownExamplesOk(p: CompiledRule, c: { kind: Rule["kind"]; category: string; config: Rule["config"] }): boolean | null {
  if (c.kind !== "code") return null;
  const rule: Rule = { id: "PROPOSED", kind: c.kind, category: c.category, title: p.title, description: p.description, severity: p.severity, status: "advisory", source: "", risk: "low", config: c.config, tests: [] };
  const flags = (t: string) => runCodeRule(rule, t, [], EMPTY_KIT).length > 0;
  return flags(p.flag_example) && !flags(p.pass_example);
}

// ---------------------------------------------------------------- Contradictions, found by code

const LANGS = ["english", "hindi", "hinglish", "tamil", "telugu", "kannada", "malayalam", "marathi", "bengali", "gujarati", "punjabi", "odia", "urdu", "assamese"];
const CHANNELS = /\b(instagram|facebook|whatsapp|linkedin|twitter|youtube|e-?mails?|newsletters?|sms|websites?|web pages?|landing pages?|ads?|reels?|stories|captions?|headlines?|posters?|flyers?|brochures?)\b/gi;
const NEG = /\b(never|not|no|don'?t|avoid|without|nor)\b/i;
const LIMIT = /\b(more than|at most|no more than|up to|maximum|not more than|fewer than|less than|only one|a single|one per|per (?:post|sentence|line))\b/i;
const REQ = /\b(always|must|use|add|include|should|put|write|end|start|finish)\b/i;
const SUBJECTS: { key: string; what: string; re: RegExp }[] = [
  { key: "emoji", what: "emoji", re: /\bemoj(?:i|is)\b|\bemoticons?\b/i },
  { key: "exclamation", what: "exclamation marks", re: /\bexclamation\s+(?:marks?|points?)\b/i },
  { key: "capitals", what: "capitals", re: /\b(?:capitals|capital letters|all[- ]caps|block capitals|upper[- ]?case)\b/i },
];

function sentences(guide: string): string[] {
  return guide.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 3);
}

/** Who a passage is about: channels named and an audience ("for Hindi-speaking parents"). Empty means every post. */
function scope(s: string): Set<string> {
  const out = new Set([...s.toLowerCase().matchAll(CHANNELS)].map((m) => m[1].replace(/s$/, "")));
  const aud = s.match(/\bfor\s+([\w-]+(?:\s+[\w-]+){0,2})/i);
  if (aud && !/^(?:emphasis|the|a|an|our|it)\b/i.test(aud[1])) out.add(`for ${aud[1].toLowerCase()}`);
  return out;
}
const overlap = (a: Set<string>, b: Set<string>) => !a.size || !b.size || [...a].some((x) => b.has(x));

type Stance = { s: string; scope: Set<string>; polarity: "require" | "forbid" | "only"; value: string };

function languageStances(s: string): Stance[] {
  const lower = s.toLowerCase();
  const out: Stance[] = [];
  for (const lang of LANGS) {
    const at = lower.search(new RegExp(`\\b(?:in|into)\\s+${lang}\\b|\\b${lang}\\s+only\\b|\\bonly\\s+(?:in\\s+)?${lang}\\b`));
    if (at < 0) continue;
    const only = new RegExp(`\\b${lang}\\s+only\\b|\\bonly\\s+(?:in\\s+)?${lang}\\b`).test(lower);
    const neg = NEG.test(lower.slice(0, at));
    if (!neg && !REQ.test(lower) && !/\bwritten\b/.test(lower) && !only) continue;
    out.push({ s, scope: scope(s), polarity: neg ? "forbid" : only ? "only" : "require", value: lang });
  }
  return out;
}

function subjectStance(s: string, re: RegExp): Stance["polarity"] | null {
  const m = s.match(re);
  if (!m || LIMIT.test(s)) return null; // "no more than one exclamation mark" is a limit, not a ban
  if (NEG.test(s.slice(0, m.index))) return "forbid";
  return REQ.test(s) ? "require" : null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Opposite requirements on the same subject, in passages that apply to the same posts. */
export function findContradictions(guide: string): CompileWarning[] {
  const ss = sentences(guide);
  const out: CompileWarning[] = [];
  const seen = new Set<string>();
  const add = (a: string, b: string, problem: string) => {
    const k = [a, b].sort().join("|");
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ passage: a, problem, kind: "contradiction" });
  };
  const langs = ss.flatMap(languageStances);
  for (let i = 0; i < langs.length; i++) {
    for (let j = i + 1; j < langs.length; j++) {
      const [a, b] = [langs[i], langs[j]];
      if (a.s === b.s || !overlap(a.scope, b.scope)) continue;
      const differ = a.value !== b.value;
      const clash =
        (differ && (a.polarity === "only" || b.polarity === "only") && a.polarity !== "forbid" && b.polarity !== "forbid") ||
        (!differ && (a.polarity === "forbid") !== (b.polarity === "forbid"));
      if (clash) add(a.s, b.s, `Contradicts "${b.s}": one passage asks for ${cap(a.value)}${a.polarity === "forbid" ? " not to be used" : a.polarity === "only" ? " only" : ""}, the other for ${cap(b.value)}${b.polarity === "forbid" ? " not to be used" : b.polarity === "only" ? " only" : ""}. Say which language applies to which posts.`);
    }
  }
  for (const subj of SUBJECTS) {
    const st = ss.map((s) => ({ s, scope: scope(s), polarity: subjectStance(s, subj.re), emphasis: /\bemphasis\b/i.test(s) })).filter((x) => x.polarity);
    for (const a of st) {
      for (const b of st) {
        if (a.polarity !== "require" || b.polarity !== "forbid" || !overlap(a.scope, b.scope)) continue;
        // "Never use capitals for emphasis" and "write acronyms in capitals" are about different uses.
        if (subj.key === "capitals" && a.emphasis !== b.emphasis) continue;
        add(a.s, b.s, `Contradicts "${b.s}": one passage asks for ${subj.what} and the other bans them, for the same posts. Say where ${subj.what} are allowed.`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- The whole compile

/**
 * Guide text in, checked proposals out. `ai` receives only the redacted guide: emails, phone numbers and ID
 * numbers never leave for the AI service. Nothing is saved here; the manager confirms each proposal.
 */
export async function compileFromGuide(guide: string, ai: (redactedGuide: string) => Promise<CompiledKit>): Promise<{ rules: Proposal[]; warnings: CompileWarning[]; dropped: number; refused: number }> {
  const { text, map } = redact(guide);
  const out = restoreCompiled(await ai(text), map);
  const g = normQuote(guide);
  // No source, no rule: a proposal whose quoted passage is not in the pasted guide is dropped.
  const inGuide = (s: string) => !!s.trim() && g.includes(normQuote(s));
  const sourced = out.rules.filter((r) => inGuide(r.source_passage));
  const aiWarnings: CompileWarning[] = out.warnings.filter((w) => inGuide(w.passage)).map((w) => ({ ...w, kind: /contradict|conflict|inconsistent|clash|opposite/i.test(w.problem) ? "contradiction" : "vague" }));
  const dropped = out.rules.length - sourced.length + out.warnings.length - aiWarnings.length;

  const warnings: CompileWarning[] = [...aiWarnings];
  // Contradictions the AI missed: added unless the AI already warned about one side as a contradiction.
  const said = aiWarnings.filter((w) => w.kind === "contradiction").map((w) => normQuote(w.passage));
  const near = (a: string, b: string) => a.includes(b) || b.includes(a);
  const contradictions = findContradictions(guide);
  for (const c of contradictions) {
    const other = c.problem.match(/^Contradicts "(.+?)":/)?.[1] ?? "";
    if (said.some((p) => near(p, normQuote(c.passage)) || (other && near(p, normQuote(other))))) continue;
    warnings.push(c);
  }
  const sides = contradictions.flatMap((c) => [c.passage, c.problem.match(/^Contradicts "(.+?)":/)?.[1] ?? ""]).filter(Boolean).map(normQuote);

  const rules: Proposal[] = [];
  let refused = 0;
  for (const p of sourced) {
    const c = proposalConfig(p);
    if ("problem" in c) {
      refused++;
      warnings.push({ passage: p.source_passage, problem: `Guidewise left out the proposed rule "${p.title}": ${c.problem}. Add it by hand if it is needed.`, kind: "dropped" });
      continue;
    }
    const src = normQuote(p.source_passage);
    const conflict = sides.find((s) => near(s, src));
    rules.push({ ...p, ...c, own_examples_ok: ownExamplesOk(p, c), ...(conflict ? { conflict: "This passage contradicts another one (see the warnings). Decide which applies before confirming." } : {}) });
  }
  return { rules, warnings, dropped, refused };
}
