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
  const steps: { done: boolean; text: string; where?: string }[] = [
    { done: true, text: "Read a finding: each one quotes the exact words, cites the rule and its source, and regulation findings show a real penalty order.",
      where: "Findings are on the right (below the draft on a phone). Each says which check raised it: code, AI, image, AI vision or consistency." },
    { done: s.accepted > 0, text: "Accept a fix (or “Accept all”). Each fix was re-tested before it was offered, and the checks run again on the new text.",
      where: s.accepted > 0 ? `${s.accepted} accepted so far. The version history under Activity shows each change word by word.` : "Open a finding with a green “Suggested fix” box." },
    ...(s.hasImages ? [{ done: s.imagesUpdated, text: s.isSample
      ? "Replace the image: “Replace or edit images” → remove it → “Use the corrected sample” → Save and re-check."
      : "Fix the design, then “Replace or edit images” with the new version, or add alt text, and save to re-check.",
      where: "Image findings cannot be fixed by text, so they stay open until the image changes or a reviewer dismisses them." }] : []),
    { done: s.submitted, text: "Submit for review. A fixed rule table routes it: outcome claims go to compliance, everything else to the brand reviewer.",
      where: s.routedTo ? `Routed to ${s.routedTo === "compliance_review" ? "compliance" : "the brand reviewer"}; the reasons are in the box under this tour.` : "The “Submit for review” button is in the box under this tour, with where it will go and why." },
    { done: s.approved, text: s.routedTo === "brand_review" ? "Act as Arjun (brand), dismiss anything left with a reason, and approve." : "Act as Kavya (compliance), dismiss anything left with a reason (an approved exception can have an end date), and approve; then act as Arjun (brand) for the second sign-off." },
    { done: s.approved, text: "Read the receipt: a fingerprint of the exact approved text and the Brand Kit version it was checked against.",
      where: "It appears after the last sign-off, with a printable record that lists every finding and how it was settled." },
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
      {open && <p className="mt-1.5 text-xs text-muted">The steps tick themselves off from what happens to this draft, so you can follow them in any order. Switch person with “Acting as” at the top of the page.</p>}
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
    </Card>
  );
}
