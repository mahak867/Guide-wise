import { z } from "zod";
import { ApiError, audit, authorise, rateLimit, type ApiKey } from "@/lib/apikeys";
import { fail } from "@/lib/db";
import { checkDraft } from "@/lib/governance";
import { firstIssue } from "@/lib/schemas";

export const maxDuration = 60;
const CheckBody = z.object({
  text: z.string().trim().min(10, "send at least 10 characters of draft text").max(12000, "up to 12,000 characters at a time"),
  content_type: z.string().max(20).optional(),
  use_ai: z.boolean().optional(),
});

// POST /api/v1/check { text, content_type?, use_ai? }: the same cited findings the app shows.
export async function POST(req: Request) {
  const t = Date.now();
  let k: ApiKey | null = null;
  try {
    k = await authorise(req, "draft:check");
    rateLimit(k.id);
    const parsed = CheckBody.safeParse(await req.json());
    if (!parsed.success) throw new ApiError(400, `Bad request (${firstIssue(parsed.error)}).`);
    const out = await checkDraft(k.ws, parsed.data);
    await audit(k, k.ws, "rest", "POST /api/v1/check", 200, Date.now() - t, { findings: out.summary.findings, violations: out.summary.violations });
    return Response.json(out);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : e instanceof SyntaxError ? 400 : 500;
    if (k) await audit(k, k.ws, "rest", "POST /api/v1/check", status, Date.now() - t).catch(() => {});
    return fail(e, status);
  }
}
