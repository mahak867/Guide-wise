import { BRAND_SIGNERS, approverLabel, canGrantException, complianceSignOff, exceptionReason, isIsoDate, parseException, type SignEvent } from "@/lib/approval";
import { actor, db, fail, loadKit, log, must, wsOf } from "@/lib/db";
import { reviewDraft } from "@/lib/engine/review";
import { riskTier } from "@/lib/engine/review";
import { createShare, sharesOf, withoutHashes, type ShareEvent } from "@/lib/share";
import { cleanAssets, cleanImages, fingerprint, getDraft, getFindings, lapseExceptions, runReview, saveText } from "@/lib/workflow";

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
    const raw = must(events) as (SignEvent & ShareEvent)[];
    // Read-only share links: listed without their tokens (never stored) or token hashes (never sent).
    const shares = sharesOf(raw).filter((s) => s.active);
    const evs = withoutHashes(raw) as SignEvent[];
    // A high-risk draft needs compliance and then brand. Which sign-off still stands is derived from the events log.
    const sign_off = draft.status === "compliance_review" ? { compliance: complianceSignOff(evs), waiting_for: complianceSignOff(evs) ? "brand" : "compliance" } : null;
    return Response.json({ draft, findings, events: evs, versions: must(versions), receipt: must(receipt), sign_off, shares });
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
    // Reviewers: brand (Arjun), compliance (Kavya), and the brand manager (Meera), who can stand in for brand.
    const reviewer = a.role === "brand" || a.role === "compliance" || a.role === "manager";
    // Read-only share links of the approval record. Sharing does not change the draft, so it works on a locked one.
    if (b.action === "share") {
      if (draft.status !== "approved") return fail("Only an approved draft has an approval record to share.", 409);
      const receipt = must(await d.from("receipts").select("id").eq("draft_id", id).order("at", { ascending: false }).limit(1).maybeSingle()) as { id: string } | null;
      if (!receipt) return fail("This draft has no approval record yet.", 409);
      const made = await createShare(ws, id, a, receipt.id, new URL(req.url).origin);
      if (!made) return fail("This draft already has 20 active links. Revoke one first.", 409);
      return Response.json({ ok: true, ...made });
    }
    if (b.action === "unshare") {
      if (!reviewer) return fail("Only a reviewer (Arjun, Kavya or Meera) can revoke a share link.", 403);
      const shareId = Number(b.share_id);
      if (!Number.isSafeInteger(shareId) || shareId <= 0) return fail("Say which link to revoke (share_id).");
      const evs = must(await d.from("events").select("id, actor, role, action, at, detail").eq("ws", ws).eq("draft_id", id).in("action", ["share_created", "share_revoked"])) as ShareEvent[];
      const s = sharesOf(evs).find((x) => x.id === shareId);
      if (!s) return fail("That share link was not found on this draft.", 404);
      if (s.revoked_at) return fail("That link is already revoked.", 409);
      await log(req, id, "share_revoked", { share_id: String(shareId) });
      return Response.json({ ok: true });
    }
    if (draft.status === "approved") return fail("This draft is approved and locked. Start a new review to change it.", 409);
    const findings = await getFindings(id);
    const inReview = REVIEW.includes(draft.status);

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
          const { findings: now } = await reviewDraft(text, draft.intent, rules, facts, kit, { useAI: false, contentType: draft.content_type });
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
        let reason = String(b.reason ?? "").trim().slice(0, 300);
        if (!reason) return fail("Choose a reason for dismissing this finding.");
        // An exception is granted by a reviewer, optionally until a date; it is stored in the reason itself,
        // as "Approved exception (until 2026-12-31)", so it reads plainly wherever the reason is shown.
        const exception = /^approved exception\b/i.test(reason);
        let until: string | null = null;
        if (exception) {
          if (f.level === "violation" && !canGrantException(a.role)) {
            return fail("Only a reviewer (Arjun, Kavya or Meera) can grant an exception. Choose another reason, fix it, or submit and let a reviewer decide.", 403);
          }
          const embedded = /\(until\s+([^)]*)\)/i.exec(reason)?.[1]?.trim() ?? null;
          const raw = b.until === undefined || b.until === null || b.until === "" ? embedded : String(b.until).trim();
          if (raw && !isIsoDate(raw)) return fail("The exception's end date must be a real date, written YYYY-MM-DD.");
          until = raw || null;
          reason = exceptionReason(until);
        }
        if (f.severity === "critical" && f.level === "violation" && a.role !== "compliance") {
          return fail("A critical finding can only be dismissed by the compliance reviewer (Kavya). You can fix it, or submit and let compliance decide.", 403);
        }
        must(await d.from("findings").update({ state: "dismissed", dismiss_reason: reason, resolved_by: a.name }).eq("id", f.id!));
        await log(req, id, "finding_dismissed", { rule: f.rule_id, quote: f.quote, reason, ...(exception ? { exception: true, until } : {}) });
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
        await runReview(ws, draft, false, true); // only images changed: no AI call needed
        await log(req, id, "images_updated", { count: images.length, version: draft.version });
        break;
      }
      case "assets": {
        if (inReview) return fail("The draft is with a reviewer. Documents can change again if they request changes.", 409);
        const assets = cleanAssets(b.assets);
        must(await d.from("drafts").update({ assets, updated_at: new Date().toISOString() }).eq("id", id));
        if (draft.status === "changes_requested") must(await d.from("drafts").update({ status: "draft" }).eq("id", id));
        await runReview(ws, { ...draft, assets }, false, true);
        await log(req, id, "assets_updated", { count: assets.length });
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
        if (!reviewer) return fail("Only a reviewer can approve. Switch role to Arjun (brand), Kavya (compliance) or Meera (brand manager).", 403);
        // Dual sign-off: a high-risk draft needs compliance (Kavya) first, then brand (Arjun or Meera).
        // The compliance sign-off is an "approved_partial" event; the brand sign-off completes the approval.
        const dual = draft.status === "compliance_review";
        const evs = dual ? must(await d.from("events").select("id, actor, role, action, at").eq("ws", ws).eq("draft_id", id)) as SignEvent[] : [];
        const signed = dual ? complianceSignOff(evs) : null;
        if (dual && a.role === "compliance" && signed) {
          return fail(`${signed.actor} has already given the compliance sign-off. It now needs the brand sign-off: switch role to Arjun (brand) or Meera (brand manager).`, 409);
        }
        if (dual && a.role !== "compliance" && !signed) {
          return fail("This draft is high risk, so it needs two sign-offs: compliance first (switch role to Kavya), then brand.", 403);
        }
        if (dual && a.role !== "compliance" && !BRAND_SIGNERS.includes(a.role)) {
          return fail("The second sign-off on a high-risk draft is the brand reviewer's (Arjun) or the brand manager's (Meera).", 403);
        }
        const { kit } = await loadKit(wsOf(req));
        // An exception past its end date has lapsed: its finding is open again, and approval waits until it is resolved.
        const lapsed = await lapseExceptions(ws, id, findings);
        if (lapsed.length) {
          await log(req, id, "approval_blocked_exception_lapsed", { rules: lapsed.map((f) => f.rule_id) });
          const ends = lapsed.map((f) => `${f.rule_id} until ${parseException(f.dismiss_reason)?.until}`).join(", ");
          return fail(`${lapsed.length === 1 ? "An approved exception has" : `${lapsed.length} approved exceptions have`} lapsed (${ends}), so ${lapsed.length === 1 ? "the finding is" : "the findings are"} open again. Resolve ${lapsed.length === 1 ? "it" : "them"}, then approve.`, 409);
        }
        // Approval is bound to the Brand Kit in force now: if rules, facts or assets changed since the draft was last
        // checked, the code checks run again first, and anything new must be resolved before approval.
        // This applies to each sign-off, the first and the second.
        let current = findings;
        if ((draft.kit_version ?? 0) < kit.version) {
          const before = new Set(findings.filter((f) => f.state === "open").map((f) => f.id));
          await runReview(ws, draft, false, true);
          current = await getFindings(id);
          draft = (await getDraft(ws, id))!;
          const fresh = current.filter((f) => f.state === "open" && f.level === "violation" && !before.has(f.id));
          if (fresh.length) {
            await log(req, id, "approval_blocked_kit_changed", { from: draft.kit_version, to: kit.version, new_findings: fresh.map((f) => f.rule_id) });
            return fail(`The Brand Kit changed since this draft was checked, so it was checked again: ${fresh.length} new finding${fresh.length > 1 ? "s" : ""} (${[...new Set(fresh.map((f) => f.rule_id))].join(", ")}). Resolve ${fresh.length > 1 ? "them" : "it"}, then approve.`, 409);
          }
        }
        const open = current.filter((f) => f.state === "open" && f.level === "violation");
        if (open.length) return fail(`${open.length} finding${open.length > 1 ? "s are" : " is"} still open. Dismiss each with a reason, or request changes.`, 409);
        if (dual && a.role === "compliance") {
          // First of two sign-offs: recorded, and the draft stays with review until brand signs off.
          await log(req, id, "approved_partial", { version: draft.version, kit_version: kit.version, note: b.comment ?? "", waiting_for: "brand" });
          must(await d.from("drafts").update({ updated_at: new Date().toISOString() }).eq("id", id));
          return Response.json({ ok: true, approved: false, waiting_for: "brand", message: `Approved by ${a.name}, waiting for brand sign-off.` });
        }
        const now = new Date().toISOString();
        const approvers = [...(dual && signed ? [{ name: signed.actor, role: "compliance", at: signed.at }] : []), { name: a.name, role: a.role, at: now }];
        const count = (s: string) => current.filter((f) => f.state === s).length;
        must(await d.from("receipts").insert({
          draft_id: id,
          text_hash: fingerprint(draft.text),
          approved_text: draft.text,
          kit_version: kit.version,
          approver: dual ? approverLabel(approvers) : a.name,
          approver_role: dual ? approvers.map((x) => x.role).join(" and ") : a.role,
          findings_summary: {
            approvers, sign_off: dual ? "dual" : "single",
            exceptions: current.filter((f) => f.state === "dismissed" && parseException(f.dismiss_reason))
              .map((f) => ({ rule: f.rule_id, quote: f.quote, until: parseException(f.dismiss_reason)!.until, by: f.resolved_by })),
            total: current.length, fixed: count("accepted") + count("resolved"), dismissed: count("dismissed"),
            suggestions_left_open: current.filter((f) => f.state === "open").length,
            rules: [...new Set(current.map((f) => f.rule_id))],
            dismissals: current.filter((f) => f.state === "dismissed").map((f) => ({ rule: f.rule_id, reason: f.dismiss_reason, by: f.resolved_by })),
            draft_version: draft.version, risk_tier: draft.risk_tier,
          },
        }));
        must(await d.from("drafts").update({ status: "approved", impact: null, updated_at: new Date().toISOString() }).eq("id", id));
        await log(req, id, "approved", { version: draft.version, kit_version: kit.version, note: b.comment ?? "", approvers: approvers.map((x) => ({ name: x.name, role: x.role })) });
        break;
      }
      case "request_changes": {
        if (!inReview) return fail("The creator has to submit this draft for review first.", 409);
        if (!reviewer) return fail("Only a reviewer can request changes. Switch role to Arjun, Kavya or Meera.", 403);
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
