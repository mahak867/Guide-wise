import { authClient } from "@/lib/accounts";
import { fail, readBody } from "@/lib/db";
import { clientIp, shareLookupAllowed } from "@/lib/share";

// Sign in with email and password. Goes through the server so attempts are rate-limited per address, like share links.
export async function POST(req: Request) {
  try {
    if (!shareLookupAllowed(`signin:${clientIp(req.headers)}`, 10)) {
      return Response.json({ error: "Too many sign-in attempts from this address. Try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const b = await readBody(req);
    if (typeof b.email !== "string" || typeof b.password !== "string" || !b.email.includes("@")) return fail("Enter an email address and a password.");
    const { data, error } = await authClient().auth.signInWithPassword({ email: b.email.trim(), password: b.password });
    if (error || !data.session) return fail(error?.message === "Email not confirmed" ? "Confirm your email address first, then sign in." : "That email and password do not match an account.", 401);
    const s = data.session;
    return Response.json({ session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e, 500);
  }
}
