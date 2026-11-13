import { aiAvailable, aiDiagnostics, aiModel } from "@/lib/engine/ai";
import { EVAL_DOCS } from "@/lib/eval/dataset";
import { scoreDoc } from "@/lib/eval/score";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "@/lib/seed";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Scores a few held-out test drafts with the AI checks on. It spends API quota, so it needs a token.
export async function GET(req: Request) {
  const token = process.env.EVAL_TOKEN;
  if (!token || req.headers.get("x-eval-token") !== token) return Response.json({ error: "Not allowed." }, { status: 403 });
  if (!aiAvailable()) return Response.json({ error: "No AI service is configured." }, { status: 503 });
  const u = new URL(req.url);
  const start = Math.max(0, Number(u.searchParams.get("start") ?? 0));
  const count = Math.min(5, Math.max(1, Number(u.searchParams.get("count") ?? 2)));
  const docs = EVAL_DOCS.filter((d) => d.split === "test").slice(start, start + count);
  const results = [];
  for (const d of docs) results.push(await scoreDoc(d, SEED_RULES, SEED_FACTS, SEED_KIT, true));
  return Response.json({ chain: aiModel(), results, ...aiDiagnostics() });
}
