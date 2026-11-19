// Brand Kit coverage added in Round 3: paid partnerships, offer conditions, competitor names, vague link text,
// CamelCase hashtags, stacked punctuation and emoji, and facts that point to their successor once they expire.
import { describe, expect, it } from "vitest";
import { runCodeRule, successor } from "../src/lib/engine/code";
import { reviewDraft, riskTier } from "../src/lib/engine/review";
import { runRuleTests } from "../src/lib/engine/ruletest";
import { EVAL_DOCS } from "../src/lib/eval/dataset";
import { HARD_CASES } from "../src/lib/hardcases";
import { RuleIn, patternProblem } from "../src/lib/schemas";
import { DEMO_CAPTION, SEED_APPROVED, SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";
import type { Fact } from "../src/lib/types";

const NEW = ["AD-PAID", "OFFER-1", "COMP-1", "LINK-2", "TAG-1", "STY-EMOJI"];
const rule = (id: string) => SEED_RULES.find((r) => r.id === id)!;
const hits = (id: string, text: string) => runCodeRule(rule(id), text, SEED_FACTS, SEED_KIT);
const review = (text: string, contentType = "social", facts: Fact[] = SEED_FACTS) =>
  reviewDraft(text, null, SEED_RULES, facts, SEED_KIT, { useAI: false, contentType });

describe("new Brand Kit rules", () => {
  it("are code rules with at least 3 flag and 3 pass sentences, and pass them all", async () => {
    for (const id of NEW) {
      const r = rule(id);
      expect(r, id).toBeDefined();
      expect(r.kind).toBe("code");
      expect(r.tests.filter((t) => t.expect === "flag").length, id).toBeGreaterThanOrEqual(3);
      expect(r.tests.filter((t) => t.expect === "pass").length, id).toBeGreaterThanOrEqual(3);
      const run = await runRuleTests(r, SEED_FACTS, SEED_KIT);
      expect(run.passed, `${id}: ${JSON.stringify(run.results.filter((x) => !x.ok))}`).toBe(true);
    }
  });
  it("are valid Brand Kit rules: every pattern compiles and is safe to store", () => {
    for (const id of NEW) {
      expect(RuleIn.safeParse(rule(id)).success, id).toBe(true);
      for (const p of [...(rule(id).config.patterns ?? []), ...(rule(id).config.requires ?? [])]) {
        expect(patternProblem(typeof p === "string" ? p : p.re), `${id}: ${String(p)}`).toBeNull();
      }
    }
  });
  it("leave the sample post, the approved piece, the hard cases and every test-set draft alone", async () => {
    const texts: [string, string][] = [[DEMO_CAPTION, "social"], [SEED_APPROVED.text, SEED_APPROVED.content_type], ...HARD_CASES.map((c) => [c.text, c.type] as [string, string])];
    for (const d of EVAL_DOCS) for (const t of ["social", "ad", "email"]) texts.push([d.text, t]);
    for (const [text, type] of texts) {
      const { findings } = await review(text, type);
      expect(findings.filter((f) => NEW.includes(f.rule_id)).map((f) => `${f.rule_id}: ${f.quote}`), text).toEqual([]);
    }
  });
});

describe("AD-PAID: paid partnerships say so", () => {
  it("flags partner wording without a label, and its fix adds #ad", async () => {
    const text = "Thanks to @preppath for the mock tests. They helped me revise.";
    const [f] = hits("AD-PAID", text);
    expect(f.quote).toBe("Thanks to @preppath for the mock tests.");
    expect(f.fix).toBe("Thanks to @preppath for the mock tests. #ad");
    const { findings } = await review(text);
    expect(findings.find((x) => x.rule_id === "AD-PAID")?.fix_status).toBe("verified");
    const fixed = (await review(text.replace(f.quote, f.fix!))).findings;
    expect(fixed.some((x) => x.rule_id === "AD-PAID")).toBe(false);
  });
  it("accepts #ad, #sponsored or Paid partnership anywhere in the post, but not #admissions", () => {
    expect(hits("AD-PAID", "Sponsored by PrepPath. #AD")).toEqual([]);
    expect(hits("AD-PAID", "Use my code RIYA10. Paid partnership.")).toEqual([]);
    expect(hits("AD-PAID", "Use my code RIYA10. #admissions")).toHaveLength(1);
  });
  it("is one finding per post, and applies to social posts only", async () => {
    expect(hits("AD-PAID", "In collaboration with @preppath. Use my code RIYA10.")).toHaveLength(1);
    expect((await review("Sponsored by PrepPath Academy.", "email")).findings.some((f) => f.rule_id === "AD-PAID")).toBe(false);
    const { findings } = await review("Sponsored by PrepPath Academy.");
    expect(riskTier(findings.map((f) => ({ ...f, state: "open" }))).tier).toBe("high");
  });
});

describe("OFFER-1: offers say when they end", () => {
  it("flags a discount, percentage, free item or promo code with no end date or T&C, as a suggestion", async () => {
    for (const t of ["Flat 15% off for droppers.", "Use promo code PREP25 at checkout.", "Get the test series free when you enrol.", "A discounted fee for siblings."]) {
      expect(hits("OFFER-1", t).length, t).toBeGreaterThan(0);
    }
    const { findings } = await review("Get 20% off with code EARLY10.");
    const f = findings.filter((x) => x.rule_id === "OFFER-1");
    expect(f).toHaveLength(1); // one finding per sentence, however many offer words it has
    expect(f[0].level).toBe("suggestion");
    expect(f[0].fix_note).toMatch(/end date/);
  });
  it("accepts an end date in several forms, or the terms", () => {
    for (const t of ["20% off, ends 30 Nov.", "Code SAVE20, valid till December 15.", "Code SAVE20 until 31/12.", "Code SAVE20. Terms and conditions apply.", "Code SAVE20. T&Cs apply."]) {
      expect(hits("OFFER-1", t), t).toEqual([]);
    }
  });
  it("leaves standing free sessions, toll-free numbers and a course start date that is not an offer alone", () => {
    for (const t of ["A free demo class runs every Sunday.", "Book a free counselling session.", "Call our toll-free number.", "Classes start 5 January."]) {
      expect(hits("OFFER-1", t), t).toEqual([]);
    }
  });
});

describe("COMP-1: no competitor names", () => {
  it("flags each competitor in any capitals or spacing, routes to compliance, and offers no automatic fix", async () => {
    const f = hits("COMP-1", "Apex  Classes and ZENITH TUTORIALS students switch to us.");
    expect(f.map((x) => x.quote)).toEqual(["Apex  Classes", "ZENITH TUTORIALS"]);
    expect(f[0].message).toMatch(/brand manager/);
    expect(f.every((x) => x.fix === null && x.risk === "high")).toBe(true);
  });
  it("does not flag a competitor's name inside a web address or a longer word", () => {
    expect(hits("COMP-1", "See apexclassesreview.com or the apex of the syllabus.")).toEqual([]);
  });
});

describe("LINK-2: links say where they lead", () => {
  it("flags click here, tap here and read more on their own, not when they say what they lead to", () => {
    expect(hits("LINK-2", "New timetable. Click here!").map((f) => f.quote)).toEqual(["Click here"]);
    expect(hits("LINK-2", "Tap here for the fee policy.")).toEqual([]);
    expect(hits("LINK-2", "Read more on our results page.")).toEqual([]);
    expect(hits("LINK-2", "Timetable: link in bio.")).toEqual([]);
  });
});

describe("TAG-1: hashtags in CamelCase", () => {
  it("splits a lower-case multi-word hashtag and fixes it", () => {
    expect(hits("TAG-1", "#jeepreparation").map((f) => f.fix)).toEqual(["#JeePreparation"]);
    expect(hits("TAG-1", "#neetprep2026 #crashcourse").map((f) => f.fix)).toEqual(["#NeetPrep2026", "#CrashCourse"]);
  });
  it("leaves single words, unknown words, CamelCase, colours and page anchors alone", () => {
    expect(hits("TAG-1", "#jee #results #motivation #together #JeePrep #e53935 preppath.in/fees#dropper")).toEqual([]);
  });
  it("leaves #preppath to the brand-name rule in a full review, so there is one fix", async () => {
    const { findings } = await review("Join us. #preppath");
    expect(findings.map((f) => f.rule_id)).toEqual(["NAME-1"]);
  });
});

describe("STY-EMOJI: no stacked punctuation or emoji clutter", () => {
  it("steps aside where the tone rule already flags the same \"!!\"", async () => {
    const { findings } = await review("Results are out!!");
    expect(findings.map((f) => f.rule_id)).toEqual(["T-2"]);
    expect((await review("Did you clear JEE Main?!")).findings.map((f) => f.rule_id)).toEqual(["STY-EMOJI"]);
  });
  it("counts flags and skin tones as one emoji each, and its fix keeps the first three", () => {
    expect(hits("STY-EMOJI", "Proud 🇮🇳 👍🏽 🎉 moment.")).toEqual([]);
    const [f] = hits("STY-EMOJI", "Results 🎉 are out 🔥 and we are proud 🚀 of you 💯.");
    expect(f.quote).toBe("🎉 are out 🔥 and we are proud 🚀 of you 💯");
    expect(f.fix).toBe("🎉 are out 🔥 and we are proud 🚀 of you");
  });
  it("applies to social posts only", async () => {
    expect((await review("🎉🎉🔥🚀 Results are out.", "email")).findings.some((f) => f.rule_id === "STY-EMOJI")).toBe(false);
  });
});

describe("superseded_by: an expired fact points to its successor", () => {
  it("names the successor in the message and offers its statement as a verified fix", async () => {
    const text = "92% of students rated our faculty 4 stars or more. Join the December batch.";
    const { findings } = await review(text);
    const f = findings.find((x) => x.fact_id === "F-11")!;
    expect(f.message).toMatch(/^Outdated fact\. F-11 .* Use F-12 instead: "94% of classroom students rated/);
    expect(f.fix).toBe(SEED_FACTS.find((x) => x.id === "F-12")!.statement);
    expect(f.fix_status).toBe("verified");
    const after = await review(text.replace(f.quote, f.fix!));
    expect(after.findings.filter((x) => x.rule_id === "R-CLAIM")).toEqual([]);
  });
  it("falls back to asking the owner when there is no valid successor", async () => {
    const noLink = SEED_FACTS.map((x) => (x.id === "F-11" ? { ...x, meta: {} } : x));
    const msg = (await review("92% of students rated our faculty 4 stars.", "social", noLink)).findings.find((x) => x.fact_id === "F-11")?.message;
    expect(msg).toMatch(/Ask Meera/);
    const f11 = SEED_FACTS.find((x) => x.id === "F-11")!;
    expect(successor(f11, SEED_FACTS)?.id).toBe("F-12");
    expect(successor(f11, SEED_FACTS.filter((x) => x.id !== "F-12"))).toBeNull();
    const expiredNext = SEED_FACTS.map((x) => (x.id === "F-12" ? { ...x, valid_until: "2026-01-01" } : x));
    expect(successor(f11, expiredNext)).toBeNull();
  });
  it("follows a chain of replacements and stops on a loop", () => {
    const f = (id: string, until: string, next?: string): Fact => ({
      id, kind: "fact", statement: id, value: 1, keywords: [], evidence: "", owner: "", valid_from: null, valid_until: until,
      disclosure: "", disclosure_keywords: [], meta: next ? { superseded_by: next } : {},
    });
    const chain = [f("A", "2020-01-01", "B"), f("B", "2021-01-01", "C"), f("C", "2099-01-01")];
    expect(successor(chain[0], chain)?.id).toBe("C");
    const loop = [f("A", "2020-01-01", "B"), f("B", "2021-01-01", "A")];
    expect(successor(loop[0], loop)).toBeNull();
  });
});
