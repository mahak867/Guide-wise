import { actor, bumpKit, db, fail, loadKit, log, must } from "@/lib/db";
import { runRuleTests } from "@/lib/engine/ruletest";

type Ctx = { params: Promise<{ id: string }> };

// action: "test" runs the rule's own test sentences; "promote" / "demote" change its status.
export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const { action } = await req.json();
    const { rules, facts, kit } = await loadKit();
    const rule = rules.find((r) => r.id === id);
    if (!rule) return fail("Rule not found.", 404);

    if (action === "test") {
      const run = await runRuleTests(rule, facts, kit);
      must(await db().from("rules").update({ last_test: run }).eq("id", id));
      await log(req, null, "rule_tested", { rule: id, passed: run.passed, mode: run.mode });
      return Response.json({ ok: true, run });
    }

    if (actor(req).role !== "manager") return fail("Only the brand manager can promote or demote a rule. Switch role to Meera.", 403);
    if (action === "promote") {
      // The gate: tests are re-run now, so a stale pass can't be used.
      const run = await runRuleTests(rule, facts, kit);
      must(await db().from("rules").update({ last_test: run }).eq("id", id));
      if (!run.passed) {
        const why = rule.tests.length ? "its check does not pass its own test sentences" : "it has no test sentences";
        return Response.json({ error: `${id} can't be enforced yet: ${why}.`, run }, { status: 409 });
      }
      must(await db().from("rules").update({ status: "enforced" }).eq("id", id));
    } else if (action === "demote") {
      must(await db().from("rules").update({ status: "advisory" }).eq("id", id));
    } else {
      return fail("Unknown action.");
    }
    const version = await bumpKit();
    await log(req, null, `rule_${action}d`, { rule: id, kit_version: version });
    return Response.json({ ok: true, kit_version: version });
  } catch (e) {
    return fail(e, 500);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    if (actor(req).role !== "manager") return fail("Only the brand manager can delete rules. Switch role to Meera.", 403);
    const { id } = await ctx.params;
    must(await db().from("rules").delete().eq("id", id));
    const version = await bumpKit();
    await log(req, null, "rule_deleted", { rule: id, kit_version: version });
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e, 500);
  }
}
