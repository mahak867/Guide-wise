import { actor, db, fail, must, wsOf } from "@/lib/db";
import { INVITERS, listInvites } from "@/lib/invite";

// Revoke a join link. It stops working at once; people who already joined keep the workspace (it has no accounts).
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const a = actor(req);
    if (!INVITERS.includes(a.role)) return fail("Only a reviewer (Arjun or Kavya) or the brand manager (Meera) can revoke a join link.", 403);
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isSafeInteger(n) || n <= 0) return fail("That join link was not found.", 404);
    const ws = wsOf(req);
    const inv = (await listInvites(ws)).find((i) => i.id === n);
    if (!inv) return fail("That join link was not found.", 404);
    if (inv.revoked_at) return fail("That join link is already revoked.", 409);
    must(await db().from("events").insert({ ws, draft_id: inv.draft_id, actor: a.name, role: a.role, action: "invite_revoked", detail: { invite_id: String(n) } }));
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e, 500);
  }
}
