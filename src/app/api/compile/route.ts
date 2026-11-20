import { actor, fail } from "@/lib/db";
import { compileFromGuide } from "@/lib/compile";
import { aiAvailable, compileGuide } from "@/lib/engine/ai";

export const maxDuration = 60;

// Brand Kit compiler: proposes rules from pasted guide text. Nothing is saved here;
// the manager confirms each proposed rule, and each one starts as advisory.
// The AI sees the guide with personal data replaced by placeholders (see compileFromGuide).
export async function POST(req: Request) {
  try {
    if (actor(req).role !== "manager") return fail("Only the brand manager can compile a guide. Switch role to Meera.", 403);
    if (!aiAvailable()) return fail("The guide compiler needs the AI service, which is off (rules-only mode). Add rules by hand instead.", 503);
    const { guide } = await req.json();
    if (!guide || String(guide).trim().length < 40) return fail("Paste at least a few sentences of the brand guide.");
    if (String(guide).length > 20000) return fail("Paste up to 20,000 characters at a time.");
    return Response.json(await compileFromGuide(String(guide), compileGuide));
  } catch (e) {
    return fail(e, 500);
  }
}
