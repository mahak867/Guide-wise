"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Field, Notice, PageHead, inputCls } from "@/components/ui";
import { api, useApp } from "@/lib/client";
import { MAX_POSTS, SAMPLE_CSV, TEMPLATE_CSV, VERDICT, postsFromCsv, postsFromPaste, resultsCsv, summarise, type BulkItem, type BulkResult } from "@/lib/bulk";
import { CONTENT_TYPES } from "@/lib/types";

const typeLabel = (v?: string) => CONTENT_TYPES.find((t) => t.v === v)?.l ?? "Social post";
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Milliseconds, for timing a run (called from an event handler, not during render). */
const clock = () => Date.now();

function download(name: string, csv: string) {
  const a = document.createElement("a");
  // The byte-order mark makes spreadsheet apps read ₹ and other non-ASCII text correctly.
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function BulkCheck() {
  const { state, role, setRole } = useApp();
  const router = useRouter();
  const [text, setText] = useState("");
  const [type, setType] = useState("social");
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<{ items: BulkItem[]; results: BulkResult[]; ms: number } | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const resultsHead = useRef<HTMLHeadingElement>(null);

  const prepared = useMemo(() => (file ? postsFromCsv(file.csv) : postsFromPaste(text, type)), [file, text, type]);
  const valid = prepared.items.filter((i) => !i.error);
  const invalid = prepared.items.filter((i) => i.error);
  const summary = useMemo(() => (run ? summarise(run.results) : null), [run]);

  // Move focus to the results when they arrive, so a screen reader announces them.
  useEffect(() => { if (run) resultsHead.current?.focus(); }, [run]);

  async function upload(f: File) {
    setError(null);
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") { setError(`"${f.name}" is not a CSV file. Save the calendar from your spreadsheet as CSV (comma separated), then upload it.`); return; }
    if (f.size > 2_000_000) { setError(`"${f.name}" is ${(f.size / 1e6).toFixed(1)} MB. A calendar of ${MAX_POSTS} posts fits well under 2 MB; check it is the right file.`); return; }
    setFile({ name: `"${f.name}"`, csv: await f.text() });
    setRun(null);
  }

  async function check() {
    if (!valid.length || prepared.problem) return;
    setBusy(true);
    setError(null);
    const t = clock();
    try {
      const out = await api<{ results: BulkResult[] }>("/api/bulk", { posts: valid.map(({ text, title, content_type, date }) => ({ text, title, content_type, date })) });
      setRun({ items: valid, results: out.results, ms: clock() - t });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openReview(i: number) {
    if (!run) return;
    const p = run.items[i];
    setOpening(i);
    setError(null);
    try {
      if (role !== "creator") setRole("creator");
      const { id } = await api<{ id: string }>("/api/drafts", { title: p.title || undefined, content_type: p.content_type ?? "social", text: p.text, useAI: true });
      router.push(`/review/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOpening(null);
    }
  }

  const runLabel = busy ? "Checking…"
    : !valid.length ? "Check posts"
    : invalid.length ? `Check ${plural(valid.length, "post")}, skip ${invalid.length} with problems`
    : `Check ${plural(valid.length, "post")}`;

  return (
    <>
      <PageHead
        title="Check many posts"
        sub={`Paste a content calendar or upload it as a CSV, up to ${MAX_POSTS} posts, and see which are ready for review and which need fixes, before anyone opens them one by one.`}
      />
      <div className="mb-4">
        <Notice>
          <b className="font-medium">Code checks only, AI off.</b> Each post gets the same code checks as a review (guarantees, figures against the Facts Register, student results, disclaimers, contacts, brand terms), so {MAX_POSTS} posts finish in seconds and use none of the free-tier AI quota. Open any post as a review to add the AI checks for tone and promises made in other words.
        </Notice>
      </div>

      <Card className="p-5">
        <div className="space-y-4">
          {file ? (
            <div className="rounded-md border border-line bg-mist px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p role="status">Using {plural(prepared.items.length, "post")} from {file.name}.</p>
                <Button type="button" onClick={() => { setFile(null); setRun(null); }}>Paste posts instead</Button>
              </div>
              {prepared.items.length > 0 && (
                <ol className="mt-2 max-h-64 space-y-1 overflow-y-auto" aria-label="Posts in the file" tabIndex={0}>
                  {prepared.items.map((p) => (
                    <li key={p.label} className="break-words">
                      <span className="font-mono text-xs text-muted">{p.label}</span>{" "}
                      {p.date && <span className="text-muted">{p.date} · </span>}
                      <span className="font-medium">{p.title || "Untitled"}</span>{" "}
                      <span className="text-muted">({typeLabel(p.content_type)}) {p.text.slice(0, 90)}{p.text.length > 90 ? "…" : ""}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
              <Field label="Posts" hint="(leave a blank line between posts)">
                <textarea rows={10} className={inputCls} value={text} onChange={(e) => { setText(e.target.value); setRun(null); }} aria-describedby="paste-count"
                  placeholder={"First post…\n\nSecond post…\n\nThird post…"} />
              </Field>
              <Field label="Content type" hint="(for every pasted post)">
                <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>{CONTENT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
              </Field>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="cursor-pointer rounded-md border border-line bg-white px-3 py-1.5 font-medium hover:bg-mist focus-within:outline focus-within:outline-2">
              Upload a CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
            </label>
            <Button type="button" variant="ghost" onClick={() => { setFile({ name: "the sample calendar", csv: SAMPLE_CSV }); setRun(null); setError(null); }}>Use a sample calendar</Button>
            <Button type="button" variant="ghost" onClick={() => download("guidewise-calendar-template.csv", TEMPLATE_CSV)}>Download a CSV template</Button>
            {!file && <span id="paste-count" className="text-muted">{text.trim() ? plural(prepared.items.length, "post") : ""}</span>}
          </div>
          <p className="text-xs text-muted">CSV columns: <code>text</code> (required), and <code>title</code>, <code>content_type</code> ({CONTENT_TYPES.map((t) => t.v).join(", ")}) and <code>date</code> if you have them. The first row names the columns. Each post needs 10 to 12,000 characters. The file is read in your browser; only the post text is sent for checking.</p>

          {prepared.problem && <Notice tone="error">{prepared.problem}</Notice>}
          {invalid.length > 0 && (
            <div className="rounded-md border border-crit/30 bg-crit-soft px-3 py-2 text-sm text-crit">
              <p className="font-medium">{plural(invalid.length, "post")} cannot be checked{valid.length ? " and will be skipped" : ""}:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {invalid.slice(0, 20).map((p) => <li key={p.label} className="break-words">{p.error}</li>)}
                {invalid.length > 20 && <li>…and {invalid.length - 20} more.</li>}
              </ul>
            </div>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" type="button" onClick={check} disabled={busy || !valid.length || !!prepared.problem}>{runLabel}</Button>
            {!valid.length && !prepared.problem && <span className="text-sm text-muted">Paste posts, upload a CSV, or use the sample calendar.</span>}
          </div>
        </div>
      </Card>

      {run && summary && (
        <section className="mt-6" aria-labelledby="bulk-results">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="bulk-results" ref={resultsHead} tabIndex={-1} className="focus:outline-none">Results</h2>
              <p className="mt-1 text-sm" role="status">
                <b>{plural(summary.total, "post")}</b> checked in {(run.ms / 1000).toFixed(1)} s against Brand Kit v{state?.kit.version ?? "?"}:{" "}
                <b className="text-brand">{summary.ready} ready for review</b>, <b className="text-crit">{summary.fix} {summary.fix === 1 ? "needs" : "need"} fixes</b>.
              </p>
              {summary.common.length > 0 && (
                <div className="mt-1 text-sm">
                  <span className="text-muted">Most common rules broken:</span>
                  <ul className="mt-0.5 list-disc pl-5">
                    {summary.common.map((c) => <li key={c.rule_id}><span className="font-mono text-xs text-muted">{c.rule_id}</span> {c.rule_title} <span className="text-muted">({plural(c.posts, "post")})</span></li>)}
                  </ul>
                </div>
              )}
            </div>
            <Button onClick={() => download("guidewise-bulk-check.csv", resultsCsv(run.items, run.results))}>Download results (CSV)</Button>
          </div>

          {/* The table scrolls sideways inside its card on a phone; focusable and named so a keyboard user can scroll it. */}
          <Card className="relative overflow-x-auto" tabIndex={0} label="Results for each post">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <caption className="px-4 pt-3 text-left font-semibold">Results for each post</caption>
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Post</th>
                  <th scope="col" className="px-4 py-2 font-medium">Verdict</th>
                  <th scope="col" className="px-4 py-2 font-medium">Findings</th>
                  <th scope="col" className="px-4 py-2 font-medium">Top findings</th>
                  <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {run.results.map((r) => {
                  const p = run.items[r.index];
                  return (
                    <tr key={p.label} className="border-b border-line align-top last:border-0">
                      <th scope="row" className="w-64 px-4 py-2.5 font-normal">
                        <span className="block font-medium">{p.title || p.label}</span>
                        <span className="block text-xs text-muted">{[p.title ? p.label : null, p.date, typeLabel(p.content_type)].filter(Boolean).join(" · ")}</span>
                        <span className="mt-0.5 block text-xs text-muted">{p.text.slice(0, 110)}{p.text.length > 110 ? "…" : ""}</span>
                      </th>
                      <td className="whitespace-nowrap px-4 py-2.5"><Badge tone={r.verdict === "ready_for_review" ? "green" : "critical"}>{VERDICT[r.verdict]}</Badge></td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                        {r.findings === 0 ? <span className="text-muted">None</span> : (
                          <ul>
                            <li className={r.counts.critical ? "text-crit" : "text-muted"}>{r.counts.critical} critical</li>
                            <li className={r.counts.major ? "text-major" : "text-muted"}>{r.counts.major} major</li>
                            <li className={r.counts.minor ? "text-minor" : "text-muted"}>{r.counts.minor} minor</li>
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.top.length === 0 ? <span className="text-muted">No rule broken.</span> : (
                          <ul className="space-y-1.5">
                            {r.top.slice(0, 2).map((f, k) => (
                              <li key={k}>
                                <span className="font-medium">{f.rule_title}</span>{f.level === "suggestion" && <span className="text-muted"> (suggestion)</span>}
                                <q className="block text-muted">{f.quote}</q>
                              </li>
                            ))}
                            {r.findings > 2 && <li className="text-xs text-muted">+{r.findings - 2} more in the full review</li>}
                          </ul>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Button onClick={() => openReview(r.index)} disabled={opening !== null}>
                          {opening === r.index ? "Opening…" : "Open as a review"}<span className="sr-only">: {p.title || p.label}</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-muted">Opening a post as a review saves it as a draft and runs the full review{state?.ai.available ? ", AI checks included" : ""}, with fixes you can apply and the approval workflow.</p>
        </section>
      )}
    </>
  );
}
