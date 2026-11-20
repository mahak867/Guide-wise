import { actor, db, fail, must } from "@/lib/db";
import { lookupInvite } from "@/lib/invite";
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
    return Response.json({ invite: { created_by: inv.created_by, draft_title: inv.draft_title, expires_at: inv.expires_at } }, { headers: HEADERS });
  } catch (e) {
    return fail(e, 500);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    if (!shareLookupAllowed(`join:${clientIp(req.headers)}`)) return tooMany();
    const inv = await lookupInvite((await ctx.params).token);
    if (!inv) return gone();
    const a = actor(req);
    must(await db().from("events").insert({ ws: inv.ws, draft_id: inv.draft_id, actor: a.name, role: a.role, action: "invite_accepted", detail: { invite_id: String(inv.id), invited_by: inv.created_by } }));
    return Response.json({ ok: true, ws: inv.ws, draft_id: inv.draft_id }, { headers: HEADERS });
  } catch (e) {
    return fail(e, 500);
  }
}
