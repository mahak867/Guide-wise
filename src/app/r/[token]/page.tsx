import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { clientIp, lookupShare, shareLookupAllowed } from "@/lib/share";

// A read-only copy of one approval record, opened from a share link by someone outside the workspace.
// It shows the record's content only: no workspace, no other drafts, nothing that can be edited.

const TZ = { timeZone: "Asia/Kolkata" } as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { ...TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { ...TZ, day: "numeric", month: "long", year: "numeric" });

export default async function SharedRecord({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!shareLookupAllowed(clientIp(await headers()))) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">Too many look-ups</h1>
        <p className="mt-2 text-sm text-muted">This address has opened many shared links in the last minute. Wait a minute, then reload the page.</p>
      </div>
    );
  }
  const r = await lookupShare(token);
  if (!r) notFound();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <article className="mx-auto max-w-3xl bg-white p-6 text-[13px] leading-relaxed shadow-sm sm:p-10 print:max-w-none print:p-0 print:shadow-none">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Approval record · read-only copy</p>
      <h1 className="mt-1">{r.title}</h1>
      {!r.still_approved && (
        <p role="status" className="mt-3 rounded-md border border-major/30 bg-major-soft p-3 text-[13px]">
          Since this record was shared, the draft was sent back for re-approval (a rule or fact it relied on changed). The record below is what was approved at the time.
        </p>
      )}
      <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 border-y border-line py-4 sm:grid-cols-2">
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Approved by</dt><dd>{r.approvers.map((x, i) => (
          <span key={i} className="block">{x.name}, {x.role} · {when(x.at)}</span>
        ))}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Approved on</dt><dd>{when(r.approved_at)}{r.sign_off === "dual" ? " (two sign-offs: compliance, then brand)" : ""}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Checked against</dt><dd>Brand Kit version {r.kit_version}{r.draft_version ? `, draft version ${r.draft_version}` : ""}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Content type and risk tier</dt><dd>{r.content_type} · {r.risk_tier ?? "–"} risk</dd></div>
        <div className="sm:col-span-2"><dt className="text-[11px] uppercase tracking-wide text-muted">SHA-256 fingerprint of the approved text</dt><dd className="break-all font-mono text-[11px]">{r.fingerprint}</dd></div>
      </dl>

      <h2 className="mt-6">Approved text</h2>
      <p className="proof mt-2 whitespace-pre-wrap !text-[15px] !leading-7">{r.approved_text}</p>

      <h2 className="mt-6">Findings and how each was resolved</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead><tr className="border-b border-ink text-[11px] uppercase tracking-wide text-muted"><th className="py-1.5 pr-3">Rule</th><th className="py-1.5 pr-3">Words</th><th className="py-1.5 pr-3">Outcome</th><th className="py-1.5">By</th></tr></thead>
          <tbody>
            {r.findings.length === 0 && <tr><td colSpan={4} className="py-2 text-muted">None. The draft passed every check in force when it was approved.</td></tr>}
            {r.findings.map((f, i) => (
              <tr key={i} className="border-b border-line align-top">
                <td className="py-1.5 pr-3"><span className="font-mono text-[11px]">{f.rule}</span> <span className="text-muted">· {f.severity}</span><span className="block text-muted">{f.rule_title}</span></td>
                <td className="py-1.5 pr-3">“{f.words}”{f.fix ? <> → “{f.fix}”</> : null}</td>
                <td className="py-1.5 pr-3">{f.outcome}</td>
                <td className="py-1.5">{f.by ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-6">Approved exceptions</h2>
      {r.exceptions.length ? (
        <ul className="mt-2 list-disc pl-5">{r.exceptions.map((x, i) => (
          <li key={i}><span className="font-mono text-[11px]">{x.rule}</span>{x.words ? ` (“${x.words}”)` : ""}: {x.until ? `valid until ${x.until}${x.until < today ? " (now lapsed)" : ""}` : "no end date"}{x.by ? `. Granted by ${x.by}.` : "."}</li>
        ))}</ul>
      ) : <p className="mt-2 text-muted">None granted.</p>}

      <h2 className="mt-6">Checks run on the approved version</h2>
      <ul className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
        {r.checks.map((c) => (
          <li key={c.name}><span aria-hidden>{c.ran ? "✓" : c.ran === false ? "✗" : "–"}</span> <b className="font-medium">{c.name}</b> <span className="sr-only">{c.ran ? "ran" : c.ran === false ? "skipped" : "not applicable"}</span>· <span className="text-muted">{c.note}</span></li>
        ))}
      </ul>
      {r.checks.some((c) => c.ran === false) && <p className="mt-1 text-[12px] text-major">A check was skipped, so this was a partial review. The approvers saw this when they approved.</p>}

      <footer className="mt-8 border-t border-line pt-3 text-[11px] text-muted">
        <p>Read-only copy shared from Guidewise; valid until {day(r.expires_at)}.</p>
        <p className="mt-1">If the published text differs from the approved text by a single character, its SHA-256 fingerprint will not match. Guidewise supports reviewers; it does not give legal advice.</p>
      </footer>
    </article>
  );
}
