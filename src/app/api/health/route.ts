import { aiAvailable, aiDiagnostics, aiModel, extractClaims, geminiLatency, geminiModels, judgeRule, probeProvider } from "@/lib/engine/ai";
import { SEED_RULES } from "@/lib/seed";
import { db, serverDbKeyKind } from "@/lib/db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Health check: with ?ai=1 it makes two small real AI calls and reports which provider answered.
export async function GET(req: Request) {
  const out: Record<string, unknown> = { ai: { available: aiAvailable(), chain: aiModel() } };
  // The database answers a one-row read, or says what is missing.
  const t0 = Date.now();
  try {
    const { error } = await db().from("kit").select("ws").limit(1);
    out.database = error ? { ok: false, error: error.message } : { ok: true, ms: Date.now() - t0, key: serverDbKeyKind() };
  } catch (e) {
    out.database = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
  const probe = new URL(req.url).searchParams.get("probe");
  if (probe) out.probe = await probeProvider(probe);
  if (new URL(req.url).searchParams.get("gemini_latency")) out.geminiLatency = await geminiLatency();
  if (new URL(req.url).searchParams.get("models") === "1") {
    out.geminiModels = await geminiModels().catch((e) => `error: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
  }
  return Response.json(out);
}
