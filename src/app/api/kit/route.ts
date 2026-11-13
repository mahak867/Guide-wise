import { actor, bumpKit, db, fail, log, must } from "@/lib/db";

// Assets: palette, approved disclaimers, approved contacts.
export async function POST(req: Request) {
  try {
    if (actor(req).role !== "manager") return fail("Only the brand manager can change assets. Switch role to Meera.", 403);
    const b = await req.json();
    const patch: Record<string, unknown> = {};
    for (const k of ["palette", "disclaimers", "contacts"]) if (Array.isArray(b[k])) patch[k] = b[k];
    if (!Object.keys(patch).length) return fail("Nothing to change.");
    must(await db().from("kit").update(patch).eq("id", 1));
    const version = await bumpKit();
    await log(req, null, "assets_saved", { changed: Object.keys(patch), kit_version: version });
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e, 500);
  }
}
