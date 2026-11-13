import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "./seed";
import { ROLES, type Fact, type Kit, type Role, type Rule } from "./types";

let _db: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!_db) {
    _db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_KEY!, {
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

export function actor(req: Request): { role: Role; name: string } {
  const r = (req.headers.get("x-role") ?? "creator") as Role;
  const role: Role = r in ROLES ? r : "creator";
  return { role, name: ROLES[role].name };
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
  const kit = must(await d.from("kit").select("version").eq("ws", ws).single()) as { version: number };
  const version = kit.version + 1;
  must(await d.from("kit").update({ version, updated_at: new Date().toISOString() }).eq("ws", ws));
  return version;
}

export async function log(req: Request, draft_id: string | null, action: string, detail: Record<string, unknown> = {}): Promise<void> {
  const a = actor(req);
  must(await db().from("events").insert({ ws: wsOf(req), draft_id, actor: a.name, role: a.role, action, detail }));
}

export function fail(e: unknown, status = 400): Response {
  return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status });
}
