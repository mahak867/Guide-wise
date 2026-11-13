import { actor, db, fail, log, must, wsOf } from "@/lib/db";
import { getDraft, runReview, type DraftRow } from "@/lib/workflow";

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const d = db();
    const drafts = must(await d.from("drafts").select("id,title,content_type,status,risk_tier,version,author,mode,updated_at,created_at").eq("ws", wsOf(req)).order("updated_at", { ascending: false }).limit(100)) as { id: string }[];
    const findings = must(await d.from("findings").select("draft_id,state").in("draft_id", drafts.map((x) => x.id).concat("00000000-0000-0000-0000-000000000000"))) as { draft_id: string; state: string }[];
    const open: Record<string, number> = {};
    for (const f of findings) if (f.state === "open") open[f.draft_id] = (open[f.draft_id] ?? 0) + 1;
    return Response.json({ drafts: drafts.map((x) => ({ ...x, open: open[x.id] ?? 0 })) });
  } catch (e) {
    return fail(e, 500);
  }
}

// Create a draft and run the first review on it.
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const text = String(b.text ?? "").trim();
    if (text.length < 10 && !(Array.isArray(b.images) && b.images.length)) return fail("Paste the draft text or add an image first.");
    if (text.length > 12000) return fail("This version reviews up to 12,000 characters at a time.");
    const a = actor(req);
    const images = (Array.isArray(b.images) ? b.images : []).slice(0, 4).map((i: Record<string, unknown>, n: number) => {
      const dataUrl = String(i.dataUrl ?? "");
      if (!dataUrl.startsWith("data:image/") || dataUrl.length > 900_000) throw new Error(`Image ${n + 1} is missing or too large.`);
      return {
        name: String(i.name ?? `Image ${n + 1}`).slice(0, 120),
        alt: String(i.alt ?? "").slice(0, 600),
        dataUrl,
        w: Number(i.w) || null,
        h: Number(i.h) || null,
        colours: (Array.isArray(i.colours) ? i.colours : []).slice(0, 8)
          .filter((c: { hex?: string }) => /^#[0-9A-F]{6}$/.test(String(c.hex)))
          .map((c: { hex: string; share: number }) => ({ hex: c.hex, share: Math.max(0, Math.min(1, Number(c.share) || 0)) })),
        ocr: String(i.ocr ?? "").slice(0, 4000),
        ocr_ok: i.ocr_ok !== false,
      };
    });
    const row = must(await db().from("drafts").insert({
      ws: wsOf(req),
      title: String(b.title || text.slice(0, 48)).trim(),
      content_type: b.content_type || "social",
      text: text || "(Image only)",
      images,
      intent: { goal: b.intent?.goal ?? "", audience: b.intent?.audience ?? "", cta: b.intent?.cta ?? "" },
      author: a.name,
    }).select("*").single()) as DraftRow;
    must(await db().from("versions").insert({ draft_id: row.id, version: 1, text: row.text, note: "Submitted for review" }));
    await runReview(wsOf(req), row, b.useAI !== false);
    const after = await getDraft(wsOf(req), row.id);
    await log(req, row.id, "review_run", { mode: after?.mode, version: 1 });
    return Response.json({ id: row.id });
  } catch (e) {
    return fail(e, 500);
  }
}
