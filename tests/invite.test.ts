// Join links ("Invite a teammate"): token shape and hashing, the 7-day expiry, and how invites are read back from events.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashInviteToken, INVITE_DAYS, inviteExpiry, invitesOf, inviteUrl, inviteUsable, isInviteToken, newInviteToken, type InviteEvent } from "../src/lib/invite";
import { withoutHashes } from "../src/lib/share";

describe("invite tokens", () => {
  it("are 32 random bytes, stored only as their SHA-256 hash", () => {
    const t = newInviteToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isInviteToken(t)).toBe(true);
    expect(newInviteToken()).not.toBe(t);
    const h = hashInviteToken(t);
    expect(h).toBe(createHash("sha256").update(t).digest("hex"));
    expect(h).not.toContain(t);
  });
  it("only a token-shaped string is looked up", () => {
    for (const t of ["", "short", "x".repeat(44), "../" + "x".repeat(40), 7, undefined]) expect(isInviteToken(t)).toBe(false);
  });
  it("build a /join/ link on the site they were made on", () => {
    expect(inviteUrl("https://guidewise-kohl.vercel.app/", "tok")).toBe("https://guidewise-kohl.vercel.app/join/tok");
  });
  it("last 7 days", () => {
    expect(INVITE_DAYS).toBe(7);
    expect(inviteExpiry(new Date("2026-11-20T10:00:00Z"))).toBe("2026-11-27T10:00:00.000Z");
  });
});

describe("invitesOf and inviteUsable", () => {
  const ev = (id: number, action: string, at: string, detail: Record<string, unknown>, draft_id: string | null = null): InviteEvent => ({ id, actor: "Arjun", role: "brand", action, at, detail, draft_id });
  const now = new Date("2026-11-20T00:00:00Z");
  const evs = [
    ev(1, "invite_created", "2026-11-18T00:00:00Z", { hash: "h1", expires_at: "2026-11-25T00:00:00Z", created_by: "Arjun" }, "d-1"),
    ev(2, "invite_created", "2026-11-19T00:00:00Z", { hash: "h2", expires_at: "2026-11-26T00:00:00Z", created_by: "Meera" }),
    ev(3, "invite_created", "2026-11-01T00:00:00Z", { hash: "h3", expires_at: "2026-11-08T00:00:00Z", created_by: "Kavya" }),
    { ...ev(4, "invite_revoked", "2026-11-19T12:00:00Z", { invite_id: "2" }), actor: "Kavya" },
    ev(5, "comment", "2026-11-19T00:00:00Z", { comment: "x" }),
  ];
  it("lists invites newest first, with expiry and revocation, never the hash", () => {
    const list = invitesOf(evs, now);
    expect(list.map((i) => [i.id, i.active])).toEqual([[2, false], [1, true], [3, false]]);
    expect(list[0]).toMatchObject({ revoked_by: "Kavya", created_by: "Meera" });
    expect(list[1].draft_id).toBe("d-1");
    expect(JSON.stringify(list)).not.toMatch(/h1|h2|hash/);
  });
  it("a stored invite opens the workspace only while unexpired and not revoked", () => {
    expect(inviteUsable(evs[0], false, now)).toBe(true);
    expect(inviteUsable(evs[0], true, now)).toBe(false);
    expect(inviteUsable(evs[2], false, now)).toBe(false);
    expect(inviteUsable({ detail: {} }, false, now)).toBe(false);
    expect(inviteUsable(null, false, now)).toBe(false);
  });
  it("the activity log never carries an invite's hash", () => {
    expect(JSON.stringify(withoutHashes(evs))).not.toContain("hash");
  });
});
