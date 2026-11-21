import { createClient } from "@supabase/supabase-js";
import { db } from "./db";
import type { Role } from "./types";

// Optional real accounts. A workspace with no rows in `members` is an unclaimed demo workspace and works exactly as
// before (x-role picks the persona). Once someone signs up in it, it is claimed: every request needs a member's
// Supabase access token, and the role comes from the members table. The check runs once, in src/proxy.ts.

export const MEMBER_ROLES: Role[] = ["creator", "brand", "compliance", "manager"];
export interface Member { ws: string; user_id: string; role: Role; name: string; created_at: string }

export function isMemberRole(r: unknown): r is Role {
  return typeof r === "string" && (MEMBER_ROLES as string[]).includes(r);
}

/** The table is not there yet (migration 010 not applied): treat every workspace as unclaimed. */
export function isMissingTable(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === "42P01" || e.code === "PGRST205" || /could not find the table|relation .* does not exist/i.test(e.message ?? "");
}

export type Access =
  | { kind: "demo" }
  | { kind: "member"; member: Member }
  | { kind: "denied"; status: 401 | 403; error: string };

/**
 * The decision for one request: demo (unclaimed), a member (role from the table), or refused. Pure. `members` is the
 * list the caller can see (members_of shows it only to a member, so a non-member sees none).
 */
export function resolveAccess(claimed: boolean, members: Member[], userId: string | null): Access {
  if (!claimed) return { kind: "demo" };
  if (!userId) return { kind: "denied", status: 401, error: "This workspace belongs to an organisation. Sign in as one of its members to open it." };
  const m = members.find((x) => x.user_id === userId);
  if (!m) return { kind: "denied", status: 403, error: "You are signed in, but you are not a member of this workspace. Ask its manager for an invite link." };
  return { kind: "member", member: m };
}

/** Whether a change leaves the workspace without a manager (refused). `next` is the new role, or null to remove. */
export function leavesNoManager(members: Member[], userId: string, next: Role | null): boolean {
  const target = members.find((m) => m.user_id === userId);
  if (!target || target.role !== "manager" || next === "manager") return false;
  return members.filter((m) => m.role === "manager").length <= 1;
}

/** The function is not there yet (migration 010 not applied): treat every workspace as unclaimed. */
export function isMissingFunction(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return isMissingTable(e) || e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message ?? "");
}

/** A Postgres error raised by the members functions, as an HTTP status (P0403 → 403 and so on). */
export function statusOf(e: { code?: string } | null | undefined): number {
  const m = /^P0(4\d\d)$/.exec(e?.code ?? "");
  if (m) return Number(m[1]);
  if (e?.code === "28000") return 401;
  if (e?.code === "22023") return 400;
  return 500;
}

/** A database client acting as the signed-in user, so auth.uid() is set inside the members functions. */
export function userDb(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** Whether the workspace has members. Null when migration 010 is missing. Other errors throw. */
export async function isClaimed(ws: string): Promise<boolean | null> {
  const r = await db().rpc("workspace_claimed", { p_ws: ws });
  if (r.error) {
    if (isMissingFunction(r.error)) return null;
    throw new Error(r.error.message);
  }
  return r.data === true;
}

/** The workspace's members, newest first, as seen by a signed-in member (empty for a non-member). */
export async function membersOf(ws: string, token: string): Promise<Member[]> {
  const r = await userDb(token).rpc("members_of", { p_ws: ws });
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as Member[];
}

/** Every workspace the signed-in user belongs to, most recent first. Null when migration 010 is missing. */
export async function membershipsOf(token: string): Promise<Member[] | null> {
  const r = await userDb(token).rpc("my_workspaces");
  if (r.error) {
    if (isMissingFunction(r.error)) return null;
    throw new Error(r.error.message);
  }
  return (r.data ?? []) as Member[];
}

/** A Supabase client with no stored session, for auth calls made by the server. */
export function authClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A sign-in token from Authorization: Bearer. API keys (gw_…) are not JWT-shaped and are left to /api/v1 and MCP. */
export function bearerOf(req: Request): string | null {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)\s*$/i);
  return m && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(m[1]) ? m[1] : null;
}

export interface AuthUser { id: string; email: string | null; name: string | null }
const verified = new Map<string, AuthUser & { until: number }>();

/** The user a Supabase access token belongs to, checked with Supabase Auth (cached 30 s per token). Null if invalid. */
export async function userOf(token: string | null): Promise<AuthUser | null> {
  if (!token) return null;
  const now = Date.now();
  const hit = verified.get(token);
  if (hit && hit.until > now) return { id: hit.id, email: hit.email, name: hit.name };
  const { data, error } = await authClient().auth.getUser(token);
  if (error || !data.user) return null;
  if (verified.size > 2000) verified.clear();
  const meta = data.user.user_metadata?.name;
  const u: AuthUser = { id: data.user.id, email: data.user.email ?? null, name: typeof meta === "string" ? meta : null };
  verified.set(token, { ...u, until: now + 30_000 });
  return u;
}

export function cleanName(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  return s || fallback;
}

/** An audit event for account changes, in the workspace's own activity log. Never fails the request. */
export async function audit(ws: string, by: { name: string; role: string; userId?: string }, action: string, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    await db().from("events").insert({ ws, draft_id: null, actor: by.name, role: by.role, action, detail: by.userId ? { ...detail, user_id: by.userId } : detail });
  } catch { /* the audit line is best effort */ }
}
