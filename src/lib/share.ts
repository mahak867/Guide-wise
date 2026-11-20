import { createHash, randomBytes } from "node:crypto";
import { approversOf, exceptionsOf, parseException } from "./approval";
import { db, must } from "./db";
import { redact } from "./engine/redact";
import { checksOf, type CheckRun } from "./record";
import { CONTENT_TYPES, ROLES, type Finding, type Role } from "./types";
import { getDraft, getFindings } from "./workflow";

// Read-only share links for an approval record. The link carries a random 32-byte token; only its SHA-256 hash is
// stored, in an event row ("share_created"), so a database reader cannot rebuild a link. Revoking adds a
// "share_revoked" event naming the share. No migration: the events table already holds everything needed.

export const SHARE_DAYS = 30;
export const MAX_ACTIVE_SHARES = 20;
const DAY = 864e5;

/** A new token: 32 random bytes, base64url (43 characters, no padding). */
export function newShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the shape a real token can have is looked up; anything else is not found without touching the database. */
export function isShareToken(t: unknown): t is string {
  return typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function shareExpiry(from: Date = new Date(), days = SHARE_DAYS): string {
  return new Date(from.getTime() + days * DAY).toISOString();
}

export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/r/${token}`;
}

export interface ShareEvent { id: number; actor: string; role: string; action: string; at: string; detail: Record<string, unknown> }
export interface Share { id: number; created_at: string; created_by: string; expires_at: string; revoked_at: string | null; revoked_by: string | null; active: boolean }

export function isExpired(expiresAt: unknown, now: Date = new Date()): boolean {
  const t = typeof expiresAt === "string" ? Date.parse(expiresAt) : NaN;
  return !Number.isFinite(t) || t <= now.getTime();
}

/** The shares of one draft, from its events, newest first. Never includes the hash. */
export function sharesOf(events: ShareEvent[], now: Date = new Date()): Share[] {
  const revoked = new Map<string, ShareEvent>();
  for (const e of events) if (e.action === "share_revoked" && e.detail?.share_id !== undefined) revoked.set(String(e.detail.share_id), e);
  return events
    .filter((e) => e.action === "share_created")
    .map((e) => {
      const r = revoked.get(String(e.id)) ?? null;
      const expires_at = String(e.detail?.expires_at ?? "");
      return {
        id: e.id, created_at: e.at, created_by: String(e.detail?.created_by ?? e.actor), expires_at,
        revoked_at: r?.at ?? null, revoked_by: r?.actor ?? null, active: !r && !isExpired(expires_at, now),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Events as the workspace sees them: the stored token hash is never sent anywhere. */
export function withoutHashes<T extends { detail?: Record<string, unknown> | null }>(events: T[]): T[] {
  return events.map((e) => {
    if (!e.detail || !("hash" in e.detail)) return e;
    const { hash: _hash, ...detail } = e.detail;
    void _hash;
    return { ...e, detail };
  });
}

// A modest per-address limit on public lookups, so tokens cannot be guessed at speed. In memory, per server instance.
const lookups = new Map<string, number[]>();
export function shareLookupAllowed(ip: string, perMinute = 30, now = Date.now()): boolean {
  if (lookups.size > 5000) for (const [k, v] of lookups) if (!v.some((t) => now - t < 60_000)) lookups.delete(k);
  const hits = (lookups.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= perMinute) {
    lookups.set(ip, hits);
    return false;
  }
  hits.push(now);
  lookups.set(ip, hits);
  return true;
}

export function clientIp(h: Headers): string {
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

/** Create a link for an approved draft. The caller has checked the workspace, the draft and its status. */
export async function createShare(ws: string, draftId: string, by: { name: string; role: string }, receiptId: string | null, origin: string) {
  const d = db();
  const events = must(await d.from("events").select("id, actor, role, action, at, detail").eq("ws", ws).eq("draft_id", draftId).in("action", ["share_created", "share_revoked"])) as ShareEvent[];
  if (sharesOf(events).filter((s) => s.active).length >= MAX_ACTIVE_SHARES) return null;
  const token = newShareToken();
  const expires_at = shareExpiry();
  const row = must(await d.from("events").insert({
    ws, draft_id: draftId, actor: by.name, role: by.role, action: "share_created",
    detail: { hash: hashShareToken(token), expires_at, created_by: by.name, receipt_id: receiptId },
  }).select("id, at").single()) as { id: number; at: string };
  return { url: shareUrl(origin, token), expires_at, share: { id: row.id, created_at: row.at, created_by: by.name, expires_at, revoked_at: null, revoked_by: null, active: true } satisfies Share };
}

export interface PublicRecord {
  title: string;
  content_type: string;
  approved_at: string;
  approvers: { name: string; role: string; at: string }[];
  sign_off: "single" | "dual";
  risk_tier: string | null;
  kit_version: number;
  draft_version: number | null;
  fingerprint: string;
  approved_text: string;
  findings: { rule: string; rule_title: string; severity: string; words: string; fix: string | null; outcome: string; by: string | null }[];
  exceptions: { rule: string; words: string | null; until: string | null; by: string | null }[];
  checks: CheckRun[];
  still_approved: boolean;
  shared_at: string;
  expires_at: string;
}

const STATE: Record<string, string> = { accepted: "Fixed (fix accepted)", resolved: "Fixed (text edited)", dismissed: "Dismissed with a reason", open: "Open suggestion" };

/**
 * The public copy of an approval record for a share token, or null when the token is unknown, expired or revoked.
 * Only the record's content leaves: no workspace, draft id, intent, author, images, documents or activity log.
 * Words quoted from earlier versions are kept only if they are in the approved text; otherwise contact details
 * and ID numbers in them are masked, as they are before any AI call.
 */
export async function lookupShare(token: string, now: Date = new Date()): Promise<PublicRecord | null> {
  if (!isShareToken(token)) return null;
  const d = db();
  const ev = must(await d.from("events").select("id, ws, draft_id, at, detail").eq("action", "share_created").eq("detail->>hash", hashShareToken(token)).limit(1).maybeSingle()) as
    { id: number; ws: string; draft_id: string | null; at: string; detail: Record<string, unknown> } | null;
  if (!ev || !ev.draft_id || isExpired(ev.detail?.expires_at, now)) return null;
  const revoked = must(await d.from("events").select("id").eq("ws", ev.ws).eq("draft_id", ev.draft_id).eq("action", "share_revoked").eq("detail->>share_id", String(ev.id)).limit(1)) as unknown[];
  if (revoked.length) return null;
  const draft = await getDraft(ev.ws, ev.draft_id);
  if (!draft) return null;
  const pinned = typeof ev.detail?.receipt_id === "string" ? ev.detail.receipt_id : null;
  const rq = d.from("receipts").select("*").eq("draft_id", draft.id);
  const r = must(await (pinned ? rq.eq("id", pinned) : rq.order("at", { ascending: false })).limit(1).maybeSingle()) as
    { text_hash: string; approved_text: string; kit_version: number; approver: string; approver_role: string; at: string; findings_summary: Record<string, unknown> } | null;
  if (!r) return null;
  const findings = await getFindings(draft.id);
  const text = r.approved_text;
  const scrub = (s: string | null | undefined) => (!s ? "" : text.includes(s) ? s : redact(s).text);
  const roleTitle = (role: string) => ROLES[role as Role]?.title ?? role;
  const outcome = (f: Finding) => {
    const ex = f.state === "dismissed" ? parseException(f.dismiss_reason) : null;
    if (ex) return `Approved exception, ${ex.until ? `valid until ${ex.until}` : "no end date"}`;
    return `${STATE[f.state ?? "open"] ?? f.state}${f.dismiss_reason ? `: ${scrub(f.dismiss_reason)}` : ""}`;
  };
  const fs = r.findings_summary ?? {};
  return {
    title: draft.title,
    content_type: CONTENT_TYPES.find((t) => t.v === draft.content_type)?.l ?? "Draft",
    approved_at: r.at,
    approvers: approversOf(r).map((a) => ({ name: a.name, role: roleTitle(a.role), at: a.at })),
    sign_off: fs.sign_off === "dual" ? "dual" : "single",
    risk_tier: typeof fs.risk_tier === "string" ? fs.risk_tier : draft.risk_tier,
    kit_version: r.kit_version,
    draft_version: typeof fs.draft_version === "number" ? fs.draft_version : null,
    fingerprint: r.text_hash,
    approved_text: text,
    findings: findings.map((f) => ({
      rule: f.rule_id, rule_title: f.rule_text || f.rule_id, severity: f.severity, words: scrub(f.quote),
      fix: f.state === "accepted" && f.fix ? scrub(f.fix) : null, outcome: outcome(f),
      by: f.resolved_by && f.resolved_by !== "edit" ? f.resolved_by : null,
    })),
    exceptions: exceptionsOf(r).map((x) => ({ rule: x.rule, words: x.quote ? scrub(x.quote) : null, until: x.until, by: x.by ?? null })),
    checks: checksOf(draft as Parameters<typeof checksOf>[0]),
    still_approved: draft.status === "approved",
    shared_at: ev.at,
    expires_at: String(ev.detail.expires_at),
  };
}
