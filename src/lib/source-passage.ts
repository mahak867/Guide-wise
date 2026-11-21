import type { Rule } from "./types";

/**
 * The passage a rule was written from, to show under a finding: the exact guide text the compiler quoted when the
 * rule was proposed (config.source_passage), with the source it came from. Null when the rule has no stored passage;
 * a passage is never made up from the rule's title or description.
 */
export function sourcePassage(rule: Pick<Rule, "source" | "config"> | null | undefined, max = 240): { quote: string; from: string } | null {
  const raw = rule?.config?.source_passage;
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim().replace(/^["“”']+|["“”']+$/g, "").trim();
  if (text.length < 3) return null;
  const quote = text.length <= max ? text : text.slice(0, text.lastIndexOf(" ", max - 1) > max / 2 ? text.lastIndexOf(" ", max - 1) : max - 1).trimEnd() + "…";
  const named = rule?.config?.source_name;
  return { quote, from: (typeof named === "string" && named.trim()) || rule?.source?.trim() || "Brand guide" };
}
