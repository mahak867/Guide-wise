"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Notice, PageHead } from "@/components/ui";
import { api } from "@/lib/client";
import type { EvalReport } from "@/lib/eval/score";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const ci = (c: [number, number]) => `${pct(c[0])}–${pct(c[1])}`;

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-muted">{sub}</div>
    </Card>
  );
}

export default function Results() {
  const [split, setSplit] = useState<"test" | "dev" | "all">("test");
  const [data, setData] = useState<{ report: EvalReport; ai: (Partial<EvalReport> & { measured?: boolean; agreement?: number }) | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function load(s = split) {
    setBusy(true);
    setError(null);
    try {
      setData(await api(`/api/eval?split=${s}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { queueMicrotask(() => load()); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const r = data?.report;
  const ai = data?.ai && data.ai.measured !== false ? data.ai : null;

  return (
    <>
      <PageHead
        title="Measured results"
        sub="Guidewise is run on drafts with errors planted in known places, and every finding is compared with the answer key. This page re-runs the code checks live each time it loads."
        action={
          <div className="flex items-center gap-2">
            <label className="text-sm"><span className="sr-only">Split</span>
              <select className="rounded-md border border-line bg-white px-2 py-1.5 text-sm" value={split} onChange={(e) => { const s = e.target.value as typeof split; setSplit(s); load(s); }}>
                <option value="test">Held-out set (40 drafts)</option>
                <option value="dev">Development set (20 drafts)</option>
                <option value="all">All 60 drafts</option>
              </select>
            </label>
            <Button onClick={() => load()} disabled={busy}>{busy ? "Running…" : "Run again"}</Button>
          </div>
        }
      />
      {error && <Notice tone="error">{error}</Notice>}
      {!r ? <p className="text-sm text-muted">Running the evaluation…</p> : (
        <>
          <h2 className="mb-2 flex flex-wrap items-center gap-2 font-semibold">Code checks only <Badge>{r.docs} drafts · {r.planted} planted errors · {r.ms} ms</Badge><span className="text-xs font-normal text-muted">Test set fingerprint <code className="font-mono">{r.fingerprint}</code></span></h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Precision" value={pct(r.precision)} sub={`${r.correct} of ${r.predicted} findings were planted errors. 95% interval ${ci(r.precisionCI)}.`} />
            <Metric label="Recall" value={pct(r.recall)} sub={`${r.caught} of ${r.planted} planted errors caught. 95% interval ${ci(r.recallCI)}.`} />
            <Metric label="Recall, critical rules" value={pct(r.criticalRecall)} sub={`Guarantees, figures, student records. ${r.criticalPlanted} planted. 95% interval ${ci(r.criticalCI)}.`} />
            <Metric label="Hard phrasings caught" value={`${r.hardCaught} of ${r.hardPlanted}`} sub="Errors written to avoid keyword patterns. These are what the AI checks are for." />
          </div>

          <Card className="mt-4 p-4 text-sm">
            <h2>With the AI checks</h2>
            {ai ? (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Precision" value={pct(ai.precision ?? 0)} sub={`${ai.correct} of ${ai.predicted} findings were planted errors. 95% interval ${ci((ai.precisionCI ?? [0, 0]) as [number, number])}.`} />
                  <Metric label="Recall" value={pct(ai.recall ?? 0)} sub={`${ai.caught} of ${ai.planted} planted errors caught. 95% interval ${ci((ai.recallCI ?? [0, 0]) as [number, number])}.`} />
                  <Metric label="Recall, critical rules" value={pct(ai.criticalRecall ?? 0)} sub={`95% interval ${ci((ai.criticalCI ?? [0, 0]) as [number, number])}.`} />
                  <Metric label="Hard phrasings caught" value={`${ai.hardCaught} of ${ai.hardPlanted}`} sub="The code checks alone catch none of these." />
                </div>
                <p className="mt-3 text-muted">
                  Measured {ai.at ? new Date(ai.at).toLocaleDateString("en-IN") : ""} on {ai.docs} of the 40 held-out drafts (every second one), one run each, on the live deployment with {ai.mode}.
                  {ai.agreement !== undefined ? ` Repeat-run agreement ${pct(ai.agreement)}.` : " Repeat-run agreement was not measured: a second full run would have used most of the free AI tier's daily allowance that judges need."}
                  {" "}The one false flag was the AI reading the “4” in “4 pm” as a figure; code now discards times and small bare numbers the AI picks up, and a test covers it. That fix came after this measurement, which is shown as measured.
                </p>
              </>
            ) : (
              <p className="mt-1 text-muted">Not measured yet. The AI service is not connected in this deployment. When it is, the same set is run with <code className="rounded bg-mist px-1">npx tsx scripts/eval.ts --ai</code> and the result is published here. We do not publish a number we have not measured.</p>
            )}
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-[22rem_1fr]">
            <Card className="h-fit overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="px-4 pt-3 text-left font-semibold">By rule</caption>
                <thead className="border-b border-line text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2 font-medium">Rule</th><th className="px-4 py-2 font-medium">Caught</th><th className="px-4 py-2 font-medium">False flags</th></tr></thead>
                <tbody>
                  {r.perRule.map((x) => (
                    <tr key={x.rule} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">{x.rule}</td>
                      <td className="px-4 py-2">{x.caught} / {x.planted}</td>
                      <td className="px-4 py-2">{x.falsePositives}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="min-w-0 p-4 text-sm">
              <h2>Every draft</h2>
              <p className="mt-0.5 text-muted">Open a draft to see what was planted and what Guidewise found.</p>
              <ul className="mt-2 divide-y divide-line">
                {r.results.map((d) => {
                  const missed = d.planted.filter((p) => !p.caught).length;
                  return (
                    <li key={d.id} className="py-1.5">
                      <button className="flex w-full min-w-0 items-center gap-2 text-left" aria-expanded={open === d.id} onClick={() => setOpen(open === d.id ? null : d.id)}>
                        <span className="font-mono text-xs text-muted">{d.id}</span>
                        <span className="min-w-0 flex-1 truncate">{d.text}</span>
                        {d.planted.length === 0 && <Badge tone="green">Clean</Badge>}
                        {missed > 0 && <Badge tone="major">{missed} missed</Badge>}
                        {d.extra.length > 0 && <Badge tone="critical">{d.extra.length} false flag{d.extra.length > 1 ? "s" : ""}</Badge>}
                        {d.planted.length > 0 && !missed && !d.extra.length && <Badge tone="green">All {d.planted.length} caught</Badge>}
                      </button>
                      {open === d.id && (
                        <div className="mt-2 space-y-1 rounded-md bg-mist p-2">
                          <p>{d.text}</p>
                          {d.planted.map((p, i) => <p key={i}>{p.caught ? "✓ Caught" : "✗ Missed"} · <span className="font-mono text-xs">{p.rule}</span> “{p.quote}”{p.hard ? " (hard phrasing)" : ""}</p>)}
                          {d.extra.map((x, i) => <p key={i} className="text-crit">False flag · <span className="font-mono text-xs">{x.rule}</span> “{x.quote}” ({x.level})</p>)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <Card className="mt-4 p-4 text-sm">
            <h2>Method and limits</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>60 short drafts for the fictional PrepPath Academy, built from 15 clean sentences and 24 planted errors across 9 rules by a seeded generator, so the set is identical on every run (see the fingerprint). About a quarter are left clean. 20 drafts were used while building (development); 40 were held out and are the headline numbers.</li>
              <li>A finding counts as correct when it cites the planted error's rule and quotes overlapping words. Any other finding counts as a false flag, including suggestions.</li>
              <li>Intervals are 95% Wilson score intervals. With 40 drafts they are wide, and they should be read that way.</li>
              <li><b>These numbers are optimistic.</b> The team wrote both the rules and the test drafts, so the drafts are phrased the way the rules expect. The "hard" errors were written to avoid the patterns on purpose, and the code checks miss all of them. Real marketing copy will be messier. The next step is a set of real, anonymised drafts from coaching-centre marketers.</li>
              <li>The evaluation found one real bug during development: the approved helpline number was being read as three unsupported figures. It was fixed before the held-out set was run.</li>
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
