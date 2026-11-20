// Read-only share links: token shape, hashing, expiry, and how shares are read back from the events log.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashShareToken, isExpired, isShareToken, newShareToken, SHARE_DAYS, shareExpiry, shareLookupAllowed, sharesOf, shareUrl, withoutHashes, type ShareEvent } from "../src/lib/share";

describe("share tokens", () => {
  it("are 32 random bytes in base64url, different every time", () => {
    const a = newShareToken(), b = newShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(a).not.toBe(b);
    expect(isShareToken(a)).toBe(true);
  });

  it("only a token-shaped string is looked up", () => {
    for (const t of ["", "abc", "x".repeat(44), "x".repeat(42) + "=", "../../etc/passwd" + "x".repeat(27), 42, null]) expect(isShareToken(t)).toBe(false);
  });

  it("are stored as a SHA-256 hash, never as themselves", () => {
    const t = newShareToken();
    const h = hashShareToken(t);
    expect(h).toBe(createHash("sha256").update(t).digest("hex"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
    expect(hashShareToken(t)).toBe(h);
  });

  it("build a /r/ link on the site they were made on", () => {
    expect(shareUrl("https://guidewise-kohl.vercel.app/", "tok")).toBe("https://guidewise-kohl.vercel.app/r/tok");
  });
});

describe("expiry", () => {
  it("is 30 days after creation", () => {
    const from = new Date("2026-11-20T10:00:00Z");
    expect(SHARE_DAYS).toBe(30);
    expect(shareExpiry(from)).toBe("2026-12-20T10:00:00.000Z");
  });

  it("a link works until its expiry and not after; a missing or broken date counts as expired", () => {
    const exp = "2026-12-20T10:00:00.000Z";
    expect(isExpired(exp, new Date("2026-12-20T09:59:59Z"))).toBe(false);
    expect(isExpired(exp, new Date("2026-12-20T10:00:00Z"))).toBe(true);
    expect(isExpired(undefined)).toBe(true);
    expect(isExpired("soon")).toBe(true);
  });
});

describe("shares from the events log", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const ev = (id: number, action: string, at: string, detail: Record<string, unknown>): ShareEvent => ({ id, action, at, actor: "Riya", role: "creator", detail });
  const events = [
    ev(1, "share_created", "2026-11-01T00:00:00Z", { hash: "h1", expires_at: "2026-12-01T00:00:00Z", created_by: "Riya" }),
    ev(2, "share_created", "2026-11-02T00:00:00Z", { hash: "h2", expires_at: "2026-12-02T00:00:00Z", created_by: "Arjun" }),
    ev(3, "share_created", "2026-10-01T00:00:00Z", { hash: "h3", expires_at: "2026-10-31T00:00:00Z", created_by: "Riya" }),
    { ...ev(4, "share_revoked", "2026-11-03T00:00:00Z", { share_id: "2" }), actor: "Kavya" },
    ev(5, "comment", "2026-11-04T00:00:00Z", { comment: "hi" }),
  ];

  it("revoked and expired links are not active; newest first", () => {
    const s = sharesOf(events, now);
    expect(s.map((x) => x.id)).toEqual([2, 1, 3]);
    expect(s.find((x) => x.id === 1)!.active).toBe(true);
    expect(s.find((x) => x.id === 2)).toMatchObject({ active: false, revoked_by: "Kavya", revoked_at: "2026-11-03T00:00:00Z" });
    expect(s.find((x) => x.id === 3)!.active).toBe(false);
  });

  it("never carries the hash", () => {
    expect(JSON.stringify(sharesOf(events, now))).not.toMatch(/"h[123]"/);
    const clean = withoutHashes(events);
    expect(JSON.stringify(clean)).not.toMatch(/"hash"/);
    expect(clean[0].detail).toEqual({ expires_at: "2026-12-01T00:00:00Z", created_by: "Riya" });
    expect(clean[4]).toBe(events[4]);
  });
});

describe("lookup rate limit", () => {
  it("allows a modest number of look-ups a minute per address, then refuses until the minute passes", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(shareLookupAllowed("203.0.113.9", 5, t + i)).toBe(true);
    expect(shareLookupAllowed("203.0.113.9", 5, t + 10)).toBe(false);
    expect(shareLookupAllowed("198.51.100.1", 5, t + 10)).toBe(true);
    expect(shareLookupAllowed("203.0.113.9", 5, t + 61_000)).toBe(true);
  });
});
