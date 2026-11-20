import { actor, bumpKit, db, fail, loadKit, log, must, wsOf } from "@/lib/db";
import { assessImpact, describeFactChange } from "@/lib/impact";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const a = actor(req);
    if (a.role !== "manager" && a.role !== "compliance") return fail("Only the brand manager or compliance reviewer can change facts.", 403);
    const { id } = await ctx.params;
    const before = (await loadKit(wsOf(req))).facts;
    // Deleting a fact that is not there changes nothing: no new Brand Kit version, no impact check.
    if (!before.some((f) => f.id === id)) return fail(`Fact ${id} was not found. It may already have been deleted.`, 404);
    must(await db().from("facts").delete().eq("ws", wsOf(req)).eq("id", id));
    const version = await bumpKit(wsOf(req));
    await log(req, null, "fact_deleted", { fact: id, kit_version: version });
    const impact = await assessImpact(wsOf(req), { kind: "fact", id, what: describeFactChange(before.find((f) => f.id === id), null) }, before);
    return Response.json({ ok: true, impact });
  } catch (e) {
    return fail(e, 500);
  }
}
