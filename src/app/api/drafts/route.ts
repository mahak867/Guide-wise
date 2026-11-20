import { actor, db, fail, log, must, readBody, wsOf } from "@/lib/db";
import { CONTENT_TYPES } from "@/lib/types";
import { cleanAssets, cleanImages, getDraft, runReview, type DraftRow } from "@/lib/workflow";

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const d = db();
    const drafts = must(await d.from("drafts").select("id,title,content_type,status,risk_tier,version,author,mode,updated_at,created_at,impact").eq("ws", wsOf(req)).order("updated_at", { ascending: false }).limit(100)) as { id: string }[];
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
    const b = await readBody(req);
    if (b.text !== undefined && b.text !== null && typeof b.text !== "string") return fail("Send the draft text as a string.");
    const text = String(b.text ?? "").trim();
    // Invisible characters (zero-width spaces, direction marks) do not count towards the 10 characters a draft needs.
    const visible = text.replace(/[\u200B-\u200F\u2060-\u2064\uFEFF\u202A-\u202E\u2066-\u2069]/g, "").trim();
    if (visible.length < 10 && !(Array.isArray(b.images) && b.images.length)) return fail("Paste the draft text or add an image first.");
    if (text.length > 12000) return fail("This version reviews up to 12,000 characters at a time.");
    const type = b.content_type || "social";
    if (!CONTENT_TYPES.some((c) => c.v === type)) return fail(`Choose a content type: ${CONTENT_TYPES.map((c) => c.v).join(", ")}.`);
    if (b.title !== undefined && b.title !== null && typeof b.title !== "string") return fail("Send the title as a string.");
    const a = actor(req);
    const images = cleanImages(b.images);
    const assets = cleanAssets(b.assets);
    const row = must(await db().from("drafts").insert({
      ws: wsOf(req),
      title: String(b.title || text.slice(0, 48)).trim().slice(0, 200),
      content_type: type,
      text: text || "(Image only)",
      images,
      assets,
      intent: {
        goal: String(b.intent?.goal ?? "").slice(0, 300), audience: String(b.intent?.audience ?? "").slice(0, 300), cta: String(b.intent?.cta ?? "").slice(0, 300),
        confidential: b.intent?.confidential === true,
        locked: (Array.isArray(b.intent?.locked) ? b.intent.locked : String(b.intent?.locked ?? "").split(",")).map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 10),
      },
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
