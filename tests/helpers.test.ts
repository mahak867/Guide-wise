// The two AI helpers (guide compiler, rule amendment): what code does around the AI, with the AI replaced by fixed answers.
import { describe, expect, it } from "vitest";
import { applyConfigChange, checkAmendment, cleanProposal, closeTo, codeFlags, dismissedSentence, testProblems, type Dismissed } from "../src/lib/amend";
import { compileFromGuide, findContradictions, proposalConfig, type CompiledRule } from "../src/lib/compile";
import { dropExcepted, runCodeRule } from "../src/lib/engine/code";
import type { CompiledKit } from "../src/lib/engine/ai";
import { flagsNothing } from "../src/lib/schemas";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";
import type { Rule } from "../src/lib/types";

const proposal = (o: Partial<CompiledRule>): CompiledRule => ({
  title: "T", description: "A rule from the guide.", kind: "code", category: "term", severity: "major", avoid: [], prefer: "", required_phrase: "",
  flag_example: "", pass_example: "", source_passage: "", ...o,
});
const fakeAI = (out: CompiledKit, seen: string[] = []) => async (text: string) => { seen.push(text); return out; };
const rule = (id: string) => SEED_RULES.find((r) => r.id === id)! as Rule;
const asRule = (c: { kind: Rule["kind"]; category: string; config: Rule["config"] }): Rule => ({ id: "X", title: "X", description: "X", severity: "major", status: "advisory", source: "", risk: "low", tests: [], ...c });

describe("guide compiler: personal data and the source check", () => {
  const guide = "Only publish the approved admissions contacts: admissions@brightpath.in and 1800 123 4567. Never share a teacher's personal phone number or email. Keep it engaging.";

  it("never sends an email address to the AI, and keeps the rule whose quote held a placeholder", async () => {
    const seen: string[] = [];
    const out = await compileFromGuide(guide, async (text) => {
      seen.push(text);
      const quote = text.split(". ")[0]; // the AI quotes the redacted text, placeholder included
      expect(quote).toContain("[EMAIL_1]");
      return { rules: [proposal({ kind: "judgment", category: "claim", title: "Approved contacts only", source_passage: quote, flag_example: "Email [EMAIL_1] or priya@gmail.com", pass_example: "Email [EMAIL_1]." })], warnings: [{ passage: "Keep it engaging.", problem: "Too vague to check." }] };
    });
    expect(seen.join("")).not.toContain("admissions@brightpath.in");
    expect(out.dropped).toBe(0);
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0].source_passage).toContain("admissions@brightpath.in");
    expect(out.rules[0].pass_example).toBe("Email admissions@brightpath.in.");
    expect(out.warnings.map((w) => w.kind)).toEqual(["vague"]);
  });

  it("still drops a proposal whose quote is not in the guide", async () => {
    const out = await compileFromGuide(guide, fakeAI({ rules: [proposal({ avoid: ["cheap"], source_passage: "Never call fees cheap." })], warnings: [{ passage: "Be bold.", problem: "vague" }] }));
    expect(out.rules).toHaveLength(0);
    expect(out.dropped).toBe(2);
  });
});

describe("guide compiler: every proposal is saved with the config it was proposed with", () => {
  it("keeps a pattern rule's phrases, so it flags what it says", () => {
    const c = proposalConfig(proposal({ category: "pattern", avoid: ["!!"] }));
    expect("problem" in c).toBe(false);
    if ("problem" in c) return;
    expect(c.config.patterns).toEqual(["!!"]);
    expect(runCodeRule(asRule(c), "Results are out!!", [], SEED_KIT)).toHaveLength(1);
    expect(runCodeRule(asRule(c), "Results are out!", [], SEED_KIT)).toHaveLength(0);
  });

  it("models a required line as a 'requires' check, not as a banned word", () => {
    const p = proposal({ category: "required", avoid: ["fee"], required_phrase: "Fees are subject to the published fee policy.", flag_example: "The fee for the JEE batch is 40,000.", pass_example: "The fee for the JEE batch is 40,000. Fees are subject to the published fee policy." });
    const c = proposalConfig(p);
    if ("problem" in c) throw new Error(c.problem);
    expect(c.category).toBe("requires");
    const r = asRule(c);
    expect(runCodeRule(r, p.flag_example, [], SEED_KIT)).toHaveLength(1);
    expect(runCodeRule(r, p.pass_example, [], SEED_KIT)).toHaveLength(0);
    expect(runCodeRule(r, "Classes start on 1 December.", [], SEED_KIT)).toHaveLength(0);
  });

  it("drops an empty banned word and explains why in a warning", async () => {
    const guide = "Write every post in English only. Posts for Hindi-speaking parents must be written in Hindi. Never mention a competitor by name.";
    const out = await compileFromGuide(guide, fakeAI({ rules: [proposal({ title: "No competitor names", avoid: [""], source_passage: "Never mention a competitor by name." })], warnings: [] }));
    expect(out.rules).toHaveLength(0);
    expect(out.refused).toBe(1);
    const w = out.warnings.find((x) => x.kind === "dropped");
    expect(w?.passage).toBe("Never mention a competitor by name.");
    expect(w?.problem).toMatch(/no words to flag.*empty word/);
  });

  it("marks a proposal whose own examples disagree with its check", async () => {
    const guide = "Mention the fee only with the line: Fees are subject to the published fee policy. Call teachers mentors.";
    const out = await compileFromGuide(guide, fakeAI({ rules: [proposal({ avoid: ["fee", "fees"], source_passage: "Mention the fee only with the line: Fees are subject to the published fee policy.", flag_example: "Our fee is low.", pass_example: "Fees are subject to the published fee policy." })], warnings: [] }));
    expect(out.rules[0].own_examples_ok).toBe(false);
  });
});

describe("saving a rule: a code check that can flag nothing is refused", () => {
  it.each([
    [{ kind: "code", category: "pattern", config: {} }, /no phrases or patterns/],
    [{ kind: "code", category: "term", config: { avoid: [], prefer: "x" } }, /no words to flag/],
    [{ kind: "code", category: "requires", config: { patterns: ["fee"] } }, /no required words/],
    [{ kind: "code", category: "brand-name", config: { names: [] } }, /no names/],
  ])("%o", (r, why) => expect(flagsNothing(r)).toMatch(why));

  it("accepts every seeded rule and judgment rules without patterns", () => {
    for (const r of SEED_RULES) expect(flagsNothing(r), r.id).toBeNull();
    expect(flagsNothing({ kind: "judgment", category: "tone", config: {} })).toBeNull();
  });
});

describe("contradictions found by code", () => {
  const sides = (g: string) => findContradictions(g).map((w) => [w.passage, w.problem.match(/^Contradicts "(.+?)":/)?.[1]]);

  it("finds English only against a Hindi requirement", () => {
    expect(sides("Write every post in English only. Posts for Hindi-speaking parents must be written in Hindi. Never mention a competitor by name.")).toEqual([
      ["Write every post in English only.", "Posts for Hindi-speaking parents must be written in Hindi."],
    ]);
  });

  it("finds emoji, exclamation marks and capitals asked for and banned for the same posts", () => {
    expect(sides("Always use emoji in Instagram captions to feel friendly. Never use emoji in any post.")).toHaveLength(1);
    expect(sides("Never use exclamation marks. Always end a greeting with exclamation marks.")).toHaveLength(1);
    expect(sides("Use capitals for emphasis in headlines. Never use capitals for emphasis.")).toHaveLength(1);
  });

  it("does not warn about limits, different channels or different uses", () => {
    expect(sides("Do not use more than one exclamation mark in a sentence. Use exclamation marks in greetings.")).toEqual([]);
    expect(sides("Use emoji on Instagram. Never use emoji in emails.")).toEqual([]);
    expect(sides("Write exam names such as NEET in capitals. Never use capitals for emphasis.")).toEqual([]);
    expect(sides("Write in English. Never use Hinglish.")).toEqual([]);
  });

  it("stays quiet on the measured passages that have no such contradiction", () => {
    for (const g of [
      "Call our teachers mentors, never tutors. Write \"online classes\", not \"e-learning\". Never describe our fees as cheap; say affordable.",
      "Never promise a guaranteed rank or a guaranteed seat. Be professional where appropriate. Any post that mentions results must end with: Past results do not guarantee future selection.",
      "Do not use countdowns or phrases like \"last chance\" or \"only a few seats left\". Give the real start date instead. Do not use more than one exclamation mark in a sentence.",
      "Do not call students weak or slow learners; say students who need more support. Address the reader as \"you\". Avoid \"hey guys\"; write \"hi everyone\".",
      "Do not call us the best or number one coaching institute unless an approved fact supports it. Use a modern, premium feel. Mention the fee only with the line: Fees are subject to the published fee policy.",
    ]) expect(sides(g), g).toEqual([]);
  });

  it("adds the warning the AI missed, and marks the rules built from either side", async () => {
    const guide = "Write every post in English only. Posts for Hindi-speaking parents must be written in Hindi. Never mention a competitor by name.";
    const out = await compileFromGuide(guide, fakeAI({ rules: [proposal({ kind: "judgment", category: "tone", source_passage: "Write every post in English only." })], warnings: [] }));
    expect(out.warnings.filter((w) => w.kind === "contradiction")).toHaveLength(1);
    expect(out.rules[0].conflict).toBeTruthy();
    // Not repeated when the AI already warned about it.
    const again = await compileFromGuide(guide, fakeAI({ rules: [], warnings: [{ passage: "Posts for Hindi-speaking parents must be written in Hindi.", problem: "Contradicts the English-only passage." }] }));
    expect(again.warnings).toHaveLength(1);
  });
});

describe("rule exceptions", () => {
  it("drop a finding only where every occurrence sits inside an exception", () => {
    const r = { ...rule("TERM-2"), config: { ...rule("TERM-2").config, except: ["cheap tricks"] } };
    expect(runCodeRule(r, "Cheap tricks do not crack JEE.", [], SEED_KIT)).toHaveLength(0);
    expect(runCodeRule(r, "Cheap tricks fail. A cheap course fails too.", [], SEED_KIT).map((f) => f.quote)).toEqual(["cheap"]);
    expect(dropExcepted(r, "x", [{ quote: "cheap" }])).toHaveLength(1);
  });
});

describe("rule amendment: the check has to change, not only the wording", () => {
  const dismissedTerm: Dismissed[] = [{ quote: "Cheap", sentence: "Cheap tricks do not crack JEE.", reason: "The rule does not apply to this content" }];

  it("finds the sentence a dismissed finding sat in", () => {
    expect(dismissedSentence("Cheap tricks do not crack JEE. Steady weekly practice does.", "Cheap")).toBe("Cheap tricks do not crack JEE.");
    expect(dismissedSentence("Happy Diwali!! Classes resume on 4 November.", "!!")).toBe("Happy Diwali!!");
    expect(dismissedSentence("Other text", "gone")).toBe("gone");
  });

  it("an exception from the dismissed text resolves the dismissal, and every old and new test passes", async () => {
    const c = await checkAmendment(rule("TERM-2"), {
      description: "Describe our fees as affordable, never cheap. Other uses of the word, like cheap tricks, are fine.", guidance: "Cheap tricks or shortcuts are fine.",
      flag_example: "Our cheap crash course starts Monday.", pass_example: "Cheap tricks do not crack JEE.", what_changed: "Limited to fees.",
      config_change: { except: ["cheap tricks"], allow: [], narrow: [] },
    }, dismissedTerm, SEED_FACTS, SEED_KIT);
    expect(c.problems).toEqual([]);
    expect(c.run.passed).toBe(true);
    expect(c.run.results).toHaveLength(rule("TERM-2").tests.length + 2);
    expect(c.dismissed).toEqual([{ text: "Cheap tricks do not crack JEE.", still_flagged: false }]);
    expect(c.resolves).toBe(true);
    expect(c.changes).toEqual(['Not flagged inside "cheap tricks"']);
  });

  it("wording that allows the text while the check still flags it is not marked as resolving", async () => {
    const c = await checkAmendment(rule("TERM-2"), {
      description: "Describe fees as affordable. Cheap tricks are allowed.", guidance: "", flag_example: "Our cheap crash course starts Monday.", pass_example: "Shortcut tricks do not crack JEE.", what_changed: "",
    }, dismissedTerm, SEED_FACTS, SEED_KIT);
    expect(c.problems).toEqual([]);
    expect(c.run.passed).toBe(true);
    expect(c.dismissed[0].still_flagged).toBe(true);
    expect(c.resolves).toBe(false);
  });

  it("refuses an amendment that returns the rule's existing tests", () => {
    const r = rule("TERM-2");
    const p = cleanProposal({ description: "Describe fees as affordable.", flag_example: r.tests[0].text, pass_example: r.tests[1].text });
    const problems = testProblems(r, p, ["Cheap tricks do not crack JEE."]);
    expect(problems).toHaveLength(2);
    expect(problems.every((x) => /repeats one of the rule's existing tests/.test(x))).toBe(true);
  });

  it("refuses a pass sentence that is not taken from the dismissed text", () => {
    const p = cleanProposal({ description: "Describe fees as affordable.", flag_example: "A cheap course.", pass_example: "Our fees are fair and clear." });
    expect(testProblems(rule("TERM-2"), p, ["Cheap tricks do not crack JEE."])[0]).toMatch(/not taken from the text reviewers dismissed/);
    expect(closeTo("Cheap tricks do not crack JEE.", "Shortcut tricks do not crack JEE.")).toBe(true);
  });

  it("limits config changes to safe ones", () => {
    expect(applyConfigChange(rule("TERM-2"), { except: ["cheap"], allow: [], narrow: [] }).problems[0]).toMatch(/single word/);
    expect(applyConfigChange(rule("TERM-2"), { except: [], allow: ["NCERT"], narrow: [] }).problems[0]).toMatch(/not a rule about capitals/);
    expect(applyConfigChange(rule("R-10"), { except: [], allow: [], narrow: [{ from: "nope", to: "x" }] }).problems[0]).toMatch(/not one of this rule's patterns/);
    expect(applyConfigChange(rule("R-10"), { except: [], allow: [], narrow: [{ from: "hurry!*", to: "(a+)+" }] }).problems[0]).toMatch(/repeats a group/);
  });

  it("capitals allowed and narrower patterns change what code flags", async () => {
    const caps = await checkAmendment(rule("STY-CAPS"), {
      description: "Words are not set in capitals to shout. Exam and board names such as NCERT are fine.", guidance: "",
      flag_example: "ADMISSIONS CLOSING for the NCERT batch.", pass_example: "Read the NCERT textbook before the batch starts.", what_changed: "",
      config_change: { except: [], allow: ["NCERT"], narrow: [] },
    }, [{ quote: "NCERT", sentence: "Read the NCERT textbook before the December batch starts.", reason: "The flag is wrong" }], SEED_FACTS, SEED_KIT);
    expect(caps.problems).toEqual([]);
    expect(caps.run.passed).toBe(true);
    expect(caps.resolves).toBe(true);

    const r10 = rule("R-10");
    const text = "No need to hurry: admissions stay open until 31 March.";
    expect(codeFlags(r10, text, SEED_FACTS, SEED_KIT)).toBe(true);
    const { config, problems } = applyConfigChange(r10, { except: ["no need to hurry"], allow: [], narrow: [] });
    expect(problems).toEqual([]);
    expect(codeFlags({ ...r10, config }, text, SEED_FACTS, SEED_KIT)).toBe(false);
    expect(codeFlags({ ...r10, config }, "Hurry, only a few seats left!", SEED_FACTS, SEED_KIT)).toBe(true);
  });
});
