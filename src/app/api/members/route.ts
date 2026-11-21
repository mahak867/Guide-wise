import { audit, bearerOf, isMemberRole, leavesNoManager, membersOf, statusOf, userDb } from "@/lib/accounts";
import { actor, fail, readBody, wsOf } from "@/lib/db";

// Members of a claimed workspace. src/proxy.ts has already checked the caller is a signed-in member; the database
// functions check it again (manager, last-manager guard) as the caller.
async function context(req: Request) {
  const a = actor(req);
  const ws = wsOf(req);
  const token = bearerOf(req);
  const members = ws !== "public" && token && a.userId ? await membersOf(ws, token) : [];
  if (!a.userId || !token || !members.length) return { error: fail("Members exist only in a workspace someone has signed up in. This is a demo workspace.", 404) };
  return { a, ws, token, members };
}

export async function GET(req: Request) {
  try {
    const c = await context(req);
    if (c.error) return c.error;
    return Response.json({ members: c.members.map((m) => ({ user_id: m.user_id, name: m.name, role: m.role, created_at: m.created_at, you: m.user_id === c.a.userId })) });
  } catch (e) {
    return fail(e, 500);
  }
}

async function change(req: Request, remove: boolean) {
  const c = await context(req);
  if (c.error) return c.error;
  if (c.a.role !== "manager") return fail("Only a manager can change members.", 403);
  const b = await readBody(req);
  const target = c.members.find((m) => m.user_id === b.user_id);
  if (!target) return fail("That member was not found.", 404);
  const next = remove ? null : b.role;
  if (!remove && !isMemberRole(next)) return fail("role must be creator, brand, compliance or manager.");
  if (leavesNoManager(c.members, target.user_id, next)) return fail("A workspace needs at least one manager. Make someone else a manager first.", 409);
  const r = remove
    ? await userDb(c.token).rpc("remove_member", { p_ws: c.ws, p_user: target.user_id })
    : await userDb(c.token).rpc("set_member_role", { p_ws: c.ws, p_user: target.user_id, p_role: next });
  if (r.error) return fail(r.error.message, statusOf(r.error));
  if (remove) await audit(c.ws, c.a, "member_removed", { member: target.name, member_role: target.role });
  else await audit(c.ws, c.a, "member_role_changed", { member: target.name, from: target.role, to: next });
  return Response.json({ ok: true });
}

export async function PATCH(req: Request) {
  try { return await change(req, false); } catch (e) { return fail(e, 500); }
}

export async function DELETE(req: Request) {
  try { return await change(req, true); } catch (e) { return fail(e, 500); }
}
