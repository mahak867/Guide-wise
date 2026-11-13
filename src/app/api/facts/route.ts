import { actor, bumpKit, db, fail, log, must } from "@/lib/db";

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
    const row = {
      id,
      kind: b.kind === "student" ? "student" : "fact",
      statement: b.statement,
      value: b.value === "" || b.value === null || b.value === undefined ? null : Number(b.value),
      keywords: list(b.keywords),
      evidence: b.evidence,
      owner: b.owner || a.name,
      valid_from: b.valid_from || null,
      valid_until: b.valid_until || null,
      disclosure: b.disclosure ?? "",
      disclosure_keywords: list(b.disclosure_keywords),
      meta: b.meta ?? {},
    };
    must(await db().from("facts").upsert(row));
    const version = await bumpKit();
    await log(req, null, "fact_saved", { fact: id, kit_version: version });
    return Response.json({ ok: true, id });
  } catch (e) {
    return fail(e, 500);
  }
}
