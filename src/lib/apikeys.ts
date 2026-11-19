import { createHash, randomBytes } from "node:crypto";
import { db, must } from "./db";

// API keys: shown once at creation, stored only as a SHA-256 hash, scoped, revocable, and every call audited.
export const SCOPES = { "brief:read": "Read the brief (rules in force, facts valid today)", "draft:check": "Check a draft" } as const;
export type Scope = keyof typeof SCOPES;
export interface ApiKey { id: string; ws: string; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null }

const hashOf = (k: string) => createHash("sha256").update(k).digest("hex");

export async function createKey(ws: string, name: string, scopes: Scope[]): Promise<{ key: string; row: ApiKey }> {
  const key = `gw_${randomBytes(24).toString("hex")}`;
  const row = must(await db().from("api_keys").insert({ ws, name, prefix: key.slice(0, 10), hash: hashOf(key), scopes }).select("id,ws,name,prefix,scopes,created_at,last_used_at,revoked_at").single()) as ApiKey;
  return { key, row };
}

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Resolve the key in an Authorization: Bearer header, and check it holds the scope this call needs. */
export async function authorise(req: Request, scope: Scope): Promise<ApiKey> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(gw_[0-9a-f]{48})\s*$/i);
  if (!m) throw new ApiError(401, "Send an API key as: Authorization: Bearer gw_… Create one on the Developers page.");
  const k = must(await db().from("api_keys").select("id,ws,name,prefix,scopes,created_at,last_used_at,revoked_at").eq("hash", hashOf(m[1])).maybeSingle()) as ApiKey | null;
  if (!k || k.revoked_at) throw new ApiError(401, "This API key is not valid or has been revoked.");
  if (!k.scopes.includes(scope)) throw new ApiError(403, `This key does not have the "${scope}" scope.`);
  return k;
}

// A small per-key limit, so one client cannot use up the AI quota for everyone.
const recent = new Map<string, number[]>();
export function rateLimit(keyId: string, perMinute = 30) {
  const now = Date.now();
  const hits = (recent.get(keyId) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= perMinute) throw new ApiError(429, `Rate limit: ${perMinute} calls a minute per key. Try again shortly.`);
  hits.push(now);
  recent.set(keyId, hits);
}

/** Audit entry for every call, successful or not, against the key's workspace. */
export async function audit(k: ApiKey | null, ws: string, via: "rest" | "mcp", endpoint: string, status: number, ms: number, detail: Record<string, unknown> = {}) {
  const d = db();
  await d.from("events").insert({ ws, draft_id: null, actor: k ? `API key ${k.name} (${k.prefix}…)` : "API", role: "api", action: "api_call", detail: { key_id: k?.id ?? null, via, endpoint, status, ms, ...detail } });
  if (k) await d.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", k.id);
}
