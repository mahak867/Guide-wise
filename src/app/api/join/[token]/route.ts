import { audit, bearerOf, cleanName, isClaimed, statusOf, userDb, userOf, type Member } from "@/lib/accounts";
import { actor, db, fail, must } from "@/lib/db";
import { hashInviteToken, lookupInvite } from "@/lib/invite";
import { clientIp, shareLookupAllowed } from "@/lib/share";

// A join link. GET describes it (who invited, to which draft, until when) without the workspace id; only POST, the
// "Join" button, hands the workspace id to the browser. Unknown, expired and revoked links give the same 404.
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
const tooMany = () => Response.json({ error: "Too many look-ups from this address. Try again in a minute." }, { status: 429, headers: { ...HEADERS, "Retry-After": "60" } });
const gone = () => Response.json({ error: "This join link is not valid: it may have expired or been revoked." }, { status: 404, headers: HEADERS });

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    if (!shareLookupAllowed(`join:${clientIp(req.headers)}`)) return tooMany();
    const inv = await lookupInvite((await ctx.params).token);
    if (!inv) return gone();
    const claimed = !!(await isClaimed(inv.ws));
    return Response.json({ invite: { created_by: inv.created_by, draft_title: inv.draft_title, expires_at: inv.expires_at, claimed } }, { headers: HEADERS });
  } catch (e) {
    return fail(e, 500);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    if (!shareLookupAllowed(`join:${clientIp(req.headers)}`)) return tooMany();
    const token = (await ctx.params).token;
    const inv = await lookupInvite(token);
    if (!inv) return gone();
    // A claimed workspace: joining needs a sign-in, and adds the user as a member with the role the inviter chose.
    // The membership comes only from the closed org_invites table (accept_invite), never from the open events table.
    if (await isClaimed(inv.ws)) {
      const bearer = bearerOf(req);
      const user = await userOf(bearer);
      if (!user || !bearer) return Response.json({ error: "This workspace belongs to an organisation. Sign in or create an account to join it.", claimed: true }, { status: 401, headers: HEADERS });
      const name = cleanName(user.name, (user.email ?? "Member").split("@")[0]);
      const r = await userDb(bearer).rpc("accept_invite", { p_token_hash: hashInviteToken(token), p_name: name });
      if (r.error) return statusOf(r.error) === 404 ? gone() : fail(r.error.message, statusOf(r.error));
      const m = r.data as Member;
      if (m.name === name && Date.now() - Date.parse(m.created_at) < 60_000) {
        await audit(inv.ws, { name, role: m.role, userId: user.id }, "member_added", { member: name, member_role: m.role, invite_id: String(inv.id), invited_by: inv.created_by });
      }
      return Response.json({ ok: true, ws: inv.ws, draft_id: inv.draft_id, claimed: true }, { headers: HEADERS });
    }
    const a = actor(req);
    must(await db().from("events").insert({ ws: inv.ws, draft_id: inv.draft_id, actor: a.name, role: a.role, action: "invite_accepted", detail: { invite_id: String(inv.id), invited_by: inv.created_by } }));
    return Response.json({ ok: true, ws: inv.ws, draft_id: inv.draft_id }, { headers: HEADERS });
  } catch (e) {
    return fail(e, 500);
  }
}
