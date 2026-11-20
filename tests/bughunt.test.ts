// Faults found by the bug hunt on the live site (20 Nov 2026), each pinned by a test. See docs/TESTING.md, "Bug hunt (20 Nov)".
import { beforeAll, describe, expect, it, vi } from "vitest";
import { logoProblem } from "../src/lib/schemas";

// A tiny in-memory stand-in for the one table bumpKit touches, with the database's behaviour that matters here:
// every read and write is a separate round trip, so two callers can interleave between them.
const kitRows = new Map<string, { version: number }>();
const tick = () => new Promise((r) => setTimeout(r, Math.random() * 5));
function table() {
  const where: Record<string, unknown> = {};
  let patch: Record<string, unknown> | null = null;
  const q = {
    select: () => q,
    update: (p: Record<string, unknown>) => { patch = p; return q; },
    eq: (k: string, v: unknown) => { where[k] = v; return q; },
    single: async () => { await tick(); return { data: { ...kitRows.get(where.ws as string)! }, error: null }; },
    then: (res: (v: unknown) => void) => (async () => {
      await tick();
      const row = kitRows.get(where.ws as string)!;
      if (patch && (where.version === undefined || row.version === where.version)) { Object.assign(row, patch); return { data: [row], error: null }; }
      return { data: [], error: null };
    })().then(res),
  };
  return q;
}
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: () => table() }) }));

let db: typeof import("../src/lib/db");
beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://fake.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||= "fake";
  db = await import("../src/lib/db");
});

describe("bug hunt, 20 Nov 2026", () => {
  it("five Brand Kit changes saved at the same moment make five versions (live: 1 became 3, not 6)", async () => {
    kitRows.set("ws-race", { version: 1 });
    const got = await Promise.all(Array.from({ length: 5 }, () => db.bumpKit("ws-race")));
    expect(kitRows.get("ws-race")!.version).toBe(6);
    expect([...got].sort()).toEqual([2, 3, 4, 5, 6]);
  });

  it("a body of null, a list, a string or a number is a 400 with a message, not a crash (live: 500 on 8 routes)", async () => {
    for (const raw of ["null", "[]", "\"x\"", "5", "true"]) {
      const err = await db.readBody(new Request("http://x/", { method: "POST", body: raw })).catch((e) => e);
      expect(err, raw).toBeInstanceOf(db.BadInput);
      expect(db.fail(err, 500).status, raw).toBe(400);
    }
    expect(await db.readBody(new Request("http://x/", { method: "POST", body: "{\"a\":1}" }))).toEqual({ a: 1 });
  });

  it("the seeded approved draft has one fixed ID per workspace, so two seedings at once insert it once (live: 3 resets made 3)", () => {
    const a = db.seedDraftId("ws-one");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(db.seedDraftId("ws-one")).toBe(a);
    expect(db.seedDraftId("ws-two")).not.toBe(a);
  });

  it("a logo must really be a PNG or WebP image (live: \"data:image/png;base64,notbase64!!!\" was saved)", () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    expect(logoProblem(png)).toBeNull();
    expect(logoProblem("/brand/preppath-mark.png")).toBeNull();
    expect(logoProblem("data:image/png;base64,notbase64!!!")).toMatch(/PNG or WebP/);
    expect(logoProblem("data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD")).toMatch(/not a real PNG/);
    expect(logoProblem("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toMatch(/PNG or WebP/);
    expect(logoProblem("data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==")).toBeNull();
    expect(logoProblem(42)).toMatch(/PNG or WebP/);
  });
});
