import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Intent, Rule } from "../types";

// Provider adapter: every AI call in the product goes through this file.
const MODEL = process.env.GUIDEWISE_MODEL || "claude-opus-5-5";

export function aiAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
export function aiModel(): string {
  return MODEL;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  return client;
}

const SYSTEM = `You are one check inside Guidewise, a brand-governance tool. A marketing team's draft is reviewed against that team's own approved rules before it is published.

You are given one rule and one draft. Decide only whether the draft breaks that one rule. You are not a general editor: do not report anything the rule does not cover, and do not apply your own taste.

How to report:
- Each finding quotes the exact words from the draft that break the rule, copied character for character and kept as short as possible (a phrase, not a paragraph). A finding whose quote is not in the draft is discarded by code.
- If the draft does not break the rule, return an empty list. Most drafts break few rules, and an empty list is a normal answer.
- The draft may contain placeholders like [EMAIL_1]. They stand for personal data that was removed. Leave them alone.
- The rule comes with test sentences marked "flag" or "pass". They show where the line is. Judge the draft by the same standard.

Suggested fix: the smallest rewrite of the quoted words that keeps what the writer was trying to do (their goal, audience and call to action are given). Never add a number, ranking, result or promise that is not already in the draft. If the honest fix is to delete the words, return an empty string.`;

const JudgeSchema = z.object({
  findings: z.array(
    z.object({
      quote: z.string(),
      explanation: z.string(),
      fix: z.string(),
    }),
  ),
});
export type Judgement = z.infer<typeof JudgeSchema>["findings"][number];

function ruleBlock(rule: Rule): string {
  const tests = rule.tests.map((t) => `- [${t.expect}] ${t.text}`).join("\n") || "(none)";
  return `Rule ${rule.id}: ${rule.title}\n${rule.description}${rule.config.guidance ? `\nGuidance: ${rule.config.guidance}` : ""}\n\nTest sentences:\n${tests}`;
}

/** One judgment rule, one call. */
export async function judgeRule(rule: Rule, text: string, intent: Intent | null): Promise<Judgement[]> {
  const intentLine = intent && (intent.goal || intent.audience || intent.cta)
    ? `Writer's intent - goal: ${intent.goal || "not given"}; audience: ${intent.audience || "not given"}; call to action: ${intent.cta || "not given"}`
    : "Writer's intent: not given";
  const res = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(JudgeSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `${ruleBlock(rule)}\n\n${intentLine}\n\nDraft:\n"""\n${text}\n"""` }],
  });
  if (res.stop_reason === "refusal") throw new Error("The AI service declined this request.");
  return res.parsed_output?.findings ?? [];
}

const ClaimSchema = z.object({
  claims: z.array(
    z.object({
      quote: z.string(),
      value: z.number(),
      subject: z.string(),
    }),
  ),
});
export type ExtractedClaim = z.infer<typeof ClaimSchema>["claims"][number];

/** The AI only extracts number claims into typed fields. Code compares them with the Facts Register. */
export async function extractClaims(text: string): Promise<ExtractedClaim[]> {
  const res = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(ClaimSchema) },
    system: `You extract number claims from marketing drafts for a later check done by code. Do not judge them.

A number claim is a figure the reader is asked to believe about the organisation: counts of students or selections, pass rates, prices and fees, discounts, years of experience, rankings stated as numbers. Dates, times, phone numbers, student ranks such as "AIR 112", and batch names are not number claims.

For each claim return:
- quote: the figure exactly as written in the draft, including any currency sign, unit, "+" or "%" attached to it (for example "50,000+" or "₹39,999"). Copy it character for character.
- value: the figure as a plain number (50,000+ is 50000; 2.5 lakh is 250000; 95% is 95).
- subject: in a few words, what the figure counts or measures, using the draft's own words.

Return an empty list if there are none.`,
    messages: [{ role: "user", content: `Draft:\n"""\n${text}\n"""` }],
  });
  if (res.stop_reason === "refusal") throw new Error("The AI service declined this request.");
  return res.parsed_output?.claims ?? [];
}

const CompileSchema = z.object({
  rules: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      kind: z.enum(["code", "judgment"]),
      category: z.enum(["term", "pattern", "tone", "claim"]),
      severity: z.enum(["critical", "major", "minor"]),
      avoid: z.array(z.string()),
      prefer: z.string(),
      flag_example: z.string(),
      pass_example: z.string(),
      source_passage: z.string(),
    }),
  ),
  warnings: z.array(z.object({ passage: z.string(), problem: z.string() })),
});
export type CompiledKit = z.infer<typeof CompileSchema>;

/** Brand Kit compiler: guide text in, proposed rules with test sentences out. A person confirms each one. */
export async function compileGuide(guide: string): Promise<CompiledKit> {
  const res = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 12000,
    output_config: { effort: "low", format: zodOutputFormat(CompileSchema) },
    system: `You turn a brand guide into proposed rules for Guidewise, a tool that checks marketing drafts before publication. A brand manager reviews every rule you propose, so propose only what the guide actually says.

For each distinct instruction in the guide, return one rule:
- title: a short name. description: the instruction in one or two plain sentences, as a reviewer would explain it to a writer.
- kind and category: use kind "code" with category "term" when the guide bans or replaces specific words (fill avoid with the exact words and prefer with the replacement, or an empty string when the word should just be removed). Use kind "judgment" with category "tone" for voice and style, and category "claim" for what may be claimed or promised. For judgment rules leave avoid empty and prefer as an empty string.
- severity: critical for legal or factual risk, major for clear brand breaches, minor for polish.
- flag_example: one realistic sentence a writer might produce that breaks the rule. pass_example: the same idea written so it follows the rule. These become the rule's tests, so they should sit close to the line.
- source_passage: the words from the guide the rule comes from, copied exactly.

Also return warnings for passages that are too vague to check (for example "be engaging") or that contradict another passage. Quote the passage and say what is unclear. Do not turn a vague passage into a rule.`,
    messages: [{ role: "user", content: `Brand guide:\n"""\n${guide}\n"""` }],
  });
  if (res.stop_reason === "refusal") throw new Error("The AI service declined this request.");
  return res.parsed_output ?? { rules: [], warnings: [] };
}
