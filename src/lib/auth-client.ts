"use client";
// The browser side of optional sign-in. The session (Supabase access and refresh tokens) lives in localStorage under
// "gw-auth". Nothing is stored, and no header is added, for a visitor who never signs in.

export interface Session { access_token: string; refresh_token: string; expires_at: number | null }
const KEY = "gw-auth";

export function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return typeof s?.access_token === "string" && typeof s?.refresh_token === "string" ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null): void {
  try {
    if (s) window.localStorage.setItem(KEY, JSON.stringify(s));
    else window.localStorage.removeItem(KEY);
  } catch { /* storage blocked */ }
}

let refreshing: Promise<Session | null> | null = null;

/** A current access token, refreshed through the server when it is about to expire. Null when not signed in. */
export async function accessToken(): Promise<string | null> {
  const s = loadSession();
  if (!s) return null;
  if (!s.expires_at || s.expires_at * 1000 - Date.now() > 60_000) return s.access_token;
  refreshing ??= (async () => {
    try {
      const res = await fetch("/api/account/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh_token }), cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.session) { saveSession(null); return null; }
      saveSession(j.session);
      return j.session as Session;
    } finally {
      refreshing = null;
    }
  })();
  return (await refreshing)?.access_token ?? null;
}

export async function authHeader(): Promise<Record<string, string>> {
  const t = await accessToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}
