import { actor, bumpKit, db, fail, log, must, wsOf } from "@/lib/db";
import { Contacts, Disclaimers, Palette, firstIssue } from "@/lib/schemas";

// Assets: palette, approved disclaimers, approved contacts, the logo.
export async function POST(req: Request) {
  try {
    if (actor(req).role !== "manager") return fail("Only the brand manager can change assets. Switch role to Meera.", 403);
    const b = await req.json();
    const patch: Record<string, unknown> = {};
    for (const [k, schema] of [["palette", Palette], ["disclaimers", Disclaimers], ["contacts", Contacts]] as const) {
      if (b[k] === undefined) continue;
      const parsed = schema.safeParse(b[k]);
      if (!parsed.success) return fail(`That ${k} can't be saved (${firstIssue(parsed.error)}).`);
      patch[k] = parsed.data;
    }
    if ("logo" in b) {
      const l = b.logo;
      if (l === null || l === "") patch.logo = null;
      else if (typeof l === "string" && (/^data:image\/(png|webp);base64,/.test(l) || /^\/brand\/[\w.-]+\.png$/.test(l)) && l.length <= 400_000) patch.logo = l;
      else return fail("The logo must be a PNG or WebP image under 300 KB.");
    }
    if (b.profile && typeof b.profile === "object") {
      const n = b.profile.students_coached;
      patch.profile = { sector: String(b.profile.sector ?? "").slice(0, 80), students_coached: n === "" || n === null || n === undefined ? null : Math.max(0, Math.floor(Number(n))) };
    }
    if (!Object.keys(patch).length) return fail("Nothing to change.");
    must(await db().from("kit").update(patch).eq("ws", wsOf(req)));
    const version = await bumpKit(wsOf(req));
    await log(req, null, "assets_saved", { changed: Object.keys(patch), kit_version: version });
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e, 500);
  }
}
