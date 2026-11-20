"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, inputCls } from "./ui";

export interface Doc { name: string; text: string }
const KINDS = ["landing page", "brochure", "email", "WhatsApp message", "other document"];

/** Campaign documents reviewed with the caption and creatives: every rule runs on each, and figures, dates and codes are compared across all. */
export function CampaignDocs({ docs, onChange }: { docs: Doc[]; onChange: (d: Doc[]) => void }) {
  const [kind, setKind] = useState(KINDS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState<string | null>(null);
  // Folded until the writer opens it, or documents are added (the sample campaign adds two).
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? docs.length > 0;
  const set = (i: number, patch: Partial<Doc>) => onChange(docs.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  async function upload(file: File) {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const out = await api<{ text: string }>("/api/extract", fd);
      onChange([...docs, { name: kind, text: out.text.slice(0, 12000) }]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }
  async function readPage() {
    setBusy(true); setError(null); setNote(null);
    try {
      const out = await api<{ text: string; url: string; truncated: boolean; hidden: number }>("/api/extract", { url });
      onChange([...docs, { name: kind, text: out.text }]);
      setNote(`Read ${out.url}${out.truncated ? " (the first 12,000 characters)" : ""}. Menus, headers and footers were left out; edit the text below if needed.`
        + (out.hidden ? ` Warning: ${out.hidden} piece${out.hidden > 1 ? "s" : ""} of text on this page ${out.hidden > 1 ? "are" : "is"} hidden from readers (for example white on white) but still read by search engines and AI tools. ${out.hidden > 1 ? "They are" : "It is"} added at the end, under a label, so every check runs on ${out.hidden > 1 ? "them" : "it"}.` : ""));
      setUrl("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }
  return (
    <details open={open} onToggle={(e) => setUserOpen(e.currentTarget.open)} className="rounded-md border border-line px-3 py-2.5">
      <summary className="cursor-pointer select-none text-sm">
        <span className="font-medium">Campaign documents</span> <span className="text-muted">(optional{docs.length ? `, ${docs.length}/4 added` : ""})</span>
        <span className="block text-xs text-muted">Add a brochure, landing page or email: prices, dates and promo codes are compared with the caption.</span>
      </summary>
      <p className="mb-2 mt-2 text-xs text-muted">Paste text, upload a PDF or Word file, or read a live page. Every text rule runs on each; post-length rules are skipped.</p>
      <div className="space-y-3">
        {docs.map((d, i) => (
          <div key={i} className="rounded-md border border-line p-2 text-sm">
            <div className="flex items-center gap-2">
              <b>Document {i + 1}</b>
              <label className="sr-only" htmlFor={`doc-kind-${i}`}>Kind of document {i + 1}</label>
              <select id={`doc-kind-${i}`} className={inputCls + " w-auto py-1"} value={d.name} onChange={(e) => set(i, { name: e.target.value })}>{[...new Set([d.name, ...KINDS])].map((k) => <option key={k}>{k}</option>)}</select>
              <button type="button" className="ml-auto text-xs text-muted underline hover:text-crit" onClick={() => onChange(docs.filter((_, j) => j !== i))}>Remove</button>
            </div>
            <label className="sr-only" htmlFor={`doc-${i}`}>Text of document {i + 1}</label>
            <textarea id={`doc-${i}`} rows={3} className={inputCls + " mt-2"} value={d.text} onChange={(e) => set(i, { text: e.target.value })} placeholder="Paste the document text" />
            {d.text.trim().length > 0 && d.text.trim().length < 10 ? <p className="text-xs text-crit">Add at least 10 characters, or remove this document.</p>
              : d.text.trim() ? <p className="mt-1 text-xs text-muted">{d.text.trim().split(/\s+/).length} words{d.text.length >= 12000 ? " (the first 12,000 characters are checked)" : ""}</p>
              : <p className="mt-1 text-xs text-muted">Empty documents are left out of the review.</p>}
          </div>
        ))}
        {docs.length < 4 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="sr-only" htmlFor="doc-kind-new">Kind of document to add</label>
            <select id="doc-kind-new" className={inputCls + " w-auto py-1"} value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
            <Button type="button" onClick={() => onChange([...docs, { name: kind, text: "" }])}>Add document</Button>
            <label className={`cursor-pointer rounded-md border border-line bg-white px-3 py-1.5 font-medium hover:bg-mist ${busy ? "pointer-events-none opacity-50" : ""}`}>
              {busy ? "Reading…" : "Upload PDF or DOCX"}
              <input type="file" accept=".pdf,.docx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
            </label>
            <div className="flex min-w-0 flex-1 basis-64 items-center gap-2">
              <label className="sr-only" htmlFor="doc-url">Web page address</label>
              <input id="doc-url" type="text" inputMode="url" autoComplete="url" className={inputCls + " min-w-0 flex-1 py-1"} value={url} onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (url.trim() && !busy) readPage(); } }} placeholder="or a live page: https://…" />
              <Button type="button" disabled={busy || !url.trim()} onClick={readPage}>{busy ? "Reading…" : "Read page"}</Button>
            </div>
          </div>
        )}
        {docs.length < 4 && !url && <p className="text-xs text-muted">No page to hand? <button type="button" className="underline hover:text-ink" onClick={() => { setKind("landing page"); setUrl(`${window.location.origin}/sample-landing.html`); }}>Use our sample landing page</button>, then press Read page.</p>}
        {note && <p className="text-xs text-muted">{note}</p>}
        {error && <p role="alert" className="text-sm text-crit">{error}</p>}
      </div>
    </details>
  );
}
