import { ApiError, audit, authorise, rateLimit, type ApiKey } from "@/lib/apikeys";
import { fail } from "@/lib/db";
import { getBrief } from "@/lib/governance";

export const dynamic = "force-dynamic";

// GET /api/v1/brief?content_type=social: the rules in force and the facts valid today.
export async function GET(req: Request) {
  const t = Date.now();
  let k: ApiKey | null = null;
  try {
    k = await authorise(req, "brief:read");
    rateLimit(k.id);
    const type = new URL(req.url).searchParams.get("content_type") ?? "social";
    const brief = await getBrief(k.ws, type);
    await audit(k, k.ws, "rest", "GET /api/v1/brief", 200, Date.now() - t, { rules: brief.rules.length, facts: brief.facts.length });
    return Response.json(brief);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    if (k) await audit(k, k.ws, "rest", "GET /api/v1/brief", status, Date.now() - t).catch(() => {});
    return fail(e, status);
  }
}
