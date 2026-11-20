"use client";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { joinTarget } from "@/lib/live";

/** Join: ask the server for the workspace, make it this browser's workspace, then open the draft (or the reviews). */
export function JoinButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function join() {
    setBusy(true);
    setError(null);
    try {
      let role = "creator";
      try { role = window.localStorage.getItem("gw-role") || "creator"; } catch { /* storage blocked */ }
      const res = await fetch(`/api/join/${encodeURIComponent(token)}`, { method: "POST", headers: { "x-role": role }, cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ws) throw new Error(j?.error ?? `The server returned an error (${res.status}). Try again.`);
      try { window.localStorage.setItem("gw-ws", j.ws); } catch { throw new Error("This browser blocks site storage, so it cannot remember the workspace. Allow storage for this site and try again."); }
      // A full page load, so every part of the app starts again with the new workspace.
      window.location.assign(joinTarget(j.draft_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button variant="primary" disabled={busy} onClick={join}>{busy ? "Joining…" : "Join"}</Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
