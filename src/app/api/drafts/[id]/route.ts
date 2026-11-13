import { actor, db, fail, loadKit, log, must, wsOf } from "@/lib/db";
import { reviewDraft } from "@/lib/engine/review";
import { riskTier } from "@/lib/engine/review";
import { cleanImages, fingerprint, getDraft, getFindings, runReview, saveText } from "@/lib/workflow";

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const d = db();
    const draft = await getDraft(wsOf(req), id);
    if (!draft) return fail("That draft was not found. It may have been removed by a demo reset.", 404);
    const [findings, events, versions, receipt] = await Promise.all([
      getFindings(id),
      d.from("events").select("*").eq("ws", wsOf(req)).eq("draft_id", id).order("at", { ascending: false }),
      d.from("versions").select("*").eq("draft_id", id).order("version", { ascending: false }),
      d.from("receipts").select("*").eq("draft_id", id).order("at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return Response.json({ draft, findings, events: must(events), versions: must(versions), receipt: must(receipt) });
  } catch (e) {
    return fail(e, 500);
  }
}

const REVIEW = ["brand_review", "compliance_review"];

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const b = await req.json();
    const a = actor(req);
    const d = db();
    const ws = wsOf(req);
    let draft = await getDraft(ws, id);
    if (!draft) return fail("That draft was not found.", 404);
    if (draft.status === "approved") return fail("This draft is approved and locked. Start a new review to change it.", 409);
    const findings = await getFindings(id);
    const inReview = REVIEW.includes(draft.status);
    const reviewer = a.role === "brand" || a.role === "compliance";

    switch (b.action) {
      case "accept": {
        if (inReview) return fail("The draft is with a reviewer. Text can change again if they request changes.", 409);
        const f = findings.find((x) => x.id === b.finding_id);
        if (!f || f.state !== "open") return fail("That finding is not open.");
        if (f.fix === null || f.fix === undefined) return fail("No fix is offered for this finding. Edit the text instead.");
        if ((f.location ?? "text") !== "text") return fail("Image findings are fixed in the design file. Dismiss with a reason once the image is replaced.");
        if (!draft.text.includes(f.quote)) return fail("Those words are no longer in the draft.");
        const edited = typeof b.fix === "string" && b.fix.trim() !== f.fix ? b.fix.trim().slice(0, 1000) : null;
        const replacement = edited ?? f.fix;
        draft = await saveText(draft, draft.text.replace(f.quote, replacement), `${edited ? "Accepted an edited fix" : "Accepted fix"} for ${f.rule_id}`);
        must(await d.from("findings").update({ state: "accepted", resolved_by: a.name, ...(edited ? { fix: edited, fix_note: "Edited by the writer before accepting; the checks ran again on it." } : {}) }).eq("id", f.id!));
        // Re-check the new text with the code checks, so overlapping findings are recomputed, not just closed.
        await runReview(ws, draft, false);
        await log(req, id, "fix_accepted", { rule: f.rule_id, from: f.quote, to: replacement, edited: !!edited, version: draft.version });
        break;
      }
      case "accept_all": {
        if (inReview) return fail("The draft is with a reviewer. Text can change again if they request changes.", 409);
        // Apply every available text fix in memory, re-checking after each one so follow-ups
        // (such as a disclaimer a fix requires) are picked up; then save once.
        const { kit, rules, facts } = await loadKit(ws);
        const skip = new Set(findings.filter((f) => f.state === "dismissed").map((f) => `${f.rule_id}|${f.quote}`));
        let text = draft.text;
        const applied: { rule: string; from: string; to: string }[] = [];
        for (let i = 0; i < 20; i++) {
          const { findings: now } = await reviewDraft(text, draft.intent, rules, facts, kit, { useAI: false });
          const f = now.find((x) => x.fix !== null && x.fix !== undefined && (x.location ?? "text") === "text" && !skip.has(`${x.rule_id}|${x.quote}`) && text.includes(x.quote));
          if (!f) break;
          text = text.replace(f.quote, f.fix!);
          applied.push({ rule: f.rule_id, from: f.quote, to: f.fix! });
        }
        if (!applied.length) return fail("There are no fixes left to accept.");
        draft = await saveText(draft, text, `Accepted ${applied.length} fix${applied.length > 1 ? "es" : ""}`);
        const hit = findings.filter((f) => f.state === "open" && applied.some((x) => x.rule === f.rule_id && x.from === f.quote));
        if (hit.length) must(await d.from("findings").update({ state: "accepted", resolved_by: a.name }).in("id", hit.map((f) => f.id!)));
        // Follow-up findings that were raised and fixed inside this pass are recorded as accepted too.
        const known = new Set(findings.map((f) => `${f.rule_id}|${f.quote}`));
        const follow = applied.filter((x) => !known.has(`${x.rule}|${x.from}`));
        if (follow.length) {
          must(await d.from("findings").insert(follow.map((x) => ({
            draft_id: id, draft_version: draft!.version, rule_id: x.rule, check_type: "code", severity: "major", level: "violation",
            risk: rules.find((r) => r.id === x.rule)?.risk ?? "low", quote: x.from, location: "text",
            message: "Raised by an earlier fix and fixed in the same step.", rule_text: rules.find((r) => r.id === x.rule)?.title ?? x.rule,
            fix: x.to, fix_status: "verified", state: "accepted", resolved_by: a.name,
          }))));
        }
        await runReview(ws, draft, false);
        must(await d.from("events").insert(applied.map((x) => ({ ws, draft_id: id, actor: a.name, role: a.role, action: "fix_accepted", detail: { rule: x.rule, from: x.from, to: x.to, version: draft!.version } }))));
        break;
      }
      case "dismiss": {
        const f = findings.find((x) => x.id === b.finding_id);
        if (!f || f.state !== "open") return fail("That finding is not open.");
        const reason = String(b.reason ?? "").trim();
        if (!reason) return fail("Choose a reason for dismissing this finding.");
        if (f.severity === "critical" && f.level === "violation" && a.role !== "compliance") {
          return fail("A critical finding can only be dismissed by the compliance reviewer (Kavya). You can fix it, or submit and let compliance decide.", 403);
        }
        must(await d.from("findings").update({ state: "dismissed", dismiss_reason: reason, resolved_by: a.name }).eq("id", f.id!));
        await log(req, id, "finding_dismissed", { rule: f.rule_id, quote: f.quote, reason });
        break;
      }
      case "reopen": {
        const f = findings.find((x) => x.id === b.finding_id);
        if (!f || f.state !== "dismissed") return fail("Only a dismissed finding can be reopened.");
        must(await d.from("findings").update({ state: "open", dismiss_reason: null, resolved_by: null }).eq("id", f.id!));
        await log(req, id, "finding_reopened", { rule: f.rule_id, quote: f.quote });
        break;
      }
      case "edit": {
        if (inReview) return fail("The draft is with a reviewer. Text can change again if they request changes.", 409);
        const text = String(b.text ?? "").trim();
        if (text.length < 10) return fail("The draft can't be empty.");
        if (text === draft.text) return fail("The text has not changed.");
        draft = await saveText(draft, text, "Edited by " + a.name);
        if (draft.status === "changes_requested") must(await d.from("drafts").update({ status: "draft" }).eq("id", id));
        await runReview(ws, draft, b.useAI !== false);
        await log(req, id, "text_edited", { version: draft.version });
        break;
      }
      case "images": {
        if (inReview) return fail("The draft is with a reviewer. Images can change again if they request changes.", 409);
        const images = cleanImages(b.images);
        must(await d.from("drafts").update({ images, updated_at: new Date().toISOString() }).eq("id", id));
        draft = await saveText(draft, draft.text, `Images updated by ${a.name} (${images.length} image${images.length === 1 ? "" : "s"})`);
        draft.images = images;
        if (draft.status === "changes_requested") must(await d.from("drafts").update({ status: "draft" }).eq("id", id));
        await runReview(ws, draft, b.useAI !== false);
        await log(req, id, "images_updated", { count: images.length, version: draft.version });
        break;
      }
      case "recheck": {
        await runReview(ws, draft, b.useAI !== false);
        await log(req, id, "review_run", { version: draft.version, mode: (await getDraft(ws, id))?.mode });
        break;
      }
      case "submit": {
        if (inReview) return fail("This draft is already with a reviewer.", 409);
        // Code checks run once more on the exact text being submitted, then the rule table routes it.
        await runReview(ws, draft, false);
        const risk = riskTier(await getFindings(id));
        const status = risk.tier === "high" ? "compliance_review" : "brand_review";
        must(await d.from("drafts").update({ status, risk_tier: risk.tier, risk_reasons: risk.reasons, updated_at: new Date().toISOString() }).eq("id", id));
        await log(req, id, "submitted", { routed_to: status, risk: risk.tier, reasons: risk.reasons, version: draft.version });
        break;
      }
      case "approve": {
        if (!inReview) return fail("The creator has to submit this draft for review first.", 409);
        if (!reviewer) return fail("Only a reviewer can approve. Switch role to Arjun (brand) or Kavya (compliance).", 403);
        if (draft.status === "compliance_review" && a.role !== "compliance") {
          return fail("This draft is high risk, so it needs the compliance reviewer. Switch role to Kavya.", 403);
        }
        const open = findings.filter((f) => f.state === "open" && f.level === "violation");
        if (open.length) return fail(`${open.length} finding${open.length > 1 ? "s are" : " is"} still open. Dismiss each with a reason, or request changes.`, 409);
        const { kit } = await loadKit(wsOf(req));
        const count = (s: string) => findings.filter((f) => f.state === s).length;
        must(await d.from("receipts").insert({
          draft_id: id,
          text_hash: fingerprint(draft.text),
          approved_text: draft.text,
          kit_version: kit.version,
          approver: a.name,
          approver_role: a.role,
          findings_summary: {
            total: findings.length, fixed: count("accepted") + count("resolved"), dismissed: count("dismissed"),
            suggestions_left_open: findings.filter((f) => f.state === "open").length,
            rules: [...new Set(findings.map((f) => f.rule_id))],
            dismissals: findings.filter((f) => f.state === "dismissed").map((f) => ({ rule: f.rule_id, reason: f.dismiss_reason, by: f.resolved_by })),
            draft_version: draft.version, risk_tier: draft.risk_tier,
          },
        }));
        must(await d.from("drafts").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", id));
        await log(req, id, "approved", { version: draft.version, kit_version: kit.version, note: b.comment ?? "" });
        break;
      }
      case "request_changes": {
        if (!inReview) return fail("The creator has to submit this draft for review first.", 409);
        if (!reviewer) return fail("Only a reviewer can request changes. Switch role to Arjun or Kavya.", 403);
        const comment = String(b.comment ?? "").trim();
        if (!comment) return fail("Say what needs to change.");
        must(await d.from("drafts").update({ status: "changes_requested", updated_at: new Date().toISOString() }).eq("id", id));
        await log(req, id, "changes_requested", { comment });
        break;
      }
      case "comment": {
        const comment = String(b.comment ?? "").trim();
        if (!comment) return fail("Write a comment first.");
        await log(req, id, "comment", { comment });
        break;
      }
      default:
        return fail("Unknown action.");
    }
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e, 500);
  }
}
