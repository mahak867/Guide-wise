import { fail, log, seed } from "@/lib/db";

export async function POST(req: Request) {
  try {
    await seed(true);
    await log(req, null, "demo_reset");
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e, 500);
  }
}
