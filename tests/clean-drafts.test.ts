import { describe, expect, it } from "vitest";
import aiResults from "../src/lib/eval/ai-results.json";
import { EVAL_DOCS } from "../src/lib/eval/dataset";
import { cleanDraftStats, runEval, summarise } from "../src/lib/eval/score";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";

const doc = (planted: number, extra: string[]) => ({
  id: "X", split: "test", text: "",
  planted: Array.from({ length: planted }, () => ({ rule: "R-12", quote: "q", caught: true })),
  extra: extra.map((level) => ({ rule: "R-08", quote: "q", level })),
});

describe("clean drafts left alone", () => {
  it("counts only drafts with nothing planted", () => {
    expect(cleanDraftStats([doc(1, []), doc(2, ["violation"])])).toEqual({ clean: 0, noViolations: 0, noFindings: 0 });
  });

  it("separates violations from suggestions", () => {
    const s = cleanDraftStats([doc(0, []), doc(0, ["suggestion"]), doc(0, ["violation"]), doc(0, ["suggestion", "violation"]), doc(1, [])]);
    expect(s).toEqual({ clean: 4, noViolations: 2, noFindings: 1 });
  });

  it("is part of every summarised report", () => {
    const r = summarise([doc(0, ["suggestion"]), doc(1, [])], SEED_RULES, "rules-only", "test");
    expect(r.cleanDrafts).toEqual({ clean: 1, noViolations: 1, noFindings: 0 });
  });

  it("held-out set, code checks: every clean draft is left alone", async () => {
    const r = await runEval(SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: false, split: "test" });
    const expected = EVAL_DOCS.filter((d) => d.split === "test" && d.planted.length === 0).length;
    expect(expected).toBe(10);
    expect(r.cleanDrafts).toEqual({ clean: expected, noViolations: expected, noFindings: expected });
  });

  it("stored AI run: computed from its per-draft results", () => {
    expect(aiResults.results).toHaveLength(40);
    expect(cleanDraftStats(aiResults.results)).toEqual({ clean: 10, noViolations: 10, noFindings: 10 });
  });
});
