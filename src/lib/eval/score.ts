import { createHash } from "node:crypto";
import type { Fact, Finding, Kit, Rule } from "../types";
import { reviewDraft } from "../engine/review";
import { EVAL_DOCS, EVAL_RULES, type EvalDoc } from "./dataset";

/** Wilson score interval for a proportion, 95%. */
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  if (k === n) return [Math.max(0, (c - m) / d), 1];
  if (k === 0) return [0, Math.min(1, (c + m) / d)];
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

const overlaps = (a: string, b: string) => a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());

export interface DocResult {
  id: string; split: string; text: string;
  planted: (EvalDoc["planted"][number] & { caught: boolean })[];
  extra: { rule: string; quote: string; level: string }[];
}
export interface EvalReport {
  mode: string; at: string; docs: number; split: string; fingerprint: string;
  planted: number; caught: number; predicted: number; correct: number;
  precision: number; precisionCI: [number, number]; recall: number; recallCI: [number, number];
  criticalRecall: number; criticalCI: [number, number]; criticalPlanted: number;
  hardPlanted: number; hardCaught: number;
  violationPrecision: number; violationPredicted: number;
  perRule: { rule: string; planted: number; caught: number; falsePositives: number }[];
  results: DocResult[];
  ms: number;
}

export function evalRules(rules: Rule[]): Rule[] {
  // The set plants errors for these rules only; other rules (disclaimers, images) are measured separately.
  return rules.filter((r) => EVAL_RULES.has(r.id));
}

/** Review one test draft and match its findings to the planted answer key. */
export async function scoreDoc(d: EvalDoc, rules: Rule[], facts: Fact[], kit: Kit, useAI: boolean): Promise<DocResult & { mode: string; aiError?: string }> {
  const { findings, stats } = await reviewDraft(d.text, null, evalRules(rules), facts, kit, { useAI });
  const used = new Set<Finding>();
  const planted = d.planted.map((p) => {
    const hit = findings.find((f) => !used.has(f) && f.rule_id === p.rule && overlaps(f.quote, p.quote));
    if (hit) used.add(hit);
    return { ...p, caught: !!hit };
  });
  const extra = findings.filter((f) => !used.has(f)).map((f) => ({ rule: f.rule_id, quote: f.quote, level: f.level }));
  return { id: d.id, split: d.split, text: d.text, planted, extra, mode: stats.mode, aiError: stats.aiError };
}

/** Totals, intervals and per-rule counts from a list of scored drafts. */
export function summarise(results: DocResult[], rules: Rule[], mode: string, split: string, ms = 0): EvalReport {
  const critical = new Set(evalRules(rules).filter((r) => r.severity === "critical").map((r) => r.id));
  const all = results.flatMap((r) => r.planted);
  const caught = all.filter((p) => p.caught).length;
  const extras = results.flatMap((r) => r.extra);
  const predicted = caught + extras.length;
  const crit = all.filter((p) => critical.has(p.rule));
  const critCaught = crit.filter((p) => p.caught).length;
  const hard = all.filter((p) => p.hard);
  const violExtras = extras.filter((e) => e.level === "violation").length;
  const rulesSeen = [...new Set([...all.map((p) => p.rule), ...extras.map((e) => e.rule)])].sort();
  return {
    mode, at: new Date().toISOString(), docs: results.length, split,
    fingerprint: createHash("sha256").update(JSON.stringify(EVAL_DOCS)).digest("hex").slice(0, 16),
    planted: all.length, caught, predicted, correct: caught,
    precision: predicted ? caught / predicted : 1, precisionCI: wilson(caught, predicted),
    recall: all.length ? caught / all.length : 1, recallCI: wilson(caught, all.length),
    criticalRecall: crit.length ? critCaught / crit.length : 1, criticalCI: wilson(critCaught, crit.length), criticalPlanted: crit.length,
    hardPlanted: hard.length, hardCaught: hard.filter((p) => p.caught).length,
    violationPrecision: caught + violExtras ? caught / (caught + violExtras) : 1, violationPredicted: caught + violExtras,
    perRule: rulesSeen.map((rule) => ({
      rule,
      planted: all.filter((p) => p.rule === rule).length,
      caught: all.filter((p) => p.rule === rule && p.caught).length,
      falsePositives: extras.filter((e) => e.rule === rule).length,
    })),
    results,
    ms,
  };
}

export async function runEval(rules: Rule[], facts: Fact[], kit: Kit, opts: { useAI: boolean; split?: "dev" | "test" | "all" }): Promise<EvalReport> {
  const started = Date.now();
  const split = opts.split ?? "test";
  const docs = EVAL_DOCS.filter((d) => split === "all" || d.split === split);
  let mode = "rules-only";
  const results: DocResult[] = [];
  for (const d of docs) {
    const r = await scoreDoc(d, rules, facts, kit, opts.useAI);
    if (r.mode === "ai") mode = "ai";
    const { mode: _m, aiError: _e, ...rest } = r;
    void _m; void _e;
    results.push(rest);
  }
  return summarise(results, rules, mode, split, Date.now() - started);
}
