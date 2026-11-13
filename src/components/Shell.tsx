"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api, useApp } from "@/lib/client";
import { ROLES, type Role } from "@/lib/types";
import { Badge, Button, Notice } from "./ui";

const NAV = [
  { href: "/", label: "Reviews" },
  { href: "/review/new", label: "New review" },
  { href: "/kit", label: "Brand Kit" },
  { href: "/facts", label: "Facts and assets" },
  { href: "/about", label: "How it works" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { role, setRole, state, error, refresh } = useApp();
  const path = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function reset() {
    if (!window.confirm("Reset the demo? This removes every draft and restores the PrepPath rules and facts.")) return;
    setBusy(true);
    try {
      await api("/api/reset", {});
      await refresh();
      router.push("/");
      router.refresh();
      window.dispatchEvent(new Event("gw-reset"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-sm text-white">G</span>
            Guidewise
          </Link>
          <nav aria-label="Main" className="flex flex-wrap gap-1 text-sm">
            {NAV.map((n) => {
              const on = n.href === "/" ? path === "/" || (path.startsWith("/review/") && path !== "/review/new") : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`rounded-md px-2.5 py-1.5 ${on ? "bg-brand-soft font-medium text-brand-dark" : "text-muted hover:bg-mist hover:text-ink"}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            {state && (
              <span title={state.ai.available ? `AI checks on (${state.ai.model})` : "AI service is off. Code checks and the full workflow still run."}>
                <Badge tone={state.ai.available ? "green" : "major"}>{state.ai.available ? "AI checks on" : "Rules-only mode"}</Badge>
              </span>
            )}
            {state && <Badge>{state.kit.name} · Kit v{state.kit.version}</Badge>}
            <label className="flex items-center gap-1.5">
              <span className="text-muted">Acting as</span>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-md border border-line bg-white px-2 py-1.5 font-medium">
                {(Object.keys(ROLES) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLES[r].name} · {ROLES[r].title}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={reset} disabled={busy}>{busy ? "Resetting…" : "Reset demo"}</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {error && (
          <div className="mb-4">
            <Notice tone="error">Guidewise could not load the workspace: {error}</Notice>
          </div>
        )}
        {children}
      </main>
      <footer className="border-t border-line bg-white px-4 py-3 text-center text-xs text-muted">
        Guidewise · CodeNova India 2026, Round 2 · PrepPath Academy is a fictional brand written for this demo · Guidewise supports reviewers; it does not give legal advice.
      </footer>
    </div>
  );
}
