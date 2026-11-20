import { actor, bumpKit, db, fail, loadKit, log, must, readBody, wsOf } from "@/lib/db";
import { buildProposal, canAddFromWords, proposalTests } from "@/lib/make-rule";
import { RuleIn, firstIssue, flagsNothing } from "@/lib/schemas";
import { assessImpact } from "@/lib/impact";

// Create or edit a rule. Only the brand manager may change the Brand Kit.
// A new or edited rule is always advisory: it has to pass its tests again before it can be enforced.
export async function POST(req: Request) {
  try {
    const b = await readBody(req);
    if (b.made_from_words !== undefined) return saveFromWords(req, b.made_from_words);
    if (actor(req).role !== "manager") return fail("Only the brand manager can change rules. Switch role to Meera.", 403);
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

/**
 * "Make this a rule": a reviewer or the brand manager adds a rule made from words in a draft. The rule is built again
 * here from the words (the page's copy of the check and tests is not trusted; only its title and description are used),
 * gets a new ID (never replacing a rule), must pass its own tests, and is saved as advisory. Only the manager can enforce it.
 */
async function saveFromWords(req: Request, input: unknown): Promise<Response> {
  const who = actor(req);
  if (!canAddFromWords(who.role)) return fail("Only a reviewer or the brand manager can add a rule from words. Switch role to Arjun, Kavya or Meera.", 403);
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("made_from_words must be an object with the selected words in text.");
  const ws = wsOf(req);
  const { rules, facts, kit } = await loadKit(ws);
  const out = buildProposal(input as Record<string, unknown>, rules);
  if (!out.ok) return fail(out.error, out.status);
  const rule = out.proposal.rule;
  const run = await proposalTests(out.proposal, facts, kit);
  if (!run.passed) return Response.json({ error: `That rule was not added: its check does not pass its own test sentences.`, run }, { status: 409 });
  const parsed = RuleIn.safeParse(rule);
  if (!parsed.success) return fail(`That rule can't be saved (${firstIssue(parsed.error)}).`);
  // insert, not upsert: a rule added from words never replaces an existing one, even if two people add at once.
  const ins = await db().from("rules").insert({ ...parsed.data, status: "advisory", last_test: run, updated_at: new Date().toISOString(), ws });
  if (ins.error?.code === "23505") return fail(`${rule.id} was added by someone else a moment ago. Propose the rule again to get a new ID.`, 409);
  must(ins);
  const version = await bumpKit(ws);
  await log(req, null, "rule_saved", { rule: rule.id, kit_version: version, from_words: true, by_role: who.role });
  const impact = await assessImpact(ws, { kind: "rule", id: rule.id, what: `Rule ${rule.id} was added from words in a draft: "${rule.description}"` });
  return Response.json({ ok: true, id: rule.id, kit_version: version, run, rule: { ...rule, status: "advisory", last_test: run }, impact });
}
