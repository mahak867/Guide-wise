import { aiAvailable, aiDiagnostics, aiModel, extractClaims, judgeRule } from "@/lib/engine/ai";
import { SEED_RULES } from "@/lib/seed";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Health check: with ?ai=1 it makes two small real AI calls and reports which provider answered.
export async function GET(req: Request) {
  const out: Record<string, unknown> = { ai: { available: aiAvailable(), chain: aiModel() } };
  if (new URL(req.url).searchParams.get("ai") === "1" && aiAvailable()) {
    const t0 = Date.now();
    try {
      const rule = SEED_RULES.find((r) => r.id === "R-12")!;
      const judged = await judgeRule(rule, "Join us and you will definitely clear JEE this year.", null);
      const claims = await extractClaims("Join 60,000+ students. Fees from ₹39,999.");
      out.check = { ok: true, ms: Date.now() - t0, judged, claims, ...aiDiagnostics() };
    } catch (e) {
      out.check = { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e), ...aiDiagnostics() };
    }
  }
  return Response.json(out);
}
