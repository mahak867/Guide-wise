import { describe, expect, it } from "vitest";
import { describeFactChange, factsUsed } from "../src/lib/impact";
import { SEED_FACTS } from "../src/lib/seed";

const F3 = SEED_FACTS.find((f) => f.id === "F-3")!;

describe("change impact", () => {
  it("knows which facts a draft relies on: its value, its subject, or a named student", () => {
    expect([...factsUsed("4,200+ JEE selections in 2025 from our two-year classroom programme.", SEED_FACTS)]).toContain("F-3");
    expect([...factsUsed("5,000+ JEE selections last year.", SEED_FACTS)]).toContain("F-3"); // same subject, other figure
    expect([...factsUsed("Meet Aarav, AIR 112!", SEED_FACTS)]).toContain("S-1");
    expect(factsUsed("Classes start on 1 December. Write to admissions@preppath.in.", SEED_FACTS).size).toBe(0);
  });

  it("says in one line what changed in a fact", () => {
    expect(describeFactChange(F3, { ...F3, value: 4500 })).toMatch(/F-3 changed: value 4200 to 4500/);
    expect(describeFactChange(F3, { ...F3, valid_until: "2026-12-31" })).toMatch(/valid until 2027-06-30 to 2026-12-31/);
    expect(describeFactChange(F3, null)).toMatch(/F-3 was deleted/);
  });
});
