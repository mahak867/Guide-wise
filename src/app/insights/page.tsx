"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, Notice, PageHead } from "@/components/ui";
import { api } from "@/lib/client";

interface Ins {
  totals: { drafts: number; approved: number; findings: number; dismissed: number };
  perRule: { id: string; title: string; status: string; raised: number; drafts: number; fixed: number; dismissed: number; unclearBy: string[]; reasons: [string, number][] }[];
  watch: { id: string; statement: string; owner: string; valid_from: string | null; valid_until: string | null; state: string }[];
}

export default function Insights() {
  const [d, setD] = useState<Ins | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = () => api<Ins>("/api/insights").then(setD).catch((e) => setError(String(e.message ?? e)));
    queueMicrotask(load);
    window.addEventListener("gw-reset", load);
    return () => window.removeEventListener("gw-reset", load);
  }, []);
  return (
    <>
      <PageHead title="Insights" sub="What the brand manager learns from reviews in this workspace: which rules people break most, which rules they push back on, and which approved facts are about to stop being true." />
      {error && <Notice tone="error">{error}</Notice>}
      {!d ? <p className="text-sm text-muted">Loading…</p> : (
        <>
          <dl className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
            {[["Drafts reviewed", d.totals.drafts], ["Approved", d.totals.approved], ["Findings raised", d.totals.findings], ["Dismissed with a reason", d.totals.dismissed]].map(([k, v]) => (
              <div key={k as string} className="bg-white p-4"><dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt><dd className="mt-1 font-serif text-3xl">{v}</dd></div>
            ))}
          </dl>
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <Card className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="px-4 pt-4 text-left">Rules by how often they fire</caption>
                <thead className="border-b border-line text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-4 py-2">Rule</th><th className="px-4 py-2">Raised</th><th className="px-4 py-2">Fixed</th><th className="px-4 py-2">Dismissed</th><th className="px-4 py-2">Signal</th></tr></thead>
                <tbody>
                  {d.perRule.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-muted">No reviews yet. <Link className="underline" href="/">Review the sample post</Link> to see data here.</td></tr>}
                  {d.perRule.map((r) => (
                    <tr key={r.id} className="border-b border-line align-top last:border-0">
                      <td className="px-4 py-2.5"><span className="font-mono text-xs text-muted">{r.id}</span> {r.title}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.raised} <span className="text-muted">in {r.drafts} draft{r.drafts === 1 ? "" : "s"}</span></td>
                      <td className="px-4 py-2.5 tabular-nums">{r.fixed}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.dismissed}{r.reasons.length > 0 && <div className="text-xs text-muted">{r.reasons.map(([k, n]) => `${k} (${n})`).join("; ")}</div>}</td>
                      <td className="px-4 py-2.5">
                        {r.unclearBy.length >= 2 ? <Badge tone="critical">Unclear to {r.unclearBy.length} people</Badge>
                          : r.dismissed > 0 && r.dismissed >= r.fixed ? <Badge tone="major">Often dismissed</Badge>
                          : r.raised >= 3 ? <Badge tone="minor">Common mistake</Badge> : <span className="text-muted">–</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-line px-4 py-3 text-xs text-muted">A rule dismissed as “unclear” by two or more different people is flagged here. In Round 3, Guidewise drafts the amendment and its tests for the manager to approve.</p>
            </Card>
            <Card className="h-fit p-4 text-sm">
              <h2>Fact expiry watch</h2>
              <p className="mt-1 text-muted">Facts that have expired, are embargoed, or expire within 60 days.</p>
              <ul className="mt-3 space-y-2.5">
                {d.watch.length === 0 && <li className="text-muted">Every fact is valid for at least 60 more days.</li>}
                {d.watch.map((f) => (
                  <li key={f.id}>
                    <Badge tone={f.state === "expired" ? "major" : f.state === "embargoed" ? "critical" : "minor"}>{f.state === "expired" ? `Expired ${f.valid_until}` : f.state === "embargoed" ? `Embargoed until ${f.valid_from}` : `Expires ${f.valid_until}`}</Badge>
                    <div className="mt-1"><span className="font-mono text-xs text-muted">{f.id}</span> {f.statement}</div>
                    <div className="text-xs text-muted">Owner: {f.owner}</div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
