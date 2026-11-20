import { actor, bumpKit, db, fail, log, must, readBody, wsOf } from "@/lib/db";
import { Contacts, Disclaimers, Palette, firstIssue, logoProblem } from "@/lib/schemas";

// Assets: palette, approved disclaimers, approved contacts, the logo.
export async function POST(req: Request) {
  try {
    if (actor(req).role !== "manager") return fail("Only the brand manager can change assets. Switch role to Meera.", 403);
    const b = await readBody(req);
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
      else {
        const why = logoProblem(l);
        if (why) return fail(why);
        patch.logo = l;
      }
    }
    if (b.profile && typeof b.profile === "object") {
      const n = b.profile.students_coached;
      const count = n === "" || n === null || n === undefined ? null : Number(String(n).replace(/,/g, ""));
      // "abc" or "1e400" used to clear the figure silently, and "-5" became 0.
      if (count !== null && (!Number.isFinite(count) || count < 0 || count > 1e9)) return fail("Students coached must be a whole number of 0 or more, like 50000.");
      patch.profile = { sector: String(b.profile.sector ?? "").slice(0, 80), students_coached: count === null ? null : Math.floor(count) };
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
