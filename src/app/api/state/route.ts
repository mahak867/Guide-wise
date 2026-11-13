import { fail, loadKit, wsOf } from "@/lib/db";
import { aiAvailable, aiModel } from "@/lib/engine/ai";

export async function GET(req: Request) {
  try {
    const data = await loadKit(wsOf(req));
    return Response.json({ ...data, ai: { available: aiAvailable(), model: aiModel() } });
  } catch (e) {
    return fail(e, 500);
  }
}
