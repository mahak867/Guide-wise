import { actor, fail } from "@/lib/db";
import { aiAvailable, compileGuide } from "@/lib/engine/ai";
import { redact } from "@/lib/engine/redact";

export const maxDuration = 60;

// Brand Kit compiler: proposes rules from pasted guide text. Nothing is saved here;
// the manager confirms each proposed rule, and each one starts as advisory.
export async function POST(req: Request) {
  try {
    if (actor(req).role !== "manager") return fail("Only the brand manager can compile a guide. Switch role to Meera.", 403);
    if (!aiAvailable()) return fail("The guide compiler needs the AI service, which is off (rules-only mode). Add rules by hand instead.", 503);
    const { guide } = await req.json();
    if (!guide || String(guide).trim().length < 40) return fail("Paste at least a few sentences of the brand guide.");
    if (String(guide).length > 20000) return fail("Paste up to 20,000 characters at a time.");
    const out = await compileGuide(redact(String(guide)).text);
    return Response.json(out);
  } catch (e) {
    return fail(e, 500);
  }
}
