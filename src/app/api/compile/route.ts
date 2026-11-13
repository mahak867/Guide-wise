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
    // No source, no rule: drop any proposal whose quoted passage is not in the pasted guide.
    const norm = (s: string) => s.toLowerCase().replace(/[“”"']/g, "").replace(/\s+/g, " ").trim();
    const g = norm(String(guide));
    const rules = out.rules.filter((r) => r.source_passage.trim() && g.includes(norm(r.source_passage)));
    const warnings = out.warnings.filter((w) => g.includes(norm(w.passage)));
    return Response.json({ rules, warnings, dropped: out.rules.length - rules.length + out.warnings.length - warnings.length });
  } catch (e) {
    return fail(e, 500);
  }
}
