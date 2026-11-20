import { fail } from "@/lib/db";
import { cleanDraftStats, runEval } from "@/lib/eval/score";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "@/lib/seed";

// Re-runs the planted-error evaluation live with the shipped PrepPath Brand Kit.
// Code checks only, so it is free and instant; AI-mode results come from scripts/eval.ts.
export async function GET(req: Request) {
  try {
    const split = new URL(req.url).searchParams.get("split");
    const s = split === "dev" || split === "all" ? split : "test";
    const report = await runEval(SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: false, split: s });
    let ai: Record<string, unknown> | null = null;
    try {
      ai = { ...((await import("@/lib/eval/ai-results.json")).default as Record<string, unknown>) };
      // Clean-draft counts for the AI run come from its stored per-draft results; without them, not measured.
      if (Array.isArray(ai.results) && !ai.cleanDrafts) ai.cleanDrafts = cleanDraftStats(ai.results as Parameters<typeof cleanDraftStats>[0]);
    } catch {
      ai = null;
    }
    return Response.json({ report, ai });
  } catch (e) {
    return fail(e, 500);
  }
}
