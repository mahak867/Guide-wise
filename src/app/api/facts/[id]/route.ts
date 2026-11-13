import { actor, bumpKit, db, fail, log, must } from "@/lib/db";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const a = actor(req);
    if (a.role !== "manager" && a.role !== "compliance") return fail("Only the brand manager or compliance reviewer can change facts.", 403);
    const { id } = await ctx.params;
    must(await db().from("facts").delete().eq("id", id));
    const version = await bumpKit();
    await log(req, null, "fact_deleted", { fact: id, kit_version: version });
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e, 500);
  }
}
