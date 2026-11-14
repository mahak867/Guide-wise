"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Field, Notice, PageHead, inputCls } from "@/components/ui";
import { ImagePicker } from "@/components/ImagePicker";
import { api, useApp } from "@/lib/client";
import type { ImageInput } from "@/lib/image";
import { DEMO_CAPTION, DEMO_INTENT } from "@/lib/seed";
import { CONTENT_TYPES } from "@/lib/types";

const TYPES = CONTENT_TYPES;

export default function NewReview() {
  const { state, role, setRole } = useApp();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("social");
  const [text, setText] = useState("");
  const [intent, setIntent] = useState({ goal: "", audience: "", cta: "", locked: "" });
  const [images, setImages] = useState<ImageInput[]>([]);
  const [confidential, setConfidential] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const brief = useMemo(() => {
    if (!state) return null;
    const facts = state.facts.filter((f) => f.kind === "fact");
    return {
      rules: state.rules.filter((r) => r.status === "enforced" && (!r.config.channels?.length || r.config.channels.includes(type))),
      usable: facts.filter((f) => (!f.valid_from || f.valid_from <= today) && (!f.valid_until || f.valid_until >= today)),
      embargoed: facts.filter((f) => f.valid_from && f.valid_from > today),
      expired: facts.filter((f) => f.valid_until && f.valid_until < today),
    };
  }, [state, today, type]);

  async function upload(file: File) {
    setBusy("Reading the document…");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const out = await api<{ text: string; name: string }>("/api/extract", fd);
      setText(out.text);
      if (!title) setTitle(out.name);
      setType("document");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("Reviewing…");
    setError(null);
    try {
      if (role !== "creator") setRole("creator");
      const { id } = await api<{ id: string }>("/api/drafts", { title, content_type: type, text, intent: { ...intent, confidential }, images });
      router.push(`/review/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <>
      <PageHead title="New review" sub="Paste the copy or upload a DOCX or PDF, add any images, say what it is for, and run the review. The draft is checked before anyone else sees it." />
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
              <Field label="Title" hint="(optional)"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="December batch caption" /></Field>
              <Field label="Content type">
                <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
              </Field>
            </div>
            <Field label="Draft text">
              <textarea required={!images.length} minLength={images.length ? 0 : 10} rows={7} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the post, ad, email or page copy here" />
            </Field>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="cursor-pointer rounded-md border border-line bg-white px-3 py-1.5 font-medium hover:bg-mist">
                Upload DOCX or PDF
                <input type="file" accept=".docx,.pdf" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
              <Button type="button" variant="ghost" onClick={() => { setText(DEMO_CAPTION); setIntent({ ...DEMO_INTENT, locked: "" }); setTitle("Instagram caption: December JEE batch"); setType("social"); }}>
                Use the sample caption
              </Button>
              <span className="text-muted">{text.length ? `${text.trim().split(/\s+/).length} words` : ""}</span>
            </div>
            <ImagePicker images={images} onChange={setImages} />
            <fieldset className="rounded-md border border-line p-3">
              <legend className="px-1 text-sm font-medium">What is this draft for? <span className="font-normal text-muted">Fixes are written to keep this intent.</span></legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Goal"><input className={inputCls} value={intent.goal} onChange={(e) => setIntent({ ...intent, goal: e.target.value })} placeholder="Get enquiries for the December batch" /></Field>
                <Field label="Audience"><input className={inputCls} value={intent.audience} onChange={(e) => setIntent({ ...intent, audience: e.target.value })} placeholder="JEE aspirants" /></Field>
                <Field label="Call to action"><input className={inputCls} value={intent.cta} onChange={(e) => setIntent({ ...intent, cta: e.target.value })} placeholder="Enquire now" /></Field>
              </div>
              <div className="mt-3"><Field label="Locked phrases" hint="(comma separated; no fix may remove them)"><input className={inputCls} value={intent.locked} onChange={(e) => setIntent({ ...intent, locked: e.target.value })} placeholder="Mission IIT 2027, December batch" /></Field></div>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-ink)]" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
                <span><b className="font-medium">Confidential draft.</b> <span className="text-muted">Never send this draft to an AI service. Only the code checks run, for this review and every re-check.</span></span>
              </label>
            </fieldset>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex items-center gap-3">
              <Button variant="primary" type="submit" disabled={!!busy}>{busy ?? "Run review"}</Button>
              {state && !state.ai.available && <span className="text-sm text-muted">AI checks are off, so this review runs the code checks only.</span>}
            </div>
          </form>
        </Card>

        <Card className="h-fit p-4">
          <h2>Brief card</h2>
          <p className="mt-0.5 text-sm text-muted">The rules in force and the facts that are safe to use today.</p>
          {!brief ? <p className="mt-3 text-sm text-muted">Loading…</p> : (
            <div className="mt-3 space-y-4 text-sm">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Facts you can use today</h3>
                <ul className="mt-1.5 space-y-1.5">
                  {brief.usable.map((f) => (
                    <li key={f.id}><Badge tone="green">{f.id}</Badge> {f.statement}{f.disclosure && <span className="block text-xs text-muted">Must appear with: {f.disclosure}</span>}</li>
                  ))}
                </ul>
              </div>
              {(brief.embargoed.length > 0 || brief.expired.length > 0) && (
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Not usable today</h3>
                  <ul className="mt-1.5 space-y-1.5">
                    {brief.embargoed.map((f) => <li key={f.id}><Badge tone="critical">{f.id}</Badge> Embargoed until {f.valid_from}. Ask {f.owner}.</li>)}
                    {brief.expired.map((f) => <li key={f.id}><Badge tone="major">{f.id}</Badge> {f.statement} <span className="text-muted">(expired {f.valid_until})</span></li>)}
                  </ul>
                </div>
              )}
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Rules in force: {TYPES.find((t) => t.v === type)?.l.toLowerCase()} ({brief.rules.length})</h3>
                <ul className="mt-1.5 space-y-1">
                  {brief.rules.map((r) => <li key={r.id}><span className="font-mono text-xs text-muted">{r.id}</span> {r.title}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Approved contacts</h3>
                <ul className="mt-1.5 space-y-1">{state!.kit.contacts.map((c) => <li key={c.value}>{c.label}: {c.value}</li>)}</ul>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
