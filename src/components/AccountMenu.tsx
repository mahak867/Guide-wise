"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { saveSession, type Session } from "@/lib/auth-client";
import { api, currentWorkspace, setWorkspace, useApp, type Account } from "@/lib/client";
import { ROLES } from "@/lib/types";
import { Button, Notice, inputCls } from "./ui";

/** Claim the current workspace; if it already belongs to someone, start a fresh one and claim that. */
async function claimHere(name: string): Promise<void> {
  try {
    await api("/api/account", { action: "claim", name });
  } catch (e) {
    if (!/already belongs|claimed a moment ago/.test(e instanceof Error ? e.message : "")) throw e;
    setWorkspace(crypto.randomUUID());
    await api("/api/account", { action: "claim", name });
  }
}

/**
 * Sign in or create an account (email and password). By default, afterwards: a new account claims this workspace and
 * becomes its manager; signing in opens the user's workspace (a chooser when there are several). `onSession`
 * replaces that, for the join page.
 */
export function AccountDialog({ open, onClose, onSession }: { open: boolean; onClose: () => void; onSession?: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [choices, setChoices] = useState<Account["workspaces"] | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function finish(ws?: string) {
    if (ws) setWorkspace(ws);
    await api("/api/account", { action: "signed_in" }).catch(() => undefined);
    window.location.assign("/");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const j = await api<{ session: Session | null; confirm?: boolean; message?: string }>(`/api/account/${mode}`, { email, password, ...(mode === "signup" ? { name } : {}) });
      if (!j.session) { setInfo(j.message ?? "Check your email to confirm the account, then sign in."); setMode("signin"); return; }
      saveSession(j.session);
      if (onSession) { await onSession(); return; }
      if (mode === "signup") { await claimHere(name); await finish(); return; }
      const me = await api<{ memberships: Account["workspaces"] }>("/api/account");
      if (me.memberships.length === 0) { await claimHere(name || email.split("@")[0]); await finish(); return; }
      if (me.memberships.length === 1) { await finish(me.memberships[0].ws); return; }
      setChoices(me.memberships);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="gw-acct-title" className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-md border border-line bg-paper p-5 text-sm text-ink backdrop:bg-black/40">
      <h2 id="gw-acct-title" className="text-base font-semibold">{choices ? "Choose a workspace" : mode === "signin" ? "Sign in" : "Create an account"}</h2>
      {choices ? (
        <ul className="mt-3 space-y-2">
          {choices.map((c, i) => (
            <li key={c.ws}>
              <Button variant={i === 0 ? "primary" : "secondary"} className="w-full text-left" onClick={() => finish(c.ws)}>
                {c.name} · {ROLES[c.role]?.title ?? c.role} {i === 0 ? "(most recent)" : ""}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <p className="text-xs text-muted">Signing in turns this workspace into your organisation&apos;s private one: only its members can open it. The demo works without signing in.</p>
          {mode === "signup" && (
            <label className="block"><span className="text-xs text-muted">Your name</span><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="name" /></label>
          )}
          <label className="block"><span className="text-xs text-muted">Email</span><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label className="block"><span className="text-xs text-muted">Password</span><input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "signup" ? 8 : 1} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></label>
          {error && <Notice tone="error">{error}</Notice>}
          {info && <Notice tone="ok">{info}</Notice>}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" type="submit" disabled={busy}>{busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}</Button>
            <Button type="button" variant="ghost" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}>
              {mode === "signin" ? "Create an account instead" : "I have an account"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      )}
    </dialog>
  );
}

export async function signOut(): Promise<void> {
  await api("/api/account", { action: "signed_out" }).catch(() => undefined);
  saveSession(null);
  // A fresh demo workspace: the organisation's workspace now refuses this browser.
  setWorkspace(crypto.randomUUID());
  window.location.assign("/");
}

/** "Sign in" in the header, or, for a member of this workspace, who is signed in. */
export function AccountMenu() {
  const { account } = useApp();
  const [open, setOpen] = useState(false);
  if (account?.member) {
    return (
      <span className="flex items-center gap-2">
        <span>Signed in as <b>{account.name}</b> · {ROLES[account.role]?.title ?? account.role}</span>
        {account.role === "manager" && <Link href="/team" className="text-muted underline">Members</Link>}
        <Button variant="ghost" onClick={signOut}>Sign out</Button>
      </span>
    );
  }
  if (account) {
    // Signed in, but this browser is on a workspace the user is not a member of (for example a demo workspace).
    const mine = account.workspaces[0];
    return (
      <span className="flex items-center gap-2">
        {!account.claimed && <Button onClick={async () => { await claimHere(account.name); window.location.assign("/"); }}>Make this workspace yours</Button>}
        {mine && mine.ws !== currentWorkspace() && <Button onClick={() => { setWorkspace(mine.ws); window.location.assign("/"); }}>Open my workspace</Button>}
        <Button variant="ghost" onClick={signOut}>Sign out</Button>
      </span>
    );
  }
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>Sign in</Button>
      <AccountDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
