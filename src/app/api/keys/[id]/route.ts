import { actor, db, fail, log, must, wsOf } from "@/lib/db";

// Revoke a key. It stops working at once; its audit trail stays.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    if (actor(req).role !== "manager") return fail("Only the brand manager can revoke API keys. Switch role to Meera.", 403);
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return fail("That key was not found.", 404);
    const row = must(await db().from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("ws", wsOf(req)).eq("id", id).is("revoked_at", null).select("prefix").maybeSingle()) as { prefix: string } | null;
    if (!row) return fail("That key was not found or is already revoked.", 404);
    await log(req, null, "api_key_revoked", { key: row.prefix });
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e, 500);
  }
}
