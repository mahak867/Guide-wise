import { authClient } from "@/lib/accounts";
import { fail, readBody } from "@/lib/db";

// Swap a refresh token for a new session. Through the server, because the page's CSP keeps the browser to this origin.
export async function POST(req: Request) {
  try {
    const b = await readBody(req);
    if (typeof b.refresh_token !== "string" || !b.refresh_token) return fail("Send refresh_token.");
    const { data, error } = await authClient().auth.refreshSession({ refresh_token: b.refresh_token });
    if (error || !data.session) return fail("The sign-in has expired. Sign in again.", 401);
    const s = data.session;
    return Response.json({ session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e, 500);
  }
}
