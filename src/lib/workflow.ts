import { createHash } from "node:crypto";
import { db, loadKit, must } from "./db";
import { reviewDraft, riskTier } from "./engine/review";
import type { Finding, Intent } from "./types";
import type { DraftImage } from "./engine/visual";

export interface DraftRow {
  id: string;
  title: string;
  content_type: string;
  text: string;
  intent: Intent;
  images: DraftImage[];
  status: string;
  risk_tier: string | null;
  risk_reasons: string[];
  version: number;
  kit_version: number;
  author: string;
  mode: string;
  stats: Record<string, unknown>;
}

const key = (f: { rule_id: string; quote: string; location?: string }) => `${f.rule_id}|${f.location ?? "text"}|${f.quote}`;

export async function getDraft(ws: string, id: string): Promise<DraftRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return must(await db().from("drafts").select("*").eq("ws", ws).eq("id", id).maybeSingle()) as DraftRow | null;
}

export async function getFindings(id: string): Promise<Finding[]> {
  return must(await db().from("findings").select("*").eq("draft_id", id).order("created_at")) as Finding[];
}

/**
 * Run the review on the draft's current text and reconcile with what is already recorded:
 * decisions people made are kept, open findings whose words are gone are closed,
 * and anything new is added.
 */
/**
 * keepAI: re-run the code and image checks only, keeping the AI findings and AI stats from the last review.
 * Used when only images changed: the AI judges text, and the text is the same.
 */
export async function runReview(ws: string, draft: DraftRow, useAI: boolean, keepAI = false): Promise<void> {
  const d = db();
  const { kit, rules, facts } = await loadKit(ws);
  const { findings, stats } = await reviewDraft(draft.text, draft.intent, rules, facts, kit, { useAI, images: draft.images ?? [], contentType: draft.content_type });
  const existing = await getFindings(draft.id);
  const found = new Set(findings.map(key));
  const known = new Map(existing.map((f) => [key(f), f]));

  // In a code-only re-check, an open AI finding stays open while its words are still in the text.
  const gone = existing.filter((f) => f.state === "open" && !found.has(key(f)) && (stats.mode === "ai" || f.check_type !== "voice" && f.check_type !== "claims" || f.location !== "text" || !draft.text.includes(f.quote)));
  if (gone.length) {
    must(await d.from("findings").update({ state: "resolved", resolved_by: "edit" }).in("id", gone.map((f) => f.id!)));
  }
  const fresh = findings.filter((f) => !known.has(key(f)));
  if (fresh.length) {
    must(await d.from("findings").insert(fresh.map((f) => ({ ...f, draft_id: draft.id, draft_version: draft.version, state: "open" }))));
  }
  // A finding that was closed by an edit and has come back is reopened.
  const back = existing.filter((f) => f.state === "resolved" && found.has(key(f)));
  if (back.length) must(await d.from("findings").update({ state: "open", resolved_by: null }).in("id", back.map((f) => f.id!)));

  const risk = riskTier(await getFindings(draft.id));
  must(await d.from("drafts").update({
    ...(() => {
      if (!keepAI || draft.mode !== "ai") return { mode: stats.mode, stats };
      const prev = draft.stats as Partial<typeof stats>;
      return { mode: draft.mode, stats: { ...stats, mode: "ai" as const, aiFindings: prev.aiFindings ?? 0, aiCalls: prev.aiCalls ?? 0, aiCached: prev.aiCached ?? 0 } };
    })(),
    kit_version: kit.version, risk_tier: risk.tier, risk_reasons: risk.reasons,
    updated_at: new Date().toISOString(),
  }).eq("id", draft.id));
}

export async function saveText(draft: DraftRow, text: string, note: string): Promise<DraftRow> {
  const d = db();
  const version = draft.version + 1;
  must(await d.from("drafts").update({ text, version, updated_at: new Date().toISOString() }).eq("id", draft.id));
  must(await d.from("versions").insert({ draft_id: draft.id, version, text, note }));
  return { ...draft, text, version };
}

/** Open findings whose quoted words are no longer in the text are closed. */
export async function closeStale(draft: DraftRow): Promise<void> {
  const open = (await getFindings(draft.id)).filter((f) => f.state === "open" && (f.location ?? "text") === "text" && !draft.text.includes(f.quote));
  if (open.length) must(await db().from("findings").update({ state: "resolved", resolved_by: "edit" }).in("id", open.map((f) => f.id!)));
}

export function fingerprint(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Validate images sent by the browser: size, colour format and text length. */
export function cleanImages(input: unknown): DraftImage[] {
  return (Array.isArray(input) ? input : []).slice(0, 4).map((i: Record<string, unknown>, n: number) => {
    const dataUrl = String(i.dataUrl ?? "");
    if (!dataUrl.startsWith("data:image/") || dataUrl.length > 900_000) throw new Error(`Image ${n + 1} is missing or too large.`);
    return {
      name: String(i.name ?? `Image ${n + 1}`).slice(0, 120),
      alt: String(i.alt ?? "").slice(0, 600),
      dataUrl,
      w: Number(i.w) || undefined,
      h: Number(i.h) || undefined,
      colours: (Array.isArray(i.colours) ? i.colours : []).slice(0, 8)
        .filter((c: { hex?: string }) => /^#[0-9A-F]{6}$/.test(String(c.hex)))
        .map((c: { hex: string; share: number }) => ({ hex: c.hex, share: Math.max(0, Math.min(1, Number(c.share) || 0)) })),
      ocr: String(i.ocr ?? "").slice(0, 4000),
      ocr_ok: i.ocr_ok !== false,
    };
  });
}
