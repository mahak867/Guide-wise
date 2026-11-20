import type { Role } from "./types";

// Approval rules that need no database: time-limited exceptions and dual sign-off.
// Shared by the API (which enforces them) and the review page and approval record (which show them).

/** The dismiss reason that grants an exception. A violation dismissed this way may carry an end date. */
export const EXCEPTION = "Approved exception";

/** Who may grant an exception on a violation: a reviewer, never the creator of the content. */
export const EXCEPTION_GRANTERS: Role[] = ["brand", "compliance", "manager"];
export const canGrantException = (role: Role) => EXCEPTION_GRANTERS.includes(role);

/** Who gives the brand sign-off on a high-risk draft, after compliance. */
export const BRAND_SIGNERS: Role[] = ["brand", "manager"];

/** A real calendar date written YYYY-MM-DD (2026-02-30 is not one). */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * The stored form of an exception, kept in findings.dismiss_reason so no new column is needed:
 * "Approved exception" or "Approved exception (until 2026-12-31)". Readable as it stands, and parsed back by parseException.
 */
export function exceptionReason(until?: string | null): string {
  return until ? `${EXCEPTION} (until ${until})` : EXCEPTION;
}

/** Is this dismiss reason an exception, and until when? Null when it is another reason. */
export function parseException(reason: string | null | undefined): { until: string | null } | null {
  if (!reason) return null;
  const m = /^approved exception(?:\s*\(until (\d{4}-\d{2}-\d{2})\))?\s*$/i.exec(reason.trim());
  if (!m) return null;
  return { until: m[1] && isIsoDate(m[1]) ? m[1] : null };
}

/** An exception lapses after its end date: valid through the "until" day, lapsed from the next day. No end date never lapses. */
export function exceptionLapsed(reason: string | null | undefined, today: string): boolean {
  const ex = parseException(reason);
  return !!ex?.until && ex.until < today;
}

/** A dismissed finding whose exception has lapsed, so it must be open again. */
export function isLapsed(f: { state?: string; dismiss_reason?: string | null }, today: string): boolean {
  return f.state === "dismissed" && exceptionLapsed(f.dismiss_reason, today);
}

export interface SignEvent { id?: number; actor: string; role: string; action: string; at: string; detail?: Record<string, unknown> }

/**
 * Anything after which an earlier compliance sign-off no longer counts: the draft went back to the creator or was
 * resubmitted, was sent back by a Brand Kit change, was approved, or its findings were decided differently since.
 */
const RESETS = new Set(["submitted", "changes_requested", "reapproval_needed", "approved", "finding_dismissed", "finding_reopened", "exception_lapsed"]);

/**
 * The compliance sign-off that still stands on a high-risk draft, derived from the events log
 * (action "approved_partial" with role "compliance"), or null when there is none.
 */
export function complianceSignOff(events: SignEvent[]): { actor: string; at: string; user_id?: string } | null {
  const ordered = [...events].sort((a, b) => (a.id !== undefined && b.id !== undefined ? a.id - b.id : a.at.localeCompare(b.at)));
  let signed: { actor: string; at: string; user_id?: string } | null = null;
  for (const e of ordered) {
    if (RESETS.has(e.action)) signed = null;
    else if (e.action === "approved_partial" && e.role === "compliance") signed = { actor: e.actor, at: e.at, ...(typeof e.detail?.user_id === "string" ? { user_id: e.detail.user_id } : {}) };
  }
  return signed;
}

interface ReceiptLike { approver: string; approver_role: string; at: string; findings_summary: Record<string, unknown> }

/** Everyone who signed a receipt, in order. Receipts from before dual sign-off name one approver. */
export function approversOf(r: ReceiptLike): { name: string; role: string; at: string; user_id?: string }[] {
  const list = r.findings_summary?.approvers;
  if (Array.isArray(list) && list.length) return list as { name: string; role: string; at: string; user_id?: string }[];
  return [{ name: r.approver, role: r.approver_role, at: r.at }];
}

/** The exceptions a receipt was approved with, and their end dates (read from the dismissals of older receipts). */
export function exceptionsOf(r: ReceiptLike): { rule: string; quote?: string; until: string | null; by?: string | null }[] {
  const list = r.findings_summary?.exceptions;
  if (Array.isArray(list)) return list as { rule: string; quote?: string; until: string | null; by?: string | null }[];
  const dismissals = (r.findings_summary?.dismissals ?? []) as { rule: string; reason?: string | null; by?: string | null }[];
  return dismissals.flatMap((d) => {
    const ex = parseException(d.reason);
    return ex ? [{ rule: d.rule, until: ex.until, by: d.by }] : [];
  });
}

const ROLE_WORD: Record<string, string> = { compliance: "compliance", brand: "brand", manager: "brand manager", creator: "creator" };

/** "Kavya (compliance) and Arjun (brand)": the receipt's approver line. */
export function approverLabel(approvers: { name: string; role: string }[]): string {
  const parts = approvers.map((a) => `${a.name} (${ROLE_WORD[a.role] ?? a.role})`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "";
}
