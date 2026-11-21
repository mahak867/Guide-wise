import { describe, expect, it } from "vitest";
import { extractNumberClaims, runCodeChecks } from "../src/lib/engine/code";
import { BRAND2_FACTS, BRAND2_KIT, BRAND2_RULES } from "../src/lib/eval/brand2";

const claims = (text: string) => runCodeChecks(text, BRAND2_RULES, BRAND2_FACTS, BRAND2_KIT).filter((f) => f.rule_id === "SH-CLAIM");

describe("ages are not figures", () => {
  it("skips 30-year-old, 25 years old, aged 40 and age 35", () => {
    const q = extractNumberClaims("For a 30-year-old, a 25 years old, anyone aged 40 or age 35. Join 50,000+ students.").map((c) => c.quote);
    expect(q).toEqual(["50,000+"]);
  });
  it("still reads a count of years that is not an age", () => {
    expect(extractNumberClaims("Over 25 years of teaching.").map((c) => c.quote)).toEqual(["25"]);
  });
  it("the approved price for a 30-year-old raises no figure finding", () => {
    expect(claims("Premiums start at ₹499 a month for a 30-year-old. Name the age the price is for.")).toEqual([]);
  });
});

describe("an approved contact number is not a figure", () => {
  it("the toll-free helpline is not read as 1,800 (which is fact SF-7)", () => {
    const text = "Need help with a claim? Call our toll-free helpline 1800 266 7780, open all day, every day.";
    expect(extractNumberClaims(text, ["1800 266 7780"]).map((c) => c.quote)).toEqual([]);
    expect(claims(text)).toEqual([]);
  });
  it("matches the helpline written with dashes or no spaces", () => {
    expect(extractNumberClaims("Call 1800-266-7780 or 18002667780.", ["1800 266 7780"])).toEqual([]);
  });
  it("a figure that is not the helpline is still checked", () => {
    expect(claims("1,800+ day-care procedures are covered. Call 1800 266 7780.").length).toBe(0);
    expect(claims("2,500+ day-care procedures are covered. Call 1800 266 7780.").map((f) => f.quote)).toEqual(["2,500+"]);
  });
});
