import type { Fact, Finding, Intent, Kit, ReviewStats, Rule } from "../types";
import { aiAvailable, extractClaims, judgeRule, readCreative } from "./ai";
import { dedupe, dropExcepted, extractNumberClaims, parseNumber, runCodeChecks, rupeeOCR, type NumberClaim } from "./code";
import { redact, restore } from "./redact";
import { verify, type Dropped } from "./verify";
import { consistencyHits } from "./consistency";
import { runVisualChecks, type DraftImage } from "./visual";

/**
 * The CCPA coaching guidelines (2024) apply to centres coaching more than 50 students.
 * If the Brand Kit says the organisation coaches 50 or fewer, those rules still run but only as suggestions.
 */
export function applicableRules(rules: Rule[], kit: Kit): Rule[] {
  const n = kit.profile?.students_coached;
  if (n === undefined || n === null || n > 50) return rules;
  return rules.map((r) => (/CCPA/.test(r.source) ? { ...r, status: "advisory" as const, risk: "low" as const } : r));
}

const key = (f: Finding) => `${f.rule_id}|${f.location ?? "text"}|${f.quote}`;

/**
 * Re-test every suggested fix before it is offered: apply it, re-run the code checks,
 * and withdraw the fix if it introduces an issue that was not there before.
 */
export function retestFixes(text: string, findings: Finding[], rules: Rule[], facts: Fact[], kit: Kit, locked: string[] = []): number {
  const norm = (n: Finding) => `${n.rule_id}|${n.quote.replace(/[.!?\s]+$/, "").toLowerCase()}`;
  const before = new Set(runCodeChecks(text, rules, facts, kit).map(norm));
  let withdrawn = 0;
  for (const f of findings) {
    if (f.fix === null || f.fix === undefined || (f.location && f.location !== "text")) continue;
    const count = (s: string, l: string) => s.toLowerCase().split(l.toLowerCase()).length - 1;
    const fixed = text.replace(f.quote, f.fix);
    const dropsLocked = locked.find((l) => l.trim() && count(fixed, l) < count(text, l));
    if (dropsLocked) {
      f.fix_status = "withdrawn";
      f.fix_note = `Fix withdrawn: it would remove the locked phrase "${dropsLocked}". Edit the wording by hand.`;
      f.fix = null;
      withdrawn++;
      continue;
    }
    const after = runCodeChecks(text.replace(f.quote, f.fix), rules, facts, kit);
    const introduced = after.filter((n) => !before.has(norm(n)) && n.level === "violation" && n.rule_id !== f.rule_id && (f.fix!.includes(n.quote) || n.quote.includes(f.fix!)));
    // A new issue the system can fix automatically is a follow-up, not a reason to withdraw,
    // but only for approved wording from the Brand Kit. An AI-written fix may not introduce any violation.
    const blocking = introduced.find((n) => n.fix === null || n.fix === undefined || f.origin === "ai");
    if (blocking) {
      f.fix_status = "withdrawn";
      f.fix_note = `Fix withdrawn: it would introduce a new issue (${blocking.rule_id}: "${blocking.quote}").`;
      f.fix = null;
      withdrawn++;
    } else {
      f.fix_status = "verified";
      if (introduced.length) {
        f.fix_note = `${f.fix_note ? f.fix_note + " " : ""}Accepting it raises a follow-up with its own fix: ${[...new Set(introduced.map((n) => n.rule_id))].join(", ")}.`;
      }
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
    origin: "ai",
    fix_status: "none",
    precedent: rule.precedent ?? null,
  };
}

const overlaps = (a: string, b: string) => a.includes(b) || b.includes(a);

/** A campaign document reviewed with the caption: landing-page copy, a brochure, an email. */
export interface Asset { name: string; text: string }

export async function reviewDraft(
  text: string,
  intent: Intent | null,
  rules: Rule[],
  facts: Fact[],
  kit: Kit,
  opts: { useAI?: boolean; images?: DraftImage[]; contentType?: string; aiCache?: boolean; assets?: Asset[] } = {},
): Promise<{ findings: Finding[]; stats: ReviewStats; images: DraftImage[] }> {
  const started = Date.now();
  rules = applicableRules(rules, kit);
  // A rule can be limited to some content types (for example social posts and ads only).
  if (opts.contentType) rules = rules.filter((r) => !r.config.channels?.length || r.config.channels.includes(opts.contentType!));
  // A confidential draft is never sent to an AI service, whatever the caller asked for.
  const useAI = (opts.useAI ?? true) && !intent?.confidential && aiAvailable();
  let aiCached = 0;
  const call = (variant: number) => ({ cache: opts.aiCache, variant, onCacheHit: () => { aiCached++; } });
  const { text: safe, map } = redact(text);
  const dropped: Dropped[] = [];
  let aiCalls = 0;
  let aiError: string | undefined;

  // 1. Number claims: extracted by the AI when it is on (typed fields only), otherwise by code.
  let claims: NumberClaim[] | undefined;
  if (useAI) {
    try {
      aiCalls++;
      const ex = await extractClaims(safe, call(1));
      claims = [];
      for (const c of ex) {
        const quote = restore(c.quote, map);
        const index = text.indexOf(quote);
        if (index < 0) { dropped.push({ reason: "quote is not in the draft", quote, rule_id: "claims" }); continue; }
        // The AI only locates the figure. Its value is re-read from the quoted words by code,
        // and a bare small number, time or date it picked up ("4 pm") is ignored as code would.
        const value = parseNumber(quote) ?? c.value;
        const bare = /^\d+$/.test(quote);
        const after = text.slice(index + quote.length, index + quote.length + 12).toLowerCase();
        if (bare && (value < 10 || /^\s*(am|pm|st|nd|rd|th)\b|^:\d/.test(after) || (value >= 1990 && value <= 2100))) continue;
        // A point on a rating scale ("4 stars", "4.5/5", "4 out of 5") describes the scale, not a claim to check.
        if (/\bstars?\b|\/\s*(5|10)\b|out of (5|10)\b/i.test(quote) || /^\s*(stars?\b|\/\s*(5|10)\b|out of (5|10)\b)/i.test(after)) continue;
        claims.push({ quote, value, index, source: "ai" });
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
        const first = await judgeRule(rule, safe, intent, call(1));
        if (!first.length) return [] as Finding[];
        aiCalls++;
        const second = await judgeRule(rule, safe, intent, call(2)).catch(() => null);
        // The rule's exceptions (config.except) hold for the AI part of the check too.
        return dropExcepted(rule, text, first.map((j) => {
          const f = toFinding(rule, restore(j.quote, map), j.explanation, restore(j.fix, map));
          // Disagreement between the two runs downgrades the finding to a suggestion.
          if (second && !second.some((s) => overlaps(restore(s.quote, map), f.quote))) {
            f.level = "suggestion";
            f.message += " (The two AI runs disagreed, so this is shown as a suggestion.)";
          }
          return f;
        }));
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
  // AI vision reads each creative once (cached by image): text OCR may miss, and any people shown.
  let images = (opts.images ?? []).map((img) => (img.ocr?.includes("$") ? { ...img, ocr: rupeeOCR(img.ocr, facts) } : img));
  let visionRead = 0;
  let visionError: string | undefined;
  if (useAI && images.some((i) => i.dataUrl && i.vision === undefined)) {
    images = await Promise.all(images.map(async (img) => {
      if (!img.dataUrl || img.vision !== undefined) return img;
      try { aiCalls++; visionRead++; return { ...img, vision: await readCreative(img.dataUrl, call(1)) }; } catch (e) { visionError = e instanceof Error ? e.message.slice(0, 200) : String(e); return img; }
    }));
  }
  // Campaign documents beyond the caption (landing page, brochure, email): every text rule, quoted from that document.
  const assets = opts.assets ?? [];
  const docRules = rules.filter((r) => !r.category.startsWith("visual-") && !["length", "readability", "consistency"].includes(r.category));
  const docFindings = assets.flatMap((a, i) => runCodeChecks(a.text, docRules, facts, kit).map((f) => ({
    ...f, location: `asset:${i + 1}`, message: `In the ${a.name}: ${f.message}`,
    fix_note: f.fix ? `Change the wording in the ${a.name} to: "${f.fix}"` : f.fix_note ?? null, fix: null,
  })));
  // AI checks on the rest of the campaign: every document and the text read from each creative go in one request
  // per rule (personal data masked first). Code then finds which source holds each quote; the verifier checks it.
  const aiDocFindings: Finding[] = [];
  const sources = [
    ...assets.map((a, i) => ({ label: a.name, location: `asset:${i + 1}`, text: a.text })),
    ...images.map((img, i) => ({ label: `image ${i + 1}`, location: `image:${i + 1}`, text: [img.ocr ?? "", img.vision?.text ?? ""].filter((x) => x.trim()).join("\n") })),
  ].filter((x) => x.text.trim().length >= 10);
  if (useAI && !aiError && sources.length) {
    const { text: safeAll, map: allMap } = redact(sources.map((x) => `[${x.label}]\n${x.text}`).join("\n\n"));
    const judgedDocs = rules.filter((r) => r.kind === "judgment" && !r.category.startsWith("visual-") && !["length", "readability", "consistency"].includes(r.category));
    const results = await Promise.allSettled(judgedDocs.map(async (rule) => {
      aiCalls++;
      const first = await judgeRule(rule, safeAll, intent, call(1));
      if (!first.length) return [] as Finding[];
      aiCalls++;
      const second = await judgeRule(rule, safeAll, intent, call(2)).catch(() => null);
      return first.flatMap((j) => {
        const quote = restore(j.quote, allMap);
        const src = sources.find((x) => x.text.includes(quote));
        if (src && !dropExcepted(rule, src.text, [{ quote }]).length) return [];
        if (!src) { dropped.push({ reason: "quote is not in any campaign document or image", quote, rule_id: rule.id }); return []; }
        const f = toFinding(rule, quote, j.explanation, restore(j.fix, allMap));
        if (second && !second.some((x) => overlaps(restore(x.quote, allMap), quote))) {
          f.level = "suggestion";
          f.message += " (The two AI runs disagreed, so this is shown as a suggestion.)";
        }
        const where = src.location.startsWith("image:") ? `the text of ${src.label}` : `the ${src.label}`;
        return [{ ...f, location: src.location, message: `In ${where}: ${f.message}`, fix_note: f.fix ? `Change the wording in ${where} to: "${f.fix}"` : f.fix_note ?? null, fix: null }];
      });
    }));
    for (const r of results) if (r.status === "fulfilled") aiDocFindings.push(...r.value);
    // A code finding on the same words in the same place wins over the AI's.
    const codeElsewhere = [...docFindings, ...runVisualChecks(images, rules, facts, kit)];
    for (let i = aiDocFindings.length - 1; i >= 0; i--) {
      const a = aiDocFindings[i];
      if (codeElsewhere.some((c) => c.location === a.location && c.rule_id === a.rule_id && overlaps(c.quote, a.quote))) aiDocFindings.splice(i, 1);
    }
  }
  const cross = rules.filter((r) => r.category === "consistency").flatMap((r) => consistencyHits(r, text, images, assets));
  const vis = verify(text, [...runVisualChecks(images, rules, facts, kit), ...cross, ...docFindings, ...aiDocFindings], rules, facts, images, assets);
  dropped.push(...vis.dropped);
  const seenVis = new Set<string>();
  const visual = vis.kept.filter((f) => (seenVis.has(key(f)) ? false : (seenVis.add(key(f)), true)));
  const findings = [...dedupe([...vc.kept, ...aiKept]).map((f) => ({ ...f, location: "text" })), ...visual];

  // 5. Re-test fixes.
  const fixesWithdrawn = retestFixes(text, findings, rules, facts, kit, intent?.locked ?? []);

  const order = { critical: 0, major: 1, minor: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.location ?? "").localeCompare(b.location ?? "") || text.indexOf(a.quote) - text.indexOf(b.quote));

  return {
    findings,
    stats: {
      mode: useAI && !aiError ? "ai" : "rules-only",
      ms: Date.now() - started,
      codeFindings: vc.kept.length,
      visualFindings: visual.length,
      images: images.length,
      assets: assets.length,
      visionRead,
      visionError,
      people: images.reduce((n, i) => n + (i.vision?.people?.length ?? 0), 0),
      aiFindings: aiKept.length + visual.filter((f) => aiDocFindings.some((a) => key(a) === key(f))).length,
      droppedByVerifier: dropped,
      fixesWithdrawn,
      aiCalls,
      aiCached,
      confidential: !!intent?.confidential,
      redactions: map.length,
      aiError,
    },
    images,
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
