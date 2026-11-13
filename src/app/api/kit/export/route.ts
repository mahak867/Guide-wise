import { fail, loadKit, wsOf } from "@/lib/db";

// The whole Brand Kit as one JSON file: assets, rules with their tests, and facts.
export async function GET(req: Request) {
  try {
    const { kit, rules, facts } = await loadKit(wsOf(req));
    const strip = <T extends object>(o: T, drop: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !drop.includes(k)));
    return Response.json({
      format: "guidewise-brand-kit",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      kit: { name: kit.name, version: kit.version, palette: kit.palette, disclaimers: kit.disclaimers, contacts: kit.contacts, profile: kit.profile ?? {} },
      rules: rules.map((r) => strip(r, ["ws", "created_at", "updated_at", "last_test"])),
      facts: facts.map((f) => strip(f, ["ws", "created_at"])),
    });
  } catch (e) {
    return fail(e, 500);
  }
}
