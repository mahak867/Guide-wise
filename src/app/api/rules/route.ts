import { actor, bumpKit, db, fail, log, must, wsOf } from "@/lib/db";
import { RuleIn, firstIssue } from "@/lib/schemas";

// Create or edit a rule. Only the brand manager may change the Brand Kit.
// A new or edited rule is always advisory: it has to pass its tests again before it can be enforced.
export async function POST(req: Request) {
  try {
    if (actor(req).role !== "manager") return fail("Only the brand manager can change rules. Switch role to Meera.", 403);
    const b = await req.json();
    const id = String(b.id ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (!id || !b.title || !b.description) return fail("A rule needs an ID, a title and a description.");
    const parsed = RuleIn.safeParse({
      ...b, id, kind: b.kind === "judgment" ? "judgment" : "code", category: b.category ?? "pattern",
      source: b.source || "Brand guide", risk: b.risk === "high" ? "high" : "low", status: "advisory",
    });
    if (!parsed.success) return fail(`That rule can't be saved (${firstIssue(parsed.error)}).`);
    const row = { ...parsed.data, status: "advisory", last_test: null, updated_at: new Date().toISOString() };
    must(await db().from("rules").upsert({ ...row, ws: wsOf(req) }));
    const version = await bumpKit(wsOf(req));
    await log(req, null, "rule_saved", { rule: id, kit_version: version });
    return Response.json({ ok: true, id, kit_version: version });
  } catch (e) {
    return fail(e, 500);
  }
}
