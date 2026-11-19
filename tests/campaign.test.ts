import { describe, expect, it } from "vitest";
import { reviewDraft } from "../src/lib/engine/review";
import { runVisualChecks } from "../src/lib/engine/visual";
import { verify } from "../src/lib/engine/verify";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";

const run = (text: string, assets: { name: string; text: string }[], images: Parameters<typeof runVisualChecks>[0] = []) =>
  reviewDraft(text, null, SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: false, contentType: "social", assets, images });

describe("campaign review", () => {
  it("flags a price that differs between the creative and the brochure, routed to compliance", async () => {
    const { findings } = await run("Our JEE crash course starts 5 January.", [{ name: "brochure", text: "JEE crash course. Fee ₹14,999 including all test papers." }],
      [{ name: "c.png", alt: "Creative with the crash course fee", colours: [], ocr: "JEE crash course\nFee ₹12,999" }]);
    const f = findings.find((x) => x.rule_id === "CONS-1" && x.quote === "₹14,999")!;
    expect(f.location).toBe("asset:1");
    expect(f.message).toMatch(/image 1 says "₹12,999"/);
    expect(f.risk).toBe("high");
  });

  it("reads an OCR'd \"$\" as the rupee sign, so image prices are still compared", async () => {
    const img = (ocr: string) => [{ name: "c.png", alt: "Crash course creative", colours: [], ocr }];
    const same = await run("JEE crash course. Fee ₹12,999.", [], img("JEE Crash Course\nFee $12,999"));
    expect(same.findings.filter((x) => x.rule_id === "CONS-1")).toEqual([]);
    const diff = await run("JEE crash course. Fee ₹12,999.", [], img("JEE Crash Course\nFee $14,999"));
    const f = diff.findings.find((x) => x.rule_id === "CONS-1");
    expect(f?.location).toBe("image:1");
    expect(f?.quote).toBe("14,999");
  });

  it("flags dates and promo codes that disagree across documents", async () => {
    const { findings } = await run("Crash course starts 5 January. Use code EARLY20.", [
      { name: "landing page", text: "The crash course starts on 12 January. Use code EARLY10 at checkout." },
    ]);
    const quotes = findings.filter((x) => x.rule_id === "CONS-1").map((x) => x.quote).sort();
    expect(quotes).toEqual(["12 January", "EARLY10"]);
  });

  it("runs every text rule on each document and quotes that document", async () => {
    const { findings } = await run("Join the December batch.", [{ name: "brochure", text: "100% selection guaranteed for every student. Call 98765 43210." }]);
    const doc = findings.filter((x) => x.location === "asset:1").map((x) => x.rule_id);
    expect(doc).toEqual(expect.arrayContaining(["R-12", "R-15"]));
    expect(findings.find((x) => x.location === "asset:1" && x.rule_id === "R-12")!.message).toMatch(/^In the brochure:/);
  });

  it("flags people AI vision saw, reads stylised text OCR missed, and grounds both", () => {
    const img = { name: "c.png", alt: "Creative showing a student", colours: [], ocr: "PrepPath Academy", vision: { text: "PrepPath Academy\n100% SELECTION GUARANTEED", people: [{ description: "student holding a trophy", kind: "photo" }] } };
    const rules = SEED_RULES.filter((r) => ["VIS-PEOPLE", "R-12"].includes(r.id));
    const f = runVisualChecks([img], rules, SEED_FACTS, SEED_KIT);
    expect(f.map((x) => x.rule_id).sort()).toEqual(["R-12", "VIS-PEOPLE"]);
    expect(verify("", f, rules, SEED_FACTS, [img]).kept).toHaveLength(2);
    expect(verify("", f, rules, SEED_FACTS, [{ ...img, vision: { text: "", people: [] } }]).kept).toHaveLength(0);
  });

  it("drops a document finding whose quote is not in that document", () => {
    const rules = SEED_RULES.filter((r) => r.id === "R-12");
    const fake = { rule_id: "R-12", check_type: "code" as const, location: "asset:1", severity: "critical" as const, level: "violation" as const, risk: "high" as const, quote: "guaranteed seat", message: "", rule_text: "", fix_status: "none" as const };
    expect(verify("", [fake], rules, SEED_FACTS, [], [{ text: "Nothing like that here." }]).kept).toHaveLength(0);
  });
});
