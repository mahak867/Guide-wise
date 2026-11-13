"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DemoGuide } from "@/components/DemoGuide";
import { ImagePicker } from "@/components/ImagePicker";
import { Badge, Button, Card, Notice, STATUS, inputCls } from "@/components/ui";
import type { ImageInput } from "@/lib/image";
import { api, fmtDate, useApp } from "@/lib/client";
import { ROLES, type Finding, type ReviewStats, type Role } from "@/lib/types";

interface Draft {
  id: string; title: string; content_type: string; text: string; intent: { goal: string; audience: string; cta: string };
  images: { name: string; alt: string; dataUrl: string; colours: { hex: string; share: number }[]; ocr: string; ocr_ok?: boolean }[];
  status: string; risk_tier: string | null; risk_reasons: string[]; version: number; kit_version: number; author: string; mode: string; stats: Partial<ReviewStats>;
}
interface Ev { id: number; actor: string; role: string; action: string; detail: Record<string, unknown>; at: string }
interface Receipt { id: string; text_hash: string; approved_text: string; kit_version: number; approver: string; approver_role: string; at: string; findings_summary: Record<string, unknown> }
interface Data { draft: Draft; findings: Finding[]; events: Ev[]; versions: { version: number; text: string; note: string; at: string }[]; receipt: Receipt | null }

const REASONS = ["The rule is unclear", "The rule does not apply to this content", "The flag is wrong", "Approved exception"];
const CHECK = { code: "Code check", claims: "Claims check", voice: "Voice check", visual: "Visual check" } as const;

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
  return <p className="whitespace-pre-wrap text-[15px] leading-7">{parts}</p>;
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
    case "approved": return `approved version ${d.version} against Brand Kit v${d.kit_version}`;
    case "changes_requested": return `requested changes: ${d.comment}`;
    case "comment": return `commented: ${d.comment}`;
    case "images_updated": return `updated the images (version ${d.version}) and re-ran the checks`;
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
  const [showResolved, setShowResolved] = useState(false);
  const [imgEdit, setImgEdit] = useState<ImageInput[] | null>(null);

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
    document.getElementById(`f-${fid}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  const show = (f: Finding) => {
    setActive(f.id!);
    if (f.location?.startsWith("image:")) document.getElementById(`img-${f.location.slice(6)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (error && !data) return <Notice tone="error">{error} <Link className="underline" href="/">Back to reviews</Link></Notice>;
  if (!data) return <p className="text-sm text-muted">Loading the review…</p>;

  const { draft, findings, events, versions, receipt } = data;
  const open = findings.filter((f) => f.state === "open");
  const closed = findings.filter((f) => f.state !== "open");
  const openViolations = open.filter((f) => f.level === "violation");
  const st = draft.stats;
  const inReview = draft.status === "brand_review" || draft.status === "compliance_review";
  const approved = draft.status === "approved";
  const needed: Role | null = draft.status === "compliance_review" ? "compliance" : draft.status === "brand_review" ? "brand" : inReview || approved ? null : "creator";
  const canApprove = inReview && (role === "compliance" || (role === "brand" && draft.status === "brand_review"));
  const canEdit = !inReview && !approved;
  const fixable = open.filter((f) => f.fix !== null && f.fix !== undefined && (f.location ?? "text") === "text");

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
        <h1 className="text-xl font-semibold tracking-tight">{draft.title}</h1>
        <Badge tone={STATUS[draft.status]?.tone}>{STATUS[draft.status]?.label ?? draft.status}</Badge>
        {draft.risk_tier && <Badge tone={draft.risk_tier === "high" ? "critical" : "green"}>{draft.risk_tier === "high" ? "High risk" : "Low risk"}</Badge>}
        <Badge>v{draft.version}</Badge>
        <Badge tone={draft.mode === "ai" ? "green" : "grey"}>{draft.mode === "ai" ? "Code and AI checks" : "Code checks only"}</Badge>
      </div>

      <DemoGuide s={{
        hasImages: events.some((e) => e.action === "images_updated") || (draft.images?.length ?? 0) > 0,
        accepted: findings.filter((f) => f.state === "accepted").length,
        imagesUpdated: events.some((e) => e.action === "images_updated"),
        submitted: events.some((e) => e.action === "submitted"),
        approved: draft.status === "approved",
        routedTo: inReview ? draft.status : null,
      }} />

      {/* What happens next, and who does it */}
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3.5 text-sm">
        <div className="min-w-0 flex-1">
          {approved ? (
            <><b>Approved and locked.</b> The receipt below records exactly what was approved.</>
          ) : inReview ? (
            <><b>Waiting for {ROLES[needed!].name}, the {ROLES[needed!].title.toLowerCase()}.</b> {draft.risk_reasons.length ? `Why: ${draft.risk_reasons.join("; ")}.` : "Nothing high-risk was flagged, so the brand reviewer can approve."}</>
          ) : draft.status === "changes_requested" ? (
            <><b>Changes requested.</b> {ROLES.creator.name} edits the draft and submits it again.</>
          ) : (
            <><b>With {draft.author}, the creator.</b> {openViolations.length ? `Resolve the ${openViolations.length} open finding${openViolations.length > 1 ? "s" : ""}, or submit and let a reviewer decide.` : "No open findings. Submit it for approval."}</>
          )}
        </div>
        {needed && role !== needed && !(needed === "brand" && role === "compliance") && (
          <Button onClick={() => setRole(needed)}>Act as {ROLES[needed].name}</Button>
        )}
        {canEdit && role === "creator" && <Button variant="primary" disabled={!!busy} onClick={() => act("Submitting…", { action: "submit" })}>{busy === "Submitting…" ? busy : "Submit for review"}</Button>}
      </Card>

      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {notice && <div className="mb-4"><Notice tone="ok">{notice}</Notice></div>}
      {st.aiError && <div className="mb-4"><Notice>The AI service was unavailable for this review ({st.aiError}), so only the code checks ran. The workflow still works.</Notice></div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Draft</h2>
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
              <h2 className="font-semibold">Update images</h2>
              <p className="mt-0.5 text-sm text-muted">Replace a creative with the corrected design, add alt text, or add another image. The checks run again when you save.</p>
              <div className="mt-3"><ImagePicker images={imgEdit} onChange={setImgEdit} /></div>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" disabled={!!busy} onClick={async () => { if (await act("Re-checking…", { action: "images", images: imgEdit }, "Images updated and checked again.")) setImgEdit(null); }}>{busy === "Re-checking…" ? busy : "Save and re-check"}</Button>
                <Button onClick={() => setImgEdit(null)}>Cancel</Button>
              </div>
            </Card>
          )}

          {draft.images?.length > 0 && imgEdit === null && (
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Images</h2>
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
                        <div><span className="text-xs uppercase tracking-wide text-muted">Alt text</span><p>{img.alt || <span className="text-muted">None</span>}</p></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="p-4 text-sm">
            <h2 className="font-semibold">How this review was produced</h2>
            <ul className="mt-2 grid gap-x-6 gap-y-1 text-muted sm:grid-cols-2">
              <li><b className="text-ink">{st.codeFindings ?? 0}</b> findings from code checks</li>
              <li><b className="text-ink">{st.aiFindings ?? 0}</b> findings from AI checks{draft.mode !== "ai" ? " (AI off)" : ` (${st.aiCalls} calls)`}</li>
              {!!st.images && <li><b className="text-ink">{st.visualFindings ?? 0}</b> findings from {st.images} image{st.images > 1 ? "s" : ""} (colours, alt text and the text inside)</li>}
              <li><b className="text-ink">{st.droppedByVerifier?.length ?? 0}</b> dropped by the verifier (no source, no flag)</li>
              <li><b className="text-ink">{st.fixesWithdrawn ?? 0}</b> fixes withdrawn after re-testing</li>
              <li><b className="text-ink">{st.redactions ?? 0}</b> personal details removed before any AI call</li>
              <li>Checked against Brand Kit <b className="text-ink">v{draft.kit_version}</b>{st.ms !== undefined ? ` in ${(st.ms / 1000).toFixed(1)}s` : ""}</li>
            </ul>
            {!!st.droppedByVerifier?.length && (
              <details className="mt-2 text-muted"><summary className="cursor-pointer">What the verifier dropped</summary>
                <ul className="mt-1 list-disc pl-5">{st.droppedByVerifier.map((d, i) => <li key={i}>{d.rule_id}: "{d.quote}" ({d.reason})</li>)}</ul>
              </details>
            )}
          </Card>

          {inReview && (
            <Card className="p-4">
              <h2 className="font-semibold">Reviewer decision</h2>
              {!canApprove ? (
                <p className="mt-1 text-sm text-muted">
                  {draft.status === "compliance_review" ? "This draft is high risk, so only the compliance reviewer can decide." : "A brand or compliance reviewer decides."}{" "}
                  Use "Act as {ROLES[needed!].name}" above.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  <label className="sr-only" htmlFor="cm">Comment</label>
                  <textarea id="cm" rows={2} className={inputCls} placeholder="Comment (required when requesting changes)" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" disabled={!!busy || openViolations.length > 0} onClick={() => act("Approving…", { action: "approve", comment }, "Approved. The receipt is below.")}>Approve</Button>
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
                <h2 className="font-semibold">Approval receipt</h2>
                <Button onClick={() => {
                  const blob = new Blob([JSON.stringify({ product: "Guidewise", draft: draft.title, ...receipt }, null, 2)], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `guidewise-receipt-${receipt.id.slice(0, 8)}.json`;
                  a.click();
                }}>Download</Button>
              </div>
              <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs uppercase tracking-wide text-muted">Approved by</dt><dd>{receipt.approver} ({ROLES[receipt.approver_role as Role]?.title ?? receipt.approver_role}) · {fmtDate(receipt.at)}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted">Checked against</dt><dd>Brand Kit v{receipt.kit_version} · draft v{String(receipt.findings_summary.draft_version)}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted">Findings</dt><dd>{String(receipt.findings_summary.total)} raised · {String(receipt.findings_summary.fixed)} fixed · {String(receipt.findings_summary.dismissed)} dismissed with a reason</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted">Rules involved</dt><dd>{(receipt.findings_summary.rules as string[]).join(", ") || "None"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wide text-muted">Fingerprint of the approved text (SHA-256)</dt><dd className="break-all font-mono text-xs">{receipt.text_hash}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-muted">If the published text differs by one character, its fingerprint will not match this one.</p>
            </Card>
          )}

          <Card className="p-4">
            <h2 className="font-semibold">Activity</h2>
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
              <ol className="mt-2 space-y-2">{versions.map((v) => <li key={v.version} className="rounded-md border border-line p-2"><div className="text-xs text-muted">v{v.version} · {v.note} · {fmtDate(v.at)}</div><div className="mt-1 whitespace-pre-wrap">{v.text}</div></li>)}</ol>
            </details>
          </Card>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{open.length} open finding{open.length === 1 ? "" : "s"}</h2>
            {canEdit && role === "creator" && fixable.length > 1 && <Button disabled={!!busy} onClick={acceptAll}>{busy === "Applying fixes…" ? busy : `Accept all ${fixable.length} fixes`}</Button>}
          </div>
          {open.length === 0 && <Card className="p-4 text-sm text-muted">{findings.length ? "Every finding is resolved." : "No findings. This draft follows the rules in force."}</Card>}
          {open.map((f) => {
            const rule = state?.rules.find((r) => r.id === f.rule_id);
            return (
              <Card key={f.id} className={`p-3.5 text-sm ${active === f.id ? "ring-2 ring-ink" : ""}`}>
                <div id={`f-${f.id}`} className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={f.severity}>{f.severity[0].toUpperCase() + f.severity.slice(1)}</Badge>
                  <Badge>{CHECK[f.check_type]}</Badge>
                  {f.level === "suggestion" && <Badge>Suggestion</Badge>}
                  {f.location?.startsWith("image:") && <Badge tone="ink">Image {f.location.slice(6)}</Badge>}
                  <button className="ml-auto text-xs text-muted underline-offset-2 hover:underline" onClick={() => show(f)}>{f.location?.startsWith("image:") ? "Show image" : "Show in draft"}</button>
                </div>
                <p className="mt-2 font-medium">{rule?.title ?? f.rule_id}</p>
                <blockquote className="mt-1 flex items-center gap-1.5 border-l-2 border-line pl-2 text-muted">{/^#[0-9A-F]{6}$/.test(f.quote) && <span className="h-3.5 w-3.5 rounded-sm border border-line" style={{ background: f.quote }} aria-hidden />}"{f.quote}"</blockquote>
                <p className="mt-2">{f.message}</p>
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
                      <select id={`r-${f.id}`} className={inputCls + " w-auto"} defaultValue="" onChange={async (e) => { if (e.target.value && (await act("…", { action: "dismiss", finding_id: f.id, reason: e.target.value }))) setDismissing(null); }}>
                        <option value="" disabled>Choose a reason</option>
                        {REASONS.map((r) => <option key={r}>{r}</option>)}
                      </select>
                      <Button variant="ghost" onClick={() => setDismissing(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {canEdit && f.fix !== null && f.fix !== undefined && <Button variant="primary" disabled={!!busy} onClick={() => act("…", { action: "accept", finding_id: f.id })}>Accept fix</Button>}
                      <Button disabled={!!busy} onClick={() => { setError(null); setDismissing(f.id!); }}>Dismiss</Button>
                    </div>
                  )
                )}
              </Card>
            );
          })}
          {closed.length > 0 && (
            <div>
              <button className="text-sm text-muted underline-offset-2 hover:underline" aria-expanded={showResolved} onClick={() => setShowResolved(!showResolved)}>
                {showResolved ? "Hide" : "Show"} {closed.length} resolved finding{closed.length === 1 ? "" : "s"}
              </button>
              {showResolved && (
                <ul className="mt-2 space-y-2">
                  {closed.map((f) => (
                    <li key={f.id} className="rounded-md border border-line bg-white p-2.5 text-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={f.state === "dismissed" ? "major" : "green"}>{f.state === "accepted" ? "Fix accepted" : f.state === "dismissed" ? "Dismissed" : "Resolved by edit"}</Badge>
                        <span className="font-mono text-xs text-muted">{f.rule_id}</span>
                        {f.resolved_by && f.resolved_by !== "edit" && <span className="text-xs text-muted">by {f.resolved_by}</span>}
                      </div>
                      <div className="mt-1 text-muted">"{f.quote}"{f.state === "accepted" && f.fix ? ` → "${f.fix}"` : ""}</div>
                      {f.dismiss_reason && <div className="mt-1 text-xs">Reason: {f.dismiss_reason}{!approved && <button className="ml-2 underline" onClick={() => act("…", { action: "reopen", finding_id: f.id })}>Reopen</button>}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
