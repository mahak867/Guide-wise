import { fail } from "@/lib/db";
import { runEval } from "@/lib/eval/score";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "@/lib/seed";

// Re-runs the planted-error evaluation live with the shipped PrepPath Brand Kit.
// Code checks only, so it is free and instant; AI-mode results come from scripts/eval.ts.
export async function GET(req: Request) {
  try {
    const split = new URL(req.url).searchParams.get("split");
    const s = split === "dev" || split === "all" ? split : "test";
    const report = await runEval(SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: false, split: s });
    let ai: unknown = null;
    try {
      ai = (await import("@/lib/eval/ai-results.json")).default;
    } catch {
      ai = null;
    }
    return Response.json({ report, ai });
  } catch (e) {
    return fail(e, 500);
  }
}
