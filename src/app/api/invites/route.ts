import { actor, db, fail, must, readBody, wsOf } from "@/lib/db";
import { bearerOf, isMemberRole, statusOf, userDb } from "@/lib/accounts";
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
    if (b.role !== undefined && !isMemberRole(b.role)) return fail("role must be creator, brand, compliance or manager.");
    // The role a signed-in joiner gets in a claimed workspace. Only a manager can invite another manager.
    if (b.role === "manager" && a.role !== "manager") return fail("Only a manager can invite another manager.", 403);
    const role = isMemberRole(b.role) ? b.role : "creator";
    const token = bearerOf(req);
    // An organisation's workspace (signed-in member): only a manager invites, through the closed org_invites table.
    if (a.userId && a.role !== "manager") return fail("Only a manager can invite people to this organisation's workspace.", 403);
    const org = a.userId && token ? async (hash: string, r: string, expiresAt: string) => {
      const res = await userDb(token).rpc("create_org_invite", { p_ws: ws, p_token_hash: hash, p_role: r, p_expires: expiresAt });
      if (res.error) throw Object.assign(new Error(res.error.message), { status: statusOf(res.error) });
      return String(res.data);
    } : undefined;
    let made;
    try {
      made = await createInvite(ws, draftId, a, new URL(req.url).origin, role, org);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status) return fail(e, status);
      throw e;
    }
    if (!made) return fail("This workspace already has 20 active join links. Revoke one first.", 409);
    return Response.json({ ok: true, ...made });
  } catch (e) {
    return fail(e, 500);
  }
}
