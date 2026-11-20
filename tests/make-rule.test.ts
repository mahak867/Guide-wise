import { describe, expect, it } from "vitest";
import { runCodeRule } from "../src/lib/engine/code";
import { buildProposal, generalise, nextRuleId, proposalTests, withAiWording, type RuleProposal } from "../src/lib/make-rule";
import { patternProblem } from "../src/lib/schemas";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";
import type { Rule } from "../src/lib/types";

function propose(input: Parameters<typeof buildProposal>[0], rules: Rule[] = SEED_RULES): RuleProposal {
  const out = buildProposal(input, rules);
  if (!out.ok) throw new Error(out.error);
  return out.proposal;
}
const flags = (rule: Rule, text: string) => runCodeRule(rule, text, SEED_FACTS, SEED_KIT).length > 0;

describe("Make this a rule: which kind of rule", () => {
  it("makes words into a term rule, with the replacement the reviewer typed", () => {
    const p = propose({ text: "world-class faculty", replacement: "experienced mentors", sentence: "Learn from our world-class faculty this summer." });
    expect(p.type).toBe("term");
    expect(p.rule.kind).toBe("code");
    expect(p.rule.category).toBe("term");
    expect(p.rule.config).toMatchObject({ avoid: ["world-class faculty"], prefer: "experienced mentors" });
    expect(p.rule.status).toBe("advisory");
    expect(p.rule.title).toBe('Say "experienced mentors", not "world-class faculty"');
    expect(p.wording).toBe("template");
  });

  it("makes words with a number into a pattern rule in which any number matches", () => {
    const p = propose({ text: "India's #1 coaching", sentence: "Join India's #1 coaching for NEET." });
    expect(p.type).toBe("pattern");
    expect(p.rule.category).toBe("pattern");
    expect(flags(p.rule, "Join India’s #2 coaching today.")).toBe(true); // curly apostrophe, another number
    expect(flags(p.rule, "Join India's coaching for NEET.")).toBe(false);
    expect(p.check).toContain('"India\'s #N coaching"');
  });

  it("makes the selected words the preferred term when asked, flagging the words typed", () => {
    const p = propose({ text: "mentor", as: "prefer", replacement: "teacher, tutor", sentence: "Every mentor answers doubts within a day." });
    expect(p.rule.config).toMatchObject({ avoid: ["teacher", "tutor"], prefer: "mentor" });
    expect(p.rule.tests[0]).toEqual({ text: "Every teacher answers doubts within a day.", expect: "flag" });
    expect(p.rule.tests[1]).toEqual({ text: "Every mentor answers doubts within a day.", expect: "pass" });
  });

  it("flags a term in either apostrophe", () => {
    const p = propose({ text: "parents' favourite" });
    expect(flags(p.rule, "The parents’ favourite batch.")).toBe(true);
    expect(flags(p.rule, "The parents' favourite batch.")).toBe(true);
  });

  it("gives each rule a new W- ID", () => {
    expect(nextRuleId(SEED_RULES)).toBe("W-01");
    expect(nextRuleId([...SEED_RULES, { id: "W-01" }, { id: "W-02" }])).toBe("W-03");
  });
});

describe("Make this a rule: generalising numbers", () => {
  it("turns each number into a bounded 'any number' that patternProblem accepts", () => {
    const re = generalise("100% selection")!;
    expect(patternProblem(re)).toBeNull();
    const r = new RegExp(re, "gi");
    for (const s of ["100% selection", "90% selection", "99.5% selection", "100%   selection"]) expect(s.match(r)?.[0]).toBe(s);
    expect(new RegExp(generalise("4,200 selections")!, "gi").test("12,500 selections")).toBe(true);
    expect(new RegExp(re, "i").test("100% selections")).toBe(false); // a whole word, not part of one
    expect(generalise("no number here")).toBeNull();
  });

  it("stays fast on long runs of digits", () => {
    const r = new RegExp(generalise("Rank 1 guaranteed")!, "gi");
    const t0 = Date.now();
    r.test("Rank " + "1".repeat(5000) + " x");
    expect(Date.now() - t0).toBeLessThan(200);
  });
});

describe("Make this a rule: refusals", () => {
  it("refuses selections that are too short, too long or only numbers", () => {
    expect(buildProposal({ text: "ab" }, SEED_RULES)).toMatchObject({ ok: false, status: 400 });
    expect(buildProposal({ text: "  a    " }, SEED_RULES)).toMatchObject({ ok: false, status: 400 });
    expect(buildProposal({ text: "x".repeat(121) }, SEED_RULES)).toMatchObject({ ok: false, status: 400 });
    const nums = buildProposal({ text: "100 %" }, SEED_RULES);
    expect(nums.ok).toBe(false);
    if (!nums.ok) expect(nums.error).toMatch(/not only numbers/);
  });

  it("refuses a pattern that would not be safe to run", () => {
    // Forty numbers make a pattern longer than patternProblem allows.
    const out = buildProposal({ text: Array.from({ length: 40 }, (_, i) => `a${i}`).join(" ").slice(0, 120) }, SEED_RULES);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/safe check: the pattern is longer than 300 characters/);
  });

  it("refuses a duplicate of an existing rule's term, naming that rule", () => {
    const out = buildProposal({ text: "Cheap" }, SEED_RULES);
    expect(out).toMatchObject({ ok: false, status: 409 });
    if (!out.ok) expect(out.error).toMatch(/TERM-2 .*already flags "cheap"/);
    const pref = buildProposal({ text: "adaptive practice", as: "prefer", replacement: "smart learning" }, SEED_RULES);
    expect(pref).toMatchObject({ ok: false, status: 409 });
    if (!pref.ok) expect(pref.error).toMatch(/TERM-4/);
    const typed = buildProposal({ text: "experienced mentors", as: "prefer", replacement: "AI-driven" }, SEED_RULES);
    if (!typed.ok) expect(typed.error).toMatch(/TERM-4 .*already flags "AI-driven"/);
    expect(typed.ok).toBe(false);
  });

  it("refuses a replacement that the rule itself would flag, and a preferred term with nothing to flag", () => {
    expect(buildProposal({ text: "top ranked", replacement: "top ranked institute" }, SEED_RULES).ok).toBe(false);
    expect(buildProposal({ text: "100% results", replacement: "95% results" }, SEED_RULES).ok).toBe(false);
    expect(buildProposal({ text: "mentor", as: "prefer" }, SEED_RULES).ok).toBe(false);
  });

  it("notes, without refusing, an existing rule that already flags the words", () => {
    const p = propose({ text: "100% selection" });
    expect(p.covered_by.map((c) => c.id)).toContain("R-12");
  });
});

describe("Make this a rule: generated tests pass by code", () => {
  const cases: Parameters<typeof buildProposal>[0][] = [
    { text: "India's #1 coaching", sentence: "Join India's #1 coaching for NEET 2027." },
    { text: "100% selection", sentence: "100% selection guaranteed for every student." },
    { text: "100% selection", replacement: "strong results" },
    { text: "world-class faculty", replacement: "experienced mentors", sentence: "Learn from our world-class faculty this summer." },
    { text: "crash course" },
    { text: "mentor", as: "prefer", replacement: "teacher, tutor", sentence: "Every mentor answers doubts." },
    { text: "Last few seats left" , sentence: "Hurry! Last few seats left in the Kota batch." },
    { text: "crash course", sentence: "A sentence that does not hold the words." },
  ];
  for (const c of cases) {
    it(`"${c.text}"${c.as === "prefer" ? " as the preferred term" : ""}`, async () => {
      const p = propose(c);
      expect(p.rule.tests.filter((t) => t.expect === "flag").length).toBeGreaterThanOrEqual(2);
      expect(p.rule.tests.filter((t) => t.expect === "pass").length).toBeGreaterThanOrEqual(2);
      const run = await proposalTests(p, SEED_FACTS, SEED_KIT);
      expect(run.mode).toBe("code");
      expect(run.results.filter((r) => !r.ok)).toEqual([]);
      expect(run.passed).toBe(true);
    });
  }

  it("uses the reviewer's sentence as the first flag test and the sentence without the words as a pass test", () => {
    const p = propose({ text: "100% selection", sentence: "100% selection guaranteed for every student." });
    expect(p.rule.tests[0]).toEqual({ text: "100% selection guaranteed for every student.", expect: "flag" });
    expect(p.rule.tests[1]).toEqual({ text: "Guaranteed for every student.", expect: "pass" });
    expect(p.rule.tests[2]).toEqual({ text: "101% selection: join the new batch today.", expect: "flag" });
  });
});

describe("Make this a rule: AI wording", () => {
  it("takes the AI's title and description only, never the check", async () => {
    const p = propose({ text: "crash course", replacement: "short course" });
    const out = await withAiWording(p, async () => ({ title: "Say \"short course\"", description: "Call it a short course, not a crash course." }));
    expect(out.wording).toBe("ai");
    expect(out.rule.title).toBe("Say \"short course\"");
    expect(out.rule.config).toEqual(p.rule.config);
    expect(out.rule.tests).toEqual(p.rule.tests);
  });

  it("keeps the template when the AI fails or answers with unusable wording, and masks personal data", async () => {
    const p = propose({ text: "call 98765 43210 now" });
    let sent = "";
    const masked = await withAiWording(p, async (q) => { sent = q.words; return { title: "x", description: "y" }; });
    expect(sent).not.toContain("98765");
    expect(masked).toBe(p);
    expect(await withAiWording(p, async () => { throw new Error("down"); })).toBe(p);
  });
});
