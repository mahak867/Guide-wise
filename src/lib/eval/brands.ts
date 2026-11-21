// The brands the accuracy evaluation runs on: PrepPath (brand 1, the demo seed) and Suraksha Health (brand 2, evaluation only).
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../seed";
import { BRAND2_DOCS, BRAND2_EVAL_RULES, BRAND2_FACTS, BRAND2_KIT, BRAND2_RULES } from "./brand2";
import { EVAL_DOCS, EVAL_RULES } from "./dataset";
import { combine, runEval, type EvalReport } from "./score";

export const EVAL_BRANDS = {
  "1": { name: "PrepPath Academy", rules: SEED_RULES, facts: SEED_FACTS, kit: SEED_KIT, set: { docs: EVAL_DOCS, ruleIds: EVAL_RULES } },
  "2": { name: "Suraksha Health", rules: BRAND2_RULES, facts: BRAND2_FACTS, kit: BRAND2_KIT, set: { docs: BRAND2_DOCS, ruleIds: BRAND2_EVAL_RULES } },
} as const;
export type BrandKey = keyof typeof EVAL_BRANDS | "all";

/** Run one brand's labelled drafts, or both brands combined into one report. */
export async function runBrandEval(brand: BrandKey, opts: { useAI: boolean; split?: "dev" | "test" | "all"; paceMs?: number; retries?: number; retryWaitMs?: number }): Promise<EvalReport> {
  const keys = brand === "all" ? (["1", "2"] as const) : [brand];
  const reports: EvalReport[] = [];
  for (const k of keys) {
    const b = EVAL_BRANDS[k];
    reports.push(await runEval(b.rules, b.facts, b.kit, { ...opts, set: b.set }));
  }
  if (reports.length === 1) return reports[0];
  // How many drafts the AI answered on, over both brands.
  return { ...combine(reports, opts.split ?? "test"), aiDocs: reports.reduce((n, r) => n + (r.aiDocs ?? 0), 0), aiErrors: reports.flatMap((r) => r.aiErrors ?? []).slice(0, 5) };
}
