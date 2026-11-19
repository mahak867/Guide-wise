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
  return (
    <fieldset className="rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-medium">Campaign documents <span className="font-normal text-muted">Optional, up to 4. Reviewed with the caption; prices, dates and promo codes are compared across all of them.</span></legend>
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
            {d.text.trim().length > 0 && d.text.trim().length < 10 && <p className="text-xs text-crit">Add at least 10 characters, or remove this document.</p>}
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
          </div>
        )}
        {error && <p role="alert" className="text-sm text-crit">{error}</p>}
      </div>
    </fieldset>
  );
}
