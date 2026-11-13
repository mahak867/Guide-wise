import { fail, loadKit } from "@/lib/db";
import { aiAvailable, aiModel } from "@/lib/engine/ai";

export async function GET() {
  try {
    const data = await loadKit();
    return Response.json({ ...data, ai: { available: aiAvailable(), model: aiModel() } });
  } catch (e) {
    return fail(e, 500);
  }
}
