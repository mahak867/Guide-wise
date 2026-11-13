"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/client";
import { ROLES, type Finding, type Role } from "@/lib/types";

interface Rec {
  draft: { title: string; text: string; status: string; version: number; images: { name: string; alt: string }[]; intent: { goal: string; audience: string; cta: string } };
  findings: Finding[];
  events: { id: number; actor: string; action: string; detail: Record<string, unknown>; at: string }[];
  receipt: { id: string; text_hash: string; approved_text: string; kit_version: number; approver: string; approver_role: string; at: string; findings_summary: Record<string, unknown> } | null;
}

const STATE: Record<string, string> = { accepted: "Fixed (fix accepted)", resolved: "Fixed (text edited)", dismissed: "Dismissed with a reason", open: "Open suggestion" };

/** A printable approval record: what was approved, against which rules, and who decided. Save as PDF from the print dialog. */
export default function Record() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Rec | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { queueMicrotask(() => api<Rec>(`/api/drafts/${id}`).then(setD).catch((e) => setError(String(e.message ?? e)))); }, [id]);
  if (error) return <p className="text-sm text-crit">{error}</p>;
  if (!d) return <p className="text-sm text-muted">Preparing the record…</p>;
  const r = d.receipt;
  if (!r) return <p className="text-sm text-muted">This draft has not been approved yet, so there is no record. <Link className="underline" href={`/review/${id}`}>Back to the review</Link></p>;
  return (
    <article className="mx-auto max-w-3xl bg-white p-10 text-[13px] leading-relaxed shadow-sm print:max-w-none print:p-0 print:shadow-none">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href={`/review/${id}`} className="text-muted underline">Back to the review</Link>
        <button onClick={() => window.print()} className="rounded-[5px] bg-ink px-3 py-1.5 text-[13px] font-medium text-paper">Print or save as PDF</button>
      </div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Guidewise approval record</p>
      <h1 className="mt-1">{d.draft.title}</h1>
      <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 border-y border-line py-4">
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Approved by</dt><dd>{r.approver}, {ROLES[r.approver_role as Role]?.title ?? r.approver_role}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Date</dt><dd>{fmtDate(r.at)}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Checked against</dt><dd>Brand Kit version {r.kit_version}, draft version {String(r.findings_summary.draft_version)}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Risk tier</dt><dd>{String(r.findings_summary.risk_tier ?? "–")}</dd></div>
        <div className="col-span-2"><dt className="text-[11px] uppercase tracking-wide text-muted">SHA-256 fingerprint of the approved text</dt><dd className="break-all font-mono text-[11px]">{r.text_hash}</dd></div>
      </dl>
      <h2 className="mt-6">Approved text</h2>
      <p className="proof mt-2 whitespace-pre-wrap !text-[15px] !leading-7">{r.approved_text}</p>
      {d.draft.images?.length > 0 && <p className="mt-2 text-muted">Images: {d.draft.images.map((i) => `${i.name}${i.alt ? ` (alt: “${i.alt}”)` : " (no alt text)"}`).join("; ")}</p>}
      <h2 className="mt-6">Findings and how each was resolved</h2>
      <table className="mt-2 w-full border-collapse text-left">
        <thead><tr className="border-b border-ink text-[11px] uppercase tracking-wide text-muted"><th className="py-1.5 pr-3">Rule</th><th className="py-1.5 pr-3">Words</th><th className="py-1.5 pr-3">Outcome</th><th className="py-1.5">By</th></tr></thead>
        <tbody>
          {d.findings.map((f) => (
            <tr key={f.id} className="border-b border-line align-top">
              <td className="py-1.5 pr-3 font-mono text-[11px]">{f.rule_id}{f.location && f.location !== "text" ? ` · image ${f.location.slice(6)}` : ""}</td>
              <td className="py-1.5 pr-3">“{f.quote}”{f.state === "accepted" && f.fix ? <> → “{f.fix}”</> : null}</td>
              <td className="py-1.5 pr-3">{STATE[f.state ?? "open"] ?? f.state}{f.dismiss_reason ? `: ${f.dismiss_reason}` : ""}</td>
              <td className="py-1.5">{f.resolved_by && f.resolved_by !== "edit" ? f.resolved_by : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="mt-6">Activity</h2>
      <ol className="mt-2 space-y-0.5 text-muted">{[...d.events].reverse().map((e) => <li key={e.id}>{fmtDate(e.at)} · {e.actor} · {e.action.replace(/_/g, " ")}</li>)}</ol>
      <p className="mt-8 border-t border-line pt-3 text-[11px] text-muted">Record {r.id}. If the published text differs from the approved text by a single character, its SHA-256 fingerprint will not match. Guidewise supports reviewers; it does not give legal advice.</p>
    </article>
  );
}
