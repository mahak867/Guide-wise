import { describe, expect, it } from "vitest";
import { extractNumberClaims } from "../src/lib/engine/code";
import { redact, restore } from "../src/lib/engine/redact";
import { applicableRules, reviewDraft, riskTier } from "../src/lib/engine/review";
import { runRuleTests } from "../src/lib/engine/ruletest";
import { verify } from "../src/lib/engine/verify";
import { contrast, deltaE, runVisualChecks } from "../src/lib/engine/visual";
import { EVAL_DOCS } from "../src/lib/eval/dataset";
import { runEval, wilson } from "../src/lib/eval/score";
import { DEMO_CAPTION, SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";
import type { Finding } from "../src/lib/types";

const review = (text: string) => reviewDraft(text, null, SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: false, contentType: "social" });

describe("redaction", () => {
  it("removes emails and phone numbers before AI calls and restores them", () => {
    const r = redact("Mail priya.sharma@preppath.in or call 98765 43210.");
    expect(r.text).not.toMatch(/preppath|98765/);
    expect(restore(r.text, r.map)).toBe("Mail priya.sharma@preppath.in or call 98765 43210.");
  });
});

describe("number claims", () => {
  it("ignores years, dates, ranks and contact numbers", () => {
    const q = extractNumberClaims("In 2025, AIR 112. Starts 1 December. Call +91 80000 12345. Join 50,000+ students.").map((c) => c.quote);
    expect(q).toEqual(["50,000+"]);
  });
  it("parses lakh and crore", () => {
    const c = extractNumberClaims("Scholarships worth ₹2.5 lakh and ₹1 crore.");
    expect(c.map((x) => x.value)).toEqual([250000, 10000000]);
  });
});

describe("demo caption", () => {
  it("raises every planted issue with a cited rule", async () => {
    const { findings } = await review(DEMO_CAPTION);
    const rules = new Set(findings.map((f) => f.rule_id));
    for (const r of ["R-12", "R-08", "R-CLAIM", "R-STU", "R-15", "R-10", "TERM-4", "R-DISC"]) expect(rules).toContain(r);
    for (const f of findings) {
      expect(DEMO_CAPTION).toContain(f.quote);
      expect(f.rule_text).toMatch(f.rule_id);
    }
  });
  it("ends clean except the student who needs a person, when every fix is accepted in turn", async () => {
    let t = DEMO_CAPTION;
    for (let i = 0; i < 20; i++) {
      const { findings } = await review(t);
      const f = findings.find((x) => x.fix != null);
      if (!f) break;
      t = t.replace(f.quote, f.fix!);
    }
    const { findings } = await review(t);
    expect(findings.map((f) => f.rule_id)).toEqual(["R-STU"]);
    expect(t).not.toMatch(/\.\./);
    expect(t).toContain("Past results do not guarantee future selection.");
  });
});

describe("facts register", () => {
  it("flags an embargoed fee and an expired figure", async () => {
    const { findings } = await review("Dropper fee ₹39,999. 92% of students rated their faculty 4 stars.");
    expect(findings.find((f) => f.fact_id === "F-9")?.message).toMatch(/Embargoed/);
    expect(findings.find((f) => f.fact_id === "F-11")?.message).toMatch(/Outdated/);
  });
  it("flags a figure used for the wrong subject", async () => {
    const { findings } = await review("Join 50,000+ toppers who cracked JEE.");
    expect(findings.find((f) => f.rule_id === "R-CLAIM")?.message).toMatch(/Contradicts an approved fact/);
  });
});

describe("verifier", () => {
  it("drops findings whose quote, rule or fact does not exist", () => {
    const base = { check_type: "claims", severity: "major", level: "violation", risk: "low", message: "", rule_text: "", fix_status: "none" } as const;
    const { kept, dropped } = verify("Our classes are great.", [
      { ...base, rule_id: "R-08", quote: "the best in India" },
      { ...base, rule_id: "R-99", quote: "great" },
      { ...base, rule_id: "R-08", quote: "great", fact_id: "F-404" },
      { ...base, rule_id: "R-08", quote: "great" },
    ] as Finding[], SEED_RULES, SEED_FACTS);
    expect(dropped.map((d) => d.reason)).toEqual(["quote is not in the draft", "cited rule does not exist", "cited fact does not exist"]);
    expect(kept).toHaveLength(1);
  });
});

describe("routing and applicability", () => {
  it("sends outcome claims to compliance and plain copy to brand", async () => {
    const hi = await review("100% selection guaranteed.");
    const lo = await review("Try our AI-powered doubt solver.");
    expect(riskTier(hi.findings.map((f) => ({ ...f, state: "open" }))).tier).toBe("high");
    expect(riskTier(lo.findings.map((f) => ({ ...f, state: "open" }))).tier).toBe("low");
  });
  it("shows CCPA rules as suggestions for centres with 50 or fewer students", () => {
    const small = applicableRules(SEED_RULES, { ...SEED_KIT, profile: { students_coached: 40 } });
    expect(small.find((r) => r.id === "R-12")?.status).toBe("advisory");
    expect(small.find((r) => r.id === "TERM-4")?.status).toBe("enforced");
  });
});

describe("rule tests", () => {
  it("every code rule passes its own test sentences", async () => {
    for (const r of SEED_RULES.filter((x) => x.kind === "code")) {
      const run = await runRuleTests(r, SEED_FACTS, SEED_KIT);
      expect(run.passed, `${r.id}: ${JSON.stringify(run.results)}`).toBe(true);
    }
  });
});

describe("visual checks", () => {
  it("measures colour difference and contrast", () => {
    expect(deltaE("#0F6B5F", "#0F6B5F")).toBe(0);
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });
  it("flags off-palette colour, missing alt text and claims inside the image", () => {
    const f = runVisualChecks([{ name: "a.png", alt: "", colours: [{ hex: "#E53935", share: 0.8 }, { hex: "#FFFFFF", share: 0.2 }], ocr: "100% SELECTION\nGUARANTEED\nCall 98765 43210" }], SEED_RULES, SEED_FACTS, SEED_KIT);
    const ids = f.map((x) => x.rule_id);
    expect(ids).toEqual(expect.arrayContaining(["VIS-PAL", "VIS-ALT", "R-12", "R-15"]));
    expect(f.every((x) => x.location === "image:1" && x.fix === null)).toBe(true);
  });
});

describe("evaluation", () => {
  it("uses the same 60 drafts every time", () => {
    expect(EVAL_DOCS).toHaveLength(60);
    expect(EVAL_DOCS.filter((d) => d.split === "test")).toHaveLength(40);
  });
  it("computes Wilson intervals", () => {
    const [lo, hi] = wilson(49, 49);
    expect(lo).toBeGreaterThan(0.9);
    expect(hi).toBe(1);
  });
  it("keeps precision perfect and catches every non-hard planted error with code checks", async () => {
    const r = await runEval(SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: false, split: "all" });
    expect(r.precision).toBe(1);
    const missedEasy = r.results.flatMap((d) => d.planted.filter((p) => !p.caught && !p.hard));
    expect(missedEasy).toEqual([]);
  });
});

describe("ordinary content is not flooded", () => {
  it("leaves bare numbers alone and groups unsupported figures", async () => {
    const { findings } = await review("Page 27 of 34. Room 12, floor 3. Join 2,000+ students, 300+ teachers, 40+ centres and 15+ cities.");
    const claims = findings.filter((f) => f.rule_id === "R-CLAIM");
    // Page, room and floor numbers are not claims.
    expect(claims.map((f) => f.quote)).not.toEqual(expect.arrayContaining(["27", "34", "12", "3"]));
    // "2,000+ students" is about the same subject as the approved "50,000+ students", so it contradicts it.
    expect(claims.find((f) => f.quote === "2,000+")?.message).toMatch(/Contradicts/);
    // The other three figures are about different subjects with no fact: one grouped, minor finding.
    const grouped = claims.find((f) => /3 figures have no approved fact/.test(f.message));
    expect(grouped?.severity).toBe("minor");
    expect(claims).toHaveLength(2);
  });
  it("does not compare two shades of the same surface for contrast", () => {
    const f = runVisualChecks([{ name: "dark.png", alt: "A dark dashboard screenshot", colours: [{ hex: "#1F2020", share: 0.6 }, { hex: "#2E2F2F", share: 0.3 }], ocr: "" }], SEED_RULES, SEED_FACTS, SEED_KIT);
    expect(f.filter((x) => x.rule_id === "VIS-CON")).toEqual([]);
  });
});

describe("rules limited to some content types", () => {
  const text = "Apply now: bit.ly/pp-dec";
  const run = (contentType?: string) => reviewDraft(text, null, SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: false, contentType });
  it("applies a social-only rule to social posts and ads, not to emails", async () => {
    expect((await run("social")).findings.map((f) => f.rule_id)).toContain("LINK-1");
    expect((await run("ad")).findings.map((f) => f.rule_id)).toContain("LINK-1");
    expect((await run("email")).findings.map((f) => f.rule_id)).not.toContain("LINK-1");
  });
  it("offers the full address as the fix", async () => {
    expect((await run("social")).findings.find((f) => f.rule_id === "LINK-1")?.fix).toBe("preppath.in/admissions");
  });
});
