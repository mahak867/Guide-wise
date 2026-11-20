import { actor, bumpKit, db, fail, log, must, wsOf } from "@/lib/db";
import { RuleIn, firstIssue, flagsNothing } from "@/lib/schemas";
import { assessImpact } from "@/lib/impact";

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
    // A code rule that can flag nothing would pass its "should pass" tests and look healthy while checking nothing.
    const empty = flagsNothing(parsed.data);
    if (empty) return fail(`That rule can't be saved: ${empty}.`);
    const row = { ...parsed.data, status: "advisory", last_test: null, updated_at: new Date().toISOString() };
    must(await db().from("rules").upsert({ ...row, ws: wsOf(req) }));
    const version = await bumpKit(wsOf(req));
    await log(req, null, "rule_saved", { rule: id, kit_version: version });
    const impact = await assessImpact(wsOf(req), { kind: "rule", id, what: `Rule ${id} was saved: "${row.description}"` });
    return Response.json({ ok: true, id, kit_version: version, impact });
  } catch (e) {
    return fail(e, 500);
  }
}
