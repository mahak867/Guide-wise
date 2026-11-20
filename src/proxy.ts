import { NextResponse, type NextRequest } from "next/server";
import { bearerOf, isClaimed, membersOf, resolveAccess, userOf } from "@/lib/accounts";
import { wsOf } from "@/lib/db";

// The one place that decides who may use a workspace's API. Unclaimed (demo) workspaces pass through unchanged.
// A claimed workspace needs a member's sign-in token; the member's role from the table replaces x-role.
// Skipped: API-key routes (/api/v1, /api/mcp) authenticate with their keys; /api/account and /api/join check
// sign-in themselves; /api/health is public.
const SKIP = /^\/api\/(v1|mcp|account|join|health)(\/|$)/;

export async function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete("x-gw-member-id");
  headers.delete("x-gw-member-name");
  const pass = () => NextResponse.next({ request: { headers } });
  if (SKIP.test(req.nextUrl.pathname)) return pass();
  const ws = wsOf(req);
  if (ws === "public") return pass();
  const unavailable = () => Response.json({ error: "Guidewise could not check who may open this workspace. Try again in a moment." }, { status: 503 });
  let claimed;
  try { claimed = await isClaimed(ws); } catch { return unavailable(); }
  if (!claimed) return pass();
  const token = bearerOf(req);
  const user = await userOf(token).catch(() => null);
  let members;
  try { members = user && token ? await membersOf(ws, token) : []; } catch { return unavailable(); }
  const access = resolveAccess(true, members, user?.id ?? null);
  if (access.kind === "denied") return Response.json({ error: access.error, claimed: true }, { status: access.status });
  if (access.kind === "member") {
    headers.set("x-role", access.member.role);
    headers.set("x-gw-member-id", access.member.user_id);
    headers.set("x-gw-member-name", encodeURIComponent(access.member.name));
  }
  return pass();
}

export const config = { matcher: ["/api/:path*"] };
