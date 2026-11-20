import { fail } from "@/lib/db";
import { clientIp, lookupShare, shareLookupAllowed } from "@/lib/share";

// The public copy of a shared approval record. No workspace header is needed or read: the token alone decides.
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    if (!shareLookupAllowed(clientIp(req.headers))) {
      return Response.json({ error: "Too many look-ups from this address. Try again in a minute." }, { status: 429, headers: { ...HEADERS, "Retry-After": "60" } });
    }
    const { token } = await ctx.params;
    const record = await lookupShare(token);
    if (!record) return Response.json({ error: "This link is not valid: it may have expired or been revoked." }, { status: 404, headers: HEADERS });
    return Response.json({ record }, { headers: HEADERS });
  } catch (e) {
    return fail(e, 500);
  }
}
