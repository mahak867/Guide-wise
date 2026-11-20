"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DemoGuide } from "@/components/DemoGuide";
import { ImagePicker } from "@/components/ImagePicker";
import { Badge, Button, Card, Notice, STATUS, inputCls } from "@/components/ui";
import type { ImageInput } from "@/lib/image";
import { api, fmtDate, useApp } from "@/lib/client";
import { wordDiff } from "@/lib/diff";
import { BRAND_SIGNERS, EXCEPTION, approversOf, canGrantException, complianceSignOff, exceptionLapsed, exceptionsOf, parseException } from "@/lib/approval";
import { ROLES, type Finding, type ReviewStats, type Role } from "@/lib/types";

interface Draft {
  id: string; title: string; content_type: string; text: string; intent: { goal: string; audience: string; cta: string; confidential?: boolean; locked?: string[]; demo?: string };
  images: { name: string; alt: string; dataUrl: string; colours: { hex: string; share: number }[]; ocr: string; ocr_ok?: boolean; logo?: import("@/lib/logo").LogoMatch | null; vision?: { text: string; people: { description: string; kind: string }[] } | null }[];
  assets?: { name: string; text: string }[];
  impact?: { reason: string; at: string } | null;
  status: string; risk_tier: string | null; risk_reasons: string[]; version: number; kit_version: number; author: string; mode: string; stats: Partial<ReviewStats>;
}
interface Ev { id: number; actor: string; role: string; action: string; detail: Record<string, unknown>; at: string }
interface Receipt { id: string; text_hash: string; approved_text: string; kit_version: number; approver: string; approver_role: string; at: string; findings_summary: Record<string, unknown> }
/** A stored finding also carries when it was raised and on which version of the draft. */
type StoredFinding = Finding & { created_at?: string; draft_version?: number };
interface Data { draft: Draft; findings: StoredFinding[]; events: Ev[]; versions: { version: number; text: string; note: string; at: string }[]; receipt: Receipt | null }

const REASONS = ["The rule is unclear", "The rule does not apply to this content", "The flag is wrong", EXCEPTION];
const todayIso = () => new Date().toISOString().slice(0, 10);

/** "Approved exception until 31 Dec 2026", "Approved exception, no end date", or that it lapsed. */
function ExceptionNote({ reason, by, open }: { reason?: string | null; by?: string | null; open?: boolean }) {
  const ex = parseException(reason);
  if (!ex) return null;
  const lapsed = exceptionLapsed(reason, todayIso());
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${lapsed ? "border-crit/40 bg-crit-soft" : "border-brand/30 bg-brand-soft"}`}>
      <b>{open || lapsed ? "Exception lapsed" : "Approved exception"}</b>
      <span>{ex.until ? `${lapsed ? "ended" : "valid until"} ${ex.until}` : "no end date"}{by && !open ? ` · granted by ${by}` : ""}</span>
      {open && <span>The finding is open again: resolve it before approval.</span>}
    </span>
  );
}
/** Which kind of check raised a finding, in a word and in one sentence. */
function checkOf(f: Finding, category?: string): { label: string; short: string; how: string } {
  if (category === "visual-people") return { label: "AI vision", short: "AI vision", how: "An AI vision model looked at the creative and described the people shown; publishing a person needs a consent record." };
  if (category === "consistency") return { label: "Consistency check", short: "Consistency", how: "Code compared the prices, figures, dates and promo codes in the caption, each image and each document, and found two that disagree." };
  if (f.origin === "ai") return { label: "AI check", short: "AI", how: "A language model judged the words against the rule's guidance, twice; the verifier confirmed the quote is really there and the rule exists." };
  if (f.check_type === "visual") return { label: "Image check", short: "Image", how: "Code measured the image in the browser (colours, contrast, logo, alt text) or ran the text rules on the words read from it." };
  if (f.check_type === "claims") return { label: "Code check: claims", short: "Code", how: "Code compared the figure or claim with the Facts Register: its value, its dates and the disclosure it needs." };
  return { label: "Code check", short: "Code", how: "A fixed rule in code (a word list, a pattern or a limit) matched these exact words. The same text always gives the same result." };
}

/** "Text", "Image 1 (sample-creative.png)", "Landing page (document 2)". */
function whereOf(location: string | undefined, d: Draft): string {
  if (location?.startsWith("image:")) { const n = Number(location.slice(6)); const img = d.images?.[n - 1]; return `Image ${n}${img ? ` (${img.name})` : ""}`; }
  if (location?.startsWith("asset:")) { const n = Number(location.slice(6)); const a = d.assets?.[n - 1]; return a ? `${a.name[0].toUpperCase()}${a.name.slice(1)} (document ${n})` : `Document ${n}`; }
  return "Draft text";
}

/** The risk reasons in plain words, with rule titles in place of bare IDs. */
function plainReasons(reasons: string[], title: (id: string) => string, liveCritical: number): string[] {
  return reasons.map((r) => {
    const m = /^Outcome, claim or regulated content was flagged \(([^)]+)\)/.exec(r);
    if (m) {
      const ids = m[1].split(/,\s*/);
      return `A rule about outcomes, claims or regulated content was flagged: ${ids.map((id) => `${title(id)} (${id})`).join("; ")}. This counts even after a fix is accepted, so the compliance reviewer sees what was claimed.`;
    }
    const c = /^(\d+) critical findings? still unresolved/.exec(r);
    // The stored reason is from the last review run or submission; the count of open critical findings is live.
    if (c) return liveCritical > 0
      ? `${liveCritical} critical finding${liveCritical === 1 ? " is" : "s are"} still open.`
      : `${c[1]} critical finding${c[1] === "1" ? " was" : "s were"} open when the risk was set; ${c[1] === "1" ? "it has" : "all have"} since been fixed or dismissed.`;
    return r.endsWith(".") ? r : `${r}.`;
  });
}

function Highlighted({ text, findings, active, onPick }: { text: string; findings: Finding[]; active: string | null; onPick: (id: string) => void }) {
  const parts = useMemo(() => {
    const spans = findings
      .map((f) => ({ f, start: text.indexOf(f.quote) }))
      .filter((s) => s.start >= 0)
      .map((s) => ({ ...s, end: s.start + s.f.quote.length }))
      .sort((a, b) => a.start - b.start || b.end - a.end);
    const out: ReactNode[] = [];
    let pos = 0;
    for (const s of spans) {
      if (s.start < pos) continue; // overlapping finding: shown in the list, not double-marked
      if (s.start > pos) out.push(text.slice(pos, s.start));
      out.push(
        <mark key={s.f.id} tabIndex={0} role="button" aria-label={`${s.f.severity} finding: ${s.f.quote}`}
          className={`hl hl-${s.f.severity} ${active === s.f.id ? "hl-active" : ""}`}
          onClick={() => onPick(s.f.id!)} onKeyDown={(e) => e.key === "Enter" && onPick(s.f.id!)}>
          {text.slice(s.start, s.end)}
        </mark>,
      );
      pos = s.end;
    }
    if (pos < text.length) out.push(text.slice(pos));
    return out;
  }, [text, findings, active, onPick]);
  return <p className="proof whitespace-pre-wrap">{parts}</p>;
}

function describe(e: Ev): string {
  const d = e.detail as Record<string, string | number | string[]>;
  switch (e.action) {
    case "review_run": return `ran the review on version ${d.version} (${d.mode === "ai" ? "code and AI checks" : "code checks"})`;
    case "fix_accepted": return `accepted the fix for ${d.rule}: "${d.from}" became "${d.to}"`;
    case "finding_dismissed": return `dismissed ${d.rule} ("${d.quote}"). Reason: ${d.reason}`;
    case "finding_reopened": return `reopened ${d.rule}`;
    case "text_edited": return `edited the text (version ${d.version})`;
    case "submitted": return `submitted version ${d.version}. Routed to ${d.routed_to === "compliance_review" ? "the compliance reviewer" : "the brand reviewer"} (${d.risk} risk)`;
    case "approved": {
      const by = e.detail.approvers as { name: string; role: string }[] | undefined;
      return `approved version ${d.version} against Brand Kit v${d.kit_version}${by && by.length > 1 ? ` (brand sign-off, after ${by[0].name}'s compliance sign-off)` : ""}`;
    }
    case "approved_partial": return `approved version ${d.version} for compliance against Brand Kit v${d.kit_version}. Waiting for brand sign-off`;
    case "exception_lapsed": return `found that the approved exception for ${d.rule} ("${d.quote}") ended on ${d.until}, so the finding is open again`;
    case "approval_blocked_exception_lapsed": return `could not approve: an approved exception had lapsed (${(d.rules as string[]).join(", ")})`;
    case "approval_blocked_kit_changed": return `could not approve: the Brand Kit changed and the re-check found ${(d.new_findings as string[]).join(", ")}`;
    case "changes_requested": return `requested changes: ${d.comment}`;
    case "comment": return `commented: ${d.comment}`;
    case "images_updated": return `updated the images (version ${d.version}) and re-ran the checks`;
    case "assets_updated": return "updated the campaign documents and re-ran the checks";
    case "reapproval_needed": return `sent it back for re-approval after a Brand Kit change: ${d.change}${d.findings ? ` (${d.findings} new finding${d.findings === 1 ? "" : "s"})` : ""}`;
    default: return e.action;
  }
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const { role, setRole, state } = useApp();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [granting, setGranting] = useState<string | null>(null);
  const [until, setUntil] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [imgEdit, setImgEdit] = useState<ImageInput[] | null>(null);
  const [fixEdit, setFixEdit] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>(`/api/drafts/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);
  useEffect(() => { queueMicrotask(load); }, [load]);

  async function act(label: string, body: Record<string, unknown>, done?: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/drafts/${id}`, body);
      await load();
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const pick = useCallback((fid: string) => {
    setActive(fid);
    requestAnimationFrame(() => document.getElementById(`f-${fid}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }, []);
  const show = (f: Finding) => {
    setActive(f.id!);
    if (f.location?.startsWith("image:")) document.getElementById(`img-${f.location.slice(6)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (f.location?.startsWith("asset:")) document.getElementById(`doc-${f.location.slice(6)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (error && !data) return <Notice tone="error">{error} <Link className="underline" href="/">Back to reviews</Link></Notice>;
  if (!data) return <p className="text-sm text-muted">Loading the review…</p>;

  const { draft, findings, events, versions, receipt } = data;
  const sevOrder = { critical: 0, major: 1, minor: 2 } as const;
  const open = findings.filter((f) => f.state === "open").sort((x, y) => sevOrder[x.severity] - sevOrder[y.severity] || (x.location ?? "").localeCompare(y.location ?? ""));
  const closed = findings.filter((f) => f.state !== "open");
  const openViolations = open.filter((f) => f.level === "violation");
  const st = draft.stats;
  const inReview = draft.status === "brand_review" || draft.status === "compliance_review";
  const approved = draft.status === "approved";
  // Dual sign-off: a high-risk draft needs compliance first, then brand (Arjun or Meera). Derived from the events log.
  const signed = draft.status === "compliance_review" ? complianceSignOff(events) : null;
  const needed: Role | null = draft.status === "compliance_review" ? (signed ? "brand" : "compliance") : draft.status === "brand_review" ? "brand" : inReview || approved ? null : "creator";
  const canApprove = inReview && (draft.status === "brand_review"
    ? role === "brand" || role === "compliance" || role === "manager"
    : signed ? BRAND_SIGNERS.includes(role) : role === "compliance");
  const canAct = needed !== null && (needed === "creator" ? role === "creator" : canApprove);
  const canEdit = !inReview && !approved;
  const fixable = open.filter((f) => f.fix !== null && f.fix !== undefined && (f.location ?? "text") === "text");
  const tally = {
    critical: open.filter((f) => f.severity === "critical").length,
    major: open.filter((f) => f.severity === "major").length,
    minor: open.filter((f) => f.severity === "minor").length,
    violations: openViolations.length,
    suggestions: open.length - openViolations.length,
    fixed: findings.filter((f) => f.state === "accepted" || f.state === "resolved").length,
    dismissed: findings.filter((f) => f.state === "dismissed").length,
  };
  /** The latest event about a finding (its dismissal or fix), matched on rule and quote. */
  const eventFor = (f: Finding, action: string) => events.find((e) => e.action === action && e.detail.rule === f.rule_id && (e.detail.quote === undefined || e.detail.quote === f.quote) && (action !== "fix_accepted" || e.detail.from === f.quote));

  async function acceptAll() {
    setBusy("Applying fixes…");
    setError(null);
    try {
      await api(`/api/drafts/${id}`, { action: "accept_all" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/" className="text-sm text-muted hover:underline">Reviews</Link><span className="text-muted">/</span>
        <h1 className="tracking-tight">{draft.title}</h1>
        <Badge tone={STATUS[draft.status]?.tone}>{STATUS[draft.status]?.label ?? draft.status}</Badge>
        {draft.risk_tier && <Badge tone={draft.risk_tier === "high" ? "critical" : "green"}>{draft.risk_tier === "high" ? "High risk" : "Low risk"}</Badge>}
        <Badge>v{draft.version}</Badge>
        <Badge tone={draft.mode === "ai" ? "green" : "grey"}>{draft.mode === "ai" ? "Code and AI checks" : "Code checks only"}</Badge>
        {draft.intent.confidential && <Badge tone="ink">Confidential · never sent to AI</Badge>}
      </div>

      {draft.intent.demo === "approved-before" && draft.status === "approved" ? (
        <Card className="mb-4 border-brand/40 p-3.5 text-sm">
          <b>Approved before you arrived, so you can see change impact.</b>{" "}
          This post uses fact F-3 (4,200+ selections). On <Link href="/facts" className="font-medium text-brand-dark underline underline-offset-2">Facts and assets</Link>, act as Meera, click Edit on F-3, change the figure and save: Guidewise re-checks this post and sends it back for re-approval with the reason.
        </Card>
      ) : <DemoGuide s={{
        hasImages: events.some((e) => e.action === "images_updated") || (draft.images?.length ?? 0) > 0,
        isSample: (draft.images ?? []).some((i) => i.name.startsWith("sample-creative")) || draft.title.startsWith("Instagram post: December JEE batch"),
        accepted: findings.filter((f) => f.state === "accepted").length,
        imagesUpdated: events.some((e) => e.action === "images_updated"),
        submitted: events.some((e) => e.action === "submitted"),
        approved: draft.status === "approved",
        routedTo: inReview ? draft.status : null,
      }} />}

      {/* What happens next, and who does it */}
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3.5 text-sm">
        <div className="min-w-0 flex-1">
          {draft.impact && inReview && (
            <><b>Back for re-approval.</b> This piece was approved, then a Brand Kit change made it fail: {draft.impact.reason} The new findings are below. </>
          )}
          {approved ? (
            <><b>Approved and locked.</b> The receipt below records exactly what was approved.</>
          ) : inReview && signed ? (
            <><b>Approved by {signed.actor}, waiting for brand sign-off.</b> High-risk content needs two sign-offs: compliance, then brand ({ROLES.brand.name} or {ROLES.manager.name}).</>
          ) : inReview ? (
            <><b>Waiting for {ROLES[needed!].name}, the {ROLES[needed!].title.toLowerCase()}.</b>{draft.status === "compliance_review" ? ` High risk needs two sign-offs: ${ROLES.compliance.name} first, then brand.` : " One approval completes it."}</>
          ) : draft.status === "changes_requested" ? (
            <><b>Changes requested.</b> {ROLES.creator.name} edits the draft and submits it again.</>
          ) : (
            <><b>With {draft.author}, the creator.</b> {openViolations.length ? `Resolve the ${openViolations.length} open finding${openViolations.length > 1 ? "s" : ""}, or submit and let a reviewer decide.` : "No open findings. Submit it for approval."}</>
          )}
        </div>
        {needed && role !== needed && !canAct && (
          <Button onClick={() => setRole(needed)}>Act as {ROLES[needed].name}</Button>
        )}
        {canEdit && role === "creator" && <Button variant="primary" disabled={!!busy} onClick={() => act("Submitting…", { action: "submit" })}>{busy === "Submitting…" ? busy : "Submit for review"}</Button>}
        {draft.risk_tier && !approved && (
          <div className="w-full border-t border-line pt-2.5 text-[13px]">
            <p>
              <b className="font-medium">{inReview ? "Why it was routed here: " : "Where it goes when submitted: "}</b>
              {draft.risk_tier === "high"
                ? `high risk, so ${ROLES.compliance.name} (compliance) signs off first and then ${ROLES.brand.name} or ${ROLES.manager.name} (brand) gives a second sign-off.`
                : `low risk, so one approval from ${ROLES.brand.name} (brand reviewer) or ${ROLES.manager.name} is enough.`}
              {inReview ? "" : " The risk is worked out again at submission, from the findings as they stand then."}
            </p>
            {draft.risk_tier === "high" && draft.risk_reasons.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                {plainReasons(draft.risk_reasons, (rid) => state?.rules.find((r) => r.id === rid)?.title ?? rid, openViolations.filter((f) => f.severity === "critical").length).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            ) : draft.risk_tier !== "high" ? (
              <p className="mt-0.5 text-muted">No rule about outcomes, claims or regulated content was flagged, and no critical finding is open.</p>
            ) : null}
          </div>
        )}
      </Card>

      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {notice && <div className="mb-4"><Notice tone="ok">{notice}</Notice></div>}
      {st.aiError && (
        <div className="mb-4"><Notice>
          The AI service was unavailable for this review ({st.aiError}), so only the code checks ran. The workflow still works.
          {draft.status !== "approved" && !draft.intent.confidential && (
            <> <Button disabled={!!busy} onClick={() => act("Re-checking…", { action: "recheck" }, "Checked again.")}>{busy === "Re-checking…" ? busy : "Re-check"}</Button></>
          )}
        </Notice></div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
        <div className="min-w-0 space-y-5 break-words">
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2>Draft</h2>
              <div className="flex gap-2">
                {canEdit && editing === null && !draft.images?.length && role === "creator" && imgEdit === null && <Button onClick={() => setImgEdit([])}>Add images</Button>}
                {canEdit && editing === null && <Button onClick={() => setEditing(draft.text)}>Edit text</Button>}
              </div>
            </div>
            {editing !== null ? (
              <div className="space-y-2">
                <label className="sr-only" htmlFor="edit">Draft text</label>
                <textarea id="edit" rows={8} className={inputCls} value={editing} onChange={(e) => setEditing(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="primary" disabled={!!busy} onClick={async () => { if (await act("Re-checking…", { action: "edit", text: editing })) setEditing(null); }}>{busy === "Re-checking…" ? busy : "Save and re-check"}</Button>
                  <Button onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Highlighted text={draft.text} findings={open.filter((f) => (f.location ?? "text") === "text")} active={active} onPick={pick} />
            )}
            {(draft.intent.goal || draft.intent.audience || draft.intent.cta) && (
              <dl className="mt-4 grid gap-x-4 gap-y-1 border-t border-line pt-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs uppercase tracking-wide text-muted">Goal</dt><dd>{draft.intent.goal || "–"}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted">Audience</dt><dd>{draft.intent.audience || "–"}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted">Call to action</dt><dd>{draft.intent.cta || "–"}</dd></div>
              </dl>
            )}
          </Card>

          {imgEdit !== null && (
            <Card className="p-5">
              <h2>Update images</h2>
              <p className="mt-0.5 text-sm text-muted">Replace a creative with the corrected design, add alt text, or add another image. The checks run again when you save.</p>
              <div className="mt-3"><ImagePicker images={imgEdit} onChange={setImgEdit} /></div>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" disabled={!!busy} onClick={async () => { if (await act("Re-checking…", { action: "images", images: imgEdit }, "Images updated and checked again.")) setImgEdit(null); }}>{busy === "Re-checking…" ? busy : "Save and re-check"}</Button>
                <Button onClick={() => setImgEdit(null)}>Cancel</Button>
              </div>
            </Card>
          )}

          {(draft.assets?.length ?? 0) > 0 && (
            <Card className="p-5">
              <h2>Campaign documents</h2>
              <p className="mt-1 text-sm text-muted">Reviewed with the caption and creatives. Prices, dates and promo codes are compared across all of them.</p>
              <div className="mt-3 space-y-3">
                {draft.assets!.map((a, i) => {
                  const n = open.filter((f) => f.location === `asset:${i + 1}`).length;
                  return (
                    <div key={i} id={`doc-${i + 1}`} className="rounded-md border border-line p-3 text-sm">
                      <div className="flex items-center gap-2"><b className="capitalize">{a.name}</b>{n > 0 ? <Badge tone="critical">{n} open finding{n === 1 ? "" : "s"}</Badge> : <Badge tone="green">No open findings</Badge>}</div>
                      <p className="mt-1.5 whitespace-pre-wrap font-serif text-[15px] leading-relaxed">{a.text}</p>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
          {draft.images?.length > 0 && imgEdit === null && (
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2>Images</h2>
                {canEdit && role === "creator" && <Button onClick={() => setImgEdit(draft.images.map((x) => ({ ...x, w: 0, h: 0, ocr_ok: x.ocr_ok !== false })))}>Replace or edit images</Button>}
              </div>
              <div className="mt-3 space-y-4">
                {draft.images.map((img, i) => {
                  const mine = open.filter((f) => f.location === `image:${i + 1}`);
                  return (
                    <div key={i} id={`img-${i + 1}`} className="flex flex-wrap gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.dataUrl} alt={img.alt || `Image ${i + 1} (no alt text provided)`} className="h-44 w-44 rounded-md border border-line object-cover" />
                      <div className="min-w-0 flex-1 space-y-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2"><b>Image {i + 1}</b><span className="text-muted">{img.name}</span>{mine.length > 0 && <Badge tone="critical">{mine.length} open finding{mine.length > 1 ? "s" : ""}</Badge>}</div>
                        <div className="flex flex-wrap gap-1">
                          {img.colours.map((c) => {
                            const flagged = mine.some((f) => f.quote === c.hex);
                            return <span key={c.hex} className={`inline-flex items-center gap-1 rounded border px-1 text-xs ${flagged ? "border-crit text-crit" : "border-line"}`}><span className="h-3 w-3 rounded-sm border border-line" style={{ background: c.hex }} aria-hidden />{c.hex} {Math.round(c.share * 100)}%{flagged ? " · off-palette" : ""}</span>;
                          })}
                        </div>
                        <div><span className="text-xs uppercase tracking-wide text-muted">Text read from the image</span><p className="mt-0.5 whitespace-pre-wrap rounded-md bg-mist px-2 py-1.5">{img.ocr_ok === false ? "Could not be read in the browser that uploaded it." : img.ocr || "No text found."}</p></div>
                        {img.logo && <div><span className="text-xs uppercase tracking-wide text-muted">Logo</span><p>{img.logo.found ? `Found: match ${img.logo.score.toFixed(2)}, ${Math.round((img.logo.box?.w ?? 0) * 100)}% of the width${(img.logo.crowd ?? 0) > 0.1 ? ", clear space crowded" : ", clear space free"}.` : <span className="text-crit">Not found. Best match {img.logo.score.toFixed(2)}; the logo counts as present at 0.70.</span>}</p></div>}
                        {img.vision && <div><span className="text-xs uppercase tracking-wide text-muted">AI vision</span><p>{img.vision.people.length ? <span className="text-crit">Shows {img.vision.people.length === 1 ? "a person" : `${img.vision.people.length} people`}: {img.vision.people.map((p) => p.description).join("; ")}. A consent record is needed.</span> : "No people shown."}{img.vision.text && img.vision.text.replace(/\s+/g, " ").trim() !== (img.ocr ?? "").replace(/\s+/g, " ").trim() ? " It also read text the OCR missed; every rule ran on it." : ""}</p></div>}
                        <div><span className="text-xs uppercase tracking-wide text-muted">Alt text</span><p>{img.alt || <span className="text-muted">None</span>}</p></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="p-4 text-sm">
            <h2>How this review was produced</h2>
            <ul className="mt-2 grid gap-x-6 gap-y-1 text-muted sm:grid-cols-2">
              <li><b className="text-ink">{st.codeFindings ?? 0}</b> finding{st.codeFindings === 1 ? "" : "s"} from code checks</li>
              <li><b className="text-ink">{st.aiFindings ?? 0}</b> finding{st.aiFindings === 1 ? "" : "s"} from AI checks{draft.intent.confidential ? " (off: confidential draft)" : draft.mode !== "ai" ? " (AI off)" : ` (${st.aiCalls} calls${st.aiCached ? `, ${st.aiCached} answered from cache` : ""})`}</li>
              {!!(st.images || st.assets) && <li><b className="text-ink">{st.visualFindings ?? 0}</b> finding{st.visualFindings === 1 ? "" : "s"} from {[st.images ? `${st.images} image${st.images > 1 ? "s" : ""}` : "", st.assets ? `${st.assets} document${st.assets > 1 ? "s" : ""}` : ""].filter(Boolean).join(" and ")} and the checks across them</li>}
              <li><b className="text-ink">{st.droppedByVerifier?.length ?? 0}</b> dropped by the verifier (no source, no flag)</li>
              <li><b className="text-ink">{st.fixesWithdrawn ?? 0}</b> fixes withdrawn after re-testing</li>
              <li><b className="text-ink">{st.redactions ?? 0}</b> personal details removed before any AI call</li>
              <li>Checked against Brand Kit <b className="text-ink">v{draft.kit_version}</b>{st.ms !== undefined ? (st.ms < 100 ? " in under 0.1s" : ` in ${(st.ms / 1000).toFixed(1)}s`) : ""}</li>
            </ul>
            {(() => {
              // What ran on this draft, and what was skipped and why: a skipped AI stage makes this a partial review.
              const ai = draft.mode === "ai";
              const why = (e?: string) => (e ? e.replace(/^The AI service did not answer \(?/, "").split(/[|(]/)[0].trim().slice(0, 90) || "the AI service did not answer" : "the AI service did not answer");
              const imgs = st.images ?? 0, docs = st.assets ?? 0;
              const rows: [string, boolean | null, string][] = [
                ["Code checks", true, "terms, contacts, students, disclaimers, every figure against the Facts Register"],
                ["AI checks", draft.intent.confidential ? null : ai, draft.intent.confidential ? "skipped: confidential drafts are never sent to AI" : ai ? `${st.aiCalls ?? 0} calls on the caption${docs || imgs ? ", the documents and the text in each creative" : ""}` : `skipped: ${why(st.aiError)}. Re-check above to try again`],
                ["Images", imgs ? true : null, imgs ? `${imgs} read in the browser: text (OCR), colours, contrast, logo, alt text` : "none attached"],
                ["AI vision", !imgs || draft.intent.confidential ? null : (st.visionRead ?? 0) > 0 && !st.visionError, !imgs ? "no images" : draft.intent.confidential ? "skipped: confidential" : st.visionError ? `skipped: ${why(st.visionError)}` : `${st.visionRead ?? imgs} creative${(st.visionRead ?? imgs) === 1 ? "" : "s"} read for stylised text and people shown`],
                ["Campaign documents", docs ? true : null, docs ? `${docs} document${docs > 1 ? "s" : ""}, every check` : "none attached"],
                ["Across the campaign", docs || imgs ? true : null, docs || imgs ? "prices, figures, dates and promo codes compared" : "nothing to compare"],
                ["Verifier", true, "every finding's quote, rule and fact confirmed"],
              ];
              const partial = rows.some(([, ok]) => ok === false);
              return (
                <div className="mt-3 border-t border-line pt-2">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-ink">What was checked {partial && <Badge tone="major">Partial review</Badge>}</h3>
                  <ul className="mt-1 space-y-0.5 text-muted">
                    {rows.map(([name, ok, detail]) => (
                      <li key={name}><span aria-hidden className={ok ? "text-brand" : ok === false ? "text-crit" : ""}>{ok ? "✓" : ok === false ? "✗" : "–"}</span> <b className="text-ink">{name}</b> <span className="sr-only">{ok ? "ran" : ok === false ? "skipped" : "not applicable"}</span>· {detail}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            {!!st.droppedByVerifier?.length && (
              <details className="mt-2 text-muted"><summary className="cursor-pointer">What the verifier dropped</summary>
                <ul className="mt-1 list-disc pl-5">{st.droppedByVerifier.map((d, i) => <li key={i}>{d.rule_id}: "{d.quote}" ({d.reason})</li>)}</ul>
              </details>
            )}
          </Card>

          {inReview && (
            <Card className="p-4">
              <h2>Reviewer decision</h2>
              {!canApprove ? (
                <p className="mt-1 text-sm text-muted">
                  {draft.status === "compliance_review"
                    ? signed ? `${signed.actor} gave the compliance sign-off. The brand sign-off is next: the brand reviewer or the brand manager.` : "This draft is high risk, so the compliance reviewer signs off first, then brand."
                    : "A brand or compliance reviewer decides."}{" "}
                  Use "Act as {ROLES[needed!].name}" above.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {draft.status === "compliance_review" && (
                    <p className="text-sm text-muted">{signed ? `Second of two sign-offs: ${signed.actor} approved for compliance on ${fmtDate(signed.at)}. Approving now completes the approval.` : "First of two sign-offs: after you approve, the brand reviewer or the brand manager signs off."}</p>
                  )}
                  <label className="sr-only" htmlFor="cm">Comment</label>
                  <textarea id="cm" rows={2} className={inputCls} placeholder="Comment (required when requesting changes)" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" disabled={!!busy || openViolations.length > 0} onClick={() => act("Approving…", { action: "approve", comment }, draft.status === "compliance_review" && !signed ? "Compliance sign-off recorded. Waiting for brand sign-off." : "Approved. The receipt is below.")}>Approve</Button>
                    <Button disabled={!!busy} onClick={async () => { if (await act("Sending…", { action: "request_changes", comment })) setComment(""); }}>Request changes</Button>
                    {openViolations.length > 0 && <span className="text-sm text-muted">{openViolations.length} open finding{openViolations.length > 1 ? "s" : ""}: dismiss each with a reason, or request changes.</span>}
                  </div>
                </div>
              )}
            </Card>
          )}

          {receipt && (
            <Card className="border-brand/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2>Approval receipt</h2>
                <div className="flex gap-2"><Button onClick={() => {
                  const blob = new Blob([JSON.stringify({ product: "Guidewise", draft: draft.title, ...receipt }, null, 2)], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `guidewise-receipt-${receipt.id.slice(0, 8)}.json`;
                  a.click();
                }}>Download JSON</Button>
                <Link href={`/review/${draft.id}/record`} className="rounded-[5px] border border-ink bg-ink px-3 py-1.5 text-[13px] font-medium text-paper">Approval record (PDF)</Link></div>
              </div>
              <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs uppercase tracking-wide text-muted">Approved by</dt><dd>{approversOf(receipt).map((x, i) => (
                  <span key={i} className="block">{x.name} ({ROLES[x.role as Role]?.title ?? x.role}) · {fmtDate(x.at)}</span>
                ))}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted">Checked against</dt><dd>Brand Kit v{receipt.kit_version} · draft v{String(receipt.findings_summary.draft_version)}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted">Findings</dt><dd>{String(receipt.findings_summary.total)} raised · {String(receipt.findings_summary.fixed)} fixed · {String(receipt.findings_summary.dismissed)} dismissed with a reason</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted">Rules involved</dt><dd>{(receipt.findings_summary.rules as string[]).join(", ") || "None"}</dd></div>
                {exceptionsOf(receipt).length > 0 && (
                  <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wide text-muted">Approved exceptions</dt><dd>{exceptionsOf(receipt).map((x, i) => (
                    <span key={i} className="block">{x.rule} (&ldquo;{x.quote}&rdquo;) · {x.until ? `valid until ${x.until}${x.until < todayIso() ? " (lapsed)" : ""}` : "no end date"}{x.by ? ` · granted by ${x.by}` : ""}</span>
                  ))}</dd></div>
                )}
                <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wide text-muted">Fingerprint of the approved text (SHA-256)</dt><dd className="break-all font-mono text-xs">{receipt.text_hash}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-muted">If the published text differs by one character, its fingerprint will not match this one.</p>
            </Card>
          )}

          <Card className="p-4">
            <h2>Activity</h2>
            <ol className="mt-2 space-y-1.5 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex gap-2"><span className="w-28 shrink-0 text-xs text-muted">{fmtDate(e.at)}</span><span><b>{e.actor}</b> {describe(e)}</span></li>
              ))}
            </ol>
            {!approved && (
              <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const f = e.currentTarget; const v = new FormData(f).get("c"); if (await act("…", { action: "comment", comment: v })) f.reset(); }}>
                <label className="sr-only" htmlFor="c">Add a comment</label>
                <input id="c" name="c" className={inputCls} placeholder={`Comment as ${ROLES[role].name}`} />
                <Button type="submit" disabled={!!busy}>Comment</Button>
              </form>
            )}
            <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted">Version history ({versions.length})</summary>
              <ol className="mt-2 space-y-2">{versions.map((v, i) => {
                const prev = versions[i + 1];
                const diff = prev ? wordDiff(prev.text, v.text) : null;
                const wc = (t: "add" | "del") => (diff ?? []).filter((p) => p.t === t).reduce((n, p) => n + (p.s.trim() ? p.s.trim().split(/\s+/).length : 0), 0);
                const raised = findings.filter((f) => f.draft_version === v.version);
                const fixedHere = events.filter((e) => e.action === "fix_accepted" && Number(e.detail.version) === v.version).length;
                return (
                  <li key={v.version} className="rounded-md border border-line p-2">
                    <div className="text-xs text-muted">v{v.version} · {v.note} · {fmtDate(v.at)}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {diff ? (wc("add") || wc("del") ? `${wc("add")} word${wc("add") === 1 ? "" : "s"} added, ${wc("del")} removed` : "Text unchanged (images, documents or a re-check)") : `First version, ${v.text.trim().split(/\s+/).length} words`}
                      {raised.length ? ` · ${raised.length} finding${raised.length === 1 ? "" : "s"} first raised on it` : ""}
                      {fixedHere ? ` · made by accepting ${fixedHere} fix${fixedHere === 1 ? "" : "es"}` : ""}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap leading-relaxed">{diff ? diff.map((p, k) => p.t === "same" ? <span key={k}>{p.s}</span> : p.t === "add" ? <ins key={k} className="bg-brand-soft no-underline">{p.s}</ins> : <del key={k} className="text-crit/80">{p.s}</del>) : v.text}</div>
                  </li>
                );
              })}</ol>
            </details>
          </Card>
        </div>

        <div className="min-w-0 space-y-3 break-words lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2>{open.length} open finding{open.length === 1 ? "" : "s"}</h2>
            {canEdit && role === "creator" && fixable.length > 1 && <Button disabled={!!busy} onClick={acceptAll}>{busy === "Applying fixes…" ? busy : `Accept all ${fixable.length} fixes`}</Button>}
          </div>
          {findings.length > 0 && (
            <div className="rounded-md border border-line bg-white px-3 py-2 text-xs" aria-label="Findings summary" role="group">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-muted">Open by severity</span>
                {(["critical", "major", "minor"] as const).map((s) => (
                  <span key={s} className="inline-flex items-center gap-1"><span aria-hidden className={`h-2 w-2 rounded-full ${{ critical: "bg-crit", major: "bg-major", minor: "bg-minor" }[s]}`} /><b className="font-medium">{tally[s]}</b> {s}</span>
                ))}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-muted">All {findings.length} by state</span>
                <span><b className="font-medium">{tally.violations}</b> open violation{tally.violations === 1 ? "" : "s"}</span>
                <span><b className="font-medium">{tally.suggestions}</b> suggestion{tally.suggestions === 1 ? "" : "s"}</span>
                <span><b className="font-medium">{tally.fixed}</b> fixed</span>
                <span><b className="font-medium">{tally.dismissed}</b> dismissed</span>
              </div>
              {/* A proportion bar of the same four states. */}
              <div aria-hidden className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-mist">
                {([["violations", "bg-crit"], ["suggestions", "bg-minor"], ["fixed", "bg-brand"], ["dismissed", "bg-major"]] as const).map(([k, c]) => tally[k] > 0 && <span key={k} className={c} style={{ width: `${(tally[k] / findings.length) * 100}%` }} />)}
              </div>
              <p className="mt-1.5 text-muted">Open violations block approval until each is fixed or dismissed with a reason; suggestions never block it.</p>
            </div>
          )}
          {open.length === 0 && <Card className="p-4 text-sm text-muted">{findings.length ? "Every finding is resolved." : "No findings. This draft follows the rules in force."}</Card>}
          {open.length > 0 && <Card className="divide-y divide-line overflow-hidden">
          {open.map((f) => {
            const rule = state?.rules.find((r) => r.id === f.rule_id);
            // One finding is open at a time; the rest stay as one-line rows.
            const expanded = active === "" ? null : open.some((x) => x.id === active) ? active : open[0]?.id;
            const isOpen = expanded === f.id;
            const check = checkOf(f, rule?.category);
            return (
              <div key={f.id} id={`f-${f.id}`} className={`border-l-[3px] text-sm ${{ critical: "border-l-crit", major: "border-l-major", minor: "border-l-minor" }[f.severity]} ${isOpen ? "bg-white" : "bg-paper/60"}`}>
                <button className="flex w-full items-start gap-3 px-4 py-2.5 text-left" aria-expanded={isOpen} onClick={() => (isOpen ? setActive("") : show(f))}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif text-[15.5px] font-medium leading-snug">{rule?.title ?? f.rule_id}</span>
                    {!isOpen && <span className="mt-0.5 block truncate font-serif text-[13.5px] italic text-muted">“{f.quote}”</span>}
                  </span>
                  <span className="shrink-0 pt-1 text-right text-[10.5px] font-medium uppercase leading-4 tracking-[0.06em] text-muted">
                    {f.severity}{f.level === "suggestion" ? " · suggestion" : ""} · {check.short}
                    <span className="block">{f.location?.startsWith("image:") ? `Image ${f.location.slice(6)}` : f.location?.startsWith("asset:") ? (draft.assets?.[Number(f.location.slice(6)) - 1]?.name ?? "Document") : "Text"}{f.fix != null ? " · fix ready" : ""}</span>
                  </span>
                  <span aria-hidden className="shrink-0 pt-0.5 text-muted">{isOpen ? "–" : "+"}</span>
                </button>
                {isOpen && (<div className="px-4 pb-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={f.severity}>{f.severity[0].toUpperCase() + f.severity.slice(1)}</Badge>
                  <span title={check.how}><Badge>{check.label}</Badge></span>
                  {f.level === "suggestion" && <Badge>Suggestion</Badge>}
                  {f.location?.startsWith("image:") && <Badge tone="ink">Image {f.location.slice(6)}</Badge>}
                  <button className="ml-auto text-xs text-muted underline-offset-2 hover:underline" onClick={() => show(f)}>{f.location?.startsWith("image:") ? "Show image" : "Show in draft"}</button>
                </div>
                <blockquote className="mt-1 flex items-center gap-1.5 font-serif text-[15px] italic text-muted">{/^#[0-9A-F]{6}$/.test(f.quote) && <span className="h-3.5 w-3.5 rounded-sm border border-line" style={{ background: f.quote }} aria-hidden />}"{f.quote}"</blockquote>
                <p className="mt-2">{f.message}</p>
                <dl className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs text-muted">
                  <dt>Check</dt><dd><b className="font-medium text-ink">{check.label}.</b> {check.how}</dd>
                  <dt>Where</dt><dd>{whereOf(f.location, draft)}</dd>
                  {f.created_at && <><dt>Raised</dt><dd>{fmtDate(f.created_at)}{f.draft_version ? `, on version ${f.draft_version}` : ""}{f.level === "suggestion" ? ". A suggestion: it does not block approval" : ""}</dd></>}
                </dl>
                {parseException(f.dismiss_reason) && <div className="mt-2"><ExceptionNote reason={f.dismiss_reason} open /></div>}
                <p className="mt-2 rounded-md bg-mist px-2 py-1.5 text-xs text-muted"><b className="text-ink">Rule cited:</b> {f.rule_text}{rule ? ` Source: ${rule.source}.` : ""}{f.fact_id ? ` Fact cited: ${f.fact_id}.` : ""}</p>
                {f.precedent && (
                  <p className="mt-2 rounded-md border border-major/30 bg-major-soft px-2 py-1.5 text-xs">
                    <b>Precedent:</b> {f.precedent.order}. {f.precedent.note}{" "}
                    <a className="underline" href={f.precedent.source} target="_blank" rel="noreferrer">Press report</a>
                  </p>
                )}
                {f.fix !== null && f.fix !== undefined ? (
                  <div className="mt-2 rounded-md border border-brand/30 bg-brand-soft px-2 py-1.5">
                    <div className="text-xs font-medium text-brand-dark">Suggested fix · re-tested, introduces no new issue</div>
                    <div className="mt-1"><del className="text-muted">{f.quote}</del> <span aria-hidden>→</span> <ins className="font-medium no-underline">{f.fix || "(remove these words)"}</ins></div>
                    {f.fix_note && <div className="mt-1 text-xs text-muted">{f.fix_note}</div>}
                  </div>
                ) : f.fix_note ? (
                  <p className="mt-2 rounded-md border border-line px-2 py-1.5 text-xs text-muted"><b className="text-ink">No automatic fix.</b> {f.fix_note}</p>
                ) : null}
                {!approved && (
                  dismissing === f.id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`r-${f.id}`}>Reason</label>
                      <select id={`r-${f.id}`} className={inputCls + " w-auto"} defaultValue="" onChange={async (e) => {
                        const reason = e.target.value;
                        if (!reason) return;
                        // An exception asks for an optional end date first; the other reasons dismiss at once.
                        if (reason === EXCEPTION) { setGranting(f.id!); setUntil(""); return; }
                        setGranting(null);
                        if (await act("…", { action: "dismiss", finding_id: f.id, reason })) setDismissing(null);
                      }}>
                        <option value="" disabled>Choose a reason</option>
                        {REASONS.map((r) => r === EXCEPTION && f.level === "violation" && !canGrantException(role)
                          ? <option key={r} value={r} disabled>{r} (reviewers only)</option>
                          : <option key={r} value={r}>{r}</option>)}
                      </select>
                      {granting === f.id && (
                        <>
                          <label className="text-xs text-muted" htmlFor={`u-${f.id}`}>Valid until (optional)</label>
                          <input id={`u-${f.id}`} type="date" min={todayIso()} className={inputCls + " w-auto"} value={until} onChange={(e) => setUntil(e.target.value)} />
                          <Button variant="primary" disabled={!!busy} onClick={async () => {
                            if (await act("…", { action: "dismiss", finding_id: f.id, reason: EXCEPTION, until: until || null }, until ? `Exception granted until ${until}. After that date the finding reopens.` : "Exception granted, with no end date.")) { setDismissing(null); setGranting(null); }
                          }}>Grant exception</Button>
                        </>
                      )}
                      <Button variant="ghost" onClick={() => { setDismissing(null); setGranting(null); }}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {canEdit && f.fix !== null && f.fix !== undefined && (fixEdit?.id === f.id ? (
                        <div className="flex w-full flex-col gap-2">
                          <label className="sr-only" htmlFor={`fx-${f.id}`}>Edit the fix</label>
                          <textarea id={`fx-${f.id}`} rows={2} className={inputCls} value={fixEdit?.text ?? ""} onChange={(e) => setFixEdit({ id: f.id!, text: e.target.value })} />
                          <div className="flex gap-2">
                            <Button variant="primary" disabled={!!busy || !fixEdit?.text.trim()} onClick={async () => { if (await act("…", { action: "accept", finding_id: f.id, fix: fixEdit?.text }, "Edited fix applied. The checks ran again on the new text.")) setFixEdit(null); }}>Apply edited fix</Button>
                            <Button onClick={() => setFixEdit(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Button variant="primary" disabled={!!busy} onClick={() => act("…", { action: "accept", finding_id: f.id })}>Accept fix</Button>
                          <Button disabled={!!busy} onClick={() => setFixEdit({ id: f.id!, text: f.fix ?? "" })}>Edit fix</Button>
                        </>
                      ))}
                      <Button disabled={!!busy} onClick={() => { setError(null); setGranting(null); setDismissing(f.id!); }}>Dismiss</Button>
                    </div>
                  )
                )}
                </div>)}
              </div>
            );
          })}
          </Card>}
          {closed.length > 0 && (
            <div>
              <button className="text-sm text-muted underline-offset-2 hover:underline" aria-expanded={showResolved} onClick={() => setShowResolved(!showResolved)}>
                {showResolved ? "Hide" : "Show"} {closed.length} resolved finding{closed.length === 1 ? "" : "s"}
              </button>
              {showResolved && (
                <ul className="mt-2 space-y-2">
                  {closed.map((f) => {
                    const rule = state?.rules.find((r) => r.id === f.rule_id);
                    const ev = f.state === "dismissed" ? eventFor(f, "finding_dismissed") : f.state === "accepted" ? eventFor(f, "fix_accepted") : undefined;
                    return (
                    <li key={f.id} className="rounded-md border border-line bg-white p-2.5 text-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={f.state === "dismissed" ? "major" : "green"}>{f.state === "accepted" ? "Fix accepted" : f.state === "dismissed" ? "Dismissed" : "Resolved by edit"}</Badge>
                        <span className="font-mono text-xs text-muted">{f.rule_id}</span>
                        {f.resolved_by && f.resolved_by !== "edit" && <span className="text-xs text-muted">by {f.resolved_by}{ev ? `, ${fmtDate(ev.at)}` : ""}</span>}
                      </div>
                      <div className="mt-1 font-medium">{rule?.title ?? f.rule_id}</div>
                      <div className="text-xs text-muted">{f.severity} · {checkOf(f, rule?.category).label} · {whereOf(f.location, draft)}{f.created_at ? ` · raised ${fmtDate(f.created_at)}` : ""}</div>
                      <div className="mt-1 text-muted">"{f.quote}"{f.state === "accepted" && f.fix ? ` → "${f.fix}"` : ""}</div>
                      {f.state === "resolved" && <div className="mt-1 text-xs text-muted">Closed by itself: after an edit, these words were no longer in the draft.</div>}
                      {f.state === "dismissed" && parseException(f.dismiss_reason) && <div className="mt-1"><ExceptionNote reason={f.dismiss_reason} by={f.resolved_by} /></div>}
                      {f.dismiss_reason && <div className="mt-1 text-xs">{f.state === "dismissed" && f.resolved_by ? `${f.resolved_by} gave the reason: ` : "Reason: "}{f.dismiss_reason}{!approved && <button className="ml-2 underline" onClick={() => act("…", { action: "reopen", finding_id: f.id })}>Reopen</button>}</div>}
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
