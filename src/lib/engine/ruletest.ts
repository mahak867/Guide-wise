import type { Fact, Kit, Rule } from "../types";
import { aiAvailable, judgeRule } from "./ai";
import { patternHits, runCodeRule } from "./code";
import { altHits, contrastHits, logoHits, paletteHits, parseColourTest, parseLogoTest } from "./visual";

export type TestRun = NonNullable<Rule["last_test"]>;

/**
 * Rule test run. Each test sentence is put through the rule's own check.
 * A rule whose check fails its own tests cannot be promoted from advisory to enforced.
 */
export async function runRuleTests(rule: Rule, facts: Fact[], kit: Kit): Promise<TestRun> {
  const ai = aiAvailable();
  const results: TestRun["results"] = [];
  for (const t of rule.tests) {
    let got: string;
    if (rule.category.startsWith("visual-")) {
      const colours = parseColourTest(t.text);
      const hits =
        rule.category === "visual-palette" ? paletteHits(rule, colours, kit, "image:1", "Test image") :
        rule.category === "visual-contrast" ? contrastHits(rule, colours, "image:1", "Test image") :
        rule.category === "visual-logo" ? logoHits(rule, parseLogoTest(t.text), "image:1", "Test image") :
        altHits(rule, t.text.replace(/^alt:\s*/i, ""), "image:1", "Test image");
      got = hits.length ? "flag" : "pass";
    } else if (rule.kind === "code") {
      got = runCodeRule(rule, t.text, facts, kit).length ? "flag" : "pass";
    } else if (patternHits(rule, t.text, facts).length) {
      got = "flag";
    } else if (ai) {
      try {
        got = (await judgeRule(rule, t.text, null)).length ? "flag" : "pass";
      } catch {
        got = "AI check failed";
      }
    } else {
      got = "needs AI check";
    }
    results.push({ text: t.text, expect: t.expect, got, ok: got === t.expect });
  }
  return {
    passed: results.length > 0 && results.every((r) => r.ok),
    at: new Date().toISOString(),
    mode: rule.kind === "code" ? "code" : ai ? "code + AI" : "code only (AI off)",
    results,
  };
}
