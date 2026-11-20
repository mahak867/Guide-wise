import { actor, bumpKit, db, fail, loadKit, log, must, readBody, wsOf } from "@/lib/db";
import { checkAmendment, dismissedSentence, type Dismissed } from "@/lib/amend";
import { aiAvailable, draftAmendment, type Amendment } from "@/lib/engine/ai";
import { redact, restore } from "@/lib/engine/redact";
import { runRuleTests } from "@/lib/engine/ruletest";
import { assessImpact } from "@/lib/impact";

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

// action: "test" runs the rule's own test sentences; "promote" / "demote" change its status.
export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await readBody(req);
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
      // The dismissed findings, with the sentence each sat in, are read again on apply: the page's copy is not trusted.
      const mine = must(await db().from("drafts").select("id,text").eq("ws", wsOf(req))) as { id: string; text: string }[];
      const rows = mine.length
        ? (must(await db().from("findings").select("quote,dismiss_reason,draft_id").in("draft_id", mine.map((x) => x.id)).eq("rule_id", id).eq("state", "dismissed").limit(12)) as { quote: string; dismiss_reason: string | null; draft_id: string }[])
        : [];
      if (!rows.length) return fail("Nobody has dismissed a finding from this rule yet, so there is nothing to learn from.");
      const dismissed: Dismissed[] = rows.map((f) => ({ quote: f.quote, sentence: dismissedSentence(mine.find((x) => x.id === f.draft_id)?.text ?? "", f.quote), reason: f.dismiss_reason ?? "no reason" }));
      const before = { description: rule.description, guidance: rule.config.guidance ?? "" };

      if (action === "amend_draft") {
        if (!aiAvailable()) return fail("Drafting an amendment needs the AI service, which is off. Edit the rule by hand instead.", 503);
        // Personal data in the dismissed text is masked before it goes to the AI, and put back in its answer.
        // One redaction over all of it, so each placeholder stands for one value.
        const { text: safe, map } = redact(dismissed.flatMap((d) => [d.quote, d.sentence]).map((s) => s.replace(/\n/g, " ")).join("\n"));
        const lines = safe.split("\n");
        const masked = dismissed.map((d, i) => ({ quote: lines[2 * i] ?? "", sentence: lines[2 * i + 1] ?? "", reason: d.reason }));
        const r = (s: string) => restore(s, map);
        const unmask = (a: Amendment): Amendment => ({
          ...a, description: r(a.description), guidance: r(a.guidance), flag_example: r(a.flag_example), pass_example: r(a.pass_example), what_changed: r(a.what_changed),
          config_change: { ...a.config_change, except: a.config_change.except.map(r) },
        });
        let c = await checkAmendment(rule, unmask(await draftAmendment(rule, masked)), dismissed, facts, kit);
        // One retry when the tests are not new or not taken from the dismissed text, telling the AI why.
        const testIssue = c.problems.filter((p) => /repeats|not taken from|no new sentence|are the same/.test(p));
        if (testIssue.length) c = await checkAmendment(rule, unmask(await draftAmendment(rule, masked, testIssue.join(" "))), dismissed, facts, kit);
        return Response.json({ ok: true, proposal: c.proposal, before, run: c.run, added: c.added, changes: c.changes, problems: c.problems, dismissed: c.dismissed, resolves: c.resolves, checked_by: c.checked_by });
      }

      const c = await checkAmendment(rule, body.proposal ?? {}, dismissed, facts, kit);
      if (c.problems.length) return Response.json({ error: `The amendment to ${id} was not saved: ${c.problems[0]}`, problems: c.problems, run: c.run }, { status: 409 });
      if (!c.run.passed) return Response.json({ error: `The amended ${id} does not pass its own test sentences, so it was not saved.`, run: c.run }, { status: 409 });
      const a = c.amended;
      must(await db().from("rules").update({ description: a.description, config: a.config, tests: a.tests, last_test: c.run, updated_at: new Date().toISOString() }).eq("ws", wsOf(req)).eq("id", id));
      const v = await bumpKit(wsOf(req));
      await log(req, null, "rule_amended", { rule: id, kit_version: v, from: rule.description, to: a.description, tests_added: c.added.length, check_changes: c.changes, resolves_dismissals: c.resolves, still_flagged: c.dismissed.filter((d) => d.still_flagged).length });
      const impact = await assessImpact(wsOf(req), { kind: "rule", id, what: `Rule ${id} was amended: "${a.description}"` });
      return Response.json({ ok: true, kit_version: v, run: c.run, impact, added: c.added, changes: c.changes, dismissed: c.dismissed, resolves: c.resolves, checked_by: c.checked_by });
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
    const impact = await assessImpact(wsOf(req), { kind: "rule", id, what: action === "promote" ? `Rule ${id} is now enforced.` : `Rule ${id} is now advisory.` });
    return Response.json({ ok: true, kit_version: version, impact });
  } catch (e) {
    return fail(e, 500);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    if (actor(req).role !== "manager") return fail("Only the brand manager can delete rules. Switch role to Meera.", 403);
    const { id } = await ctx.params;
    // Deleting a rule that is not there changes nothing: no new Brand Kit version, no impact check.
    const gone = must(await db().from("rules").select("id").eq("ws", wsOf(req)).eq("id", id)) as unknown[];
    if (!gone.length) return fail(`Rule ${id} was not found. It may already have been deleted.`, 404);
    must(await db().from("rules").delete().eq("ws", wsOf(req)).eq("id", id));
    const version = await bumpKit(wsOf(req));
    await log(req, null, "rule_deleted", { rule: id, kit_version: version });
    const impact = await assessImpact(wsOf(req), { kind: "rule", id, what: `Rule ${id} was deleted.` });
    return Response.json({ ok: true, impact });
  } catch (e) {
    return fail(e, 500);
  }
}
