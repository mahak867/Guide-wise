// The demo shows one embargoed fact (F-9) and one expired fact (F-11). Results of the hackathon are judged for
// weeks after submission, so the demo must keep both examples, and its sample findings, well past that.
import { afterAll, describe, expect, it, vi } from "vitest";
import { reviewDraft } from "../src/lib/engine/review";
import { DEMO_CAPTION, SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";

describe("demo dates", () => {
  afterAll(() => vi.useRealTimers());
  for (const day of ["2026-11-21", "2026-12-15", "2027-02-15"]) {
    it(`keeps its embargoed and expired examples on ${day}`, async () => {
      vi.useFakeTimers({ now: new Date(`${day}T06:00:00Z`), toFake: ["Date"] });
      const { findings } = await reviewDraft(DEMO_CAPTION, null, SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: false, contentType: "social" });
      expect(findings.find((f) => f.fact_id === "F-9")?.message).toMatch(/Embargoed/);
      const f11 = SEED_FACTS.find((f) => f.id === "F-11")!;
      expect(f11.valid_until! < day).toBe(true);
      vi.useRealTimers();
    });
  }
});
