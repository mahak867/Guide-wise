// Runs the planted-error evaluation. Usage:
//   npx tsx scripts/eval.ts          code checks only, prints the numbers
//   npx tsx scripts/eval.ts --ai     with the AI checks (needs GROQ_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY), run twice for
//                                    repeat-run agreement, and saves src/lib/eval/ai-results.json
import { writeFileSync } from "node:fs";
import { aiAvailable, aiModel } from "../src/lib/engine/ai";
import { runBrandEval } from "../src/lib/eval/brands";
import { runEval, type EvalReport } from "../src/lib/eval/score";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";

// --brand 2      code checks on the second brand (Suraksha Health, 40 held-out drafts)
// --brand all    each brand on its own line, then both combined (80 held-out drafts)
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const line = (label: string, a: EvalReport) =>
  `${label}: precision ${pct(a.precision)} [${a.precisionCI.map(pct).join(", ")}], recall ${pct(a.recall)} [${a.recallCI.map(pct).join(", ")}], critical recall ${pct(a.criticalRecall)}, hard ${a.hardCaught}/${a.hardPlanted}, clean drafts left alone ${a.cleanDrafts.noViolations}/${a.cleanDrafts.clean}, ${a.docs} drafts`;

async function main() {
  const useAI = process.argv.includes("--ai");
  const bi = process.argv.indexOf("--brand");
  const brand = bi > 0 ? process.argv[bi + 1] : undefined;
  if (brand !== undefined && brand !== "1" && brand !== "2" && brand !== "all") throw new Error("--brand takes 1, 2 or all.");
  if (brand === "2" || brand === "all") {
    if (useAI) throw new Error("The published AI run is for brand 1 only; run --brand 2 or all with code checks.");
    if (brand === "all") for (const k of ["1", "2"] as const) console.log(line(`brand ${k}, rules-only`, await runBrandEval(k, { useAI: false, split: "test" })));
    console.log(line(brand === "all" ? "both brands, rules-only" : "brand 2 (Suraksha Health), rules-only", await runBrandEval(brand, { useAI: false, split: "test" })));
    return;
  }
  if (useAI && !aiAvailable()) throw new Error("Set GROQ_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY to run with the AI checks.");
  const a = await runEval(SEED_RULES, SEED_FACTS, SEED_KIT, { useAI, split: "test" });
  console.log(`${a.mode}: precision ${pct(a.precision)} [${a.precisionCI.map(pct).join(", ")}], recall ${pct(a.recall)} [${a.recallCI.map(pct).join(", ")}], critical recall ${pct(a.criticalRecall)}, hard ${a.hardCaught}/${a.hardPlanted}, ${a.ms} ms`);
  const c = a.cleanDrafts;
  console.log(`clean drafts with no violations flagged: ${c.noViolations} of ${c.clean} (with no findings at all: ${c.noFindings} of ${c.clean})`);
  if (!useAI) {
    if (!brand) console.log(line("brand 2 (Suraksha Health), rules-only", await runBrandEval("2", { useAI: false, split: "test" })));
    return;
  }
  if (a.mode !== "ai") throw new Error("The AI checks did not run; nothing saved.");
  console.log(`AI answered on ${a.aiDocs} of ${a.docs} drafts${a.aiErrors?.length ? `; AI errors: ${a.aiErrors.join(" | ")}` : ""}`);
  // Second run: how often does the same draft produce the same set of findings?
  const b = await runEval(SEED_RULES, SEED_FACTS, SEED_KIT, { useAI, split: "test" });
  const sig = (r: typeof a, i: number) => JSON.stringify([...r.results[i].planted.map((p) => p.caught), ...r.results[i].extra.map((e) => e.rule + e.quote).sort()]);
  const same = a.results.filter((_, i) => sig(a, i) === sig(b, i)).length;
  const agreement = same / a.results.length;
  console.log(`repeat-run agreement: ${same}/${a.results.length} drafts identical (${pct(agreement)})`);
  const { results: _r, ...summary } = a;
  void _r;
  writeFileSync("src/lib/eval/ai-results.json", JSON.stringify({ measured: true, ...summary, mode: `AI checks (${aiModel()})`, agreement }, null, 2) + "\n");
  console.log("Saved src/lib/eval/ai-results.json");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
