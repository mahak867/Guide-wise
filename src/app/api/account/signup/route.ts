import { authClient, cleanName } from "@/lib/accounts";
import { fail, readBody } from "@/lib/db";
import { clientIp, shareLookupAllowed } from "@/lib/share";

// Create an account with email and password (rate-limited per address). When the Supabase project asks for email
// confirmation, no session comes back: the caller is told to confirm, then sign in.
export async function POST(req: Request) {
  try {
    if (!shareLookupAllowed(`signin:${clientIp(req.headers)}`, 10)) {
      return Response.json({ error: "Too many sign-in attempts from this address. Try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const b = await readBody(req);
    if (typeof b.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim())) return fail("Enter a valid email address.");
    if (typeof b.password !== "string" || b.password.length < 8) return fail("Choose a password of at least 8 characters.");
    const name = cleanName(b.name, b.email.split("@")[0]);
    const { data, error } = await authClient().auth.signUp({ email: b.email.trim(), password: b.password, options: { data: { name } } });
    if (error) return fail(error.message);
    const s = data.session;
    if (!s) return Response.json({ session: null, confirm: true, message: "Check your email to confirm the account, then sign in." }, { headers: { "Cache-Control": "no-store" } });
    return Response.json({ session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? null }, confirm: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e, 500);
  }
}
