import type { Fact, Finding, Intent, Kit, ReviewStats, Rule } from "../types";
import { aiAvailable, extractClaims, judgeRule } from "./ai";
import { dedupe, extractNumberClaims, runCodeChecks, type NumberClaim } from "./code";
import { redact, restore } from "./redact";
import { verify, type Dropped } from "./verify";

const key = (f: Finding) => `${f.rule_id}|${f.quote}`;

/**
 * Re-test every suggested fix before it is offered: apply it, re-run the code checks,
 * and withdraw the fix if it introduces an issue that was not there before.
 */
export function retestFixes(text: string, findings: Finding[], rules: Rule[], facts: Fact[], kit: Kit): number {
  const before = new Set(runCodeChecks(text, rules, facts, kit).map(key));
  let withdrawn = 0;
  for (const f of findings) {
    if (f.fix === null || f.fix === undefined) continue;
    const after = runCodeChecks(text.replace(f.quote, f.fix), rules, facts, kit);
    const introduced = after.find((n) => !before.has(key(n)) && f.fix!.includes(n.quote) && n.level === "violation");
    if (introduced) {
      f.fix_status = "withdrawn";
      f.fix_note = `Fix withdrawn: it would introduce a new issue (${introduced.rule_id}: "${introduced.quote}").`;
      f.fix = null;
      withdrawn++;
    } else {
      f.fix_status = "verified";
    }
  }
  return withdrawn;
}

function toFinding(rule: Rule, quote: string, explanation: string, fix: string): Finding {
  return {
    rule_id: rule.id,
    check_type: rule.category === "tone" ? "voice" : "claims",
    severity: rule.severity,
    level: rule.status === "enforced" ? "violation" : "suggestion",
    risk: rule.risk,
    quote,
    message: explanation,
    rule_text: `${rule.id} · ${rule.title}: ${rule.description}`,
    fix,
    fix_note: "AI-written suggestion, re-tested against the code checks.",
    fix_status: "none",
    precedent: rule.precedent ?? null,
  };
}

const overlaps = (a: string, b: string) => a.includes(b) || b.includes(a);

export async function reviewDraft(
  text: string,
  intent: Intent | null,
  rules: Rule[],
  facts: Fact[],
  kit: Kit,
  opts: { useAI?: boolean } = {},
): Promise<{ findings: Finding[]; stats: ReviewStats }> {
  const started = Date.now();
  const useAI = (opts.useAI ?? true) && aiAvailable();
  const { text: safe, map } = redact(text);
  const dropped: Dropped[] = [];
  let aiCalls = 0;
  let aiError: string | undefined;

  // 1. Number claims: extracted by the AI when it is on (typed fields only), otherwise by code.
  let claims: NumberClaim[] | undefined;
  if (useAI) {
    try {
      aiCalls++;
      const ex = await extractClaims(safe);
      claims = [];
      for (const c of ex) {
        const quote = restore(c.quote, map);
        const index = text.indexOf(quote);
        if (index < 0) { dropped.push({ reason: "quote is not in the draft", quote, rule_id: "claims" }); continue; }
        claims.push({ quote, value: c.value, index });
      }
      // Code extraction stays as a floor so a missed figure is still checked.
      for (const c of extractNumberClaims(text)) if (!claims.some((x) => overlaps(x.quote, c.quote))) claims.push(c);
    } catch (e) {
      aiError = e instanceof Error ? e.message : String(e);
      claims = undefined;
    }
  }

  // 2. Code checks: terms, patterns, contacts, claims against the register, student records.
  const code = runCodeChecks(text, rules, facts, kit, claims);

  // 3. AI checks: one judgment rule per call; a rule that returns a finding is run a second time.
  const ai: Finding[] = [];
  if (useAI && !aiError) {
    const judged = rules.filter((r) => r.kind === "judgment");
    const results = await Promise.allSettled(
      judged.map(async (rule) => {
        aiCalls++;
        const first = await judgeRule(rule, safe, intent);
        if (!first.length) return [] as Finding[];
        aiCalls++;
        const second = await judgeRule(rule, safe, intent).catch(() => null);
        return first.map((j) => {
          const f = toFinding(rule, restore(j.quote, map), j.explanation, restore(j.fix, map));
          // Disagreement between the two runs downgrades the finding to a suggestion.
          if (second && !second.some((s) => overlaps(restore(s.quote, map), f.quote))) {
            f.level = "suggestion";
            f.message += " (The two AI runs disagreed, so this is shown as a suggestion.)";
          }
          return f;
        });
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled") ai.push(...r.value);
      else aiError = r.reason instanceof Error ? r.reason.message : String(r.reason);
    }
  }

  // 4. Verifier, then merge: a code finding wins over an AI finding on the same words.
  const v = verify(text, ai, rules, facts);
  dropped.push(...v.dropped);
  const aiKept = v.kept.filter((a) => !code.some((c) => c.rule_id === a.rule_id && overlaps(c.quote, a.quote)));
  const vc = verify(text, code, rules, facts);
  dropped.push(...vc.dropped);
  const findings = dedupe([...vc.kept, ...aiKept]);

  // 5. Re-test fixes.
  const fixesWithdrawn = retestFixes(text, findings, rules, facts, kit);

  const order = { critical: 0, major: 1, minor: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity] || text.indexOf(a.quote) - text.indexOf(b.quote));

  return {
    findings,
    stats: {
      mode: useAI && !aiError ? "ai" : "rules-only",
      ms: Date.now() - started,
      codeFindings: vc.kept.length,
      aiFindings: aiKept.length,
      droppedByVerifier: dropped,
      fixesWithdrawn,
      aiCalls,
      redactions: map.length,
      aiError,
    },
  };
}

/** High risk goes to compliance. A fixed rule table decides, not a model. */
export function riskTier(findings: Finding[]): { tier: "low" | "high"; reasons: string[] } {
  const reasons: string[] = [];
  // Findings closed because their words were edited out no longer describe the content.
  const live = findings.filter((f) => f.state !== "resolved");
  const highRules = [...new Set(live.filter((f) => f.risk === "high").map((f) => f.rule_id))];
  if (highRules.length) reasons.push(`Outcome, claim or regulated content was flagged (${highRules.join(", ")})`);
  const open = findings.filter((f) => f.state === "open" && f.severity === "critical" && f.level === "violation");
  if (open.length) reasons.push(`${open.length} critical finding${open.length > 1 ? "s" : ""} still unresolved`);
  return { tier: reasons.length ? "high" : "low", reasons };
}
