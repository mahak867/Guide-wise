"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Field, Notice, PageHead, inputCls } from "@/components/ui";
import { ImagePicker } from "@/components/ImagePicker";
import { CampaignDocs, type Doc } from "@/components/CampaignDocs";
import { ChannelPreview } from "@/components/ChannelPreview";
import { analyseImage } from "@/lib/image";
import { api, useApp } from "@/lib/client";
import type { ImageInput } from "@/lib/image";
import { HARD_CASES } from "@/lib/hardcases";
import { DEMO_CAPTION, DEMO_INTENT } from "@/lib/seed";
import { CONTENT_TYPES } from "@/lib/types";

const TYPES = CONTENT_TYPES;

const SAMPLE_CAMPAIGN = {
  caption: "JEE crash course for droppers: 60 days of full-length tests and evening doubt sessions. Starts 5 January. Fee ₹12,999. Use code EARLY20 when you enrol at admissions@preppath.in.",
  docs: [
    { name: "brochure", text: "PrepPath JEE Crash Course. Fee ₹14,999 including printed test papers. Classes start on 5 January at our Anna Nagar centre. Finish every mock test and an IIT seat is as good as yours. Early-bird code EARLY20." },
    { name: "landing page", text: "Join the PrepPath JEE crash course. Starts 12 January. Use early-bird code EARLY10 when you enrol." },
  ],
};

export default function NewReview() {
  const { state, role, setRole } = useApp();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("social");
  const [text, setText] = useState("");
  const [hard, setHard] = useState<string | null>(null);
  const [intent, setIntent] = useState({ goal: "", audience: "", cta: "", locked: "" });
  const [images, setImages] = useState<ImageInput[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const logo = useApp().state?.kit.logo ?? null;
  const [confidential, setConfidential] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const brief = useMemo(() => {
    if (!state) return null;
    const facts = state.facts.filter((f) => f.kind === "fact");
    const applies = (r: (typeof state.rules)[number]) => !r.config.channels?.length || r.config.channels.includes(type);
    return {
      rules: state.rules.filter((r) => r.status === "enforced" && applies(r)),
      advisory: state.rules.filter((r) => r.status === "advisory" && applies(r)),
      // Rules that run only for some content types, and those that run for this one.
      channelOnly: state.rules.filter((r) => r.config.channels?.length && r.config.channels.includes(type)),
      length: state.rules.filter((r) => r.category === "length" && r.config.maxChars && applies(r)),
      readability: state.rules.find((r) => r.category === "readability" && applies(r)),
      usable: facts.filter((f) => (!f.valid_from || f.valid_from <= today) && (!f.valid_until || f.valid_until >= today)),
      embargoed: facts.filter((f) => f.valid_from && f.valid_from > today),
      expired: facts.filter((f) => f.valid_until && f.valid_until < today),
    };
  }, [state, today, type]);

  // Live counts for the draft text, measured the way the length and readability checks measure it.
  const counts = useMemo(() => {
    const body = text.trim();
    const words = body ? body.split(/\s+/).length : 0;
    const longest = body.split(/[.!?\n]+/).reduce((m, s) => Math.max(m, s.trim() ? s.trim().split(/\s+/).length : 0), 0);
    return { words, chars: body.length, longest };
  }, [text]);
  const locked = intent.locked.split(",").map((x) => x.trim()).filter(Boolean);
  const docsReady = docs.filter((d) => d.text.trim()).length;
  const aiOn = !!state?.ai.available && !confidential;
  const typeLabel = TYPES.find((t) => t.v === type)?.l ?? type;

  async function loadCampaign() {
    setTitle("Campaign: JEE crash course"); setType("social"); setHard(null);
    setText(SAMPLE_CAMPAIGN.caption); setDocs(SAMPLE_CAMPAIGN.docs);
    setIntent({ goal: "Fill the January crash course", audience: "JEE droppers", cta: "Enrol for the crash course", locked: "" });
    setBusy("Reading the campaign creative…");
    try {
      const blob = await (await fetch("/sample-campaign-creative.png")).blob();
      const img = await analyseImage(blob, "sample-campaign-creative.png", (m) => setBusy(`Campaign creative: ${m}`), logo);
      setImages([{ ...img, alt: "PrepPath crash course creative: an illustrated student holding a trophy beside the text JEE Crash Course, Fee ₹12,999, Starts 5 January, Code EARLY20." }]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  }

  // /review/new#hard (the home page's "Try a hard case") goes straight to the hard cases.
  const [hardOpen, setHardOpen] = useState(false);
  useEffect(() => {
    if (window.location.hash !== "#hard") return;
    queueMicrotask(() => setHardOpen(true));
    requestAnimationFrame(() => document.getElementById("hard")?.scrollIntoView({ block: "center" }));
  }, []);

  const autoLoaded = useRef(false);
  // /review/new?sample=campaign (linked from the home page) loads the sample campaign straight away.
  useEffect(() => {
    if (state && !autoLoaded.current && new URLSearchParams(window.location.search).get("sample") === "campaign" && !text) { autoLoaded.current = true; loadCampaign(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

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
      const { id } = await api<{ id: string }>("/api/drafts", { title, content_type: type, text, intent: { ...intent, confidential }, images, assets: docs.filter((d) => d.text.trim()) });
      router.push(`/review/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  const checkSummary = brief
    ? [`${brief.rules.length} rules`, `${brief.usable.length} facts`, images.length ? `${images.length} image${images.length === 1 ? "" : "s"}` : "", docsReady ? `${docsReady} document${docsReady === 1 ? "" : "s"}` : "", `AI checks ${aiOn ? "on" : "off"}`].filter(Boolean).join(" · ")
    : "Loading the Brand Kit…";

  return (
    <>
      <PageHead title="New review" sub="Paste or upload the draft, then run the review. Images, campaign documents and the draft's goal are optional." />
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
              <Field label="Title" hint="(optional)"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="December batch caption" /></Field>
              <div>
                <Field label="Content type">
                  <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)} aria-describedby="type-help">{TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
                </Field>
                <p id="type-help" className="mt-1 text-xs text-muted">
                  {brief?.channelOnly.length ? <span title={brief.channelOnly.map((r) => r.title).join("; ")}>Adds {brief.channelOnly.length} rule{brief.channelOnly.length === 1 ? "" : "s"} only for {typeLabel.toLowerCase()}s.</span> : <>Decides which channel rules run.</>}
                </p>
              </div>
            </div>
            <div>
              <Field label="Draft text">
                <textarea required={!images.length} minLength={images.length ? 0 : 10} rows={7} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the post, ad, email or page copy here" aria-describedby="text-counts" />
              </Field>
              <p id="text-counts" className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                <span>{counts.words} word{counts.words === 1 ? "" : "s"}</span>
                <span>{counts.chars.toLocaleString("en-IN")} character{counts.chars === 1 ? "" : "s"}{counts.chars > 10000 ? " of 12,000 at most" : ""}</span>
                {brief?.length.map((r) => {
                  const max = r.config.maxChars!;
                  const over = counts.chars > max;
                  return (
                    <span key={r.id} className={over ? "font-medium text-crit" : ""}>
                      {counts.chars}/{max} before the cut-off{over ? `: ${counts.chars - max} over` : ""}
                    </span>
                  );
                })}
                {brief?.readability?.config.maxWords && counts.words > 0 && counts.longest > brief.readability.config.maxWords && (
                  <span className="text-major">Longest sentence {counts.longest} words (keep to {brief.readability.config.maxWords})</span>
                )}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <label className="cursor-pointer rounded-md border border-line bg-white px-3 py-1.5 font-medium hover:bg-mist">
                  Upload DOCX or PDF
                  <input type="file" accept=".docx,.pdf" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                </label>
                <Button type="button" variant="ghost" onClick={() => { setText(DEMO_CAPTION); setIntent({ ...DEMO_INTENT, locked: "" }); setTitle("Instagram caption: December JEE batch"); setType("social"); }}>
                  Use the sample caption
                </Button>
                <Button type="button" variant="ghost" disabled={!!busy} onClick={loadCampaign}>
                  Use the sample campaign
                </Button>
              </div>
            </div>
            <ChannelPreview text={text} title={title} type={type} kit={state?.kit} rules={brief?.rules ?? []} cta={intent.cta} image={images[0]} />
            <ImagePicker images={images} onChange={setImages} />
            <CampaignDocs docs={docs} onChange={setDocs} />
            <fieldset className="rounded-md border border-line p-3">
              <legend className="px-1 text-sm font-medium">What is this draft for? <span className="font-normal text-muted">(optional)</span></legend>
              <p className="mb-2 text-xs text-muted">AI fixes keep this intent, and the reviewer sees it.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Goal"><input className={inputCls} value={intent.goal} onChange={(e) => setIntent({ ...intent, goal: e.target.value })} placeholder="Get enquiries for the December batch" /></Field>
                <Field label="Audience"><input className={inputCls} value={intent.audience} onChange={(e) => setIntent({ ...intent, audience: e.target.value })} placeholder="JEE aspirants" /></Field>
                <Field label="Call to action"><input className={inputCls} value={intent.cta} onChange={(e) => setIntent({ ...intent, cta: e.target.value })} placeholder="Enquire now" /></Field>
              </div>
              <div className="mt-3"><Field label="Locked phrases" hint="(comma separated)"><input className={inputCls} value={intent.locked} onChange={(e) => setIntent({ ...intent, locked: e.target.value })} placeholder="Mission IIT 2027, December batch" aria-describedby="locked-help" /></Field></div>
              <p id="locked-help" className="mt-1 text-xs text-muted">
                No fix may change these words; findings on them are fixed by hand.
                {locked.length > 0 && <> Protected: {locked.map((l) => <span key={l} className="mx-0.5 inline-block rounded border border-line bg-mist px-1 text-ink">{l}</span>)}</>}
              </p>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-ink)]" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
                <span><b className="font-medium">Confidential draft.</b> <span className="text-muted">Never send it to an AI service; only the code checks run.</span></span>
              </label>
              {confidential && <p className="mt-1 pl-6 text-xs text-muted">Still checked: banned terms, contacts, disclaimers, named students, every figure against the Facts Register, and colours, logo and text read from images in your browser. Skipped: the AI tone and paraphrase checks and AI vision.</p>}
            </fieldset>
            <details id="hard" open={hardOpen || !!hard} onToggle={(e) => setHardOpen(e.currentTarget.open)} className="scroll-mt-24 rounded-md border border-dashed border-line px-3 py-2.5 text-sm">
              <summary className="cursor-pointer select-none"><span className="font-medium">Try a hard case</span> <span className="text-muted">Drafts built to get past a checker</span></summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {HARD_CASES.map((c) => (
                  <button key={c.id} type="button" aria-pressed={hard === c.id}
                    className={`rounded-full border px-2.5 py-1 text-xs ${hard === c.id ? "border-ink bg-ink text-white" : "border-line bg-white hover:bg-mist"}`}
                    onClick={() => { setHard(c.id); setText(c.text); setType(c.type); setTitle(`Hard case: ${c.label}`); setIntent({ goal: "", audience: "", cta: "", locked: "" }); }}>
                    {c.label}
                  </button>
                ))}
              </div>
              {hard && <p className="mt-2 text-muted" role="status"><b className="text-ink">What to look for:</b> {HARD_CASES.find((c) => c.id === hard)?.expect}</p>}
            </details>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="border-t border-line pt-4">
              <details className="mb-3 text-sm">
                <summary className="cursor-pointer select-none text-muted hover:text-ink"><span className="font-medium text-ink">What will be checked:</span> {checkSummary}</summary>
                {brief && (
                  <ul className="mt-1.5 grid gap-x-5 gap-y-1 text-muted sm:grid-cols-2">
                    <li><b className="text-ink">{brief.rules.length}</b> rules in force for {typeLabel.toLowerCase()}{brief.advisory.length ? `, plus ${brief.advisory.length} advisory (suggestions only)` : ""}</li>
                    <li><b className="text-ink">{brief.usable.length}</b> fact{brief.usable.length === 1 ? "" : "s"} usable today; any other figure is flagged{brief.embargoed.length + brief.expired.length ? ` (${brief.embargoed.length + brief.expired.length} embargoed or expired)` : ""}</li>
                    <li><b className="text-ink">{images.length}</b> image{images.length === 1 ? "" : "s"}{images.length ? `: text, colours, contrast, logo, alt text${aiOn ? ", and AI vision for people shown" : ""}` : " attached"}</li>
                    <li><b className="text-ink">{docsReady}</b> campaign document{docsReady === 1 ? "" : "s"}{docsReady || images.length ? "; prices, dates and promo codes compared across everything" : " attached"}</li>
                    <li><b className="text-ink">{locked.length}</b> locked phrase{locked.length === 1 ? "" : "s"} protected from fixes</li>
                    <li>
                      AI checks: <b className={aiOn ? "text-brand" : "text-ink"}>{aiOn ? "on" : "off"}</b>
                      {confidential ? " (confidential draft)" : !state?.ai.available ? " (service unavailable; code checks run)" : `, ${state.ai.model}; each AI finding is run twice and verified`}
                    </li>
                  </ul>
                )}
              </details>
              <Button variant="primary" type="submit" className="!px-5 !py-2.5 !text-[15px]" disabled={!!busy}>{busy ?? "Run review"}</Button>
            </div>
            <p className="mt-3 text-[13px] text-muted">
              <b className="text-ink">What happens next:</b> each finding quotes your words and the Brand Kit rule they break, usually with a fix you can accept.
              Fix or dismiss them, then submit; Guidewise sends the draft to the right reviewer, who approves it.
            </p>
          </form>
        </Card>

        <Card className="h-fit p-4">
          <h2>Brief card</h2>
          <p className="mt-0.5 text-sm text-muted">What is safe to say today{state ? `, from Brand Kit v${state.kit.version}` : ""}. A figure or contact not listed here is flagged.</p>
          {!brief ? <p className="mt-3 text-sm text-muted">Loading…</p> : (
            <div className="mt-3 space-y-4 text-sm">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Facts you can use today</h3>
                <ul className="mt-1.5 space-y-1.5">
                  {brief.usable.map((f) => (
                    <li key={f.id}><span className="font-mono text-xs text-muted">{f.id}</span> {f.statement}{f.disclosure && <span className="block text-xs text-muted">Must appear with: {f.disclosure}</span>}</li>
                  ))}
                </ul>
              </div>
              {(brief.embargoed.length > 0 || brief.expired.length > 0) && (
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Not usable today</h3>
                  <ul className="mt-1.5 space-y-1.5 text-muted">
                    {brief.embargoed.map((f) => <li key={f.id}><span className="font-mono text-xs">{f.id}</span> Embargoed until {f.valid_from}. Ask {f.owner}.</li>)}
                    {brief.expired.map((f) => <li key={f.id}><span className="font-mono text-xs">{f.id}</span> {f.statement} (expired {f.valid_until})</li>)}
                  </ul>
                </div>
              )}
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Approved contacts</h3>
                <ul className="mt-1.5 space-y-1">{state!.kit.contacts.map((c) => <li key={c.value}>{c.label}: {c.value}</li>)}</ul>
              </div>
              <details>
                <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-muted hover:text-ink">Rules in force for {typeLabel.toLowerCase()} ({brief.rules.length})</summary>
                <ul className="mt-1.5 space-y-1">
                  {brief.rules.map((r) => <li key={r.id}><span className="font-mono text-xs text-muted">{r.id}</span> {r.title}</li>)}
                </ul>
                {brief.advisory.length > 0 && <p className="mt-1.5 text-xs text-muted">Also {brief.advisory.length} advisory rule{brief.advisory.length === 1 ? "" : "s"} ({brief.advisory.map((r) => r.id).join(", ")}): suggestions that never block approval.</p>}
              </details>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
