import type { ReviewStats } from "./types";

/** The parts of a draft that say which checks ran on it. */
export interface CheckedDraft {
  mode?: string;
  stats?: Partial<ReviewStats>;
  intent?: { confidential?: boolean } | null;
  images?: unknown[];
  assets?: unknown[];
}

export interface CheckRun { name: string; ran: boolean | null; note: string }

/** What ran on the draft and what was skipped, from the review's own statistics. `ran` is null when not applicable. */
export function checksOf(d: CheckedDraft): CheckRun[] {
  const st = d.stats ?? {};
  const ai = d.mode === "ai", conf = !!d.intent?.confidential;
  const imgs = st.images ?? d.images?.length ?? 0, docs = st.assets ?? d.assets?.length ?? 0;
  const n = (k: number | undefined, w: string) => `${k ?? 0} ${w}${k === 1 ? "" : w.endsWith("x") ? "es" : "s"}`;
  return [
    { name: "Code checks", ran: true, note: `terms, contacts, students, disclaimers, figures against the Facts Register; ${n(st.codeFindings, "finding")} on the last run` },
    { name: "AI checks", ran: conf ? null : ai, note: conf ? "skipped: confidential draft, never sent to AI" : ai ? `${n(st.aiFindings, "finding")} from ${n(st.aiCalls, "call")}` : `skipped: ${st.aiError ? st.aiError.slice(0, 80) : "the AI service was off"}` },
    { name: "Images", ran: imgs ? true : null, note: imgs ? `${n(imgs, "image")}: text, colours, contrast, logo, alt text` : "none attached" },
    { name: "AI vision", ran: !imgs || conf ? null : (st.visionRead ?? 0) > 0 && !st.visionError, note: !imgs ? "no images" : conf ? "skipped: confidential" : st.visionError ? "skipped: the AI service did not answer" : `${n(st.visionRead, "creative")} read for people shown` },
    { name: "Campaign documents", ran: docs ? true : null, note: docs ? `${n(docs, "document")}, every text rule` : "none attached" },
    { name: "Verifier", ran: true, note: `${n(st.droppedByVerifier?.length, "unsupported finding")} dropped; ${n(st.fixesWithdrawn, "fix")} withdrawn after re-testing` },
  ];
}
