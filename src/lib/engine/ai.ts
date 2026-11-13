import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { z } from "zod";
import type { Intent, Rule } from "../types";

/*
 * Provider adapter: every AI call in the product goes through this file.
 * Guidewise can run on Claude, Groq or Gemini. Whichever keys are set are tried in that order,
 * and a failed or rate-limited call falls through to the next provider. With no key at all,
 * the product runs in rules-only mode. Every provider returns JSON that must pass the same
 * Zod schema, and everything it returns is then checked by code (see verify.ts).
 */

// Each AI call is capped so a slow or overloaded provider cannot stall a review past the server limit.
const CALL_TIMEOUT_MS = 20_000;

interface Task<T> { name: string; system: string; user: string; schema: z.ZodType<T>; maxTokens: number }
interface Provider { id: string; label: string; run<T>(t: Task<T>): Promise<T> }

/** JSON Schema for a Zod schema, without the $schema header some providers reject. */
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _drop;
  return rest;
}

function parseJson<T>(raw: string | null | undefined, schema: z.ZodType<T>): T {
  if (!raw) throw new Error("The AI service returned an empty answer.");
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  return schema.parse(JSON.parse(text));
}

function claude(): Provider | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const model = process.env.GUIDEWISE_MODEL || "claude-opus-5-5";
  let client: Anthropic | null = null;
  return {
    id: "claude", label: `Claude (${model})`,
    async run<T>(t: Task<T>): Promise<T> {
      client ??= new Anthropic({ timeout: CALL_TIMEOUT_MS, maxRetries: 0 });
      const res = await client.messages.parse({
        model,
        max_tokens: t.maxTokens,
        output_config: { effort: "low", format: zodOutputFormat(t.schema as z.ZodType<T> & z.ZodObject) },
        system: [{ type: "text", text: t.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: t.user }],
      });
      if (res.stop_reason === "refusal") throw new Error("The AI service declined this request.");
      if (res.parsed_output == null) throw new Error("The AI service returned no structured answer.");
      return res.parsed_output as T;
    },
  };
}

function groq(): Provider | null {
  if (!process.env.GROQ_API_KEY) return null;
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  let client: Groq | null = null;
  return {
    id: "groq", label: `Groq (${model})`,
    async run<T>(t: Task<T>): Promise<T> {
      client ??= new Groq({ timeout: CALL_TIMEOUT_MS, maxRetries: 0 });
      const res = await client.chat.completions.create({
        model,
        max_completion_tokens: t.maxTokens,
        reasoning_effort: "low",
        response_format: { type: "json_schema", json_schema: { name: t.name, schema: jsonSchema(t.schema), strict: true } },
        messages: [{ role: "system", content: t.system }, { role: "user", content: t.user }],
      });
      return parseJson(res.choices[0]?.message?.content, t.schema);
    },
  };
}

/** Flash models this key can call, newest first (lite models last). */
export async function geminiModels(): Promise<string[]> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return [];
  const pager = await new GoogleGenAI({ apiKey: key }).models.list();
  const names: string[] = [];
  for await (const m of pager) {
    const n = (m.name ?? "").replace(/^models\//, "");
    if (/flash/i.test(n) && !/image|tts|audio|live|preview-native|embedding/i.test(n) && (m.supportedActions ?? ["generateContent"]).includes("generateContent")) names.push(n);
  }
  const ver = (n: string) => Number(n.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  return names.sort((x, y) => Number(/lite/.test(x)) - Number(/lite/.test(y)) || ver(y) - ver(x) || Number(/preview|exp/.test(x)) - Number(/preview|exp/.test(y)));
}

function gemini(): Provider | null {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;
  // A stable model by default; if this key cannot use it, the newest Flash model it can use is found.
  let model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  let resolved = false;
  let client: GoogleGenAI | null = null;
  const provider: Provider = {
    id: "gemini", label: `Gemini (${model})`,
    async run<T>(t: Task<T>): Promise<T> {
      client ??= new GoogleGenAI({ apiKey: key });
      const call = () => client!.models.generateContent({
        model,
        contents: t.user,
        config: { systemInstruction: t.system, responseMimeType: "application/json", responseJsonSchema: jsonSchema(t.schema), maxOutputTokens: t.maxTokens },
      });
      try {
        return parseJson((await call()).text, t.schema);
      } catch (e) {
        // A model name this key cannot use: pick the newest Flash model it can, once, and retry.
        if ((e as { status?: number })?.status !== 404 || resolved) throw e;
        resolved = true;
        const [best] = await geminiModels();
        if (!best) throw e;
        model = best;
        provider.label = `Gemini (${model})`;
        return parseJson((await call()).text, t.schema);
      }
    },
  };
  return provider;
}

let providers: Provider[] | null = null;
function chain(): Provider[] {
  providers ??= [claude(), groq(), gemini()].filter((p): p is Provider => p !== null);
  return providers;
}

/** Health check only: run one tiny structured task on a single named provider. */
export async function probeProvider(id: string): Promise<{ ok: boolean; label?: string; ms: number; error?: string }> {
  const p = chain().find((x) => x.id === id);
  const t0 = Date.now();
  if (!p) return { ok: false, ms: 0, error: "not configured" };
  try {
    await withTimeout(p.run({ name: "probe", system: "Return the JSON asked for.", user: 'Return {"findings": []}.', schema: JudgeSchema, maxTokens: 200 }), CALL_TIMEOUT_MS, p.label);
    return { ok: true, label: p.label, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, label: p.label, ms: Date.now() - t0, error: (e as Error)?.message?.slice(0, 200) };
  }
}

export function aiAvailable(): boolean {
  return chain().length > 0;
}
export function aiModel(): string {
  const c = chain();
  if (!c.length) return "none";
  return c.map((p) => p.label).join(", then ");
}

// Free tiers limit requests per minute, so calls are queued a few at a time.
const MAX_PARALLEL = Number(process.env.GUIDEWISE_AI_PARALLEL || 3);
let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

const isRateLimit = (e: unknown) => {
  const s = (e as { status?: number })?.status;
  return s === 429 || /rate|quota|429|exhausted/i.test(String((e as Error)?.message ?? ""));
};

function withTimeout<T>(work: Promise<T>, ms: number, who: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${who} took longer than ${ms / 1000}s`)), ms); });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

let lastAnswered: string | null = null;
const failures: string[] = [];
/** Which provider answered last, and recent failures. For the health check only; never includes keys. */
export function aiDiagnostics() {
  return { lastAnswered, failures: failures.slice(-6) };
}

/** Run one structured task on the first provider that answers; rate limits get one short retry. */
async function structured<T>(t: Task<T>): Promise<T> {
  const c = chain();
  if (!c.length) throw new Error("No AI service is configured.");
  let last: unknown;
  for (const p of c) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await slot(() => withTimeout(p.run(t), CALL_TIMEOUT_MS, p.label));
        lastAnswered = p.label;
        return out;
      } catch (e) {
        failures.push(`${p.id}: ${(e as Error)?.message?.slice(0, 160) ?? String(e)}`);
        last = e;
        if (attempt === 0 && isRateLimit(e)) {
          // Wait as long as the provider asks (capped), then try once more before falling through.
          const h = (e as { headers?: Record<string, string> | Headers })?.headers;
          const ra = Number((h instanceof Headers ? h.get("retry-after") : h?.["retry-after"]) ?? 0);
          await new Promise((r) => setTimeout(r, Math.min(8000, Math.max(2000, ra * 1000))));
          continue;
        }
        break;
      }
    }
  }
  const msg = last instanceof Error ? last.message : String(last);
  throw new Error(`The AI service did not answer (${msg.slice(0, 140)})`);
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
  const intentLine = (intent && (intent.goal || intent.audience || intent.cta)
    ? `Writer's intent - goal: ${intent.goal || "not given"}; audience: ${intent.audience || "not given"}; call to action: ${intent.cta || "not given"}`
    : "Writer's intent: not given") + (intent?.locked?.length ? `\nLocked phrases the fix must keep word for word: ${intent.locked.map((l) => `"${l}"`).join(", ")}` : "");
  const out = await structured({
    name: "rule_check", system: SYSTEM, schema: JudgeSchema, maxTokens: 3000,
    user: `${ruleBlock(rule)}\n\n${intentLine}\n\nDraft:\n"""\n${text}\n"""`,
  });
  return out.findings;
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
  const out = await structured({
    name: "number_claims", schema: ClaimSchema, maxTokens: 3000,
    system: `You extract number claims from marketing drafts for a later check done by code. Do not judge them.

A number claim is a figure the reader is asked to believe about the organisation: counts of students or selections, pass rates, prices and fees, discounts, years of experience, rankings stated as numbers. Dates, times, phone numbers, student ranks such as "AIR 112", and batch names are not number claims.

For each claim return:
- quote: the figure exactly as written in the draft, including any currency sign, unit, "+" or "%" attached to it (for example "50,000+" or "₹39,999"). Copy it character for character.
- value: the figure as a plain number (50,000+ is 50000; 2.5 lakh is 250000; 95% is 95).
- subject: in a few words, what the figure counts or measures, using the draft's own words.

Return an empty list if there are none.`,
    user: `Draft:\n"""\n${text}\n"""`,
  });
  return out.claims;
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
  return structured({
    name: "brand_kit", schema: CompileSchema, maxTokens: 12000,
    system: `You turn a brand guide into proposed rules for Guidewise, a tool that checks marketing drafts before publication. A brand manager reviews every rule you propose, so propose only what the guide actually says.

For each distinct instruction in the guide, return one rule:
- title: a short name. description: the instruction in one or two plain sentences, as a reviewer would explain it to a writer.
- kind and category: use kind "code" with category "term" when the guide bans or replaces specific words (fill avoid with the exact words and prefer with the replacement, or an empty string when the word should just be removed). Use kind "judgment" with category "tone" for voice and style, and category "claim" for what may be claimed or promised. For judgment rules leave avoid empty and prefer as an empty string.
- severity: critical for legal or factual risk, major for clear brand breaches, minor for polish.
- flag_example: one realistic sentence a writer might produce that breaks the rule. pass_example: the same idea written so it follows the rule. These become the rule's tests, so they should sit close to the line.
- source_passage: the words from the guide the rule comes from, copied exactly.

Also return warnings for passages that are too vague to check (for example "be engaging") or that contradict another passage. Quote the passage and say what is unclear. Do not turn a vague passage into a rule.`,
    user: `Brand guide:\n"""\n${guide}\n"""`,
  });
}
