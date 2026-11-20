"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Notice, PageHead } from "@/components/ui";
import { Toast } from "@/components/Toast";
import { api, useApp } from "@/lib/client";

interface Ins {
  totals: { drafts: number; approved: number; findings: number; dismissed: number };
  perRule: { id: string; title: string; status: string; raised: number; drafts: number; fixed: number; dismissed: number; unclearBy: string[]; reasons: [string, number][]; amended: { at: string; before: { raised: number; dismissed: number }; after: { raised: number; dismissed: number } } | null }[];
  watch: { id: string; statement: string; owner: string; valid_from: string | null; valid_until: string | null; state: string }[];
}

interface Proposal { description: string; guidance: string; flag_example: string; pass_example: string; what_changed: string; config_change?: { except: string[]; allow: string[]; narrow: { from: string; to: string }[] } }
interface Draft {
  id: string; proposal: Proposal; before: { description: string; guidance: string };
  run: { passed: boolean; results: { text: string; expect: string; got: string; ok: boolean }[] };
  /** Code's verdict (src/lib/amend.ts): new tests added, changes to the check, why it cannot be saved, and the dismissed text re-checked. */
  added?: { text: string; expect: string }[]; changes?: string[]; problems?: string[];
  dismissed?: { text: string; still_flagged: boolean }[]; resolves?: boolean; checked_by?: "code" | "code patterns";
}

export default function Insights() {
  const { role, setRole, refresh } = useApp();
  const [d, setD] = useState<Ins | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [amend, setAmend] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api<Ins>("/api/insights").then(setD).catch((e) => setError(String(e.message ?? e)));
  async function draft(id: string) {
    setBusy(id); setError(null); setMsg(null); setAmend(null);
    try {
      const out = await api<Omit<Draft, "id">>(`/api/rules/${id}`, { action: "amend_draft" });
      setAmend({ id, ...out });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  }
  async function apply() {
    if (!amend) return;
    setBusy("apply"); setError(null);
    try {
      const out = await api<{ kit_version: number; resolves?: boolean; dismissed?: { still_flagged: boolean }[] }>(`/api/rules/${amend.id}`, { action: "amend_apply", proposal: amend.proposal });
      const still = out.dismissed?.filter((x) => x.still_flagged).length ?? 0;
      setMsg(`${amend.id} amended. Brand Kit is now version ${out.kit_version}; new reviews use the new wording.${out.resolves ? " The text reviewers dismissed is no longer flagged." : still ? ` The check still flags ${still} of the dismissed texts, so this does not resolve those dismissals.` : ""}`);
      setAmend(null);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  }
  useEffect(() => {
    queueMicrotask(load);
    window.addEventListener("gw-reset", load);
    return () => window.removeEventListener("gw-reset", load);
  }, []);
  return (
    <>
      <PageHead title="Insights" sub="What the brand manager learns from reviews in this workspace: which rules people break most, which rules they push back on, and which approved facts are about to stop being true." />
      {error && !d && <div className="mb-4"><Notice tone="error">Insights could not be loaded: {error} <button className="ml-1 underline" onClick={() => { setError(null); load(); }}>Try again</button></Notice></div>}
      <Toast msg={msg} err={d ? error : null} onClose={() => { setMsg(null); setError(null); }} />
      {!d ? (!error && <p className="text-sm text-muted">Loading…</p>) : (
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
                  {d.perRule.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-muted">No findings yet in this workspace. <Link className="underline" href="/">Review the sample post</Link> from the Reviews page, then come back: each rule it breaks is counted here. Dismiss a finding with a reason to see Guidewise draft clearer wording for that rule.</td></tr>}
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
                        {r.amended && (
                          <div className="mt-1 text-xs text-muted">
                            Amended {new Date(r.amended.at).toLocaleDateString("en-IN")}. Dismissed before: {r.amended.before.dismissed} of {r.amended.before.raised}; after: {r.amended.after.raised ? `${r.amended.after.dismissed} of ${r.amended.after.raised}` : "no findings yet"}.
                          </div>
                        )}
                        {r.dismissed > 0 && (
                          <div className="mt-1.5">
                            {role === "manager"
                              ? <Button disabled={!!busy} onClick={() => draft(r.id)}>{busy === r.id ? "Drafting…" : "Draft amendment"}</Button>
                              : <button className="text-xs underline text-muted hover:text-ink" onClick={() => setRole("manager")}>Act as Meera to amend</button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {amend && (
                <div className="border-t border-line bg-mist/50 px-4 py-4 text-sm" role="region" aria-label={`Proposed amendment to ${amend.id}`}>
                  <h3 className="font-medium">Proposed amendment to <span className="font-mono text-xs">{amend.id}</span></h3>
                  <p className="mt-1 text-muted">{amend.proposal.what_changed}</p>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div><dt className="text-[11px] uppercase tracking-wide text-muted">Current wording</dt><dd className="mt-0.5">{amend.before.description}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wide text-muted">Proposed wording</dt><dd className="mt-0.5">{amend.proposal.description}{amend.proposal.guidance && <span className="block text-muted">Still allowed: {amend.proposal.guidance}</span>}</dd></div>
                  </dl>
                  <div className="mt-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Change to the check</p>
                    {amend.changes?.length
                      ? <ul className="mt-0.5 list-disc pl-5">{amend.changes.map((c) => <li key={c}>{c}</li>)}</ul>
                      : <p className="mt-0.5 text-muted">None: only the wording and the tests change, so the check flags exactly what it flagged before.</p>}
                  </div>
                  {!!amend.dismissed?.length && (
                    <div className="mt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted">Dismissed text, re-checked on the amended rule{amend.checked_by === "code patterns" ? " (code patterns only; the AI part is judged by the tests below)" : ""}</p>
                        <Badge tone={amend.resolves ? "green" : "major"}>{amend.resolves ? "Resolves the dismissals" : "Does not resolve the dismissals"}</Badge>
                      </div>
                      <ul className="mt-1 space-y-1">
                        {amend.dismissed.map((x, i) => (
                          <li key={i} className="flex flex-wrap items-start justify-between gap-2 border-t border-line pt-1">
                            <span>{x.text}</span>
                            <Badge tone={x.still_flagged ? "critical" : "green"}>{x.still_flagged ? "Still flagged" : "No longer flagged"}</Badge>
                          </li>
                        ))}
                      </ul>
                      {!amend.resolves && amend.dismissed.some((x) => x.still_flagged) && <p className="mt-1 text-xs text-major">The check still flags text that reviewers dismissed{amend.proposal.guidance ? ", even if the new wording says it is allowed" : ""}. Approving changes the wording, but the same findings will keep appearing.</p>}
                    </div>
                  )}
                  <table className="mt-3 w-full text-left">
                    <caption className="pb-1 text-left !font-sans !text-[11px] uppercase !tracking-wide text-muted">Every test sentence, run on the amended rule</caption>
                    <tbody>
                      {amend.run.results.map((t, i) => (
                        <tr key={i} className="border-t border-line align-top">
                          <td className="py-1.5 pr-2">{t.text}{(amend.added ? amend.added.some((a) => a.text === t.text) : t.text === amend.proposal.flag_example || t.text === amend.proposal.pass_example) && <span className="ml-1 text-xs text-muted">(new)</span>}</td>
                          <td className="w-24 py-1.5 pr-2 text-muted">should {t.expect}</td>
                          <td className="w-32 py-1.5"><Badge tone={t.ok ? "green" : "critical"}>{t.ok ? "Correct" : `Got: ${t.got}`}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!!amend.problems?.length && (
                    <ul className="mt-3 space-y-1 text-crit">{amend.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button variant="primary" disabled={!!busy || !amend.run.passed || !!amend.problems?.length} onClick={apply}>{busy === "apply" ? "Saving…" : "Approve amendment"}</Button>
                    <Button disabled={!!busy} onClick={() => setAmend(null)}>Discard</Button>
                    {!amend.run.passed ? <span className="text-crit">The amended rule fails a test, so it cannot be saved. Discard it or draft again.</span>
                      : amend.problems?.length ? <span className="text-crit">This amendment cannot be saved for the reasons above. Draft again.</span> : null}
                  </div>
                </div>
              )}
              <p className="border-t border-line px-4 py-3 text-xs text-muted">A rule dismissed as “unclear” by two or more different people is flagged here. For any rule with dismissals, Guidewise can draft clearer wording, new test sentences and, where the check reaches too far, a narrower check from what people dismissed. Code re-runs every test on the amended rule and re-checks the dismissed text, the manager approves, and a new Brand Kit version is created.</p>
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
