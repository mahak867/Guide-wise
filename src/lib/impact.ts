import { isLapsed } from "./approval";
import { db, loadKit, must } from "./db";
import { extractNumberClaims, subjectWindow, today } from "./engine/code";
import { reviewDraft, riskTier } from "./engine/review";
import type { Fact, Finding } from "./types";
import { getFindings, runReview, type DraftRow } from "./workflow";

// Change impact. When a fact or a rule changes, every draft that used it is found, re-checked against the
// new Brand Kit, and any approved draft that no longer passes is sent back for re-approval with the reason.

export interface Change { kind: "fact" | "rule"; id: string; what: string }
export interface Affected {
  id: string; title: string; status: string;
  outcome: "reapproval" | "still_passes" | "rechecked";
  findings: { rule_id: string; quote: string; message: string }[];
}
export interface Impact { change: Change; at: string; checked: number; affected: Affected[] }

const word = (hay: string, k: string) => new RegExp(`(?<![a-z])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(hay);

/** The facts a text relies on: a figure with the fact's value, or a figure about the fact's subject, or a named student. */
export function factsUsed(text: string, facts: Fact[]): Set<string> {
  const used = new Set<string>();
  for (const c of extractNumberClaims(text)) {
    const near = subjectWindow(text, c);
    for (const f of facts) {
      if (f.kind !== "fact" || f.value === null) continue;
      if (Number(f.value) === c.value || f.keywords.some((k) => word(near, k))) used.add(f.id);
    }
  }
  for (const f of facts) if (f.kind === "student" && f.meta.name && word(text, f.meta.name.split(/[ ,]/)[0])) used.add(f.id);
  return used;
}

const key = (f: { rule_id: string; quote: string }) => `${f.rule_id}|${f.quote}`;

export async function assessImpact(ws: string, change: Change, factsBefore: Fact[] = []): Promise<Impact> {
  const d = db();
  const { kit, rules, facts } = await loadKit(ws);
  const drafts = must(await d.from("drafts").select("*").eq("ws", ws)) as DraftRow[];
  const affected: Affected[] = [];
  for (const draft of drafts) {
    const existing = await getFindings(draft.id);
    const text = [draft.text, ...(draft.images ?? []).map((i) => i.ocr ?? ""), ...(draft.assets ?? []).map((a) => a.text)].join("\n");
    const cites = (f: Finding) => (change.kind === "fact" ? f.fact_id === change.id : f.rule_id === change.id);
    const used = change.kind === "fact"
      ? factsUsed(text, [...factsBefore, ...facts]).has(change.id) || existing.some(cites)
      : existing.some(cites);
    if (!used) continue;
    const { findings } = await reviewDraft(draft.text, draft.intent, rules, facts, kit, { useAI: false, images: draft.images ?? [], contentType: draft.content_type, assets: draft.assets ?? [] });
    const relevant = findings.filter((f) => cites(f) && f.level === "violation");
    const brief = (fs: Finding[]) => fs.map((f) => ({ rule_id: f.rule_id, quote: f.quote, message: f.message }));
    if (draft.status === "approved") {
      // A dismissal settles its finding, unless it was an exception whose end date has passed: that one reopens.
      const t = today();
      const lapsed = existing.filter((f) => isLapsed(f, t));
      const settled = new Set(existing.filter((f) => f.state === "dismissed" && !isLapsed(f, t)).map(key));
      const fresh = [...relevant.filter((f) => !settled.has(key(f))), ...lapsed.filter((f) => !relevant.some((r) => key(r) === key(f)))];
      if (!fresh.length) { affected.push({ id: draft.id, title: draft.title, status: draft.status, outcome: "still_passes", findings: [] }); continue; }
      await runReview(ws, draft, false, true);
      const status = riskTier(await getFindings(draft.id)).tier === "high" ? "compliance_review" : "brand_review";
      const why = lapsed.length ? `${change.what} An approved exception has also lapsed (${[...new Set(lapsed.map((f) => f.rule_id))].join(", ")}).` : change.what;
      const impact = { reason: why, change_kind: change.kind, change_id: change.id, at: new Date().toISOString(), previous_status: "approved" };
      // Only move it back if it is still approved: two Brand Kit changes at once send it back (and log it) once.
      const moved = must(await d.from("drafts").update({ status, impact, updated_at: new Date().toISOString() }).eq("id", draft.id).eq("status", "approved").select("id")) as unknown[];
      if (moved.length) must(await d.from("events").insert({ ws, draft_id: draft.id, actor: "Guidewise", role: "system", action: "reapproval_needed", detail: { change: change.what, findings: fresh.length } }));
      affected.push({ id: draft.id, title: draft.title, status, outcome: "reapproval", findings: brief(fresh) });
    } else {
      await runReview(ws, draft, false, true);
      if (draft.status === "brand_review" && riskTier(await getFindings(draft.id)).tier === "high") {
        must(await d.from("drafts").update({ status: "compliance_review" }).eq("id", draft.id));
      }
      affected.push({ id: draft.id, title: draft.title, status: draft.status, outcome: "rechecked", findings: brief(relevant) });
    }
  }
  const impact: Impact = { change, at: new Date().toISOString(), checked: drafts.length, affected };
  must(await d.from("events").insert({ ws, draft_id: null, actor: "Guidewise", role: "system", action: "impact_assessed", detail: impact }));
  return impact;
}

/** One line saying what changed in a fact, for the impact record and the re-approval banner. */
export function describeFactChange(before: Fact | undefined, after: Fact | null): string {
  if (!after) return `Fact ${before?.id} was deleted ("${before?.statement}").`;
  if (!before) return `Fact ${after.id} was added ("${after.statement}").`;
  const parts: string[] = [];
  if (before.value !== after.value) parts.push(`value ${before.value ?? "none"} to ${after.value ?? "none"}`);
  if (before.statement !== after.statement) parts.push(`wording to "${after.statement}"`);
  if (before.valid_from !== after.valid_from) parts.push(`valid from ${before.valid_from ?? "always"} to ${after.valid_from ?? "always"}`);
  if (before.valid_until !== after.valid_until) parts.push(`valid until ${before.valid_until ?? "no end"} to ${after.valid_until ?? "no end"}`);
  if (before.disclosure !== after.disclosure) parts.push("its required disclosure");
  if (JSON.stringify(before.keywords) !== JSON.stringify(after.keywords)) parts.push("what it counts");
  return `Fact ${after.id} changed: ${parts.join("; ") || "details updated"}.`;
}
