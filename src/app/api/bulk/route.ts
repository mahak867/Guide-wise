import { BulkBody, bulkIssue, bulkRow } from "@/lib/bulk";
import { fail, wsOf } from "@/lib/db";
import { checkMany } from "@/lib/governance";

export const maxDuration = 60;

// POST /api/bulk { posts: [{ text, title?, content_type?, date? }] } (1 to 50 posts): the code checks of a
// review for each post, with AI off, against this workspace's Brand Kit. Nothing is stored.
export async function POST(req: Request) {
  try {
    const parsed = BulkBody.safeParse(await req.json());
    if (!parsed.success) return fail(bulkIssue(parsed.error), 400);
    const { posts } = parsed.data;
    const out = await checkMany(wsOf(req), posts);
    return Response.json({
      mode: "rules-only",
      kit_version: out.kit_version,
      results: out.results.map((r, i) => bulkRow(i, r, out.titles)),
    });
  } catch (e) {
    return fail(e, 500);
  }
}
