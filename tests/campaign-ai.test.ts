// The AI checks also read every campaign document and the text in each creative. A fake AI stands in for the
// provider: findings are placed in the document that holds the quote, personal data never reaches it, and a
// quote that is in no source is dropped.
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = { seen: [] as string[], quote: "" };

vi.mock("../src/lib/engine/ai", () => ({
  aiAvailable: () => true,
  aiModel: () => "fake-ai",
  extractClaims: async () => [],
  readCreative: async () => ({ text: "", people: [] }),
  judgeRule: async (rule: { id: string }, text: string) => {
    fake.seen.push(text);
    // Only the guaranteed-outcomes rule finds something, and only in the campaign request (not the caption's).
    return rule.id === "R-12" && text.includes("[brochure]") && fake.quote ? [{ quote: fake.quote, explanation: "Implies a guaranteed seat.", fix: "Our mentors help you prepare for IIT" }] : [];
  },
}));

const { reviewDraft } = await import("../src/lib/engine/review");
const { SEED_FACTS, SEED_KIT, SEED_RULES } = await import("../src/lib/seed");

const run = (assets: { name: string; text: string }[], images: { name: string; alt: string; colours: never[]; ocr: string }[] = []) =>
  reviewDraft("JEE crash course for droppers. Starts 5 January.", null, SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: true, contentType: "social", assets, images });

beforeEach(() => { fake.seen = []; fake.quote = ""; });

describe("AI checks on campaign documents and creatives", () => {
  it("places a reworded guarantee in the brochure that holds it", async () => {
    fake.quote = "your IIT seat is assured";
    const { findings, stats } = await run([
      { name: "landing page", text: "Enrol for the crash course at preppath.in." },
      { name: "brochure", text: "Join PrepPath and your IIT seat is assured. Call 98765 43210." },
    ]);
    const f = findings.find((x) => x.rule_id === "R-12" && x.location === "asset:2");
    expect(f?.quote).toBe("your IIT seat is assured");
    expect(f?.message).toMatch(/^In the brochure:/);
    expect(f?.fix).toBeNull();
    expect(f?.fix_note).toMatch(/Change the wording in the brochure/);
    expect(stats.aiFindings).toBeGreaterThanOrEqual(1);
  });

  it("masks personal data in documents before the AI sees them", async () => {
    await run([{ name: "brochure", text: "Write to riya.sharma@gmail.com or call 98765 43210 for the crash course." }]);
    const campaign = fake.seen.filter((t) => t.includes("[brochure]"));
    expect(campaign.length).toBeGreaterThan(0);
    for (const t of campaign) {
      expect(t).not.toContain("riya.sharma@gmail.com");
      expect(t).not.toContain("98765 43210");
    }
  });

  it("drops a quote that is in no document or creative", async () => {
    fake.quote = "admission guaranteed at IIT Bombay";
    const { findings, stats } = await run([{ name: "brochure", text: "Join the crash course this January." }]);
    expect(findings.some((x) => x.quote === fake.quote)).toBe(false);
    expect(stats.droppedByVerifier.some((d) => d.reason === "quote is not in any campaign document or image")).toBe(true);
  });

  it("reads the text in a creative too", async () => {
    fake.quote = "Seat assured";
    const { findings } = await run([{ name: "brochure", text: "Join the crash course this January." }],
      [{ name: "c.png", alt: "Crash course creative", colours: [], ocr: "JEE Crash Course\nSeat assured for every dropper" }]);
    expect(findings.find((x) => x.rule_id === "R-12" && x.location === "image:1")?.message).toMatch(/^In the text of image 1:/);
  });

  it("never sends a confidential campaign", async () => {
    fake.quote = "your IIT seat is assured";
    await reviewDraft("Crash course.", { goal: "", audience: "", cta: "", confidential: true }, SEED_RULES, SEED_FACTS, SEED_KIT,
      { useAI: true, assets: [{ name: "brochure", text: "Join PrepPath and your IIT seat is assured." }] });
    expect(fake.seen).toEqual([]);
  });
});
