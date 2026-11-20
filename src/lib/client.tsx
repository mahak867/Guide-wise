"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authHeader, loadSession } from "./auth-client";
import type { Fact, Kit, Role, Rule } from "./types";

export interface AppState {
  kit: Kit;
  rules: Rule[];
  facts: Fact[];
  ai: { available: boolean; model: string };
}

let currentRole: Role = "creator";
let workspace = "";

/** Switch this browser to another workspace (after sign-in or sign-out). The caller reloads the page. */
export function setWorkspace(ws: string): void {
  workspace = ws;
  try { window.localStorage.setItem("gw-ws", ws); } catch { /* storage blocked */ }
}

export function currentWorkspace(): string {
  return getWorkspace();
}

/** One private demo workspace per browser, so visitors never see or reset each other's work. */
function getWorkspace(): string {
  if (workspace) return workspace;
  try {
    workspace = window.localStorage.getItem("gw-ws") ?? "";
    if (!/^[a-z0-9-]{8,48}$/.test(workspace)) {
      workspace = crypto.randomUUID();
      window.localStorage.setItem("gw-ws", workspace);
    }
  } catch {
    workspace = crypto.randomUUID();
  }
  return workspace;
}

export async function api<T = Record<string, unknown>>(path: string, body?: unknown, method?: string): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "x-role": currentRole, "x-workspace": getWorkspace(), ...(await authHeader()), ...(body !== undefined && !isForm ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    cache: "no-store",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `The server returned an error (${res.status}). Try again.`;
    throw Object.assign(new Error(msg), { data });
  }
  // A fact or rule change reports which drafts it touched; the Impact panel shows it on any page.
  const impact = (data as { impact?: unknown } | null)?.impact;
  if (impact && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("gw-impact", { detail: impact }));
  return data as T;
}

/** The signed-in user, and whether they are a member of the current (claimed) workspace. */
export interface Account { name: string; role: Role; email: string | null; workspaces: { ws: string; role: Role; name: string; created_at: string }[]; member: boolean; claimed: boolean }

interface Ctx {
  account: Account | null;
  loadAccount: () => Promise<void>;
  role: Role;
  setRole: (r: Role) => void;
  state: AppState | null;
  error: string | null;
  refresh: () => Promise<void>;
}
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>("creator");
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);

  const loadAccount = useCallback(async () => {
    if (!loadSession()) { setAccount(null); return; }
    try {
      const j = await api<{ user: { email: string | null; name: string | null }; memberships: Account["workspaces"]; current: { role: Role; name: string } | null; claimed: boolean }>("/api/account");
      const cur = j.current;
      if (cur) { currentRole = cur.role; setRoleState(cur.role); }
      setAccount({ name: cur?.name ?? j.user.name ?? j.user.email ?? "", role: cur?.role ?? currentRole, email: j.user.email, workspaces: j.memberships, member: !!cur, claimed: j.claimed });
    } catch {
      setAccount(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await api<AppState>("/api/state"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let saved: Role | null = null;
    try {
      saved = window.localStorage.getItem("gw-role") as Role | null;
    } catch {
      /* storage blocked */
    }
    if (saved && ["creator", "brand", "compliance", "manager"].includes(saved)) currentRole = saved;
    const role = currentRole;
    // A shared read-only record (/r/…) needs no workspace, so none is created or loaded for its visitor; nor does a
    // join link (/join/…), which replaces the browser's workspace when its visitor presses Join.
    const shared = window.location.pathname.startsWith("/r/") || window.location.pathname.startsWith("/join/");
    queueMicrotask(() => {
      setRoleState(role);
      if (!shared) refresh();
      loadAccount();
    });
  }, [refresh, loadAccount]);

  const setRole = useCallback((r: Role) => {
    currentRole = r;
    try {
      window.localStorage.setItem("gw-role", r);
    } catch {
      /* storage blocked */
    }
    setRoleState(r);
  }, []);

  return <AppCtx.Provider value={{ account, loadAccount, role, setRole, state, error, refresh }}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp must be used inside AppProvider");
  return c;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
