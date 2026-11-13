// Prints the code-only held-out evaluation as JSON (used by the PDF builder).
import { runEval } from "../src/lib/eval/score";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";

runEval(SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: false, split: "test" }).then((r) => {
  const { results: _r, ...summary } = r;
  void _r;
  process.stdout.write(JSON.stringify(summary));
});
