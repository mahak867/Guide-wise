import { db, must } from "./db";
import { REVIEWER_ROLES } from "./live";
import { hashShareToken, isExpired, isShareToken, newShareToken } from "./share";

// Join links: "Invite a teammate" lets a second person open this workspace in their own browser and work on the same
// drafts. Built like the read-only share links (src/lib/share.ts): the link carries 32 random bytes; only their SHA-256
// hash is stored, in an "invite_created" event; revoking adds an "invite_revoked" event naming the invite; joining logs
// "invite_accepted". No migration: the events table holds everything. A demo reset wipes the workspace's events, and
// with them its invites.

export const INVITE_DAYS = 7;
export const MAX_ACTIVE_INVITES = 20;
const DAY = 864e5;
/** Who can create and revoke join links: the reviewers and the brand manager. */
export const INVITERS = REVIEWER_ROLES;

export const newInviteToken = newShareToken;
export const isInviteToken = isShareToken;
export const hashInviteToken = hashShareToken;

export function inviteExpiry(from: Date = new Date(), days = INVITE_DAYS): string {
  return new Date(from.getTime() + days * DAY).toISOString();
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/join/${token}`;
}

export interface InviteEvent { id: number; actor: string; role: string; action: string; at: string; draft_id?: string | null; detail: Record<string, unknown> }
export interface Invite { id: number; created_at: string; created_by: string; expires_at: string; draft_id: string | null; revoked_at: string | null; revoked_by: string | null; active: boolean }

/** The invites of one workspace, from its events, newest first. Never includes the hash. */
export function invitesOf(events: InviteEvent[], now: Date = new Date()): Invite[] {
  const revoked = new Map<string, InviteEvent>();
  for (const e of events) if (e.action === "invite_revoked" && e.detail?.invite_id !== undefined) revoked.set(String(e.detail.invite_id), e);
  return events
    .filter((e) => e.action === "invite_created")
    .map((e) => {
      const r = revoked.get(String(e.id)) ?? null;
      const expires_at = String(e.detail?.expires_at ?? "");
      return {
        id: e.id, created_at: e.at, created_by: String(e.detail?.created_by ?? e.actor), expires_at, draft_id: e.draft_id ?? null,
        revoked_at: r?.at ?? null, revoked_by: r?.actor ?? null, active: !r && !isExpired(expires_at, now),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Whether a stored invite still opens the workspace: not expired and not revoked. */
export function inviteUsable(ev: { detail?: Record<string, unknown> | null } | null, revoked: boolean, now: Date = new Date()): boolean {
  return !!ev && !revoked && !isExpired(ev.detail?.expires_at, now);
}

const COLS = "id, actor, role, action, at, draft_id, detail";

export async function listInvites(ws: string): Promise<Invite[]> {
  const evs = must(await db().from("events").select(COLS).eq("ws", ws).in("action", ["invite_created", "invite_revoked"])) as InviteEvent[];
  return invitesOf(evs);
}

/** Create a join link to the workspace. Null when it already has MAX_ACTIVE_INVITES active links. */
/**
 * Create a join link to the workspace. Null when it already has MAX_ACTIVE_INVITES active links. In an organisation's
 * workspace, `org` registers the link in the closed org_invites table first (as the signed-in manager); only that row
 * can add a member. The event row is still written, for the list and the join page.
 */
export async function createInvite(ws: string, draftId: string | null, by: { name: string; role: string }, origin: string, memberRole = "creator",
  org?: (hash: string, role: string, expiresAt: string) => Promise<string>) {
  if ((await listInvites(ws)).filter((i) => i.active).length >= MAX_ACTIVE_INVITES) return null;
  const token = newInviteToken();
  const expires_at = inviteExpiry();
  const orgInviteId = org ? await org(hashInviteToken(token), memberRole, expires_at) : null;
  const row = must(await db().from("events").insert({
    ws, draft_id: draftId, actor: by.name, role: by.role, action: "invite_created",
    detail: { hash: hashInviteToken(token), expires_at, created_by: by.name, member_role: memberRole, ...(orgInviteId ? { org_invite_id: orgInviteId } : {}) },
  }).select("id, at").single()) as { id: number; at: string };
  const invite: Invite = { id: row.id, created_at: row.at, created_by: by.name, expires_at, draft_id: draftId, revoked_at: null, revoked_by: null, active: true };
  return { url: inviteUrl(origin, token), expires_at, invite };
}

export interface FoundInvite { id: number; ws: string; draft_id: string | null; draft_title: string | null; created_by: string; created_at: string; expires_at: string; member_role: string }

/** The invite a token opens, or null when it is unknown, malformed, expired or revoked (all look the same). */
export async function lookupInvite(token: string, now: Date = new Date()): Promise<FoundInvite | null> {
  if (!isInviteToken(token)) return null;
  const d = db();
  const ev = must(await d.from("events").select("id, ws, draft_id, at, detail").eq("action", "invite_created").eq("detail->>hash", hashInviteToken(token)).limit(1).maybeSingle()) as
    { id: number; ws: string; draft_id: string | null; at: string; detail: Record<string, unknown> } | null;
  if (!ev) return null;
  const revoked = must(await d.from("events").select("id").eq("ws", ev.ws).eq("action", "invite_revoked").eq("detail->>invite_id", String(ev.id)).limit(1)) as unknown[];
  if (!inviteUsable(ev, revoked.length > 0, now)) return null;
  const draft = ev.draft_id ? (must(await d.from("drafts").select("title").eq("ws", ev.ws).eq("id", ev.draft_id).maybeSingle()) as { title: string } | null) : null;
  return {
    id: ev.id, ws: ev.ws, draft_id: draft ? ev.draft_id : null, draft_title: draft?.title ?? null,
    created_by: String(ev.detail?.created_by ?? ""), created_at: ev.at, expires_at: String(ev.detail?.expires_at ?? ""),
    member_role: typeof ev.detail?.member_role === "string" ? ev.detail.member_role : "creator",
  };
}
