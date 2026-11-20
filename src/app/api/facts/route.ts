import { actor, bumpKit, db, fail, log, must, readBody, wsOf } from "@/lib/db";
import { FactIn, firstIssue } from "@/lib/schemas";
import { loadKit } from "@/lib/db";
import { assessImpact, describeFactChange } from "@/lib/impact";

// A list of words, sent as a list or as comma-separated text. Anything else (an object, a number) adds no words.
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" || typeof x === "number").map((x) => String(x).trim()).filter(Boolean)
  : typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

export async function POST(req: Request) {
  try {
    const a = actor(req);
    if (a.role !== "manager" && a.role !== "compliance") return fail("Only the brand manager or compliance reviewer can change facts.", 403);
    const b = await readBody(req);
    const id = String(b.id ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (!id || !b.statement) return fail("A fact needs an ID and a statement.");
    if (!b.evidence) return fail("A fact needs evidence: say where the figure comes from.");
    const value = b.value === "" || b.value === null || b.value === undefined ? null : Number(String(b.value).replace(/,/g, ""));
    if (value !== null && !Number.isFinite(value)) return fail("The value must be a number, like 4200 or 92.");
    const parsed = FactIn.safeParse({
      id, kind: b.kind === "student" ? "student" : "fact", statement: b.statement, value,
      keywords: list(b.keywords), evidence: b.evidence, owner: b.owner || a.name,
      valid_from: b.valid_from || null, valid_until: b.valid_until || null,
      disclosure: b.disclosure ?? "", disclosure_keywords: list(b.disclosure_keywords), meta: b.meta ?? {},
    });
    if (!parsed.success) return fail(`That fact can't be saved (${firstIssue(parsed.error)}).`);
    const row = parsed.data;
    const before = (await loadKit(wsOf(req))).facts;
    must(await db().from("facts").upsert({ ...row, ws: wsOf(req) }));
    const version = await bumpKit(wsOf(req));
    await log(req, null, "fact_saved", { fact: id, kit_version: version });
    const prev = before.find((f) => f.id === id);
    const impact = await assessImpact(wsOf(req), { kind: "fact", id, what: describeFactChange(prev, { ...(prev ?? {}), ...row } as typeof before[number]) }, before);
    return Response.json({ ok: true, id, impact });
  } catch (e) {
    return fail(e, 500);
  }
}
