import { describe, expect, it } from "vitest";
import { analysePreview, countGraphemes, cutIndex, defaultChannel, graphemeStarts, locate, tokens, truncateGraphemes } from "../src/lib/preview";
import { DEMO_CAPTION, DEMO_INTENT, SEED_KIT, SEED_RULES } from "../src/lib/seed";

const required = SEED_RULES.filter((r) => r.category === "disclaimer" && r.status === "enforced")
  .map((r) => ({ id: r.config.fixFactId ?? "D-1", patterns: (r.config.patterns ?? []).map((e) => (typeof e === "string" ? e : { re: e.re })) }));
const kit = { disclaimers: SEED_KIT.disclaimers, required };
const D1 = "Past results do not guarantee future selection.";

describe("graphemes", () => {
  it("counts an emoji, a flag, a family and a Devanagari syllable as one character each", () => {
    expect(countGraphemes("👍🏽")).toBe(1);
    expect(countGraphemes("🇮🇳")).toBe(1);
    expect(countGraphemes("👨‍👩‍👧")).toBe(1);
    expect(countGraphemes("नि")).toBe(1); // a consonant with its vowel sign
    expect(countGraphemes("abc")).toBe(3);
    expect(graphemeStarts("a👍🏽b")).toEqual([0, 1, 5, 6]);
  });
  it("truncates without splitting a grapheme", () => {
    expect(truncateGraphemes("ab👨‍👩‍👧cd", 3)).toBe("ab👨‍👩‍👧");
    expect(truncateGraphemes("ab👨‍👩‍👧cd", 2)).toBe("ab");
    expect(truncateGraphemes("abc", 10)).toBe("abc");
  });
  it("cuts at a grapheme boundary even in a run of emoji", () => {
    const s = "🎉".repeat(130);
    const at = cutIndex(s, 125, null);
    expect(countGraphemes(s.slice(0, at))).toBe(125);
    expect(s.slice(0, at)).toBe("🎉".repeat(125));
  });
});

describe("cut by channel", () => {
  it("picks the tab from the content type", () => {
    expect(defaultChannel("social")).toBe("instagram");
    expect(defaultChannel("ad")).toBe("facebook");
    expect(defaultChannel("email")).toBe("email");
    expect(defaultChannel("landing")).toBe("screen");
    expect(defaultChannel("document")).toBe("screen");
  });
  it("does not cut text within the limit", () => {
    const p = analysePreview({ text: "Short post.", channel: "instagram" });
    expect(p.cut).toBe(false);
    expect(p.visible).toBe("Short post.");
  });
  it("cuts Instagram at 125, LinkedIn at 210, a Facebook ad at 125 and the first screen at 300, moving back to a space", () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    for (const [channel, n] of [["instagram", 125], ["linkedin", 210], ["facebook", 125], ["screen", 300]] as const) {
      const p = analysePreview({ text: words, channel });
      expect(p.cut).toBe(true);
      expect(p.shown).toBeLessThanOrEqual(n);
      expect(p.shown).toBeGreaterThan(n - 20);
      expect(p.visible + " " + p.hidden).toBe(words); // cut between words
    }
  });
  it("shows WhatsApp in full", () => {
    const p = analysePreview({ text: "x ".repeat(500), channel: "whatsapp" });
    expect(p.cut).toBe(false);
  });
  it("cuts at a line limit before the character limit", () => {
    const p = analysePreview({ text: "One\nTwo\nThree\nFour", channel: "linkedin" });
    expect(p.visible).toBe("One\nTwo\nThree");
    expect(p.hidden).toBe("Four");
    expect(analysePreview({ text: "One\nTwo\nThree", channel: "instagram" }).visible).toBe("One\nTwo");
  });
  it("counts emoji as one character in the cut", () => {
    const text = "🎉".repeat(100) + " " + "a".repeat(10) + " tail words here";
    const p = analysePreview({ text, channel: "instagram" });
    expect(p.shown).toBeLessThanOrEqual(125);
    expect(p.visible.startsWith("🎉".repeat(100))).toBe(true);
  });
  it("email: subject from a Subject line, the title or the first line, and a 90-character inbox preview", () => {
    const body = "Dear parent, the December batch starts on 1 December with weekly tests and a mentor for every student. Enrol at admissions@preppath.in.";
    const a = analysePreview({ text: "Subject: December batch\n" + body, channel: "email", title: "Ignored" });
    expect(a.subject).toBe("December batch");
    expect(a.subjectFrom).toBe("subject line");
    expect(a.shown).toBeLessThanOrEqual(90);
    expect(a.cut).toBe(true);
    const b = analysePreview({ text: body, channel: "email", title: "December batch" });
    expect([b.subject, b.subjectFrom]).toEqual(["December batch", "title"]);
    const c = analysePreview({ text: "December batch\n\n" + body, channel: "email" });
    expect([c.subject, c.subjectFrom]).toEqual(["December batch", "first line"]);
    expect(c.body.startsWith("Dear parent")).toBe(true);
  });
});

describe("what falls after the cut", () => {
  it("the sample caption: D-1 is required but missing, and the call to action is after the Instagram cut", () => {
    const p = analysePreview({ text: DEMO_CAPTION, channel: "instagram", cta: DEMO_INTENT.cta, ...kit });
    expect(p.cut).toBe(true);
    expect(p.shown).toBe(125);
    expect(p.visible.endsWith("AIR 112!")).toBe(true);
    const d1 = p.items.find((i) => i.label === "Disclaimer D-1")!;
    expect(d1.status).toBe("missing");
    expect(p.warnings.some((w) => w.tone === "warn" && w.text.includes(D1) && /not in the draft/.test(w.text))).toBe(true);
    const cta = p.items.find((i) => i.kind === "cta")!;
    expect(cta.quote).toBe("Enrol today, limited seats");
    expect(cta.status).toBe("after");
    expect(p.warnings.some((w) => w.tone === "warn" && /call to action .*after the cut/.test(w.text))).toBe(true);
    expect(p.items.find((i) => i.kind === "price")).toMatchObject({ quote: "₹39,999", status: "after" });
    // WhatsApp shows everything, so only the missing disclaimer remains a warning.
    const wa = analysePreview({ text: DEMO_CAPTION, channel: "whatsapp", cta: DEMO_INTENT.cta, ...kit });
    expect(wa.warnings.filter((w) => w.tone === "warn").map((w) => w.text)).toEqual([expect.stringContaining("Disclaimer D-1")]);
  });
  it("warns when the claim is seen but its disclaimer comes after the cut", () => {
    const text = `4,200+ JEE selections in 2025 from our two-year classroom programme, with weekly tests, doubt sessions and personal mentors for every student. ${D1}`;
    const p = analysePreview({ text, channel: "facebook", ...kit });
    expect(p.items.find((i) => i.label === "Disclaimer D-1")?.status).toBe("after");
    expect(p.items.find((i) => i.kind === "claim")).toMatchObject({ quote: "selections", status: "seen" });
    expect(p.warnings[0]).toMatchObject({ tone: "warn" });
    expect(p.warnings[0].text).toMatch(/sees the results claim .*disclaimer D-1 is after the cut/);
    // The same text on LinkedIn fits: no warning.
    expect(analysePreview({ text, channel: "linkedin", ...kit }).warnings).toEqual([]);
  });
  it("does not treat the disclaimer's own word \"selection\" as a results claim", () => {
    const p = analysePreview({ text: `Classes start 1 December. ${D1}`, channel: "instagram", ...kit });
    expect(p.items.some((i) => i.kind === "claim")).toBe(false);
    expect(p.warnings).toEqual([]);
  });
  it("finds the intent's call to action word for word, by its first word, or not at all", () => {
    const long = "Our two-year JEE programme has weekly tests, evening doubt sessions, printed material and a mentor for every student in the batch. ";
    const exact = analysePreview({ text: long + "Enquire about the December batch.", channel: "instagram", cta: "Enquire about the December batch" });
    expect(exact.items.find((i) => i.kind === "cta")).toMatchObject({ status: "after", note: "from the intent" });
    const first = analysePreview({ text: "Enrol for the crash course at admissions@preppath.in.", channel: "instagram", cta: "Enrol now" });
    expect(first.items.find((i) => i.kind === "cta")).toMatchObject({ status: "seen", note: "nearest match" });
    const none = analysePreview({ text: "Classes start 1 December.", channel: "instagram", cta: "Enquire now" });
    expect(none.items.find((i) => i.kind === "cta")?.status).toBe("missing");
    expect(none.warnings.some((w) => /not in the draft/.test(w.text))).toBe(true);
  });
  it("marks a phrase that straddles the cut as cut in half", () => {
    const text = "a".repeat(115) + " Enquire about the December batch today.";
    const p = analysePreview({ text, channel: "instagram", cta: "Enquire about the December batch" });
    expect(p.items.find((i) => i.kind === "cta")?.status).toBe("split");
  });
  it("email: a disclaimer after the inbox preview is not a warning (the reader sees it on opening)", () => {
    const text = `Subject: Results\n4,200+ JEE selections in 2025 from our two-year classroom programme, with weekly tests and mentors. ${D1}`;
    const p = analysePreview({ text, channel: "email", ...kit });
    expect(p.items.find((i) => i.label === "Disclaimer D-1")?.status).toBe("after");
    expect(p.warnings.filter((w) => w.tone === "warn")).toEqual([]);
  });
  it("finds a promo code and locates phrases ignoring case and spacing", () => {
    const p = analysePreview({ text: "Fee ₹12,999. Use code EARLY20 when you enrol.", channel: "instagram" });
    expect(p.items.find((i) => i.kind === "code")).toMatchObject({ quote: "EARLY20", status: "seen" });
    expect(locate("PAST  results do not guarantee future selection", D1)).toEqual({ start: 0, end: 47 });
  });
});

describe("rich text", () => {
  it("styles hashtags and mentions on social channels, not emails or #1", () => {
    const t = tokens("India's #1 coaching #JEE2027 with @preppath.in, mail priya.sharma@preppath.in", "instagram");
    expect(t.filter((x) => x.t !== "text").map((x) => x.v)).toEqual(["#JEE2027", "@preppath.in"]);
    expect(t.map((x) => x.v).join("")).toBe("India's #1 coaching #JEE2027 with @preppath.in, mail priya.sharma@preppath.in");
    expect(tokens("#JEE", "email")).toEqual([{ t: "text", v: "#JEE" }]);
    expect(tokens("#जेईई", "linkedin")[0].t).toBe("tag");
  });
  it("renders WhatsApp *bold*, _italic_ and ~strike~, but not 2*3*4", () => {
    const t = tokens("Batch *starts 1 December*, _limited_ ~seats~ and 2*3*4", "whatsapp");
    expect(t.filter((x) => x.t !== "text")).toEqual([{ t: "bold", v: "starts 1 December" }, { t: "italic", v: "limited" }, { t: "strike", v: "seats" }]);
  });
});
