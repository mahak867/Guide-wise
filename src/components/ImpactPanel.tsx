"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Impact } from "@/lib/impact";

/** After any fact or rule change, shows which drafts used it, what the re-check found, and which approvals were reopened. */
export function ImpactPanel() {
  const [impact, setImpact] = useState<Impact | null>(null);
  const ref = useRef<HTMLElement>(null);
  // The change is usually saved from a form further down the page; bring the result into view.
  useEffect(() => {
    if (impact) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [impact]);
  useEffect(() => {
    const on = (e: Event) => setImpact((e as CustomEvent<Impact>).detail);
    window.addEventListener("gw-impact", on);
    return () => window.removeEventListener("gw-impact", on);
  }, []);
  if (!impact) return null;
  const reopened = impact.affected.filter((a) => a.outcome === "reapproval");
  const label = { reapproval: "Sent back for re-approval", still_passes: "Approved, still passes", rechecked: "Re-checked" } as const;
  return (
    <section ref={ref} role="status" aria-label="Impact of this change" className="mb-5 scroll-mt-28 rounded-md border border-line bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1">
          <h2 className="text-base">Impact of this change</h2>
          <p className="mt-0.5 text-muted">{impact.change.what}</p>
        </div>
        <button className="text-xs text-muted underline hover:text-ink" onClick={() => setImpact(null)}>Close</button>
      </div>
      {impact.affected.length === 0 ? (
        <p className="mt-2">No draft or approved piece uses this. Checked {impact.checked} draft{impact.checked === 1 ? "" : "s"}; nothing needed re-checking.</p>
      ) : (
        <>
          <p className="mt-2">
            {impact.affected.length} of {impact.checked} draft{impact.checked === 1 ? "" : "s"} used it and {impact.affected.length === 1 ? "was" : "were"} checked again against the new Brand Kit.
            {reopened.length > 0 && <b className="text-crit"> {reopened.length} approved piece{reopened.length === 1 ? " no longer passes and was" : "s no longer pass and were"} sent back for re-approval.</b>}
          </p>
          <ul className="mt-2 divide-y divide-line rounded-md border border-line">
            {impact.affected.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-2 px-3 py-2">
                <Link className="font-medium underline-offset-2 hover:underline" href={`/review/${a.id}`}>{a.title}</Link>
                <span className={`rounded px-1.5 text-xs ${a.outcome === "reapproval" ? "bg-crit-soft text-crit" : a.outcome === "still_passes" ? "bg-brand-soft text-brand-dark" : "bg-mist"}`}>{label[a.outcome]}</span>
                {a.findings.length > 0 && <span className="w-full text-xs text-muted">{a.findings.map((f) => `“${f.quote}”: ${f.message}`).join(" · ").slice(0, 300)}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
