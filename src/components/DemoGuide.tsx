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

/** A checklist that ticks itself off from the draft's real state, so a first-time visitor needs no walkthrough. */
export function DemoGuide({ s }: { s: GuideState }) {
  const [open, setOpen] = useState(true);
  const steps = [
    { done: true, text: "Read a finding: each one quotes the exact words, cites the rule and its source, and regulation findings show a real penalty order." },
    { done: s.accepted > 0, text: "Accept a fix (or “Accept all”). Each fix was re-tested before it was offered, and the checks run again on the new text." },
    ...(s.hasImages ? [{ done: s.imagesUpdated, text: s.isSample
      ? "Replace the image: “Replace or edit images” → remove it → “Use the corrected sample” → Save and re-check."
      : "Fix the design, then “Replace or edit images” with the new version, or add alt text, and save to re-check." }] : []),
    { done: s.submitted, text: "Submit for review. A fixed rule table routes it: outcome claims go to compliance, everything else to the brand reviewer." },
    { done: s.approved, text: `Act as ${s.routedTo === "brand_review" ? "Arjun (brand)" : "Kavya (compliance)"}, dismiss anything left with a reason, and approve.` },
    { done: s.approved, text: "Read the approval receipt: a fingerprint of the exact approved text and the Brand Kit version it was checked against." },
  ];
  const done = steps.filter((x) => x.done).length;
  return (
    <Card className="mb-4 border-brand/40 p-3.5 text-sm">
      <button className="flex w-full items-center gap-2 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b className="whitespace-nowrap">Guided tour</b>
        <span className="whitespace-nowrap text-muted">{done} of {steps.length} done</span>
        <span className="ml-auto hidden h-1.5 w-32 overflow-hidden sm:block rounded-full bg-mist" aria-hidden><span className="block h-full bg-brand" style={{ width: `${(done / steps.length) * 100}%` }} /></span>
        <span className="text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <ol className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {steps.map((x, i) => (
            <li key={i} className={`flex gap-2 rounded-md px-2 py-1.5 ${x.done ? "text-muted" : "bg-brand-soft/50"}`}>
              <span aria-hidden className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] ${x.done ? "bg-brand text-white" : "border border-brand text-brand"}`}>{x.done ? "✓" : i + 1}</span>
              <span><span className="sr-only">{x.done ? "Done: " : "To do: "}</span>{x.text}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
