"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { approversOf, exceptionLapsed, exceptionsOf, parseException } from "@/lib/approval";
import { api, fmtDate } from "@/lib/client";
import { CONTENT_TYPES, ROLES, type Finding, type ReviewStats, type Role } from "@/lib/types";

interface Rec {
  draft: {
    title: string; text: string; status: string; version: number; content_type?: string; author?: string; mode?: string; kit_version?: number;
    stats?: Partial<ReviewStats>; images: { name: string; alt: string }[]; assets?: { name: string }[]; intent: { goal: string; audience: string; cta: string; confidential?: boolean };
  };
  findings: Finding[];
  events: { id: number; actor: string; action: string; detail: Record<string, unknown>; at: string }[];
  receipt: { id: string; text_hash: string; approved_text: string; kit_version: number; approver: string; approver_role: string; at: string; findings_summary: Record<string, unknown> } | null;
}

const ACTION: Record<string, string> = { approved_partial: "approved for compliance (first of two sign-offs)", exception_lapsed: "an approved exception lapsed; finding reopened" };
const STATE: Record<string, string> = { accepted: "Fixed (fix accepted)", resolved: "Fixed (text edited)", dismissed: "Dismissed with a reason", open: "Open suggestion" };

/** What ran on the draft and what was skipped, from the review's own statistics. */
function checksOf(d: Rec["draft"]): { name: string; ran: boolean | null; note: string }[] {
  const st = d.stats ?? {};
  const ai = d.mode === "ai", conf = !!d.intent.confidential;
  const imgs = st.images ?? d.images?.length ?? 0, docs = st.assets ?? d.assets?.length ?? 0;
  const n = (k: number | undefined, w: string) => `${k ?? 0} ${w}${k === 1 ? "" : w.endsWith("x") ? "es" : "s"}`;
  return [
    { name: "Code checks", ran: true, note: `terms, contacts, students, disclaimers, figures against the Facts Register; ${n(st.codeFindings, "finding")} on the last run` },
    { name: "AI checks", ran: conf ? null : ai, note: conf ? "skipped: confidential draft, never sent to AI" : ai ? `${n(st.aiFindings, "finding")} from ${n(st.aiCalls, "call")}` : `skipped: ${st.aiError ? st.aiError.slice(0, 80) : "the AI service was off"}` },
    { name: "Images", ran: imgs ? true : null, note: imgs ? `${n(imgs, "image")}: text, colours, contrast, logo, alt text` : "none attached" },
    { name: "AI vision", ran: !imgs || conf ? null : (st.visionRead ?? 0) > 0 && !st.visionError, note: !imgs ? "no images" : conf ? "skipped: confidential" : st.visionError ? "skipped: the AI service did not answer" : `${n(st.visionRead, "creative")} read for people shown` },
    { name: "Campaign documents", ran: docs ? true : null, note: docs ? `${n(docs, "document")}, every text rule` : "none attached" },
    { name: "Verifier", ran: true, note: `${n(st.droppedByVerifier?.length, "unsupported finding")} dropped; ${n(st.fixesWithdrawn, "fix")} withdrawn after re-testing` },
  ];
}

/** A printable approval record: what was approved, against which rules, and who decided. Save as PDF from the print dialog. */
export default function Record() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Rec | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { queueMicrotask(() => api<Rec>(`/api/drafts/${id}`).then(setD).catch((e) => setError(String(e.message ?? e)))); }, [id]);
  if (error) return <p className="text-sm text-crit">{error}</p>;
  if (!d) return <p className="text-sm text-muted">Preparing the record…</p>;
  const r = d.receipt;
  if (!r) return (
    <div>
      <h1>Approval record</h1>
      <p className="mt-1 text-sm text-muted">This draft has not been approved yet, so there is no record. <Link className="underline" href={`/review/${id}`}>Back to the review</Link></p>
    </div>
  );
  const approvers = approversOf(r);
  const exceptions = exceptionsOf(r);
  const today = new Date().toISOString().slice(0, 10);
  const fs = d.findings;
  const sev = (x: string) => fs.filter((f) => f.severity === x).length;
  const exc = fs.filter((f) => f.state === "dismissed" && parseException(f.dismiss_reason)).length;
  const outcome = [
    ["Fixed by an accepted fix", fs.filter((f) => f.state === "accepted").length],
    ["Fixed by editing the text", fs.filter((f) => f.state === "resolved").length],
    ["Dismissed with a reason", fs.filter((f) => f.state === "dismissed").length - exc],
    ["Approved as an exception", exc],
    ["Suggestions left open", fs.filter((f) => f.state === "open").length],
  ] as const;
  const checks = checksOf(d.draft);
  const type = CONTENT_TYPES.find((t) => t.v === d.draft.content_type)?.l;
  return (
    <article className="mx-auto max-w-3xl bg-white p-10 text-[13px] leading-relaxed shadow-sm print:max-w-none print:p-0 print:shadow-none">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href={`/review/${id}`} className="text-muted underline">Back to the review</Link>
        <button onClick={() => window.print()} className="rounded-[5px] bg-ink px-3 py-1.5 text-[13px] font-medium text-paper">Print or save as PDF</button>
      </div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Guidewise approval record</p>
      <h1 className="mt-1">{d.draft.title}</h1>
      <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 border-y border-line py-4">
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Approved by</dt><dd>{approvers.map((x, i) => (
          <span key={i} className="block">{x.name}, {ROLES[x.role as Role]?.title ?? x.role}{approvers.length > 1 ? ` · ${fmtDate(x.at)}` : ""}</span>
        ))}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Date</dt><dd>{fmtDate(r.at)}{approvers.length > 1 ? " (two sign-offs: compliance, then brand)" : ""}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Checked against</dt><dd>Brand Kit version {r.kit_version}, draft version {String(r.findings_summary.draft_version)}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Risk tier</dt><dd>{String(r.findings_summary.risk_tier ?? "–")}</dd></div>
        <div className="col-span-2"><dt className="text-[11px] uppercase tracking-wide text-muted">SHA-256 fingerprint of the approved text</dt><dd className="break-all font-mono text-[11px]">{r.text_hash}</dd></div>
      </dl>
      <section aria-labelledby="summary" className="mt-5 break-inside-avoid rounded-md border border-line p-4">
        <h2 id="summary">Summary</h2>
        <p className="mt-1">
          {type ?? "Draft"}{d.draft.author ? ` by ${d.draft.author}` : ""}, approved on {fmtDate(r.at)} by {approvers.map((x) => `${x.name} (${ROLES[x.role as Role]?.title.toLowerCase() ?? x.role})`).join(", then ")}.
          {" "}Checked against Brand Kit version {r.kit_version}{d.draft.intent.confidential ? "; marked confidential, so no AI service saw it" : ""}.
          {" "}{String(r.findings_summary.risk_tier ?? "") === "high" ? "High risk, so it needed two sign-offs: compliance, then brand." : "Low risk, so one approval was enough."}
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted">Findings by severity</h3>
            <dl className="mt-1 space-y-0.5">
              {(["critical", "major", "minor"] as const).map((x) => <div key={x} className="flex justify-between gap-2"><dt className="capitalize">{x}</dt><dd className="font-medium">{sev(x)}</dd></div>)}
              <div className="flex justify-between gap-2 border-t border-line pt-0.5"><dt>Total raised</dt><dd className="font-medium">{fs.length}</dd></div>
            </dl>
          </div>
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted">Findings by outcome</h3>
            <dl className="mt-1 space-y-0.5">
              {outcome.map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt>{k}</dt><dd className="font-medium">{v}</dd></div>)}
            </dl>
          </div>
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted">Exceptions</h3>
            {exceptions.length ? (
              <ul className="mt-1 space-y-0.5">{exceptions.map((x, i) => (
                <li key={i}><span className="font-mono text-[11px]">{x.rule}</span>: {x.until ? `valid until ${x.until}${x.until < today ? " (lapsed)" : ""}` : "no end date"}{x.by ? `, granted by ${x.by}` : ""}</li>
              ))}</ul>
            ) : <p className="mt-1 text-muted">None granted.</p>}
          </div>
        </div>
        <h3 className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted">Checks on the approved version</h3>
        <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
          {checks.map((c) => (
            <li key={c.name}><span aria-hidden>{c.ran ? "✓" : c.ran === false ? "✗" : "–"}</span> <b className="font-medium">{c.name}</b> <span className="sr-only">{c.ran ? "ran" : c.ran === false ? "skipped" : "not applicable"}</span>· <span className="text-muted">{c.note}</span></li>
          ))}
        </ul>
        {checks.some((c) => c.ran === false) && <p className="mt-1 text-[12px] text-major">A check was skipped, so this was a partial review. The review page showed this to the approvers.</p>}
      </section>
      <h2 className="mt-6">Approved text</h2>
      <p className="proof mt-2 whitespace-pre-wrap !text-[15px] !leading-7">{r.approved_text}</p>
      {d.draft.images?.length > 0 && <p className="mt-2 text-muted">Images: {d.draft.images.map((i) => `${i.name}${i.alt ? ` (alt: “${i.alt}”)` : " (no alt text)"}`).join("; ")}</p>}
      <h2 className="mt-6">Findings and how each was resolved</h2>
      <table className="mt-2 w-full border-collapse text-left">
        <thead><tr className="border-b border-ink text-[11px] uppercase tracking-wide text-muted"><th className="py-1.5 pr-3">Rule</th><th className="py-1.5 pr-3">Words</th><th className="py-1.5 pr-3">Outcome</th><th className="py-1.5">By</th></tr></thead>
        <tbody>
          {d.findings.length === 0 && <tr><td colSpan={4} className="py-2 text-muted">None. The draft passed every check in force when it was approved.</td></tr>}
          {d.findings.map((f) => (
            <tr key={f.id} className="border-b border-line align-top">
              <td className="py-1.5 pr-3 font-mono text-[11px]">{f.rule_id}{f.location?.startsWith("image:") ? ` · image ${f.location.slice(6)}` : f.location?.startsWith("asset:") ? ` · ${d.draft.assets?.[Number(f.location.slice(6)) - 1]?.name ?? `document ${f.location.slice(6)}`}` : ""}</td>
              <td className="py-1.5 pr-3">“{f.quote}”{f.state === "accepted" && f.fix ? <> → “{f.fix}”</> : null}</td>
              <td className="py-1.5 pr-3">{f.state === "dismissed" && parseException(f.dismiss_reason)
                ? `Approved exception, ${parseException(f.dismiss_reason)!.until ? `valid until ${parseException(f.dismiss_reason)!.until}${exceptionLapsed(f.dismiss_reason, today) ? " (now lapsed)" : ""}` : "no end date"}`
                : `${STATE[f.state ?? "open"] ?? f.state}${f.dismiss_reason ? `: ${f.dismiss_reason}` : ""}`}</td>
              <td className="py-1.5">{f.resolved_by && f.resolved_by !== "edit" ? f.resolved_by : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {exceptions.length > 0 && (
        <>
          <h2 className="mt-6">Approved exceptions</h2>
          <ul className="mt-2 list-disc pl-5">{exceptions.map((x, i) => (
            <li key={i}><span className="font-mono text-[11px]">{x.rule}</span>{x.quote ? ` (“${x.quote}”)` : ""}: {x.until ? `valid until ${x.until}${x.until < today ? ", now lapsed: the finding reopens on the next re-check" : ""}` : "no end date"}{x.by ? `. Granted by ${x.by}.` : "."}</li>
          ))}</ul>
        </>
      )}
      <h2 className="mt-6">Activity</h2>
      <ol className="mt-2 space-y-0.5 text-muted">{[...d.events].reverse().map((e) => <li key={e.id}>{fmtDate(e.at)} · {e.actor} · {ACTION[e.action] ?? e.action.replace(/_/g, " ")}</li>)}</ol>
      <p className="mt-8 border-t border-line pt-3 text-[11px] text-muted">Record {r.id}. If the published text differs from the approved text by a single character, its SHA-256 fingerprint will not match. Guidewise supports reviewers; it does not give legal advice.</p>
    </article>
  );
}
