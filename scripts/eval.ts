// Runs the planted-error evaluation. Usage:
//   npx tsx scripts/eval.ts          code checks only, prints the numbers
//   npx tsx scripts/eval.ts --ai     with the AI checks (needs ANTHROPIC_API_KEY), run twice for
//                                    repeat-run agreement, and saves src/lib/eval/ai-results.json
import { writeFileSync } from "node:fs";
import { aiAvailable, aiModel } from "../src/lib/engine/ai";
import { runEval } from "../src/lib/eval/score";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

async function main() {
  const useAI = process.argv.includes("--ai");
  if (useAI && !aiAvailable()) throw new Error("Set ANTHROPIC_API_KEY to run with the AI checks.");
  const a = await runEval(SEED_RULES, SEED_FACTS, SEED_KIT, { useAI, split: "test" });
  console.log(`${a.mode}: precision ${pct(a.precision)} [${a.precisionCI.map(pct).join(", ")}], recall ${pct(a.recall)} [${a.recallCI.map(pct).join(", ")}], critical recall ${pct(a.criticalRecall)}, hard ${a.hardCaught}/${a.hardPlanted}, ${a.ms} ms`);
  if (!useAI) return;
  if (a.mode !== "ai") throw new Error("The AI checks did not run; nothing saved.");
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
