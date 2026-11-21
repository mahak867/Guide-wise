import { describe, expect, it } from "vitest";
import { rupeeOCR } from "../src/lib/engine/code";
import { reviewDraft } from "../src/lib/engine/review";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";
import type { Fact } from "../src/lib/types";

describe("OCR rupee sign", () => {
  it("puts ₹ back for a number after $ when the brand's facts are in rupees", () => {
    expect(rupeeOCR("Fee $12,999 only. Save $ 2,000", SEED_FACTS)).toBe("Fee ₹12,999 only. Save ₹ 2,000");
  });
  it("leaves $ alone when it is not before a number", () => {
    expect(rupeeOCR("Price in $: see brochure", SEED_FACTS)).toBe("Price in $: see brochure");
  });
  it("leaves $ alone when the brand's facts are not in rupees", () => {
    const usd = SEED_FACTS.map((f) => ({ ...f, statement: f.statement.replace(/₹/g, "$") })) as Fact[];
    expect(rupeeOCR("Fee $12,999", usd)).toBe("Fee $12,999");
    expect(rupeeOCR("Fee $12,999", [])).toBe("Fee $12,999");
  });
  it("a review stores and quotes the image text with ₹", async () => {
    const r = await reviewDraft("Admissions open.", null, SEED_RULES, SEED_FACTS, SEED_KIT, {
      useAI: false, contentType: "social", images: [{ name: "c.png", alt: "", colours: [], ocr: "Fee $12,999" }],
    });
    expect(r.images[0].ocr).toBe("Fee ₹12,999");
    expect(r.findings.some((f) => f.quote.includes("$"))).toBe(false);
  });
});
