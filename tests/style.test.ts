import { describe, expect, it } from "vitest";
import { reviewDraft } from "../src/lib/engine/review";
import { runVisualChecks } from "../src/lib/engine/visual";
import { verify } from "../src/lib/engine/verify";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";

const review = (text: string, contentType = "social") =>
  reviewDraft(text, null, SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: false, contentType });
const by = async (text: string, rule: string, type?: string) => (await review(text, type)).findings.filter((f) => f.rule_id === rule);

describe("writing-style rules", () => {
  it("fixes the brand name but leaves web and email addresses alone", async () => {
    const f = await by("Join Preppath or Prep Path today. Mail admissions@preppath.in or visit preppath.in/admissions.", "NAME-1");
    expect(f.map((x) => x.quote)).toEqual(["Preppath", "Prep Path"]);
    expect(f.every((x) => x.fix === "PrepPath")).toBe(true);
  });

  it("flags words in capitals and keeps exam acronyms", async () => {
    const f = await by("HURRY! JEE ADVANCED batch with IIT faculty. NEET too.", "STY-CAPS");
    expect(f.map((x) => [x.quote, x.fix])).toEqual([["HURRY", "Hurry"], ["JEE ADVANCED", "JEE advanced"]]);
  });

  it("applies the ad length limit to ads only, quoting the hidden part", async () => {
    const long = "JEE December batch at PrepPath: two-year classroom programme with weekly tests, doubt sessions and mentors. Past results do not guarantee future selection.";
    const ad = await by(long, "STY-AD", "ad");
    expect(ad).toHaveLength(1);
    expect(long).toContain(ad[0].quote);
    expect(ad[0].quote).toMatch(/^Past results|guarantee/);
    expect(await by(long, "STY-AD", "email")).toHaveLength(0);
  });

  it("suggests splitting long sentences, as a suggestion only", async () => {
    const f = await by("Our two-year classroom programme for JEE aspirants combines weekly tests, personal mentors, doubt-clearing sessions every evening, printed study material, parent meetings and an online practice portal that you can use from home at any time.", "STY-READ");
    expect(f).toHaveLength(1);
    expect(f[0].level).toBe("suggestion");
  });

  it("offers respectful wording", async () => {
    const f = await by("Special batch for weak students.", "INC-1");
    expect(f[0].fix).toBe("students who need more support");
  });
});

describe("logo findings", () => {
  const rules = SEED_RULES.filter((r) => r.id === "VIS-LOGO");
  const img = (logo: Parameters<typeof runVisualChecks>[0][number]["logo"]) => ({ name: "a.png", alt: "", colours: [], ocr: "", logo });

  it("flags a missing logo, a small one and a crowded one; passes a good one; skips when the kit has none", () => {
    const run = (logo: Parameters<typeof img>[0]) => runVisualChecks([img(logo)], rules, SEED_FACTS, SEED_KIT);
    expect(run({ found: false, score: 0.5 })[0].message).toMatch(/does not carry the approved logo/);
    expect(run({ found: true, score: 0.9, box: { x: 0, y: 0, w: 0.05, h: 0.05 }, crowd: 0 })[0].message).toMatch(/minimum is 8%/);
    expect(run({ found: true, score: 0.9, box: { x: 0, y: 0, w: 0.12, h: 0.12 }, crowd: 0.3 })[0].message).toMatch(/clear space/);
    expect(run({ found: true, score: 0.9, box: { x: 0, y: 0, w: 0.12, h: 0.12 }, crowd: 0.02 })).toHaveLength(0);
    expect(run(null)).toHaveLength(0);
  });

  it("the verifier keeps a logo finding only when the image was searched", () => {
    const f = runVisualChecks([img({ found: false, score: 0.4 })], rules, SEED_FACTS, SEED_KIT);
    expect(verify("", f, rules, SEED_FACTS, [img({ found: false, score: 0.4 })]).kept).toHaveLength(1);
    expect(verify("", f, rules, SEED_FACTS, [img(null)]).kept).toHaveLength(0);
  });

  it("does not run length or sentence rules on text read from an image", () => {
    const long = "JEE December batch at PrepPath: two-year classroom programme with weekly tests, doubt sessions and mentors. Past results do not guarantee future selection.";
    const f = runVisualChecks([{ name: "a.png", alt: "An ad creative with the batch details", colours: [], ocr: long }], SEED_RULES, SEED_FACTS, SEED_KIT);
    expect(f.some((x) => x.rule_id === "STY-AD" || x.rule_id === "STY-READ")).toBe(false);
  });
});
