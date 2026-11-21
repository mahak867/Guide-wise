import { describe, expect, it } from "vitest";
import { BRAND2_DOCS, BRAND2_FACTS, BRAND2_KIT, BRAND2_RULES } from "../src/lib/eval/brand2";
import { runBrandEval } from "../src/lib/eval/brands";
import { SEED_RULES } from "../src/lib/seed";

describe("second evaluation brand (Suraksha Health)", () => {
  it("has 40 drafts with unique ids, 10 of them clean", () => {
    expect(BRAND2_DOCS).toHaveLength(40);
    expect(new Set(BRAND2_DOCS.map((d) => d.id)).size).toBe(40);
    expect(BRAND2_DOCS.filter((d) => d.planted.length === 0)).toHaveLength(10);
    for (const d of BRAND2_DOCS) {
      expect(["dev", "test"]).toContain(d.split);
      expect(d.text.length).toBeGreaterThan(10);
    }
  });

  it("labels quote the draft and reference rules in its own kit", () => {
    const ids = new Set(BRAND2_RULES.map((r) => r.id));
    for (const d of BRAND2_DOCS) for (const p of d.planted) {
      expect(ids.has(p.rule), `${d.id} ${p.rule}`).toBe(true);
      expect(d.text.toLowerCase(), d.id).toContain(p.quote.toLowerCase());
    }
    expect(BRAND2_DOCS.flatMap((d) => d.planted).filter((p) => p.hard).length).toBeGreaterThanOrEqual(8);
  });

  it("kit references point at existing facts and disclaimers, and ids do not clash with PrepPath", () => {
    const facts = new Set(BRAND2_FACTS.map((f) => f.id));
    const disclaimers = new Set(BRAND2_KIT.disclaimers.map((x) => x.id));
    for (const f of BRAND2_FACTS) if (f.meta.superseded_by) expect(facts.has(f.meta.superseded_by)).toBe(true);
    for (const r of BRAND2_RULES) {
      if (r.config.fixFactId) expect(facts.has(r.config.fixFactId) || disclaimers.has(r.config.fixFactId), r.id).toBe(true);
      for (const e of r.config.patterns ?? []) if (typeof e !== "string" && e.factId) expect(facts.has(e.factId)).toBe(true);
    }
    const seed = new Set(SEED_RULES.map((r) => r.id));
    expect(BRAND2_RULES.some((r) => seed.has(r.id))).toBe(false);
    expect(BRAND2_RULES.length).toBeGreaterThanOrEqual(12);
    expect(BRAND2_FACTS.length).toBeGreaterThanOrEqual(6);
  });

  it("runs per brand and combined", async () => {
    const [a, b, both] = await Promise.all([runBrandEval("1", { useAI: false }), runBrandEval("2", { useAI: false }), runBrandEval("all", { useAI: false })]);
    expect(a.docs).toBe(40);
    expect(b.docs).toBe(40);
    expect(both.docs).toBe(80);
    expect(both.planted).toBe(a.planted + b.planted);
    expect(both.caught).toBe(a.caught + b.caught);
    expect(both.cleanDrafts.clean).toBe(a.cleanDrafts.clean + b.cleanDrafts.clean);
  });
});
