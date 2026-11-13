"use client";
import { useState } from "react";
import { Badge, Button, Card, Field, Notice, PageHead, inputCls } from "@/components/ui";
import { api, useApp } from "@/lib/client";
import type { Fact } from "@/lib/types";

const blank = { id: "", statement: "", value: "", keywords: "", evidence: "", valid_from: "", valid_until: "", disclosure: "", disclosure_keywords: "" };

function validity(f: Fact, today: string): { label: string; tone: string } {
  if (f.valid_from && f.valid_from > today) return { label: `Embargoed until ${f.valid_from}`, tone: "critical" };
  if (f.valid_until && f.valid_until < today) return { label: `Expired ${f.valid_until}`, tone: "major" };
  return { label: f.valid_until ? `Valid until ${f.valid_until}` : "Valid", tone: "green" };
}

export default function FactsPage() {
  const { state, role, setRole, refresh } = useApp();
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [color, setColor] = useState({ name: "", hex: "#0F6B5F" });
  const [disc, setDisc] = useState({ text: "", when: "" });
  const canEdit = role === "manager" || role === "compliance";
  const manager = role === "manager";
  const today = new Date().toISOString().slice(0, 10);
  const set = (k: keyof typeof blank, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function call(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await fn();
      await refresh();
      setMsg(ok);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <p className="text-sm text-muted">Loading the register…</p>;
  const facts = state.facts.filter((f) => f.kind === "fact");
  const students = state.facts.filter((f) => f.kind === "student");
  const kit = state.kit;

  return (
    <>
      <PageHead
        title="Facts and assets"
        sub="Approved facts carry evidence, an owner, a start date, an end date and any disclosure that must appear with them. A figure used before its start date is flagged as a leak; after its end date, as outdated."
        action={!canEdit ? <Button onClick={() => setRole("manager")}>Act as Meera to edit</Button> : undefined}
      />
      {msg && <div className="mb-3"><Notice tone="ok">{msg}</Notice></div>}
      {err && <div className="mb-3"><Notice tone="error">{err}</Notice></div>}

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="px-4 pt-3 text-left font-semibold">Facts Register</caption>
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-2 font-medium">ID</th><th className="px-4 py-2 font-medium">Approved statement</th><th className="px-4 py-2 font-medium">Status today</th><th className="px-4 py-2 font-medium">Evidence and owner</th><th className="px-4 py-2 font-medium">Must appear with</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody>
            {facts.map((f) => {
              const v = validity(f, today);
              return (
                <tr key={f.id} className="border-b border-line align-top last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{f.id}</td>
                  <td className="px-4 py-2.5">{f.statement}{f.keywords.length > 0 && <div className="text-xs text-muted">Counts: {f.keywords.join(", ")}</div>}</td>
                  <td className="px-4 py-2.5"><Badge tone={v.tone}>{v.label}</Badge>{f.valid_from && <div className="mt-0.5 text-xs text-muted">from {f.valid_from}</div>}</td>
                  <td className="px-4 py-2.5 text-muted">{f.evidence}<div className="text-xs">{f.owner}</div></td>
                  <td className="px-4 py-2.5 text-muted">{f.disclosure || "–"}</td>
                  <td className="px-4 py-2.5">{canEdit && <Button variant="danger" disabled={busy} onClick={() => window.confirm(`Delete fact ${f.id}?`) && call(() => api(`/api/facts/${f.id}`, undefined, "DELETE"), `${f.id} deleted.`)}>Delete</Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="px-4 pt-3 text-left font-semibold">Student records <span className="font-normal text-muted">· a named result needs a course and written consent dated after the result</span></caption>
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-2 font-medium">ID</th><th className="px-4 py-2 font-medium">Student</th><th className="px-4 py-2 font-medium">Course taken</th><th className="px-4 py-2 font-medium">Consent</th><th className="px-4 py-2 font-medium">Record</th></tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{s.id}</td>
                <td className="px-4 py-2.5">{s.meta.name}, AIR {s.meta.rank}</td>
                <td className="px-4 py-2.5">{s.meta.course || <Badge tone="critical">Missing</Badge>}</td>
                <td className="px-4 py-2.5">{s.meta.consent_date ? <Badge tone="green">On file, {s.meta.consent_date}</Badge> : <Badge tone="critical">No consent on file</Badge>}</td>
                <td className="px-4 py-2.5 text-muted">{s.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="font-semibold">Add a fact</h2>
          {!canEdit && <p className="mt-1 text-sm text-muted">Only the brand manager or compliance reviewer can add facts.</p>}
          <form className="mt-3" onSubmit={async (e) => { e.preventDefault(); if (await call(() => api("/api/facts", form), `${form.id.toUpperCase()} saved. Reviews now check against it.`)) setForm(blank); }}>
            <fieldset disabled={!canEdit || busy} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
                <Field label="ID"><input required className={inputCls} value={form.id} onChange={(e) => set("id", e.target.value)} placeholder="F-12" /></Field>
                <Field label="Approved statement"><input required className={inputCls} value={form.statement} onChange={(e) => set("statement", e.target.value)} placeholder="1,150+ NEET selections in 2025 from our classroom programme" /></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Figure" hint="(as a number)"><input className={inputCls} inputMode="decimal" value={form.value} onChange={(e) => set("value", e.target.value)} placeholder="1150" /></Field>
                <Field label="What it counts" hint="(words, comma separated)"><input className={inputCls} value={form.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="selections, selected" /></Field>
              </div>
              <Field label="Evidence"><input required className={inputCls} value={form.evidence} onChange={(e) => set("evidence", e.target.value)} placeholder="Where the figure comes from" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Valid from"><input type="date" className={inputCls} value={form.valid_from} onChange={(e) => set("valid_from", e.target.value)} /></Field>
                <Field label="Valid until"><input type="date" className={inputCls} value={form.valid_until} onChange={(e) => set("valid_until", e.target.value)} /></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Must appear with" hint="(optional)"><input className={inputCls} value={form.disclosure} onChange={(e) => set("disclosure", e.target.value)} placeholder="Name the course" /></Field>
                <Field label="Words that satisfy it"><input className={inputCls} value={form.disclosure_keywords} onChange={(e) => set("disclosure_keywords", e.target.value)} placeholder="classroom programme" /></Field>
              </div>
              <Button variant="primary" type="submit">{busy ? "Saving…" : "Save fact"}</Button>
            </fieldset>
          </form>
        </Card>

        <Card className="space-y-5 p-4">
          <div>
            <h2 className="font-semibold">Palette</h2>
            <ul className="mt-2 flex flex-wrap gap-2 text-sm">
              {kit.palette.map((c) => (
                <li key={c.hex + c.name} className="flex items-center gap-2 rounded-md border border-line py-1 pl-1 pr-2">
                  <span className="h-6 w-6 rounded border border-line" style={{ background: c.hex }} aria-hidden />
                  {c.name} <span className="font-mono text-xs text-muted">{c.hex}</span>
                  {manager && <button aria-label={`Remove ${c.name}`} className="text-muted hover:text-crit" onClick={() => call(() => api("/api/kit", { palette: kit.palette.filter((x) => x !== c) }), "Palette updated.")}>×</button>}
                </li>
              ))}
            </ul>
            {manager && (
              <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await call(() => api("/api/kit", { palette: [...kit.palette, { name: color.name, hex: color.hex.toUpperCase() }] }), "Palette updated.")) setColor({ name: "", hex: "#0F6B5F" }); }}>
                <Field label="Colour name"><input required className={inputCls} value={color.name} onChange={(e) => setColor({ ...color, name: e.target.value })} /></Field>
                <Field label="Colour"><input type="color" className="h-[34px] w-14 rounded-md border border-line" value={color.hex} onChange={(e) => setColor({ ...color, hex: e.target.value })} /></Field>
                <Button type="submit" disabled={busy}>Add colour</Button>
              </form>
            )}
            <p className="mt-2 text-xs text-muted">Image checks against the palette arrive in Round 3. Text review is what runs today.</p>
          </div>
          <div>
            <h2 className="font-semibold">Approved disclaimers</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {kit.disclaimers.map((d) => (
                <li key={d.id} className="rounded-md border border-line px-2 py-1.5"><span className="font-mono text-xs text-muted">{d.id}</span> {d.text}<div className="text-xs text-muted">Use: {d.when}
                  {manager && <button className="ml-2 underline hover:text-crit" onClick={() => call(() => api("/api/kit", { disclaimers: kit.disclaimers.filter((x) => x.id !== d.id) }), "Disclaimers updated.")}>Remove</button>}</div></li>
              ))}
            </ul>
            {manager && (
              <form className="mt-2 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await call(() => api("/api/kit", { disclaimers: [...kit.disclaimers, { id: `D-${kit.disclaimers.length + 1}`, ...disc }] }), "Disclaimers updated.")) setDisc({ text: "", when: "" }); }}>
                <Field label="Disclaimer text"><input required className={inputCls} value={disc.text} onChange={(e) => setDisc({ ...disc, text: e.target.value })} /></Field>
                <Field label="When to use it"><input required className={inputCls} value={disc.when} onChange={(e) => setDisc({ ...disc, when: e.target.value })} /></Field>
                <Button type="submit" disabled={busy}>Add disclaimer</Button>
              </form>
            )}
          </div>
          <div>
            <h2 className="font-semibold">Approved contacts</h2>
            <ul className="mt-2 space-y-1 text-sm">{kit.contacts.map((c) => <li key={c.value}>{c.label}: <span className="font-mono text-xs">{c.value}</span></li>)}</ul>
            <p className="mt-1 text-xs text-muted">Any other email or phone number in a draft is flagged and replaced with one of these.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
