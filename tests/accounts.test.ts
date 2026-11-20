import { describe, expect, it } from "vitest";
import { bearerOf, isMissingFunction, isMissingTable, leavesNoManager, statusOf, resolveAccess, type Member } from "@/lib/accounts";
import { actor } from "@/lib/db";

const m = (user_id: string, role: Member["role"]): Member => ({ ws: "ws-12345678", user_id, role, name: user_id, created_at: "2026-11-20T00:00:00Z" });

describe("accounts: claimed vs unclaimed", () => {
  it("a workspace with no members is the demo, whoever asks", () => {
    expect(resolveAccess(false, [], null)).toEqual({ kind: "demo" });
    expect(resolveAccess(false, [], "u1")).toEqual({ kind: "demo" });
  });
  it("a claimed workspace refuses no sign-in with 401 and a non-member with 403", () => {
    const r = resolveAccess(true, [], null);
    expect(r.kind === "denied" && r.status).toBe(401);
    const s = resolveAccess(true, [], "u2");
    expect(resolveAccess(true, [m("u1", "manager")], "u2").kind).toBe("denied");
    expect(s.kind === "denied" && s.status).toBe(403);
  });
  it("a member gets the role from the table", () => {
    const r = resolveAccess(true, [m("u1", "manager"), m("u2", "creator")], "u2");
    expect(r.kind === "member" && r.member.role).toBe("creator");
  });
  it("treats a missing members table as unclaimed, other errors not", () => {
    expect(isMissingTable({ code: "PGRST205", message: "Could not find the table 'public.members'" })).toBe(true);
    expect(isMissingTable({ code: "42P01" })).toBe(true);
    expect(isMissingTable({ code: "57014", message: "timeout" })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
    expect(isMissingFunction({ code: "PGRST202", message: "Could not find the function public.workspace_claimed" })).toBe(true);
  });
  it("maps the members functions' errors to HTTP statuses", () => {
    expect(statusOf({ code: "P0409" })).toBe(409);
    expect(statusOf({ code: "P0403" })).toBe(403);
    expect(statusOf({ code: "28000" })).toBe(401);
    expect(statusOf({ code: "XX000" })).toBe(500);
  });
});

describe("accounts: last-manager guard", () => {
  const two = [m("a", "manager"), m("b", "creator")];
  it("refuses removing or demoting the only manager, self included", () => {
    expect(leavesNoManager(two, "a", null)).toBe(true);
    expect(leavesNoManager(two, "a", "brand")).toBe(true);
  });
  it("allows it with a second manager, and any change to a non-manager", () => {
    expect(leavesNoManager([...two, m("c", "manager")], "a", null)).toBe(false);
    expect(leavesNoManager(two, "b", null)).toBe(false);
    expect(leavesNoManager(two, "a", "manager")).toBe(false);
  });
});

describe("accounts: role resolution in actor()", () => {
  it("uses x-role in a demo workspace", () => {
    expect(actor(new Request("http://x", { headers: { "x-role": "brand" } }))).toEqual({ role: "brand", name: "Arjun" });
  });
  it("uses the member's name and id when the proxy set them", () => {
    const a = actor(new Request("http://x", { headers: { "x-role": "manager", "x-gw-member-id": "u1", "x-gw-member-name": encodeURIComponent("Asha Rao") } }));
    expect(a).toEqual({ role: "manager", name: "Asha Rao", userId: "u1" });
  });
  it("takes only a JWT-shaped bearer as a sign-in token, never an API key", () => {
    expect(bearerOf(new Request("http://x", { headers: { authorization: "Bearer aaa.bbb.ccc" } }))).toBe("aaa.bbb.ccc");
    expect(bearerOf(new Request("http://x", { headers: { authorization: `Bearer gw_${"0".repeat(48)}` } }))).toBeNull();
  });
});
