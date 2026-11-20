import { actor, fail, log, seed, wsOf } from "@/lib/db";

export async function POST(req: Request) {
  try {
    // In an organisation's workspace (signed-in member), only a manager may wipe everyone's drafts.
    const a = actor(req);
    if (a.userId && a.role !== "manager") return fail("Only a manager can reset this organisation's workspace.", 403);
    await seed(wsOf(req), true);
    await log(req, null, "demo_reset");
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e, 500);
  }
}
