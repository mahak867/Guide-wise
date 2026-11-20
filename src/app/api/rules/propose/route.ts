import { actor, fail, loadKit, readBody, wsOf } from "@/lib/db";
import { aiAvailable, suggestRuleWording } from "@/lib/engine/ai";
import { CAN_ADD_FROM_WORDS, buildProposal, canAddFromWords, proposalTests, withAiWording } from "@/lib/make-rule";

export const maxDuration = 30;

// "Make this a rule": the rule Guidewise proposes for the selected words, with its own tests run by code. Nothing is saved;
// saving is POST /api/rules with { made_from_words: <the same body> }, which builds the rule again on the server.
export async function POST(req: Request) {
  try {
    if (!canAddFromWords(actor(req).role)) return fail("Only a reviewer or the brand manager can propose a rule. Switch role to Arjun, Kavya or Meera.", 403);
    const b = await readBody(req);
    const { rules, facts, kit } = await loadKit(wsOf(req));
    const out = buildProposal(b, rules);
    if (!out.ok) return fail(out.error, out.status);
    // The AI may reword the title and description only. With the AI off, or { ai: false }, the template wording stays.
    const proposal = b.ai !== false && aiAvailable() ? await withAiWording(out.proposal, suggestRuleWording) : out.proposal;
    const run = await proposalTests(proposal, facts, kit);
    return Response.json({ ok: true, proposal, run, can_add: CAN_ADD_FROM_WORDS });
  } catch (e) {
    return fail(e, 500);
  }
}
