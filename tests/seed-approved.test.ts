import { describe, expect, it } from "vitest";
import { reviewDraft } from "../src/lib/engine/review";
import { factsUsed } from "../src/lib/impact";
import { SEED_APPROVED, SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";

describe("the demo's approved piece", () => {
  it("passes every code check as approved", async () => {
    const { findings } = await reviewDraft(SEED_APPROVED.text, null, SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: false, contentType: SEED_APPROVED.content_type });
    expect(findings.filter((f) => f.level === "violation")).toEqual([]);
  });
  it("uses fact F-3, so changing F-3 sends it back", async () => {
    expect(factsUsed(SEED_APPROVED.text, SEED_FACTS)).toContain("F-3");
    const changed = SEED_FACTS.map((f) => (f.id === "F-3" ? { ...f, value: 4500, statement: f.statement.replace("4,200", "4,500") } : f));
    const { findings } = await reviewDraft(SEED_APPROVED.text, null, SEED_RULES, changed, SEED_KIT, { useAI: false, contentType: "social" });
    expect(findings.some((f) => f.fact_id === "F-3" && f.level === "violation")).toBe(true);
  });
});
