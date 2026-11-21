"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, Notice } from "@/components/ui";
import { api, fmtDate, useApp } from "@/lib/client";
import { ROLES, type Role } from "@/lib/types";

interface Row { user_id: string; name: string; role: Role; created_at: string; you: boolean }

/** Members of an organisation's workspace. A manager changes roles and removes members; everyone else reads. */
export default function TeamPage() {
  const { account } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const manager = account?.member && account.role === "manager";

  const load = useCallback(async () => {
    try { setRows((await api<{ members: Row[] }>("/api/members")).members); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { if (account?.member) queueMicrotask(load); }, [account?.member, load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  if (!account?.member) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <h1>Members</h1>
        <p className="mt-2 text-sm text-muted">This is a demo workspace, so it has no members: anyone with this browser can act as any role. Use Sign in in the header to make it your organisation&apos;s private workspace.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl">
      <h1>Members</h1>
      <p className="mt-1 text-sm text-muted">Who can open this workspace, and with which role. Add people with “Invite a teammate” on a draft.</p>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <table className="mt-4 w-full text-sm">
        <thead><tr className="text-left text-xs text-muted"><th className="py-1">Name</th><th>Role</th><th>Joined</th><th /></tr></thead>
        <tbody>
          {(rows ?? []).map((m) => (
            <tr key={m.user_id} className="border-t border-line">
              <td className="py-2">{m.name}{m.you ? " (you)" : ""}</td>
              <td>
                {manager ? (
                  <select aria-label={`Role of ${m.name}`} value={m.role} disabled={busy} onChange={(e) => act(() => api("/api/members", { user_id: m.user_id, role: e.target.value }, "PATCH"))} className="rounded-md border border-line bg-white px-2 py-1">
                    {(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r].title}</option>)}
                  </select>
                ) : ROLES[m.role]?.title ?? m.role}
              </td>
              <td className="text-muted">{fmtDate(m.created_at)}</td>
              <td className="text-right">
                {manager && <Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm(`Remove ${m.name} from this workspace?`)) act(() => api("/api/members", { user_id: m.user_id }, "DELETE")); }}>Remove</Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
