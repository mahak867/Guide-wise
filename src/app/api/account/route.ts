import { audit, bearerOf, cleanName, isClaimed, membershipsOf, statusOf, userDb, userOf } from "@/lib/accounts";
import { db, fail, readBody, seed, wsOf } from "@/lib/db";

// The signed-in user's account: which workspaces they belong to, and claiming the current one.
const NO_TABLE = "Accounts are not set up on this server yet (migration 010 is missing). The demo works without signing in.";

export async function GET(req: Request) {
  try {
    const token = bearerOf(req);
    const user = await userOf(token);
    if (!user || !token) return fail("Sign in first.", 401);
    const mine = await membershipsOf(token);
    const ws = wsOf(req);
    const claimed = ws === "public" ? false : await isClaimed(ws);
    return Response.json({
      available: mine !== null,
      user: { id: user.id, email: user.email, name: user.name },
      memberships: (mine ?? []).map((m) => ({ ws: m.ws, role: m.role, name: m.name, created_at: m.created_at })),
      current: (mine ?? []).find((m) => m.ws === ws) ?? null,
      claimed: !!claimed,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e, 500);
  }
}

export async function POST(req: Request) {
  try {
    const token = bearerOf(req);
    const user = await userOf(token);
    if (!user || !token) return fail("Sign in first.", 401);
    const b = await readBody(req);
    const ws = wsOf(req);
    if (ws === "public") return fail("Send the x-workspace header of the workspace.");
    const mine = await membershipsOf(token);
    if (mine === null) return fail(NO_TABLE, 503);
    const me = mine.find((m) => m.ws === ws);
    if (b.action === "claim") {
      if (me) return Response.json({ ok: true, member: me });
      const name = cleanName(b.name, user.name ?? (user.email ?? "Manager").split("@")[0]);
      // The database function claims only a workspace with no members, as the caller (auth.uid()).
      const r = await userDb(token).rpc("claim_workspace", { p_ws: ws, p_name: name });
      if (r.error) return fail(r.error.message, statusOf(r.error));
      // A brand-new workspace (no Brand Kit yet) gets the demo data, as a first visit would.
      const kit = await db().from("kit").select("ws").eq("ws", ws).maybeSingle();
      if (!kit.error && !kit.data) await seed(ws, false);
      const by = { name, role: "manager", userId: user.id };
      await audit(ws, by, "workspace_claimed");
      await audit(ws, by, "member_added", { member: name, member_role: "manager" });
      return Response.json({ ok: true, member: r.data });
    }
    if (b.action === "signed_in" || b.action === "signed_out") {
      if (me) await audit(ws, { name: me.name, role: me.role, userId: user.id }, b.action);
      return Response.json({ ok: true });
    }
    return fail('action must be "claim", "signed_in" or "signed_out".');
  } catch (e) {
    return fail(e, 500);
  }
}
