"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Fact, Kit, Role, Rule } from "./types";

export interface AppState {
  kit: Kit;
  rules: Rule[];
  facts: Fact[];
  ai: { available: boolean; model: string };
}

let currentRole: Role = "creator";

export async function api<T = Record<string, unknown>>(path: string, body?: unknown, method?: string): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "x-role": currentRole, ...(body !== undefined && !isForm ? { "content-type": "application/json" } : {}) },
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
  return data as T;
}

interface Ctx {
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

  const refresh = useCallback(async () => {
    try {
      setState(await api<AppState>("/api/state"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("gw-role") as Role | null;
    if (saved && ["creator", "brand", "compliance", "manager"].includes(saved)) {
      currentRole = saved;
      setRoleState(saved);
    }
    refresh();
  }, [refresh]);

  const setRole = useCallback((r: Role) => {
    currentRole = r;
    window.localStorage.setItem("gw-role", r);
    setRoleState(r);
  }, []);

  return <AppCtx.Provider value={{ role, setRole, state, error, refresh }}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp must be used inside AppProvider");
  return c;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
