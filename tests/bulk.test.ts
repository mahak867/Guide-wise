import { describe, expect, it, vi } from "vitest";
import { BulkBody, bulkRow, contentTypeOf, postsFromCsv, postsFromPaste, resultsCsv, SAMPLE_CALENDAR, SAMPLE_CSV, summarise } from "../src/lib/bulk";
import { CsvError, csvField, detectDelimiter, parseCsv, toCsv } from "../src/lib/csv";
import { SEED_FACTS, SEED_KIT, SEED_RULES } from "../src/lib/seed";

// The route reads the Brand Kit from the database; here it gets the demo kit instead.
vi.mock("../src/lib/db", async (orig) => ({
  ...(await orig<typeof import("../src/lib/db")>()),
  loadKit: async () => ({ kit: SEED_KIT, rules: SEED_RULES, facts: SEED_FACTS }),
}));
const { POST } = await import("../src/app/api/bulk/route");
const post = (body: unknown, raw?: string) =>
  POST(new Request("http://x/api/bulk", { method: "POST", headers: { "content-type": "application/json", "x-workspace": "test-bulk-ws" }, body: raw ?? JSON.stringify(body) }));

describe("CSV reader", () => {
  it("reads plain rows, CRLF and LF, and a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\n3,4\n")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
    expect(parseCsv("a,b")).toEqual([["a", "b"]]);
    expect(parseCsv("")).toEqual([]);
  });
  it("keeps commas, line breaks and doubled quotes inside quoted fields", () => {
    const rows = parseCsv('text,title\n"Fees, dates and ""seats""\nsecond line",Promo\r\n"",x');
    expect(rows).toEqual([["text", "title"], ['Fees, dates and "seats"\nsecond line', "Promo"], ["", "x"]]);
  });
  it("keeps empty fields and ignores a byte-order mark", () => {
    expect(parseCsv("﻿text,,date\n,,")).toEqual([["text", "", "date"], ["", "", ""]]);
  });
  it("names the line of a quote that is never closed", () => {
    expect(() => parseCsv('text\nok\n"never closed,\nmore')).toThrow(CsvError);
    expect(() => parseCsv('text\nok\n"never closed,\nmore')).toThrow(/line 3/);
  });
  it("reads semicolon and tab separated files", () => {
    expect(detectDelimiter("text;title;date\n")).toBe(";");
    expect(detectDelimiter("text\ttitle\n")).toBe("\t");
    expect(detectDelimiter('"a;b;c",d\n')).toBe(",");
    expect(parseCsv("text;title\nHello, world;T")).toEqual([["text", "title"], ["Hello, world", "T"]]);
  });
  it("writes fields that read back the same, and never as a formula", () => {
    const rows = [["plain", 'say "hi", twice', "two\nlines", " padded "], ["₹39,999", "x", "", "y"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
    expect(csvField("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField("+91 80000 12345")).toBe("'+91 80000 12345");
    expect(csvField(42)).toBe("42");
  });
});

describe("posts from a paste or a CSV", () => {
  it("splits pasted posts on blank lines and flags short ones", () => {
    const p = postsFromPaste("First post with enough text.\n\n  \nhi\r\n\r\nThird post, also long enough.\nSame post, next line.", "ad");
    expect(p.items.map((i) => i.label)).toEqual(["Post 1", "Post 2", "Post 3"]);
    expect(p.items[1].error).toMatch(/Post 2 is only 2 characters/);
    expect(p.items[2].text).toContain("\nSame post");
    expect(p.items.every((i) => i.content_type === "ad")).toBe(true);
    expect(p.problem).toBeUndefined();
  });
  it("refuses more than 50 posts at once", () => {
    const p = postsFromPaste(Array.from({ length: 51 }, (_, i) => `Post number ${i + 1} for the calendar.`).join("\n\n"));
    expect(p.problem).toMatch(/51 posts.*up to 50/);
    expect(postsFromPaste(Array(50).fill("A post that is long enough.").join("\n\n")).problem).toBeUndefined();
  });
  it("reads a calendar with title, content type and date columns in any order", () => {
    const csv = 'Date,Content Type,Title,Text\n2026-12-01,Social post,One,"Our adaptive practice classes, every evening."\n2026-12-02,EMAIL,Two,Write to admissions@preppath.in today.\n,,,\n2026-12-03,tiktok,Three,Short\n';
    const p = postsFromCsv(csv);
    expect(p.problem).toBeUndefined();
    expect(p.items).toHaveLength(3); // the blank row is skipped
    expect(p.items[0]).toEqual({ label: "Row 2", text: "Our adaptive practice classes, every evening.", content_type: "social", title: "One", date: "2026-12-01" });
    expect(p.items[1].content_type).toBe("email");
    expect(p.items[2].error).toMatch(/^Row 5: the text is only 5 characters.*; the content type "tiktok" is not one of/);
  });
  it("explains a file it cannot use", () => {
    expect(postsFromCsv("").problem).toMatch(/empty/);
    expect(postsFromCsv("caption_text,when\nHello there everyone,today").problem).toMatch(/called "text"/);
    expect(postsFromCsv("text\n").problem).toMatch(/no posts/);
    expect(postsFromCsv('text\n"open').problem).toMatch(/never closed/);
    expect(postsFromCsv("post\nThis column is called post, which also works.").items).toHaveLength(1);
  });
  it("maps content types as people write them", () => {
    expect(contentTypeOf("Advertisement")).toBe("ad");
    expect(contentTypeOf(" landing ")).toBe("landing");
    expect(contentTypeOf("Document or brochure")).toBe("document");
    expect(contentTypeOf("fax")).toBeNull();
  });
  it("reads the sample calendar back as six valid posts", () => {
    const p = postsFromCsv(SAMPLE_CSV);
    expect(p.items.map(({ text, title, content_type, date }) => ({ text, title, content_type, date }))).toEqual(SAMPLE_CALENDAR);
    expect(p.items.every((i) => !i.error)).toBe(true);
  });
});

describe("bulk request validation", () => {
  const ok = { text: "A post that is long enough to check." };
  it("accepts 1 to 50 posts with optional fields", () => {
    expect(BulkBody.safeParse({ posts: [ok] }).success).toBe(true);
    expect(BulkBody.safeParse({ posts: Array(50).fill({ ...ok, title: "T", content_type: "email", date: "2026-12-01" }) }).success).toBe(true);
  });
  it("refuses a bad body with a message naming the post", async () => {
    const cases: [unknown, RegExp][] = [
      [{ posts: Array(51).fill(ok) }, /up to 50 posts/],
      [{ posts: [] }, /at least one post/],
      [{ posts: [ok, { text: "short" }] }, /post 2: send at least 10 characters/],
      [{ posts: [{ text: "x".repeat(12001) }] }, /12,000 characters/],
      [{ posts: [{ ...ok, content_type: "fax" }] }, /post 1, content type: use one of social/],
      [{ posts: [{ title: "no text" }] }, /post 1: text is missing/],
      [{ posts: "nope" }, /list/],
      [{}, /list/],
      [null, /JSON object/],
    ];
    for (const [body, msg] of cases) {
      const r = await post(body);
      expect([JSON.stringify(body).slice(0, 40), r.status]).toEqual([JSON.stringify(body).slice(0, 40), 400]);
      expect((await r.json()).error).toMatch(msg);
    }
  });
  it("refuses malformed JSON", async () => {
    const r = await post(null, "{not json");
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/not valid JSON/);
  });
});

describe("bulk route results", () => {
  it("checks the sample calendar with the code checks: a mix of ready and needs fixes", async () => {
    const r = await post({ posts: SAMPLE_CALENDAR });
    expect(r.status).toBe(200);
    const out = await r.json();
    expect(out.mode).toBe("rules-only");
    expect(out.results).toHaveLength(6);
    const verdicts = out.results.map((x: { verdict: string }) => x.verdict);
    expect(verdicts).toContain("ready_for_review");
    expect(verdicts).toContain("fix_before_publishing");
    const guarantee = out.results[1];
    expect(guarantee.verdict).toBe("fix_before_publishing");
    expect(guarantee.top[0]).toMatchObject({ rule_id: "R-12", rule_title: "No guaranteed outcomes", severity: "critical", quote: "100% selection guaranteed" });
    expect(guarantee.counts.critical).toBeGreaterThan(0);
    expect(out.results[2]).toMatchObject({ verdict: "ready_for_review", violations: 0 });
  });
  it("orders findings by level and severity, counts them, and summarises the rules broken", () => {
    const titles = new Map([["A", "Rule A"], ["B", "Rule B"]]);
    const f = (rule_id: string, severity: "critical" | "major" | "minor", level: "violation" | "suggestion" = "violation") => ({ rule_id, severity, level, quote: rule_id + severity, message: "m" });
    const a = bulkRow(0, { verdict: "fix_before_publishing", findings: [f("B", "minor", "suggestion"), f("B", "minor"), f("A", "critical"), f("A", "major")] }, titles);
    expect(a.top.map((x) => x.quote)).toEqual(["Acritical", "Amajor", "Bminor"]);
    expect(a.counts).toEqual({ critical: 1, major: 1, minor: 2 });
    expect(a.broken).toEqual([{ rule_id: "B", rule_title: "Rule B" }, { rule_id: "A", rule_title: "Rule A" }]);
    const b = bulkRow(1, { verdict: "fix_before_publishing", findings: [f("A", "critical")] }, titles);
    const c = bulkRow(2, { verdict: "ready_for_review", findings: [f("C", "minor", "suggestion")] }, titles);
    expect(c.broken).toEqual([]);
    expect(summarise([a, b, c])).toEqual({ total: 3, ready: 1, fix: 2, common: [{ rule_id: "A", rule_title: "Rule A", posts: 2 }, { rule_id: "B", rule_title: "Rule B", posts: 1 }] });
    const items = [{ label: "Row 2", text: "=1+1 is two", title: "T" }, { label: "Row 3", text: "b" }, { label: "Row 4", text: "c" }];
    const rows = parseCsv(resultsCsv(items, [a, b, c]));
    expect(rows[0]).toEqual(["row", "title", "date", "content_type", "verdict", "critical", "major", "minor", "rules_broken", "top_findings", "text"]);
    expect(rows[1].slice(0, 9)).toEqual(["Row 2", "T", "", "social", "Needs fixes", "1", "1", "2", "B Rule B; A Rule A"]);
    expect(rows[1][10]).toBe("'=1+1 is two");
    expect(rows[3][4]).toBe("Ready for review");
  });
});
