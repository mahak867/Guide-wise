import { actor, db, fail, must, readBody, wsOf } from "@/lib/db";
import { createInvite, INVITERS, listInvites } from "@/lib/invite";

// Join links to this workspace ("Invite a teammate"). Listed without tokens (never stored) or hashes (never sent).
export async function GET(req: Request) {
  try {
    const ws = wsOf(req);
    if (ws === "public") return Response.json({ invites: [] });
    return Response.json({ invites: (await listInvites(ws)).filter((i) => i.active) });
  } catch (e) {
    return fail(e, 500);
  }
}

export async function POST(req: Request) {
  try {
    const a = actor(req);
    if (!INVITERS.includes(a.role)) return fail("Only a reviewer (Arjun or Kavya) or the brand manager (Meera) can invite a teammate.", 403);
    const ws = wsOf(req);
    if (ws === "public") return fail("Send the x-workspace header of the workspace to invite to.");
    const b = await readBody(req);
    let draftId: string | null = null;
    if (b.draft_id !== undefined && b.draft_id !== null) {
      if (typeof b.draft_id !== "string" || !/^[0-9a-f-]{36}$/.test(b.draft_id)) return fail("draft_id is not a draft ID.");
      const found = must(await db().from("drafts").select("id").eq("ws", ws).eq("id", b.draft_id).maybeSingle());
      if (!found) return fail("That draft was not found.", 404);
      draftId = b.draft_id;
    }
    const made = await createInvite(ws, draftId, a, new URL(req.url).origin);
    if (!made) return fail("This workspace already has 20 active join links. Revoke one first.", 409);
    return Response.json({ ok: true, ...made });
  } catch (e) {
    return fail(e, 500);
  }
}
