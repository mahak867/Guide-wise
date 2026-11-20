"use client";
import { useState } from "react";
import { Card } from "./ui";

export interface GuideState {
  hasImages: boolean;
  isSample?: boolean;
  accepted: number;
  imagesUpdated: boolean;
  submitted: boolean;
  approved: boolean;
  routedTo: string | null;
}

/** A checklist that ticks itself off from the draft's real state. Folded to one line (the next step) until opened. */
export function DemoGuide({ s }: { s: GuideState }) {
  const [open, setOpen] = useState(false);
  const steps: { done: boolean; text: string; where?: string }[] = [
    { done: true, text: "Read a finding: it quotes the exact words and cites the rule and its source.",
      where: "Findings are on the right (below the draft on a phone)." },
    { done: s.accepted > 0, text: "Accept a fix, or “Accept all”. Each fix was re-tested before it was offered.",
      where: s.accepted > 0 ? `${s.accepted} accepted so far. Version history under Activity shows each change.` : "Open a finding with a suggested fix." },
    ...(s.hasImages ? [{ done: s.imagesUpdated, text: s.isSample
      ? "Replace the image: “Replace or edit images” → Remove → “Use the corrected sample” → Save and re-check."
      : "Fix the design, then “Replace or edit images” with the new version and save to re-check.",
      where: "Image findings cannot be fixed by text, so they stay open until the image changes or a reviewer dismisses them." }] : []),
    { done: s.submitted, text: "Submit for review. Outcome claims go to compliance, everything else to the brand reviewer.",
      where: s.routedTo ? `Routed to ${s.routedTo === "compliance_review" ? "compliance" : "the brand reviewer"}.` : "Use “Submit for review” in the Next step bar." },
    { done: s.approved, text: s.routedTo === "brand_review" ? "Act as Arjun (brand), dismiss anything left with a reason, and approve." : "Act as Kavya (compliance), dismiss anything left with a reason, and approve; then act as Arjun (brand) for the second sign-off." },
    { done: s.approved, text: "Read the receipt: a fingerprint of the exact approved text and the Brand Kit version.",
      where: "It appears after the last sign-off, with a printable approval record." },
  ];
  const done = steps.filter((x) => x.done).length;
  const next = steps.find((x) => !x.done);
  return (
    <Card className="mb-3 px-3.5 py-2.5 text-sm">
      <button className="flex w-full items-center gap-x-2 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b className="whitespace-nowrap">Guided tour</b>
        <span className="whitespace-nowrap text-muted">{done} of {steps.length} done</span>
        <span className="ml-auto hidden h-1.5 w-24 overflow-hidden rounded-full bg-mist sm:block" aria-hidden><span className="block h-full bg-brand" style={{ width: `${(done / steps.length) * 100}%` }} /></span>
        <span className="text-muted underline decoration-line underline-offset-4">{open ? "Hide steps" : "Show steps"}</span>
      </button>
      {!open && next && <p className="mt-0.5 text-[13px] text-muted">Step {steps.indexOf(next) + 1}: {next.text}</p>}
      {open && (
        <ol className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {steps.map((x, i) => (
            <li key={i} className={`flex gap-2 rounded-md px-2 py-1.5 ${x.done ? "text-muted" : "bg-brand-soft/50"}`}>
              <span aria-hidden className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] ${x.done ? "bg-brand text-white" : "border border-brand text-brand"}`}>{x.done ? "✓" : i + 1}</span>
              <span><span className="sr-only">{x.done ? "Done: " : "To do: "}</span>{x.text}{x.where && <span className="mt-0.5 block text-xs text-muted">{x.where}</span>}</span>
            </li>
          ))}
        </ol>
      )}
      {open && <p className="mt-1.5 text-xs text-muted">Steps tick themselves off from what happens to this draft. Switch person with “Acting as” at the top of the page.</p>}
    </Card>
  );
}
