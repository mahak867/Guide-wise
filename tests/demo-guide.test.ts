import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_GUIDE_PASSAGES } from "../src/lib/demo-guide";
import { SEED_RULES } from "../src/lib/seed";
import { sourcePassage } from "../src/lib/source-passage";

const guide = readFileSync("docs/demo/PrepPath_Brand_Guide.md", "utf8");

describe("demo brand guide passages", () => {
  it("the guide says it is fictional on its first line", () => {
    expect(guide.split("\n")[0]).toMatch(/fictional/i);
  });
  it("every seed rule has a passage quoted exactly from its own numbered section", () => {
    expect(SEED_RULES).toHaveLength(31);
    for (const r of SEED_RULES) {
      const g = DEMO_GUIDE_PASSAGES[r.id];
      expect(g, r.id).toBeDefined();
      const section = guide.split(/^## /m).find((s) => s.startsWith(`${g.section}. `));
      expect(section, `${r.id} section ${g.section}`).toBeDefined();
      expect(section).toContain(`Rule ${r.id}.`);
      expect(section).toContain(g.passage);
      expect(r.config.source_passage).toBe(g.passage);
      expect(sourcePassage(r)?.from).toBe(`PrepPath Brand Guide, section ${g.section}`);
    }
  });
  it("adding passages leaves each rule's source and other config as they were", () => {
    for (const r of SEED_RULES) {
      const { source_passage: _p, source_name: _n, ...rest } = r.config;
      void _p; void _n;
      expect(Object.keys(rest).some((k) => k.startsWith("source"))).toBe(false);
      expect(r.source.length).toBeGreaterThan(3);
    }
  });
});
