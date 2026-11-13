"use client";
import { useState } from "react";
import { Badge, Button, Card, Field, Notice, PageHead, inputCls } from "@/components/ui";
import { api, fmtDate, useApp } from "@/lib/client";
import { CONTENT_TYPES, type Rule } from "@/lib/types";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const KINDS = [
  { v: "term", l: "Replace a word (code check)" },
  { v: "pattern", l: "Flag phrases (code check)" },
  { v: "brand-name", l: "Spell a name exactly (code check)" },
  { v: "caps", l: "No capitals for emphasis (code check)" },
  { v: "length", l: "Maximum length (code check)" },
  { v: "readability", l: "Maximum sentence length (code check)" },
  { v: "tone", l: "Tone or voice (AI check)" },
  { v: "claim", l: "What may be claimed (AI check)" },
];
const blank = { id: "", title: "", description: "", type: "term", severity: "major", risk: "low", avoid: "", prefer: "", phrases: "", flag: "", pass: "", channels: "", param: "" };
const typeLabel = (v: string) => CONTENT_TYPES.find((t) => t.v === v)?.l ?? v;

interface Proposal { title: string; description: string; kind: string; category: string; severity: string; avoid: string[]; prefer: string; flag_example: string; pass_example: string; source_passage: string }

function RuleCard({ rule, manager, onChange }: { rule: Rule; manager: boolean; onChange: (msg?: string, err?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (action: string) => {
    setBusy(true);
    try {
      await api(`/api/rules/${rule.id}`, { action });
      onChange(action === "promote" ? `${rule.id} is now enforced.` : action === "demote" ? `${rule.id} is now advisory.` : undefined);
    } catch (e) {
      onChange(undefined, e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const t = rule.last_test;
  return (
    <Card className="p-3.5 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-xs text-muted">{rule.id}</span>
        <button className="font-medium underline-offset-2 hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>{rule.title}</button>
        <Badge tone={rule.status === "enforced" ? "green" : "major"}>{rule.status === "enforced" ? "Enforced" : "Advisory"}</Badge>
        <Badge>{rule.kind === "code" ? "Code check" : rule.config.patterns?.length ? "AI check + code patterns" : "AI check"}</Badge>
        <Badge tone={rule.severity}>{rule.severity}</Badge>
        {rule.risk === "high" && <Badge tone="critical">Routes to compliance</Badge>}
        {!!rule.config.channels?.length && <Badge tone="minor">{rule.config.channels.map(typeLabel).join(", ")} only</Badge>}
        {t && <Badge tone={t.passed ? "green" : "critical"}>{t.passed ? "Tests pass" : "Tests fail"}</Badge>}
        <span className="ml-auto flex gap-1.5">
          <Button disabled={busy} onClick={() => { setOpen(true); run("test"); }}>{busy ? "Running…" : "Run tests"}</Button>
          {manager && (rule.status === "advisory"
            ? <Button variant="primary" disabled={busy} onClick={() => { setOpen(true); run("promote"); }}>Enforce</Button>
            : <Button disabled={busy} onClick={() => run("demote")}>Make advisory</Button>)}
        </span>
      </div>
      <p className="mt-1.5 text-muted">{rule.description}</p>
      {open && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <p className="text-xs text-muted">Source: {rule.source}</p>
          {rule.config.avoid && <p>Flags: {rule.config.avoid.map((a) => <code key={a} className="mr-1 rounded bg-mist px-1">{a}</code>)} Use instead: <code className="rounded bg-mist px-1">{rule.config.prefer || "(remove)"}</code></p>}
          {rule.config.names && <p>Exact spelling: {rule.config.names.map((a) => <code key={a} className="mr-1 rounded bg-mist px-1">{a}</code>)}</p>}
          {rule.config.allow && <p>Allowed in capitals: {rule.config.allow.map((a) => <code key={a} className="mr-1 rounded bg-mist px-1">{a}</code>)}</p>}
          {rule.config.maxChars && <p>Limit: {rule.config.maxChars} characters</p>}
          {rule.config.maxWords && <p>Limit: {rule.config.maxWords} words per sentence</p>}
          {rule.config.logo && <p>Minimum width {Math.round((rule.config.logo.minWidth ?? 0.08) * 100)}% of the image; clear space {Math.round((rule.config.logo.clear ?? 0.25) * 100)}% of the logo&apos;s height on every side.</p>}
          {rule.config.guidance && <p className="text-muted">{rule.kind === "judgment" ? "Guidance for the AI check" : "Note"}: {rule.config.guidance}</p>}
          {rule.precedent && <p className="rounded-md border border-major/30 bg-major-soft px-2 py-1.5 text-xs"><b>Precedent:</b> {rule.precedent.order}. {rule.precedent.note} <a className="underline" href={rule.precedent.source} target="_blank" rel="noreferrer">Press report</a></p>}
          <table className="w-full text-left">
            <caption className="pb-1 text-left text-xs font-medium uppercase tracking-wide text-muted">Test sentences{t ? ` · last run ${fmtDate(t.at)} · ${t.mode}` : " · not run yet"}</caption>
            <tbody>
              {rule.tests.length === 0 && <tr><td className="text-muted">No test sentences, so this rule can't be enforced.</td></tr>}
              {rule.tests.map((x, i) => {
                const r = t?.results[i];
                return (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2">{x.text}</td>
                    <td className="w-24 py-1.5 pr-2 text-muted">should {x.expect}</td>
                    <td className="w-36 py-1.5">{r ? <Badge tone={r.ok ? "green" : "critical"}>{r.ok ? "Correct" : `Got: ${r.got}`}</Badge> : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {manager && <Button variant="danger" disabled={busy} onClick={async () => { if (window.confirm(`Delete rule ${rule.id}?`)) { await api(`/api/rules/${rule.id}`, undefined, "DELETE"); onChange(`${rule.id} deleted.`); } }}>Delete rule</Button>}
        </div>
      )}
    </Card>
  );
}

export default function KitPage() {
  const { state, role, setRole, refresh } = useApp();
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState("");
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [warnings, setWarnings] = useState<{ passage: string; problem: string }[]>([]);
  const manager = role === "manager";
  const set = (k: keyof typeof blank, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onChange = async (m?: string, e?: string) => {
    setMsg(m ?? null);
    setErr(e ?? null);
    await refresh();
  };

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const out = await api<{ id: string }>("/api/rules", body);
      await onChange(`${out.id} saved as advisory. Run its tests, then enforce it.`);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const code = !["tone", "claim"].includes(form.type);
    const num = Math.max(1, Math.floor(Number(form.param) || 0));
    const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    const ok = await save({
      id: form.id, title: form.title, description: form.description, severity: form.severity, risk: form.risk,
      kind: code ? "code" : "judgment", category: form.type,
      config: {
        ...(form.type === "term" ? { avoid: list(form.avoid), prefer: form.prefer }
          : form.type === "pattern" ? { patterns: list(form.phrases).map(esc) }
          : form.type === "brand-name" ? { names: list(form.param) }
          : form.type === "caps" ? { allow: list(form.param).map((a) => a.toUpperCase()) }
          : form.type === "length" ? { maxChars: num }
          : form.type === "readability" ? { maxWords: num }
          : {}),
        ...(list(form.channels).length ? { channels: list(form.channels) } : {}),
      },
      tests: [form.flag && { text: form.flag, expect: "flag" }, form.pass && { text: form.pass, expect: "pass" }].filter(Boolean),
    });
    if (ok) setForm(blank);
  }

  async function compile() {
    setBusy(true);
    setErr(null);
    setProposals(null);
    try {
      const out = await api<{ rules: Proposal[]; warnings: { passage: string; problem: string }[] }>("/api/compile", { guide });
      setProposals(out.rules);
      setWarnings(out.warnings);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportKit() {
    setErr(null);
    try {
      const kit = await api<Record<string, unknown>>("/api/kit/export");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(kit, null, 2)], { type: "application/json" }));
      a.download = `guidewise-brand-kit-v${state?.kit.version ?? 1}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function importKit(file: File) {
    setBusy(true);
    setErr(null);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("That file is larger than 2 MB.");
      let parsed: unknown;
      try { parsed = JSON.parse(await file.text()); } catch { throw new Error("That file is not valid JSON."); }
      const out = await api<{ rules: { imported: number; unchanged: number }; facts: number; kit_version: number }>("/api/kit/import", parsed);
      await onChange(`Imported: ${out.rules.imported} new or changed rule${out.rules.imported === 1 ? "" : "s"} (added as advisory until their tests pass), ${out.rules.unchanged} unchanged, ${out.facts} fact${out.facts === 1 ? "" : "s"}. Brand Kit is now version ${out.kit_version}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(p: Proposal, i: number) {
    const n = (state?.rules.length ?? 0) + 1;
    const ok = await save({
      id: `G-${String(n).padStart(2, "0")}`, title: p.title, description: p.description, severity: p.severity, kind: p.kind, category: p.category,
      source: "Compiled from pasted guide text",
      config: p.category === "term" ? { avoid: p.avoid, prefer: p.prefer } : {},
      tests: [{ text: p.flag_example, expect: "flag" }, { text: p.pass_example, expect: "pass" }],
    });
    if (ok) setProposals((ps) => ps?.filter((_, j) => j !== i) ?? null);
  }

  if (!state) return <p className="text-sm text-muted">Loading the Brand Kit…</p>;
  const enforced = state.rules.filter((r) => r.status === "enforced");
  const advisory = state.rules.filter((r) => r.status === "advisory");

  return (
    <>
      <PageHead
        title={`Brand Kit · version ${state.kit.version}`}
        sub="Each rule carries test sentences. A rule starts as advisory and can only be enforced when its own check passes those tests. Every change makes a new Brand Kit version, and each review records the version it was checked against."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={exportKit} disabled={busy}>Export Brand Kit</Button>
            {manager ? (
              <label className={`cursor-pointer rounded-[5px] border border-line bg-white px-3 py-1.5 text-[13px] font-medium hover:border-ink/40 ${busy ? "pointer-events-none opacity-45" : ""}`}>
                Import Brand Kit
                <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importKit(f); }} />
              </label>
            ) : (
              <Button onClick={() => setRole("manager")}>Act as Meera to edit</Button>
            )}
          </div>
        }
      />
      {msg && <div className="mb-3"><Notice tone="ok">{msg}</Notice></div>}
      {err && <div className="mb-3"><Notice tone="error">{err}</Notice></div>}

      <h2 className="mb-2">Enforced rules ({enforced.length})</h2>
      <div className="space-y-2">{enforced.map((r) => <RuleCard key={r.id} rule={r} manager={manager} onChange={onChange} />)}</div>
      <h2 className="mb-2 mt-6">Advisory rules ({advisory.length})</h2>
      <p className="mb-2 text-sm text-muted">Advisory rules show as suggestions and never block approval.</p>
      <div className="space-y-2">
        {advisory.length === 0 && <p className="text-sm text-muted">None.</p>}
        {advisory.map((r) => <RuleCard key={r.id} rule={r} manager={manager} onChange={onChange} />)}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <h2>Add a rule</h2>
          {!manager && <p className="mt-1 text-sm text-muted">Only the brand manager can add rules.</p>}
          <form onSubmit={submit} className="mt-3 space-y-3">
            <fieldset disabled={!manager || busy} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
                <Field label="ID"><input required className={inputCls} value={form.id} onChange={(e) => set("id", e.target.value)} placeholder="TERM-7" /></Field>
                <Field label="Title"><input required className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={'Say "mentor", not "teacher"'} /></Field>
              </div>
              <Field label="What the rule says"><textarea required rows={2} className={inputCls} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Type"><select className={inputCls} value={form.type} onChange={(e) => set("type", e.target.value)}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</select></Field>
                <Field label="Severity"><select className={inputCls} value={form.severity} onChange={(e) => set("severity", e.target.value)}><option>critical</option><option>major</option><option>minor</option></select></Field>
                <Field label="If flagged, route to"><select className={inputCls} value={form.risk} onChange={(e) => set("risk", e.target.value)}><option value="low">Brand reviewer</option><option value="high">Compliance reviewer</option></select></Field>
              </div>
              <fieldset>
                <legend className="text-sm font-medium">Applies to <span className="font-normal text-muted">(leave all unticked for every content type)</span></legend>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {CONTENT_TYPES.map((t) => {
                    const on = form.channels.split(",").filter(Boolean).includes(t.v);
                    return (
                      <label key={t.v} className="flex items-center gap-1.5">
                        <input type="checkbox" className="h-4 w-4 accent-[var(--color-ink)]" checked={on} onChange={() => set("channels", (on ? form.channels.split(",").filter((x) => x && x !== t.v) : [...form.channels.split(",").filter(Boolean), t.v]).join(","))} />
                        {t.l}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {form.type === "term" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Words to flag" hint="(comma separated)"><input required className={inputCls} value={form.avoid} onChange={(e) => set("avoid", e.target.value)} placeholder="teacher, tutor" /></Field>
                  <Field label="Use instead"><input className={inputCls} value={form.prefer} onChange={(e) => set("prefer", e.target.value)} placeholder="mentor" /></Field>
                </div>
              )}
              {form.type === "pattern" && <Field label="Phrases to flag" hint="(comma separated)"><input required className={inputCls} value={form.phrases} onChange={(e) => set("phrases", e.target.value)} placeholder="money-back, risk-free" /></Field>}
              {form.type === "brand-name" && <Field label="Names, spelled exactly" hint="(comma separated)"><input required className={inputCls} value={form.param} onChange={(e) => set("param", e.target.value)} placeholder="PrepPath, PrepPath Academy" /></Field>}
              {form.type === "caps" && <Field label="Words allowed in capitals" hint="(comma separated; words of three letters or fewer are always allowed)"><input className={inputCls} value={form.param} onChange={(e) => set("param", e.target.value)} placeholder="NEET, CBSE" /></Field>}
              {form.type === "length" && <Field label="Maximum characters"><input required type="number" min={1} className={inputCls + " w-36"} value={form.param} onChange={(e) => set("param", e.target.value)} placeholder="125" /></Field>}
              {form.type === "readability" && <Field label="Maximum words per sentence"><input required type="number" min={5} className={inputCls + " w-36"} value={form.param} onChange={(e) => set("param", e.target.value)} placeholder="30" /></Field>}
              {(form.type === "tone" || form.type === "claim") && <p className="text-sm text-muted">This rule is judged by the AI check, one rule per call, using the test sentences below as the boundary.{!state.ai.available && " The AI service is off, so its tests can't pass until it is on."}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="A sentence that should be flagged"><input required className={inputCls} value={form.flag} onChange={(e) => set("flag", e.target.value)} /></Field>
                <Field label="A sentence that should pass"><input required className={inputCls} value={form.pass} onChange={(e) => set("pass", e.target.value)} /></Field>
              </div>
              <Button variant="primary" type="submit">{busy ? "Saving…" : "Save as advisory"}</Button>
            </fieldset>
          </form>
        </Card>

        <Card className="p-4">
          <h2>Compile rules from a brand guide</h2>
          <p className="mt-1 text-sm text-muted">Paste guide text. Guidewise proposes rules with test sentences and points out passages too vague to check. You confirm each rule; nothing is saved until you do.</p>
          <label className="sr-only" htmlFor="guide">Brand guide text</label>
          <textarea id="guide" rows={6} className={inputCls + " mt-3"} value={guide} onChange={(e) => setGuide(e.target.value)} placeholder={'Example: "Always call our teachers mentors. Never promise a rank. Keep the tone warm and engaging."'} />
          <div className="mt-2 flex items-center gap-2">
            <Button variant="primary" disabled={!manager || busy || !state.ai.available} onClick={compile}>{busy ? "Working…" : "Propose rules"}</Button>
            {!state.ai.available ? <span className="text-sm text-muted">Needs the AI service, which is off. Add rules by hand.</span> : !manager ? <span className="text-sm text-muted">Only the brand manager can do this.</span> : null}
          </div>
          {warnings.length > 0 && (
            <div className="mt-3">
              <h3 className="text-sm font-medium">Passages that need a clearer rule</h3>
              <ul className="mt-1 space-y-1 text-sm">{warnings.map((w, i) => <li key={i} className="rounded-md border border-major/30 bg-major-soft px-2 py-1.5">"{w.passage}" <span className="text-muted">· {w.problem}</span></li>)}</ul>
            </div>
          )}
          {proposals && (
            <ul className="mt-3 space-y-2 text-sm">
              {proposals.length === 0 && <li className="text-muted">No more proposals.</li>}
              {proposals.map((p, i) => (
                <li key={i} className="rounded-md border border-line p-2.5">
                  <div className="flex flex-wrap items-center gap-1.5"><b>{p.title}</b><Badge>{p.kind === "code" ? "Code check" : "AI check"}</Badge><Badge tone={p.severity}>{p.severity}</Badge></div>
                  <p className="mt-1 text-muted">{p.description}</p>
                  <p className="mt-1 text-xs text-muted">From the guide: "{p.source_passage}"</p>
                  <p className="mt-1 text-xs">Should flag: {p.flag_example}<br />Should pass: {p.pass_example}</p>
                  <div className="mt-2 flex gap-2"><Button variant="primary" disabled={busy} onClick={() => confirm(p, i)}>Confirm as advisory</Button><Button onClick={() => setProposals(proposals.filter((_, j) => j !== i))}>Discard</Button></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
