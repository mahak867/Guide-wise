import { createHash } from "node:crypto";
import { isLapsed, parseException } from "./approval";
import { BadInput, db, loadKit, must } from "./db";
import { today } from "./engine/code";
import { reviewDraft, riskTier } from "./engine/review";
import { summarisePrecedents, type DismissEvent, type Precedent, type PrecedentRow } from "./review-extras";
import type { Finding, Intent } from "./types";
import type { DraftImage } from "./engine/visual";

export interface DraftRow {
  id: string;
  title: string;
  content_type: string;
  text: string;
  intent: Intent;
  images: DraftImage[];
  assets?: { name: string; text: string }[];
  status: string;
  risk_tier: string | null;
  risk_reasons: string[];
  version: number;
  kit_version: number;
  author: string;
  mode: string;
  stats: Record<string, unknown>;
  impact?: { reason: string; change_kind: string; change_id: string; at: string; previous_status: string } | null;
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
 * Exceptions past their end date lapse: the finding is open again (its old reason is kept, so the page can say the
 * exception lapsed), and the lapse is logged. Returns the findings that were reopened; `findings` is updated in place.
 */
export async function lapseExceptions(ws: string, draftId: string, findings: Finding[]): Promise<Finding[]> {
  const t = today();
  const lapsed = findings.filter((f) => isLapsed(f, t));
  if (!lapsed.length) return [];
  const d = db();
  must(await d.from("findings").update({ state: "open", resolved_by: null }).in("id", lapsed.map((f) => f.id!)));
  must(await d.from("events").insert(lapsed.map((f) => ({
    ws, draft_id: draftId, actor: "Guidewise", role: "system", action: "exception_lapsed",
    detail: { rule: f.rule_id, quote: f.quote, until: parseException(f.dismiss_reason)?.until ?? null, granted_by: f.resolved_by ?? null },
  }))));
  for (const f of lapsed) { f.state = "open"; f.resolved_by = null; }
  return lapsed;
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
  const { findings, stats, images } = await reviewDraft(draft.text, draft.intent, rules, facts, kit, { useAI, images: draft.images ?? [], contentType: draft.content_type, assets: draft.assets ?? [] });
  // Keep what AI vision read from each creative, so it is read once and shown on the review.
  const visionAdded = images.some((img, i) => img.vision !== undefined && draft.images?.[i]?.vision === undefined);
  if (visionAdded) { must(await d.from("drafts").update({ images }).eq("id", draft.id)); draft.images = images; }
  const existing = await getFindings(draft.id);
  // An exception past its end date no longer settles its finding: it is reopened before anything else is reconciled.
  await lapseExceptions(ws, draft.id, existing);
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

/**
 * Precedents for the rules on a draft: how this workspace's other drafts settled the same rules (fixed, or dismissed
 * and why, by whom, when). One query for the findings of every rule at once, grouped by rule in code, and one for the
 * dismissal events that date them; never a request per finding. A failure here never breaks the review page.
 */
export async function loadPrecedents(ws: string, draftId: string, ruleIds: string[]): Promise<Record<string, Precedent>> {
  const rules = [...new Set(ruleIds)].filter(Boolean).slice(0, 200);
  if (!rules.length) return {};
  try {
    const d = db();
    const [rows, evs] = await Promise.all([
      d.from("findings").select("rule_id, state, dismiss_reason, resolved_by, draft_id, quote, created_at, drafts!inner(ws)")
        .eq("drafts.ws", ws).neq("draft_id", draftId).in("rule_id", rules).in("state", ["accepted", "resolved", "dismissed"]).limit(5000),
      d.from("events").select("draft_id, detail, at")
        .eq("ws", ws).eq("action", "finding_dismissed").neq("draft_id", draftId).in("detail->>rule", rules).order("at", { ascending: false }).limit(2000),
    ]);
    return summarisePrecedents(must(rows) as unknown as PrecedentRow[], must(evs) as DismissEvent[]);
  } catch (e) {
    console.error("[guidewise] precedents", e);
    return {};
  }
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
function cleanLogo(l: unknown): DraftImage["logo"] {
  if (!l || typeof l !== "object") return null;
  const o = l as Record<string, unknown>;
  const n = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0));
  const b = o.box as Record<string, unknown> | undefined;
  return {
    found: o.found === true, score: n(o.score),
    ...(b ? { box: { x: n(b.x), y: n(b.y), w: n(b.w), h: n(b.h) } } : {}),
    ...(o.crowd !== undefined ? { crowd: n(o.crowd) } : {}),
  };
}

/** Validate campaign documents: up to 4, each named, 10 to 12,000 characters. */
export function cleanAssets(input: unknown): { name: string; text: string }[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new BadInput("Campaign documents must be a list.");
  if (input.length > 4) throw new BadInput("Add up to 4 campaign documents.");
  return input.map((a: Record<string, unknown>, n: number) => {
    const name = String(a?.name ?? "").trim().slice(0, 40) || `document ${n + 1}`;
    const text = String(a?.text ?? "").trim();
    if (text.length < 10) throw new BadInput(`Campaign document ${n + 1} (${name}) needs at least 10 characters of text.`);
    if (text.length > 12000) throw new BadInput(`Campaign document ${n + 1} (${name}) is longer than 12,000 characters.`);
    return { name, text };
  });
}

export function cleanImages(input: unknown): DraftImage[] {
  return (Array.isArray(input) ? input : []).slice(0, 4).map((i: Record<string, unknown>, n: number) => {
    const dataUrl = String(i.dataUrl ?? "");
    if (!dataUrl.startsWith("data:image/") || dataUrl.length > 900_000) throw new BadInput(`Image ${n + 1} is missing, is not an image, or is too large.`);
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
      logo: cleanLogo(i.logo),
    };
  });
}
