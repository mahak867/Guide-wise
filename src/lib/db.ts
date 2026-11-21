import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { approverLabel } from "./approval";
import { SEED_APPROVED, SEED_APPROVED_SIGNOFFS, SEED_FACTS, SEED_KIT, SEED_RULES } from "./seed";
import { ROLES, type Fact, type Kit, type Role, type Rule } from "./types";

/**
 * The key the server uses for its own database client: the secret service-role key when it is set (server-only,
 * never NEXT_PUBLIC and never sent to the browser), else the public key. Once migration 011 closes the tables
 * to the public key, only the server can read or write them.
 */
export function serverDbKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY;
}
/** Which key the server client is using, for the health check. Never the key itself. */
export function serverDbKeyKind(): "service_role" | "public" {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "public";
}

let _db: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!_db) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serverDbKey()) {
      throw new Error("No database is configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_KEY in .env.local to a Supabase project with the migrations in supabase/migrations applied (see README, Run locally), then restart.");
    }
    _db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serverDbKey()!, {
      auth: { persistSession: false },
    });
  }
  return _db;
}

export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** The visitor's workspace, from the browser. Each visitor gets an isolated copy of the demo. */
export function wsOf(req: Request): string {
  const w = (req.headers.get("x-workspace") ?? "").toLowerCase();
  return /^[a-z0-9-]{8,48}$/.test(w) ? w : "public";
}

/**
 * Who is acting. In a demo workspace, the "Acting as" persona (x-role). In a claimed workspace, src/proxy.ts has
 * already checked the member's sign-in, replaced x-role with the member's role and set x-gw-member-*; it strips
 * those headers from every incoming request, so a caller cannot set them.
 */
export function actor(req: Request): { role: Role; name: string; userId?: string } {
  const r = (req.headers.get("x-role") ?? "creator") as Role;
  const role: Role = r in ROLES ? r : "creator";
  const userId = req.headers.get("x-gw-member-id") || undefined;
  const member = userId ? decodeURIComponent(req.headers.get("x-gw-member-name") ?? "") : "";
  return userId ? { role, name: member || ROLES[role].name, userId } : { role, name: ROLES[role].name };
}

export async function seed(ws: string, wipe: boolean): Promise<void> {
  const d = db();
  if (wipe) {
    must(await d.from("drafts").delete().eq("ws", ws));
    must(await d.from("events").delete().eq("ws", ws));
    must(await d.from("rules").delete().eq("ws", ws));
    must(await d.from("facts").delete().eq("ws", ws));
  }
  const { id: _id, ...kit } = SEED_KIT;
  void _id;
  must(await d.from("kit").upsert({ ...kit, ws, updated_at: new Date().toISOString() }));
  must(await d.from("rules").upsert(SEED_RULES.map((r) => ({ ...r, ws, last_test: null }))));
  must(await d.from("facts").upsert(SEED_FACTS.map((f) => ({ ...f, ws }))));
  await seedApproved(ws);
}

/**
 * One piece already approved, so change impact can be tried at once: it cites fact F-3, and changing F-3's figure
 * sends it back for re-approval. It passes every code check as written (a unit test keeps it that way).
 */
async function seedApproved(ws: string): Promise<void> {
  const d = db();
  const existing = must(await d.from("drafts").select("id").eq("ws", ws).limit(1)) as unknown[];
  if (existing.length) return;
  const a = SEED_APPROVED;
  const at = new Date(Date.now() - 3 * 864e5).toISOString();
  // The same ID for every seeding of this workspace, so two seedings at once (a double-clicked Reset demo, or a
  // first visit opening several pages) insert it once: the second insert is ignored and adds nothing else.
  const inserted = must(await d.from("drafts").upsert({
    id: seedDraftId(ws), ws, title: a.title, content_type: a.content_type, text: a.text, intent: a.intent, status: "approved", risk_tier: "high",
    risk_reasons: ["Uses a results figure (F-3)"], author: "Riya", mode: "rules-only", created_at: at, updated_at: at,
  }, { onConflict: "id", ignoreDuplicates: true }).select("id")) as { id: string }[];
  const row = inserted[0];
  if (!row) return;
  must(await d.from("versions").insert({ draft_id: row.id, version: 1, text: a.text, note: "Submitted for review" }));
  // High risk, so it carries both sign-offs: compliance (Kavya) first, then brand (Arjun).
  const hour = (h: number) => new Date(Date.parse(at) - h * 36e5).toISOString();
  const approvers = SEED_APPROVED_SIGNOFFS.map((s) => ({ name: s.name, role: s.role, at: hour(s.hoursBefore) }));
  must(await d.from("receipts").insert({
    draft_id: row.id, text_hash: createHash("sha256").update(a.text, "utf8").digest("hex"), approved_text: a.text, kit_version: 1,
    approver: approverLabel(approvers), approver_role: approvers.map((x) => x.role).join(" and "), at,
    findings_summary: { approvers, sign_off: "dual", exceptions: [], total: 0, fixed: 0, dismissed: 0, suggestions_left_open: 0, rules: [], dismissals: [], draft_version: 1, risk_tier: "high" },
  }));
  const note = "Demo data: approved before you arrived";
  must(await d.from("events").insert([
    { ws, draft_id: row.id, actor: "Riya", role: "creator", action: "submitted", detail: { routed_to: "compliance_review", risk: "high", reasons: ["Uses a results figure (F-3)"], version: 1 }, at: hour(3) },
    { ws, draft_id: row.id, actor: approvers[0].name, role: approvers[0].role, action: "approved_partial", detail: { version: 1, kit_version: 1, note, waiting_for: "brand" }, at: approvers[0].at },
    { ws, draft_id: row.id, actor: approvers[1].name, role: approvers[1].role, action: "approved", detail: { version: 1, kit_version: 1, note, approvers: approvers.map((x) => ({ name: x.name, role: x.role })) }, at: approvers[1].at },
  ]));
}

/** The seeded approved draft's ID in a workspace: a UUID derived from the workspace name. */
export function seedDraftId(ws: string): string {
  const h = createHash("sha256").update(`guidewise-seed:${ws}`, "utf8").digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function loadKit(ws: string): Promise<{ kit: Kit; rules: Rule[]; facts: Fact[] }> {
  const d = db();
  let kitRow = must(await d.from("kit").select("*").eq("ws", ws).maybeSingle()) as Kit | null;
  if (!kitRow) {
    await seed(ws, false);
    kitRow = must(await d.from("kit").select("*").eq("ws", ws).single()) as Kit;
  }
  const [rules, facts] = await Promise.all([
    d.from("rules").select("*").eq("ws", ws).order("created_at").order("id"),
    d.from("facts").select("*").eq("ws", ws).order("kind").order("id"),
  ]);
  const f = (must(facts) as Fact[]).map((x) => ({ ...x, value: x.value === null ? null : Number(x.value) }));
  return { kit: kitRow, rules: must(rules) as Rule[], facts: f };
}

/** Any change to rules, facts or assets creates a new Brand Kit version. */
export async function bumpKit(ws: string): Promise<number> {
  const d = db();
  // Compare and set: two changes saved at the same moment must make two versions, not one (bug hunt, 20 Nov:
  // five fact saves at once moved the version from 1 to 3). The update applies only if nobody bumped it meanwhile.
  for (let attempt = 0; attempt < 20; attempt++) {
    const kit = must(await d.from("kit").select("version").eq("ws", ws).single()) as { version: number };
    const version = kit.version + 1;
    const done = must(await d.from("kit").update({ version, updated_at: new Date().toISOString() }).eq("ws", ws).eq("version", kit.version).select("version")) as unknown[];
    if (done.length) return version;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60));
  }
  throw new Error("The Brand Kit is being changed by several people at once. Try again in a moment.");
}

export async function log(req: Request, draft_id: string | null, action: string, detail: Record<string, unknown> = {}): Promise<void> {
  const a = actor(req);
  must(await db().from("events").insert({ ws: wsOf(req), draft_id, actor: a.name, role: a.role, action, detail: a.userId ? { ...detail, user_id: a.userId } : detail }));
}

/** A problem with what the caller sent. Reported as 400 with its message, never as a server error. */
export class BadInput extends Error {}
/** Someone else changed the same record first; the caller should reload and try again (409). */
export class Conflict extends Error {}

/** The request body as a JSON object. A body of null, a list, a string or a number is the caller's mistake (400), not a crash. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readBody(req: Request): Promise<Record<string, any>> {
  const b: unknown = await req.json();
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new BadInput("The request body must be a JSON object.");
  return b as Record<string, unknown>;
}

export function fail(e: unknown, status = 400): Response {
  // A body that is not JSON, or input a helper rejected, is the caller's mistake, not ours.
  if (e instanceof SyntaxError) return Response.json({ error: "The request body is not valid JSON." }, { status: 400 });
  if (e instanceof BadInput) status = 400;
  if (e instanceof Conflict) status = 409;
  if (status >= 500) console.error("[guidewise]", e);
  return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status });
}
