import { z } from "zod";
import { createKey, SCOPES, type Scope } from "@/lib/apikeys";
import { actor, db, fail, log, must, wsOf } from "@/lib/db";
import { firstIssue } from "@/lib/schemas";

// Key management for the Developers page: list keys and their recent calls, create a key. Brand manager only.
export async function GET(req: Request) {
  try {
    const ws = wsOf(req);
    const keys = must(await db().from("api_keys").select("id,name,prefix,scopes,created_at,last_used_at,revoked_at").eq("ws", ws).order("created_at", { ascending: false }));
    const calls = must(await db().from("events").select("actor,detail,at").eq("ws", ws).eq("action", "api_call").order("at", { ascending: false }).limit(50));
    return Response.json({ keys, calls, scopes: SCOPES });
  } catch (e) {
    return fail(e, 500);
  }
}

const NewKey = z.object({ name: z.string().trim().min(2, "name the key").max(60), scopes: z.array(z.enum(Object.keys(SCOPES) as [Scope, ...Scope[]])).min(1, "choose at least one scope") });
export async function POST(req: Request) {
  try {
    if (actor(req).role !== "manager") return fail("Only the brand manager can create API keys. Switch role to Meera.", 403);
    const parsed = NewKey.safeParse(await req.json());
    if (!parsed.success) return fail(`That key can't be created (${firstIssue(parsed.error)}).`);
    const ws = wsOf(req);
    if ((must(await db().from("api_keys").select("id").eq("ws", ws).is("revoked_at", null)) as unknown[]).length >= 10) return fail("A workspace can have up to 10 active keys. Revoke one first.");
    const { key, row } = await createKey(ws, parsed.data.name, [...new Set(parsed.data.scopes)]);
    // Several creates at once each saw fewer than 10 keys (bug hunt, 20 Nov: 13 at once made 13). Count again now:
    // a key that is not among the 10 oldest active keys is taken back, never handed out.
    const active = must(await db().from("api_keys").select("id").eq("ws", ws).is("revoked_at", null).order("created_at").order("id")) as { id: string }[];
    if (active.findIndex((x) => x.id === row.id) >= 10) {
      must(await db().from("api_keys").delete().eq("id", row.id));
      return fail("A workspace can have up to 10 active keys. Revoke one first.");
    }
    await log(req, null, "api_key_created", { key: row.prefix, name: row.name, scopes: row.scopes });
    return Response.json({ key, row });
  } catch (e) {
    return fail(e, 500);
  }
}
