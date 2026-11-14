import { describe, expect, it } from "vitest";
import { FactIn, Palette, RuleIn, patternProblem } from "../src/lib/schemas";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";

describe("input validation", () => {
  it("accepts every rule, fact and colour in the demo Brand Kit", () => {
    for (const r of SEED_RULES) expect([r.id, RuleIn.safeParse(r).success]).toEqual([r.id, true]);
    for (const f of SEED_FACTS) expect([f.id, FactIn.safeParse(f).success]).toEqual([f.id, true]);
    expect(Palette.safeParse(SEED_KIT.palette).success).toBe(true);
  });

  it("rejects patterns that can stall a review, or do not compile", () => {
    expect(patternProblem("(a+)+$")).toMatch(/repeats a group/);
    expect(patternProblem("(?:\\w*\\s?)*x")).toMatch(/repeats a group/);
    expect(patternProblem("(unclosed")).toMatch(/not a valid/);
    expect(patternProblem("limited\\s+seats!*")).toBeNull();
    expect(patternProblem("(?:https?://)?(?:bit\\.ly|t\\.co)/[\\w-]+")).toBeNull();
  });

  it("rejects malformed rules and facts", () => {
    const rule = { id: "X-1", kind: "code", category: "pattern", title: "t", description: "d" };
    expect(RuleIn.safeParse({ ...rule, tests: "x" }).success).toBe(false);
    expect(RuleIn.safeParse({ ...rule, severity: "apocalyptic" }).success).toBe(false);
    expect(RuleIn.safeParse({ ...rule, config: "y" }).success).toBe(false);
    const fact = { id: "F-1", statement: "s", evidence: "e" };
    expect(FactIn.safeParse({ ...fact, valid_from: "not a date" }).success).toBe(false);
    expect(FactIn.safeParse({ ...fact, valid_from: "2026-02-30" }).success).toBe(false);
    expect(FactIn.safeParse({ ...fact, valid_from: "2026-06-01", valid_until: "2026-01-01" }).success).toBe(false);
    expect(FactIn.safeParse({ ...fact, valid_from: "2026-01-01", valid_until: "2026-06-01" }).success).toBe(true);
    expect(Palette.safeParse([{ name: "x", hex: "red" }]).success).toBe(false);
  });
});
