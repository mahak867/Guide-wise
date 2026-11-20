import { loadKit } from "./db";
import { today } from "./engine/code";
import { reviewDraft } from "./engine/review";
import type { DraftImage } from "./engine/visual";
import { CONTENT_TYPES } from "./types";

// The two things an outside writing tool needs, shared by the app, the REST API and the MCP server,
// so all three give the same answer for the same workspace.

export async function getBrief(ws: string, contentType = "social") {
  const { kit, rules, facts } = await loadKit(ws);
  const t = today();
  const type = CONTENT_TYPES.some((c) => c.v === contentType) ? contentType : "social";
  return {
    brand: kit.name, kit_version: kit.version, content_type: type, date: t,
    rules: rules
      .filter((r) => r.status === "enforced" && (!r.config.channels?.length || r.config.channels.includes(type)))
      .map((r) => ({ id: r.id, title: r.title, rule: r.description, severity: r.severity, source: r.source })),
    // Only facts valid today: an AI writing tool never sees an expired or embargoed figure.
    facts: facts
      .filter((f) => f.kind === "fact" && (!f.valid_from || f.valid_from <= t) && (!f.valid_until || f.valid_until >= t))
      .map((f) => ({ id: f.id, statement: f.statement, valid_until: f.valid_until, must_appear_with: f.disclosure || null })),
    disclaimers: kit.disclaimers.map((d) => ({ id: d.id, text: d.text, when: d.when })),
    contacts: kit.contacts,
    palette: kit.palette,
  };
}

export interface CheckInput { text: string; content_type?: string; use_ai?: boolean; images?: DraftImage[] }

type Loaded = Awaited<ReturnType<typeof loadKit>>;

/** `loaded` lets a caller checking many drafts read the workspace's Brand Kit once. */
export async function checkDraft(ws: string, input: CheckInput, loaded?: Loaded) {
  const { kit, rules, facts } = loaded ?? await loadKit(ws);
  const type = CONTENT_TYPES.some((c) => c.v === input.content_type) ? input.content_type! : "social";
  const { findings, stats } = await reviewDraft(input.text, null, rules, facts, kit, { useAI: input.use_ai !== false, images: input.images ?? [], contentType: type });
  const violations = findings.filter((f) => f.level === "violation");
  return {
    kit_version: kit.version, content_type: type, mode: stats.mode,
    verdict: violations.length ? "fix_before_publishing" : "ready_for_review",
    summary: { findings: findings.length, violations: violations.length, critical: violations.filter((f) => f.severity === "critical").length },
    findings: findings.map((f) => ({
      rule_id: f.rule_id, fact_id: f.fact_id ?? null, severity: f.severity, level: f.level, quote: f.quote,
      message: f.message, fix: f.fix ?? null, fix_note: f.fix_note ?? null, rule: f.rule_text, location: f.location ?? "text",
    })),
  };
}

/**
 * Many drafts against one read of the Brand Kit, with the code checks only (AI off), so a whole
 * content calendar is checked in seconds and never spends AI quota. Same findings as checkDraft.
 */
export async function checkMany(ws: string, posts: { text: string; content_type?: string }[]) {
  const loaded = await loadKit(ws);
  const results = [];
  for (const p of posts) results.push(await checkDraft(ws, { text: p.text, content_type: p.content_type, use_ai: false }, loaded));
  return { kit_version: loaded.kit.version, titles: new Map(loaded.rules.map((r) => [r.id, r.title])), results };
}
