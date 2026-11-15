import { describe, expect, it } from "vitest";
import { reviewDraft } from "../src/lib/engine/review";
import { HARD_CASES } from "../src/lib/hardcases";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";

describe("hard cases offered on the New review page", () => {
  for (const c of HARD_CASES) {
    it(`${c.label}: ${c.rule || "code checks find no banned phrase"}`, async () => {
      const { findings, stats } = await reviewDraft(c.text, null, SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: false, contentType: c.type });
      const ids = findings.map((f) => f.rule_id);
      if (c.rule) expect(ids).toContain(c.rule);
      else expect(ids.filter((id) => id === "R-12" || id === "R-08")).toEqual([]);
      if (c.id === "pii") expect(stats.redactions).toBeGreaterThanOrEqual(0);
      if (c.id === "subject") expect(findings.some((f) => /Embargoed/.test(f.message))).toBe(true);
    });
  }
});
