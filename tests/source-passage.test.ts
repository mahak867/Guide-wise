import { describe, expect, it } from "vitest";
import { sourcePassage } from "../src/lib/source-passage";

describe("source passage per finding", () => {
  it("returns the compiled guide passage with its source", () => {
    expect(sourcePassage({ source: "Compiled from pasted guide text", config: { source_passage: "  “Never promise a rank or a selection.” " } }))
      .toEqual({ quote: "Never promise a rank or a selection.", from: "Compiled from pasted guide text" });
  });
  it("shortens a long passage at a word, with an ellipsis", () => {
    const long = "Every claim about results must name the year, the programme and the number of students counted. ".repeat(5);
    const sp = sourcePassage({ source: "PrepPath brand guide", config: { source_passage: long } }, 120)!;
    expect(sp.quote.length).toBeLessThanOrEqual(121);
    expect(sp.quote.endsWith("…")).toBe(true);
    expect(long.replace(/\s+/g, " ")).toContain(sp.quote.slice(0, -1));
  });
  it("is null when a rule has no stored passage, so nothing is made up", () => {
    expect(sourcePassage(null)).toBeNull();
    expect(sourcePassage({ source: "Brand guide", config: {} })).toBeNull();
    expect(sourcePassage({ source: "Brand guide", config: { source_passage: " " } })).toBeNull();
  });
  it("falls back to a plain source name", () => {
    expect(sourcePassage({ source: "", config: { source_passage: "Use mentor, not tutor." } })?.from).toBe("Brand guide");
  });
});
