"use client";
import { useId, useState } from "react";
import { Button, Notice, inputCls } from "@/components/ui";
import { api, fmtDate, useApp } from "@/lib/client";
import { REVIEWER_ROLES } from "@/lib/live";

interface Invite { id: number; created_at: string; created_by: string; expires_at: string }

/**
 * "Invite a teammate": a join link to this workspace, so a second person can work on the same drafts in their own
 * browser. Made and revoked by a reviewer or the brand manager. The link is shown once; only its hash is stored.
 */
export function InviteTeammate({ draftId, onChange }: { draftId: string; onChange?: () => void }) {
  const { role, setRole } = useApp();
  const can = REVIEWER_ROLES.includes(role);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ url: string; invite: Invite } | null>(null);
  const [others, setOthers] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const panel = useId();

  async function list() {
    try { setOthers((await api<{ invites: Invite[] }>("/api/invites")).invites); } catch { /* the list is a convenience */ }
  }
  async function create() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const r = await api<{ url: string; invite: Invite }>("/api/invites", { draft_id: draftId });
      setMade(r);
      await list();
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: number) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/invites/${id}`, undefined, "DELETE");
      if (made?.invite.id === id) setMade(null);
      await list();
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || !can) return;
    // The first open makes a link; later opens show it again instead of making another.
    if (!made) await create(); else await list();
  }
  async function copy() {
    if (!made) return;
    try { await navigator.clipboard.writeText(made.url); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <div className="text-sm">
      <Button aria-expanded={open} aria-controls={panel} onClick={toggle}>Invite a teammate</Button>
      {open && (
        <div id={panel} className="mt-2 max-w-xl space-y-2 rounded-md border border-line bg-white p-3">
          {!can ? (
            <>
              <p>A join link lets a second person work on these drafts in their own browser. It is made by a reviewer or the brand manager.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setRole("manager")}>Act as Meera (brand manager)</Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted">Send this link to a teammate. Opening it explains what joining means; pressing Join opens this workspace in their browser, on this draft. Changes either of you make show up for the other within seconds.</p>
              {busy && !made && <p role="status" className="text-muted">Making a join link…</p>}
              {made && (
                <>
                  <label className="block">
                    <span className="text-xs text-muted">Join link</span>
                    <input readOnly className={inputCls + " mt-1 font-mono text-xs"} value={made.url} onFocus={(e) => e.currentTarget.select()} />
                  </label>
                  <p className="text-xs text-muted">Valid until {fmtDate(made.invite.expires_at)} (7 days). Only a fingerprint of the link is stored, so copy it now: it cannot be shown again.</p>
                </>
              )}
              {error && <Notice tone="error">{error}</Notice>}
              <div className="flex flex-wrap items-center gap-2">
                {made && <Button variant="primary" onClick={copy}>{copied ? "Copied" : "Copy link"}</Button>}
                {made && <Button variant="danger" disabled={busy} onClick={() => revoke(made.invite.id)}>Revoke this link</Button>}
                {!made && !busy && <Button variant="primary" onClick={create}>Make a join link</Button>}
                <Button variant="ghost" onClick={() => setOpen(false)}>Done</Button>
              </div>
              {others.filter((o) => o.id !== made?.invite.id).length > 0 && (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer select-none hover:text-ink">{others.filter((o) => o.id !== made?.invite.id).length} other active join link{others.filter((o) => o.id !== made?.invite.id).length === 1 ? "" : "s"}</summary>
                  <ul className="mt-1.5 space-y-1">
                    {others.filter((o) => o.id !== made?.invite.id).map((o) => (
                      <li key={o.id} className="flex flex-wrap items-center gap-2">
                        <span>Made by {o.created_by}, {fmtDate(o.created_at)} · valid until {fmtDate(o.expires_at)}</span>
                        <Button variant="ghost" disabled={busy} aria-label={`Revoke the join link made by ${o.created_by} on ${fmtDate(o.created_at)}`} onClick={() => revoke(o.id)}>Revoke</Button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
