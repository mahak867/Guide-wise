import { actor, bumpKit, db, fail, log, must, wsOf } from "@/lib/db";
import { FactIn, firstIssue } from "@/lib/schemas";

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export async function POST(req: Request) {
  try {
    const a = actor(req);
    if (a.role !== "manager" && a.role !== "compliance") return fail("Only the brand manager or compliance reviewer can change facts.", 403);
    const b = await req.json();
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
    must(await db().from("facts").upsert({ ...row, ws: wsOf(req) }));
    const version = await bumpKit(wsOf(req));
    await log(req, null, "fact_saved", { fact: id, kit_version: version });
    return Response.json({ ok: true, id });
  } catch (e) {
    return fail(e, 500);
  }
}
