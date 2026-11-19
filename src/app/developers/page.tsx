"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Field, Notice, PageHead, inputCls } from "@/components/ui";
import { Toast } from "@/components/Toast";
import { api, fmtDate, useApp } from "@/lib/client";
import { CONTENT_TYPES } from "@/lib/types";

interface Key { id: string; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null }
interface Call { actor: string; at: string; detail: { via: string; endpoint: string; status: number; ms: number; findings?: number; violations?: number; rules?: number; facts?: number } }
interface Finding { rule_id: string; severity: string; level: string; quote: string; message: string; fix: string | null }
const SAMPLE = "India's #1 JEE coaching. 100% selection guaranteed!! Join 50,000+ toppers who cracked JEE with PrepPath. Email priya.sharma@preppath.in.";

export default function Developers() {
  const { role, setRole } = useApp();
  const manager = role === "manager";
  const [data, setData] = useState<{ keys: Key[]; calls: Call[]; scopes: Record<string, string> } | null>(null);
  const [name, setName] = useState("Writing assistant");
  const [scopes, setScopes] = useState<string[]>(["brief:read", "draft:check"]);
  const [created, setCreated] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  // Playground
  const [key, setKey] = useState("");
  const [tool, setTool] = useState<"check_draft" | "get_brief">("check_draft");
  const [via, setVia] = useState<"rest" | "mcp">("rest");
  const [text, setText] = useState(SAMPLE);
  const [type, setType] = useState("social");
  const [useAi, setUseAi] = useState(false);
  const [out, setOut] = useState<{ status: number; body: unknown; ms: number; via: "rest" | "mcp" } | null>(null);

  const [origin, setOrigin] = useState("https://guidewise-kohl.vercel.app");
  const load = useCallback(() => api<NonNullable<typeof data>>("/api/keys").then(setData).catch((e) => setErr(String(e.message ?? e))), []);
  useEffect(() => { queueMicrotask(() => { setOrigin(window.location.origin); load(); }); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null); setCreated(null); setCopied(false);
    try {
      const r = await api<{ key: string }>("/api/keys", { name: name.trim(), scopes });
      setCreated(r.key); setKey(r.key);
      setMsg(`Key "${name.trim()}" created. Copy it now; it has also been filled into the playground.`);
      await load();
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    setBusy(false);
  }
  async function revoke(k: Key) {
    if (!window.confirm(`Revoke the key "${k.name}" (${k.prefix}…)? Any tool using it stops working at once. Its audit trail is kept.`)) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      await api(`/api/keys/${k.id}`, undefined, "DELETE");
      setMsg(`Key "${k.name}" revoked. Calls with it are now refused (401); its past calls stay in the audit trail.`);
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    await load(); // also clears a stale Revoke button if the key was already revoked in another tab
    setBusy(false);
  }
  async function copy() {
    if (!created) return;
    try { await navigator.clipboard.writeText(created); setCopied(true); } catch { setErr("Copying was blocked by the browser. Select the key and copy it by hand."); }
  }
  async function run() {
    setBusy(true); setOut(null);
    const t = performance.now();
    const auth = { authorization: `Bearer ${key.trim()}` };
    try {
      let res: Response;
      if (via === "rest") {
        res = tool === "get_brief"
          ? await fetch(`/api/v1/brief?content_type=${type}`, { headers: auth })
          : await fetch("/api/v1/check", { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ text, content_type: type, use_ai: useAi }) });
        setOut({ status: res.status, body: await res.json().catch(() => null), ms: Math.round(performance.now() - t), via });
      } else {
        const args = tool === "get_brief" ? { content_type: type } : { text, content_type: type, use_ai: useAi };
        res = await fetch("/api/mcp", { method: "POST", headers: { ...auth, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }) });
        const j = await res.json().catch(() => null);
        const result = j?.result;
        setOut({ status: result?.isError ? 400 : res.status, body: result?.structuredContent ?? result?.content?.[0]?.text ?? j?.error ?? j, ms: Math.round(performance.now() - t), via });
      }
    } catch (x) { setOut({ status: 0, body: x instanceof Error ? x.message : String(x), ms: 0, via }); }
    setBusy(false);
    load();
  }

  const body = out?.body as { findings?: Finding[]; verdict?: string; rules?: unknown[]; facts?: unknown[]; error?: string | { message?: string } } | string | null;
  const outError = !out || out.status === 200 ? null
    : typeof body === "string" ? body
    : typeof body?.error === "string" ? body.error
    : body?.error?.message ?? "The call failed. Open the raw response below for details.";
  const outHint = out?.status === 401 ? "Check the key: it may be mistyped, incomplete or revoked." : out?.status === 403 ? "This key does not have the scope this tool needs. Create a key with that scope ticked." : null;
  const nameTaken = !!data?.keys.some((k) => !k.revoked_at && k.name.trim().toLowerCase() === name.trim().toLowerCase());
  const mcpConfig = JSON.stringify({ mcpServers: { guidewise: { url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${created ?? "gw_your_key"}` } } } }, null, 2);

  return (
    <>
      <PageHead
        title="API and MCP server"
        sub={<>Let AI writing tools follow the brand before a person ever sees the draft: fetch the rules in force and the facts valid today, then check a draft and get the same cited findings as this app. MCP (Model Context Protocol) is the open standard that AI assistants such as Claude and Cursor use to call outside tools; the REST API offers the same two tools over plain HTTP.</>}
      />
      <Toast msg={msg} err={err} onClose={() => { setMsg(null); setErr(null); }} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="min-w-0 space-y-4 p-4 text-sm">
          <h2>1. Create a key</h2>
          {!manager ? (
            <p className="text-muted">Only the brand manager creates keys. <button className="underline" onClick={() => setRole("manager")}>Act as Meera to create one</button></p>
          ) : (
            <form onSubmit={create} className="space-y-3">
              <Field label="Name" hint="(what will use the key)"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} /></Field>
              {name.trim().length < 2 ? <p className="text-xs text-crit">Give the key a name of at least 2 characters, such as &quot;Writing assistant&quot;.</p>
                : nameTaken ? <p className="text-xs text-major">An active key is already called &quot;{name.trim()}&quot;. A different name keeps the two apart in the audit trail.</p> : null}
              <fieldset><legend className="font-medium">Scopes</legend>
                {Object.entries(data?.scopes ?? {}).map(([s, d]) => (
                  <label key={s} className="mt-1 flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--color-ink)]" checked={scopes.includes(s)} onChange={() => setScopes(scopes.includes(s) ? scopes.filter((x) => x !== s) : [...scopes, s])} /><code className="rounded bg-mist px-1">{s}</code> <span className="text-muted">{d}</span></label>
                ))}
              </fieldset>
              {!scopes.length && <p className="text-xs text-crit">Tick at least one scope.</p>}
              <Button variant="primary" type="submit" disabled={busy || !scopes.length || name.trim().length < 2}>{busy ? "Working…" : "Create key"}</Button>
            </form>
          )}
          {created && (
            <Notice tone="ok">
              <b>Copy this key now.</b> It is shown only once; only its fingerprint is stored.
              <code className="mt-1 block break-all rounded bg-white px-2 py-1 font-mono text-xs">{created}</code>
              <Button className="mt-1.5" onClick={copy}>{copied ? "Copied" : "Copy key"}</Button>
            </Notice>
          )}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Keys in this workspace</h3>
            {!data ? <p className="text-muted">Loading…</p> : data.keys.length === 0 ? <p className="mt-1 text-muted">No keys yet. {manager ? "Create one above" : "Act as Meera (above) to create one"} to try the playground.</p> : (
              <ul className="mt-1 divide-y divide-line">
                {data.keys.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-medium">{k.name}</span><code className="text-xs text-muted">{k.prefix}…</code>
                    {k.scopes.map((s) => <Badge key={s}>{s}</Badge>)}
                    {k.revoked_at ? <Badge tone="critical">Revoked</Badge> : <span className="text-xs text-muted">{k.last_used_at ? `Last used ${fmtDate(k.last_used_at)}` : "Not used yet"}</span>}
                    {manager && !k.revoked_at && <button className="ml-auto text-xs underline hover:text-crit disabled:opacity-45" disabled={busy} onClick={() => revoke(k)}>Revoke</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Connect an MCP client</h3>
            <p className="mt-1 text-muted">For a client that reads a JSON config with remote servers and headers (for example Cursor&apos;s <code>mcp.json</code>). It exposes <code>get_brief</code> and <code>check_draft</code>.</p>
            <pre className="mt-1 overflow-x-auto rounded bg-mist p-2 text-xs">{mcpConfig}</pre>
            <p className="mt-2 text-muted">Claude Code, from a terminal:</p>
            <pre className="mt-1 overflow-x-auto rounded bg-mist p-2 text-xs">{`claude mcp add --transport http guidewise ${origin}/api/mcp --header "Authorization: Bearer ${created ?? "gw_your_key"}"`}</pre>
          </div>
        </Card>

        <Card className="min-w-0 space-y-3 p-4 text-sm">
          <h2>2. Playground</h2>
          <p className="text-muted">Calls the live API the way an AI writing tool would, with the key you give it.</p>
          <Field label="API key"><input className={inputCls + " font-mono"} value={key} onChange={(e) => setKey(e.target.value)} placeholder="gw_…" /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tool"><select className={inputCls} value={tool} onChange={(e) => setTool(e.target.value as typeof tool)}><option value="check_draft">check_draft</option><option value="get_brief">get_brief</option></select></Field>
            <Field label="Call through"><select className={inputCls} value={via} onChange={(e) => setVia(e.target.value as typeof via)}><option value="rest">REST API</option><option value="mcp">MCP server</option></select></Field>
            <Field label="Content type"><select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>{CONTENT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select></Field>
          </div>
          {tool === "check_draft" && (
            <>
              <Field label="Draft text" hint={`(${text.trim().length.toLocaleString("en-IN")} characters; the API takes 10 to 12,000)`}><textarea rows={4} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} /></Field>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--color-ink)]" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> Also run the AI checks (slower)</label>
            </>
          )}
          <Button variant="primary" disabled={busy || !key.trim()} onClick={run}>{busy ? "Calling…" : `Call ${tool}`}</Button>
          {!key.trim() && <p className="text-xs text-muted">Paste a key, or create one in step 1 and it fills in here. Keys are shown only once, so after a page refresh paste yours again or create a new one.</p>}
          {out && (
            <div className="space-y-2">
              <p><Badge tone={out.status === 200 ? "green" : "critical"}>{out.status === 200 ? "200 OK" : out.status ? `Error ${out.status}` : "Network error"}</Badge> <span className="text-xs text-muted">{out.ms} ms via {out.via === "rest" ? "REST" : "MCP"}</span></p>
              {outError && <Notice tone="error">{outError}{outHint && <> {outHint}</>}</Notice>}
              {typeof body === "object" && body?.findings && (
                <div>
                  <p className="font-medium">{body.verdict === "ready_for_review" ? "No violations: ready for a person to review." : `${body.findings.length} finding${body.findings.length === 1 ? "" : "s"}, the same as the app would show:`}</p>
                  <ul className="mt-1 space-y-1">
                    {body.findings.map((f, i) => <li key={i} className="rounded border border-line px-2 py-1"><span className="font-mono text-xs text-muted">{f.rule_id}</span> <Badge tone={f.severity as "critical"}>{f.severity}</Badge> “{f.quote}”: {f.message}{f.fix ? <span className="text-muted"> Fix: “{f.fix}”</span> : null}</li>)}
                  </ul>
                </div>
              )}
              {typeof body === "object" && body?.rules && <p>{body.rules.length} rules in force and {body.facts?.length} facts valid today. An AI writing tool never sees an expired or embargoed fact.</p>}
              <details><summary className="cursor-pointer text-xs text-muted">Raw response</summary><pre className="mt-1 max-h-72 overflow-auto rounded bg-mist p-2 text-xs">{typeof body === "string" ? body : JSON.stringify(body, null, 2)}</pre></details>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="px-4 pt-4 text-left">3. Audit trail: every call, by key</caption>
          <thead className="border-b border-line text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Key</th><th className="px-4 py-2">Call</th><th className="px-4 py-2">Result</th></tr></thead>
          <tbody>
            {(data?.calls ?? []).length === 0 && <tr><td colSpan={4} className="px-4 py-5 text-muted">No calls yet. Use the playground or an MCP client; each call appears here.</td></tr>}
            {(data?.calls ?? []).map((c, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-4 py-2 text-muted">{fmtDate(c.at)}</td>
                <td className="px-4 py-2">{c.actor.replace(/^API key /, "")}</td>
                <td className="px-4 py-2"><code className="text-xs">{c.detail.endpoint}</code> <span className="text-xs text-muted">({c.detail.via === "mcp" ? "MCP" : "REST"})</span></td>
                <td className="px-4 py-2"><Badge tone={c.detail.status === 200 ? "green" : "critical"}>{c.detail.status}</Badge> <span className="text-xs text-muted">{c.detail.ms} ms{c.detail.findings !== undefined ? ` · ${c.detail.findings} findings` : ""}{c.detail.rules !== undefined ? ` · ${c.detail.rules} rules, ${c.detail.facts} facts` : ""}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
