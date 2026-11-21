import { fail } from "@/lib/db";
import { runBrandEval } from "@/lib/eval/brands";
import { cleanDraftStats } from "@/lib/eval/score";

// Re-runs the planted-error evaluation live: PrepPath (brand=1, the default), Suraksha Health (brand=2) or both (brand=all).
// Code checks only, so it is free and instant; AI-mode results come from scripts/eval.ts.
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const split = q.get("split");
    const s = split === "dev" || split === "all" ? split : "test";
    const b = q.get("brand");
    const brand = b === "2" || b === "all" ? b : "1";
    const report = await runBrandEval(brand, { useAI: false, split: s });
    let ai: Record<string, unknown> | null = null;
    // Each brand shows its own stored AI run (PrepPath: the published run; Suraksha Health: the verified run of
    // 21 Nov from the AI reliability workflow). Both brands combined have no AI run, so none is shown.
    if (brand === "1" || brand === "2") {
      try {
        ai = { ...((brand === "1" ? await import("@/lib/eval/ai-results.json") : await import("@/lib/eval/ai-results-brand-2.json")).default as Record<string, unknown>) };
        // Clean-draft counts for the AI run come from its stored per-draft results; without them, not measured.
        if (Array.isArray(ai.results) && !ai.cleanDrafts) ai.cleanDrafts = cleanDraftStats(ai.results as Parameters<typeof cleanDraftStats>[0]);
      } catch {
        ai = null;
      }
    }
    return Response.json({ report, ai, brand });
  } catch (e) {
    return fail(e, 500);
  }
}
