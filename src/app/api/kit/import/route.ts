import { z } from "zod";
import { actor, bumpKit, db, fail, loadKit, log, must, wsOf } from "@/lib/db";

const id = z.string().regex(/^[A-Z0-9-]{1,24}$/);
const RuleIn = z.object({
  id, kind: z.enum(["code", "judgment"]), category: z.string().max(40), title: z.string().min(1).max(200), description: z.string().max(1000).default(""),
  severity: z.enum(["critical", "major", "minor"]).default("major"), status: z.enum(["advisory", "enforced"]).default("advisory"),
  source: z.string().max(300).default("Imported"), risk: z.enum(["low", "high"]).default("low"),
  config: z.record(z.string(), z.unknown()).default({}),
  tests: z.array(z.object({ text: z.string().max(600), expect: z.enum(["flag", "pass"]) })).max(20).default([]),
  precedent: z.object({ order: z.string(), note: z.string(), source: z.string() }).nullable().default(null),
});
const FactIn = z.object({
  id, kind: z.enum(["fact", "student"]).default("fact"), statement: z.string().min(1).max(600), value: z.number().nullable().default(null),
  keywords: z.array(z.string()).max(30).default([]), evidence: z.string().max(600).default(""), owner: z.string().max(200).default(""),
  valid_from: z.string().nullable().default(null), valid_until: z.string().nullable().default(null),
  disclosure: z.string().max(600).default(""), disclosure_keywords: z.array(z.string()).max(30).default([]), meta: z.record(z.string(), z.unknown()).default({}),
});
const KitFile = z.object({
  format: z.literal("guidewise-brand-kit"),
  kit: z.object({
    name: z.string().max(120).optional(),
    palette: z.array(z.object({ name: z.string(), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/) })).max(24).optional(),
    disclaimers: z.array(z.object({ id: z.string(), text: z.string(), when: z.string() })).max(40).optional(),
    contacts: z.array(z.object({ label: z.string(), value: z.string() })).max(20).optional(),
    profile: z.record(z.string(), z.unknown()).optional(),
  }).default({}),
  rules: z.array(RuleIn).max(200).default([]),
  facts: z.array(FactIn).max(500).default([]),
});

// The database stores JSON with its keys reordered, so compare with keys sorted (and null = missing).
const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined && x !== null).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)]))
  : v ?? null;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const CONTENT = ["kind", "category", "title", "description", "severity", "source", "risk", "config", "tests", "precedent"] as const;

// Import a Brand Kit file. Rules and facts are merged by ID; nothing is deleted.
// A rule that is new or different comes in as advisory: it must pass its own tests before it can be enforced.
export async function POST(req: Request) {
  try {
    if (actor(req).role !== "manager") return fail("Only the brand manager can import a Brand Kit. Switch role to Meera.", 403);
    const parsed = KitFile.safeParse(await req.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return fail(`That file is not a valid Guidewise Brand Kit (${first.path.join(".") || "file"}: ${first.message}).`);
    }
    const file = parsed.data;
    const ws = wsOf(req);
    const { rules: existing } = await loadKit(ws);
    const byId = new Map(existing.map((r) => [r.id, r]));
    let unchanged = 0, advisory = 0;
    const rows = file.rules.flatMap((r) => {
      const cur = byId.get(r.id) as Record<string, unknown> | undefined;
      if (cur && CONTENT.every((k) => same(cur[k], (r as Record<string, unknown>)[k]))) { unchanged++; return []; }
      advisory++;
      return [{ ...r, ws, status: "advisory", last_test: null, updated_at: new Date().toISOString() }];
    });
    const d = db();
    if (rows.length) must(await d.from("rules").upsert(rows));
    if (file.facts.length) must(await d.from("facts").upsert(file.facts.map((f) => ({ ...f, ws }))));
    const assets = Object.fromEntries(Object.entries(file.kit).filter(([k, v]) => v !== undefined && k !== "version"));
    if (Object.keys(assets).length) must(await d.from("kit").update(assets).eq("ws", ws));
    const version = await bumpKit(ws);
    await log(req, null, "kit_imported", { rules: file.rules.length, facts: file.facts.length, kit_version: version });
    return Response.json({ ok: true, kit_version: version, rules: { imported: rows.length, unchanged, advisory }, facts: file.facts.length });
  } catch (e) {
    return fail(e, 500);
  }
}
