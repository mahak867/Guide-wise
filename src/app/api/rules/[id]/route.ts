import { actor, bumpKit, db, fail, loadKit, log, must, wsOf } from "@/lib/db";
import { aiAvailable, draftAmendment } from "@/lib/engine/ai";
import { redact } from "@/lib/engine/redact";
import { runRuleTests } from "@/lib/engine/ruletest";
import type { Rule } from "@/lib/types";

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

// action: "test" runs the rule's own test sentences; "promote" / "demote" change its status.
export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const { action } = body;
    const { rules, facts, kit } = await loadKit(wsOf(req));
    const rule = rules.find((r) => r.id === id);
    if (!rule) return fail("Rule not found.", 404);

    if (action === "test") {
      const run = await runRuleTests(rule, facts, kit);
      must(await db().from("rules").update({ last_test: run }).eq("ws", wsOf(req)).eq("id", id));
      await log(req, null, "rule_tested", { rule: id, passed: run.passed, mode: run.mode });
      return Response.json({ ok: true, run });
    }

    if (actor(req).role !== "manager") return fail("Only the brand manager can change a rule. Switch role to Meera.", 403);

    // Guideline Health. "amend_draft" proposes clearer wording from the findings people dismissed and tests it; nothing is saved.
    // "amend_apply" saves the wording the manager approved, only if the rule's check still passes every test.
    if (action === "amend_draft" || action === "amend_apply") {
      const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
      let p: { description: string; guidance: string; flag_example: string; pass_example: string; what_changed: string };
      if (action === "amend_draft") {
        if (!aiAvailable()) return fail("Drafting an amendment needs the AI service, which is off. Edit the rule by hand instead.", 503);
        const mine = must(await db().from("drafts").select("id").eq("ws", wsOf(req))) as { id: string }[];
        const dismissed = mine.length
          ? (must(await db().from("findings").select("quote,dismiss_reason").in("draft_id", mine.map((x) => x.id)).eq("rule_id", id).eq("state", "dismissed").limit(12)) as { quote: string; dismiss_reason: string | null }[])
          : [];
        if (!dismissed.length) return fail("Nobody has dismissed a finding from this rule yet, so there is nothing to learn from.");
        p = await draftAmendment(rule, dismissed.map((f) => ({ quote: redact(f.quote).text, reason: f.dismiss_reason ?? "no reason" })));
      } else {
        p = body.proposal ?? {};
      }
      const description = clip(p.description, 1000);
      if (description.length < 10) return fail("The amended wording is missing.");
      const extra = [{ text: clip(p.flag_example, 600), expect: "flag" as const }, { text: clip(p.pass_example, 600), expect: "pass" as const }]
        .filter((t) => t.text && !rule.tests.some((x) => x.text === t.text));
      const guidance = clip(p.guidance, 1000);
      const amended: Rule = { ...rule, description, config: { ...rule.config, ...(guidance ? { guidance } : {}) }, tests: [...rule.tests, ...extra].slice(0, 20) };
      const run = await runRuleTests(amended, facts, kit);
      const proposal = { description, guidance, flag_example: clip(p.flag_example, 600), pass_example: clip(p.pass_example, 600), what_changed: clip(p.what_changed, 400) };
      if (action === "amend_draft") return Response.json({ ok: true, proposal, before: { description: rule.description, guidance: rule.config.guidance ?? "" }, run });
      if (!run.passed) return Response.json({ error: `The amended ${id} does not pass its own test sentences, so it was not saved.`, run }, { status: 409 });
      must(await db().from("rules").update({ description, config: amended.config, tests: amended.tests, last_test: run, updated_at: new Date().toISOString() }).eq("ws", wsOf(req)).eq("id", id));
      const v = await bumpKit(wsOf(req));
      await log(req, null, "rule_amended", { rule: id, kit_version: v, from: rule.description, to: description, tests_added: extra.length });
      return Response.json({ ok: true, kit_version: v, run });
    }
    if (action === "promote") {
      // The gate: tests are re-run now, so a stale pass can't be used.
      const run = await runRuleTests(rule, facts, kit);
      must(await db().from("rules").update({ last_test: run }).eq("ws", wsOf(req)).eq("id", id));
      if (!run.passed) {
        const why = rule.tests.length ? "its check does not pass its own test sentences" : "it has no test sentences";
        return Response.json({ error: `${id} can't be enforced yet: ${why}.`, run }, { status: 409 });
      }
      must(await db().from("rules").update({ status: "enforced" }).eq("ws", wsOf(req)).eq("id", id));
    } else if (action === "demote") {
      must(await db().from("rules").update({ status: "advisory" }).eq("ws", wsOf(req)).eq("id", id));
    } else {
      return fail("Unknown action.");
    }
    const version = await bumpKit(wsOf(req));
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
    must(await db().from("rules").delete().eq("ws", wsOf(req)).eq("id", id));
    const version = await bumpKit(wsOf(req));
    await log(req, null, "rule_deleted", { rule: id, kit_version: version });
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e, 500);
  }
}
