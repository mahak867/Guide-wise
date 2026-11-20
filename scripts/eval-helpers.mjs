// Measures Guidewise's two AI helpers against the live site (or BASE_URL), in a fresh random workspace:
//  1. the guide compiler (POST /api/compile): 10 short brand-guide passages with an answer key of expected rules and
//     planted vague or contradictory passages;
//  2. the Guideline Health amendment helper (POST /api/rules/:id, actions amend_draft and amend_apply): 8 seeded rules
//     with real dismissals created through the API.
// Runs once, sequentially, with pauses (free AI tiers). Writes src/lib/eval/helpers-results.json.
//   BASE_URL=https://guidewise-kohl.vercel.app node scripts/eval-helpers.mjs          (full run, roughly 30 to 50 AI calls)
//   node scripts/eval-helpers.mjs --dry      (only checks that each amendment draft triggers its rule; no AI calls)
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const L = (process.env.BASE_URL || "https://guidewise-kohl.vercel.app").replace(/\/$/, "");
const DRY = process.argv.includes("--dry");
const PAUSE = 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let aiCalls = 0;

async function call(ws, method, path, { role = "manager", body } = {}) {
  const h = { "x-workspace": ws, "x-role": role };
  if (body !== undefined) h["content-type"] = "application/json";
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(L + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    let j = null;
    try { j = await r.json(); } catch { /* not JSON */ }
    // A rate-limited or busy AI provider: wait once and try again.
    if ((r.status === 503 || r.status === 429 || r.status >= 500) && attempt === 0) { await sleep(20000); continue; }
    return { s: r.status, j };
  }
}
const norm = (s) => String(s ?? "").toLowerCase().replace(/[“”"'‘’]/g, "").replace(/\s+/g, " ").trim();
const has = (hay, needles) => needles.some((n) => norm(hay).includes(norm(n)));
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);

// ---------------------------------------------------------------- 1. Guide compiler
// Each expected rule is found by distinctive words from its sentence (`src`) in the proposal's quoted source passage,
// or, for term rules, by a banned word in its avoid list. Each planted problem is found when a warning quotes it.
const PASSAGES = [
  {
    id: "P1", text: "Call our teachers mentors, never tutors. Write \"online classes\", not \"e-learning\". Never describe our fees as cheap; say affordable.",
    rules: [
      { kind: "preferred term", src: ["never tutors"], avoid: ["tutor"] },
      { kind: "preferred term", src: ["e-learning"], avoid: ["e-learning"] },
      { kind: "banned term", src: ["fees as cheap"], avoid: ["cheap"] },
    ],
    planted: [],
  },
  {
    id: "P2", text: "Never promise a guaranteed rank or a guaranteed seat. Be professional where appropriate. Any post that mentions results must end with: Past results do not guarantee future selection.",
    rules: [
      { kind: "claim", src: ["guaranteed rank", "guaranteed seat"] },
      { kind: "required disclaimer", src: ["must end with", "past results do not guarantee"] },
    ],
    planted: [{ type: "vague", src: ["professional where appropriate"] }],
  },
  {
    id: "P3", text: "Spell the brand name as BrightPath, one word, never Bright Path. Always use emoji in Instagram captions to feel friendly. Never use emoji in any post.",
    rules: [{ kind: "brand name", src: ["one word", "never bright path"], avoid: ["bright path"] }],
    planted: [{ type: "contradiction", src: ["always use emoji", "never use emoji"] }],
  },
  {
    id: "P4", text: "Only publish the approved admissions contacts: admissions@brightpath.in and 1800 123 4567. Never share a teacher's personal phone number or email. Keep it engaging.",
    rules: [{ kind: "contact", src: ["approved admissions contacts", "personal phone number"] }],
    planted: [{ type: "vague", src: ["keep it engaging"] }],
  },
  {
    id: "P5", text: "Do not use countdowns or phrases like \"last chance\" or \"only a few seats left\". Give the real start date instead. Do not use more than one exclamation mark in a sentence.",
    rules: [
      { kind: "banned phrase (urgency)", src: ["countdowns", "last chance", "few seats left", "real start date"], avoid: ["last chance", "only a few seats left"] },
      { kind: "tone (exclamation marks)", src: ["exclamation mark"] },
    ],
    planted: [],
  },
  {
    id: "P6", text: "Headlines must be under eight words. Headlines should be long and descriptive, at least twelve words, so they rank in search. Write numbers as digits, not words.",
    rules: [{ kind: "style (numbers as digits)", src: ["numbers as digits"] }],
    planted: [{ type: "contradiction", src: ["under eight words", "at least twelve words", "long and descriptive"] }],
  },
  {
    id: "P7", text: "Do not call students weak or slow learners; say students who need more support. Address the reader as \"you\". Avoid \"hey guys\"; write \"hi everyone\".",
    rules: [
      { kind: "preferred term", src: ["weak or slow learners"], avoid: ["weak", "slow learner"] },
      { kind: "tone (second person)", src: ["address the reader"] },
      { kind: "preferred term", src: ["hey guys"], avoid: ["hey guys"] },
    ],
    planted: [],
  },
  {
    id: "P8", text: "Do not call us the best or number one coaching institute unless an approved fact supports it. Use a modern, premium feel. Mention the fee only with the line: Fees are subject to the published fee policy.",
    rules: [
      { kind: "claim (superlatives)", src: ["number one coaching", "the best or number one"] },
      { kind: "required disclaimer", src: ["mention the fee only", "fees are subject to"] },
    ],
    planted: [{ type: "vague", src: ["modern, premium feel"] }],
  },
  {
    id: "P9", text: "Content should resonate with our audience. Try to sound on-brand at all times. Never use the word \"revolutionary\" about our courses.",
    rules: [{ kind: "banned term", src: ["revolutionary"], avoid: ["revolutionary"] }],
    planted: [{ type: "vague", src: ["resonate with our audience"] }, { type: "vague", src: ["on-brand at all times"] }],
  },
  {
    id: "P10", text: "Write every post in English only. Posts for Hindi-speaking parents must be written in Hindi. Never mention a competitor by name.",
    rules: [{ kind: "claim (competitors)", src: ["competitor by name"] }],
    planted: [{ type: "contradiction", src: ["english only", "written in hindi"] }],
  },
];

async function evalCompiler() {
  const ws = randomUUID();
  await call(ws, "GET", "/api/state");
  const out = [];
  let n = 0;
  for (const p of PASSAGES) {
    console.log(`compile ${p.id} …`);
    aiCalls++;
    const r = await call(ws, "POST", "/api/compile", { body: { guide: p.text } });
    await sleep(PAUSE);
    const row = { id: p.id, status: r.s, error: r.s === 200 ? null : r.j?.error ?? null, dropped: r.j?.dropped ?? 0, rules: [], warnings: [], expected: [], planted: [] };
    if (r.s !== 200) { out.push(row); console.log(`  ${r.s} ${row.error}`); continue; }
    const vagueSrc = p.planted.flatMap((x) => x.src);
    for (const pr of r.j.rules) {
      const id = `EV-${String(++n).padStart(2, "0")}`;
      // Saved exactly as the Brand Kit page's "Add as advisory" button saves a proposal, then its own tests are run.
      const save = await call(ws, "POST", "/api/rules", { body: {
        id, title: pr.title, description: pr.description, severity: pr.severity, kind: pr.kind, category: pr.category,
        // Since the fixes the API returns the config each proposal is saved with; older deployments did not.
        source: "Compiled from pasted guide text", config: pr.config ?? (pr.category === "term" ? { avoid: pr.avoid, prefer: pr.prefer } : {}),
        tests: [{ text: pr.flag_example, expect: "flag" }, { text: pr.pass_example, expect: "pass" }],
      } });
      let test = null;
      if (save.s === 200) {
        const usesAI = pr.kind !== "code";
        if (usesAI) aiCalls += 2;
        const t = await call(ws, "POST", `/api/rules/${id}`, { body: { action: "test" } });
        test = t.j?.run ?? null;
        if (usesAI) await sleep(PAUSE);
      }
      row.rules.push({
        id, title: pr.title, kind: pr.kind, category: pr.category, avoid: pr.avoid, prefer: pr.prefer, source_passage: pr.source_passage,
        flag_example: pr.flag_example, pass_example: pr.pass_example,
        saved: save.s === 200 ? true : save.j?.error ?? save.s,
        tests_passed: test ? test.passed : null, test_results: test?.results?.map((x) => ({ expect: x.expect, got: x.got })) ?? null,
        from_vague_passage: has(pr.source_passage, vagueSrc),
      });
    }
    // Warnings of kind "dropped" or "check" are about a proposal Guidewise left out, not about the guide's wording,
    // so they are kept apart and not scored as warnings about the guide.
    const aboutProposal = (w) => w.kind === "dropped" || w.kind === "check";
    row.proposal_notes = r.j.warnings.filter(aboutProposal);
    row.warnings = r.j.warnings.filter((w) => !aboutProposal(w)).map((w) => ({ ...w, planted: p.planted.some((x) => has(w.passage, x.src)) }));
    for (const e of p.rules) {
      const hit = row.rules.find((x) => has(x.source_passage, e.src) || (e.avoid && (x.avoid ?? []).some((a) => has(a, e.avoid))));
      row.expected.push({ kind: e.kind, found: !!hit, by: hit?.id ?? null, category: hit?.category ?? null });
    }
    for (const x of p.planted) row.planted.push({ type: x.type, src: x.src, warned: row.warnings.some((w) => has(w.passage, x.src)) });
    console.log(`  ${row.rules.length} rules (${row.rules.filter((x) => x.tests_passed).length} pass own tests), ${row.warnings.length} warnings; expected ${row.expected.filter((x) => x.found).length}/${row.expected.length}, planted warned ${row.planted.filter((x) => x.warned).length}/${row.planted.length}`);
    out.push(row);
  }
  const all = out.flatMap((x) => x.rules);
  const exp = out.flatMap((x) => x.expected);
  const pl = out.flatMap((x) => x.planted);
  const warns = out.flatMap((x) => x.warnings);
  const explained = (x) => x.rules.filter((r) => !x.expected.some((e) => e.by === r.id)).length;
  const summary = {
    passages: PASSAGES.length,
    compile_calls_ok: out.filter((x) => x.status === 200).length,
    expected_rules: exp.length, expected_rules_found: exp.filter((x) => x.found).length, expected_rules_found_pct: pct(exp.filter((x) => x.found).length, exp.length),
    proposed_rules: all.length, proposed_rules_saved: all.filter((x) => x.saved === true).length,
    proposed_rules_pass_own_tests: all.filter((x) => x.tests_passed).length, proposed_rules_pass_own_tests_pct: pct(all.filter((x) => x.tests_passed).length, all.length),
    proposed_rules_not_in_key: out.reduce((s, x) => s + explained(x), 0),
    rules_from_planted_vague_passages: all.filter((x) => x.from_vague_passage).length,
    planted_problems: pl.length, planted_warned: pl.filter((x) => x.warned).length, planted_warned_pct: pct(pl.filter((x) => x.warned).length, pl.length),
    planted_vague: pl.filter((x) => x.type === "vague").length, planted_vague_warned: pl.filter((x) => x.type === "vague" && x.warned).length,
    planted_contradictions: pl.filter((x) => x.type === "contradiction").length, planted_contradictions_warned: pl.filter((x) => x.type === "contradiction" && x.warned).length,
    warnings: warns.length, false_warnings: warns.filter((w) => !w.planted).length,
    dropped_by_source_check: out.reduce((s, x) => s + x.dropped, 0),
    left_out_by_config_check: out.reduce((s, x) => s + (x.proposal_notes?.length ?? 0), 0),
  };
  return { workspace_note: "fresh random workspace", summary, passages: PASSAGES, results: out };
}

// ---------------------------------------------------------------- 2. Rule amendment (Guideline Health)
// Each seeded rule gets two drafts where its finding is a plausible over-reach, submitted and dismissed by two
// different reviewers with reasons the review page offers. Then: amend_draft (AI), amend_apply (code gate), an
// independent re-run of the tests, and the first dismissed draft submitted again to see if the rule still fires.
const AMEND = [
  { rule: "TERM-2", drafts: ["Cheap tricks do not crack JEE. Steady weekly practice does.", "Skip the cheap shortcuts: our mock tests follow the real paper."], reasons: ["The rule is unclear", "The rule does not apply to this content"] },
  { rule: "TERM-4", drafts: ["Our exam hall bans AI-powered gadgets during mock tests.", "Parents ask about AI-driven cheating apps. Our mock tests are held offline, on paper."], reasons: ["The rule does not apply to this content", "The rule is unclear"] },
  { rule: "STY-CAPS", drafts: ["Read the NCERT textbook before the December batch starts.", "Our syllabus follows NCERT and the NTA exam pattern."], reasons: ["The flag is wrong", "The rule is unclear"] },
  { rule: "INC-1", drafts: ["We never call anyone weak students. Every student gets a mentor.", "Hey guys, a parent asked us not to write this, so from now on it is hi everyone."], reasons: ["The flag is wrong", "The rule is unclear"] },
  { rule: "R-10", drafts: ["No need to hurry: admissions stay open until 31 March.", "This is not your last chance. You can join the batch in any month."], reasons: ["The flag is wrong", "The rule is unclear"] },
  { rule: "T-2", drafts: ["Happy Diwali!! Classes resume on 4 November.", "Congratulations, Diya!! Your mentor is proud of you."], reasons: ["The rule is unclear", "Approved exception"] },
  { rule: "R-DISC", drafts: ["Weekly tests show your rank in the batch so you can track your progress.", "Each mock test gives you a rank within your own batch."], reasons: ["The rule does not apply to this content", "The rule is unclear"] },
  { rule: "R-08", drafts: ["How to choose the best coaching institute for you: five questions to ask.", "Families often ask which is the leading coaching institute in their city. Ask to see audited results."], reasons: ["The rule is unclear", "The flag is wrong"] },
];

async function openFinding(ws, draftId, rule) {
  const g = await call(ws, "GET", `/api/drafts/${draftId}`, { role: "creator" });
  return (g.j?.findings ?? []).find((f) => f.rule_id === rule && f.state === "open") ?? null;
}

async function evalAmend() {
  const ws = randomUUID();
  const st = await call(ws, "GET", "/api/state");
  const seeded = new Map((st.j?.rules ?? []).map((r) => [r.id, r]));
  const out = [];
  for (const a of AMEND) {
    const row = { rule: a.rule, title: seeded.get(a.rule)?.title ?? null, before: seeded.get(a.rule)?.description ?? null, kind: seeded.get(a.rule)?.kind ?? null, dismissals: [], triggered: 0 };
    let first = null;
    for (let i = 0; i < a.drafts.length; i++) {
      const c = await call(ws, "POST", "/api/drafts", { role: "creator", body: { title: `Eval ${a.rule} ${i + 1}`, content_type: "social", text: a.drafts[i], useAI: false } });
      const id = c.j?.id;
      if (!id) { row.dismissals.push({ text: a.drafts[i], error: c.j?.error ?? c.s }); continue; }
      const f = await openFinding(ws, id, a.rule);
      if (!f) { row.dismissals.push({ text: a.drafts[i], triggered: false }); continue; }
      row.triggered++;
      first ??= a.drafts[i];
      await call(ws, "POST", `/api/drafts/${id}`, { role: "creator", body: { action: "submit" } });
      const who = i === 0 ? "brand" : "compliance";
      const d = await call(ws, "POST", `/api/drafts/${id}`, { role: who, body: { action: "dismiss", finding_id: f.id, reason: a.reasons[i] } });
      row.dismissals.push({ text: a.drafts[i], triggered: true, quote: f.quote, reason: a.reasons[i], by: who, dismissed: d.s === 200 ? true : d.j?.error ?? d.s });
    }
    console.log(`${a.rule}: ${row.triggered}/${a.drafts.length} drafts triggered the rule`);
    if (DRY || !row.dismissals.some((x) => x.dismissed === true)) { out.push(row); continue; }

    aiCalls++;
    const dr = await call(ws, "POST", `/api/rules/${a.rule}`, { body: { action: "amend_draft" } });
    await sleep(PAUSE);
    row.draft_status = dr.s;
    if (dr.s !== 200) { row.error = dr.j?.error ?? null; out.push(row); console.log(`  amend_draft ${dr.s} ${row.error}`); continue; }
    const p = dr.j.proposal;
    const results = dr.j.run.results;
    const isNew = (t) => t.text === p.flag_example || t.text === p.pass_example;
    row.proposal = p;
    row.new_tests = results.filter(isNew).map((t) => ({ text: t.text, expect: t.expect, got: t.got, ok: t.ok }));
    row.new_tests_correct = row.new_tests.length === 2 && row.new_tests.every((t) => t.ok);
    // Examples identical to a test the rule already has are not added (the route skips duplicates).
    row.tests_added = dr.j.added ? dr.j.added.length : [p.flag_example, p.pass_example].filter((t) => t && !(seeded.get(a.rule)?.tests ?? []).some((x) => x.text === t)).length;
    // Since the fixes: what code says about the draft (changes to the check, refusals, the dismissed text re-checked).
    row.check_changes = dr.j.changes ?? null;
    row.problems = dr.j.problems ?? null;
    row.claims_to_resolve = dr.j.resolves ?? null;
    row.all_tests_pass_at_draft = dr.j.run.passed;
    row.failing_tests = results.filter((t) => !t.ok).map((t) => ({ text: t.text, expect: t.expect, got: t.got, new: isNew(t) }));

    const ap = await call(ws, "POST", `/api/rules/${a.rule}`, { body: { action: "amend_apply", proposal: p } });
    if (row.kind !== "code") await sleep(PAUSE);
    row.gate = ap.s === 200 ? "accepted" : ap.s === 409 ? "refused" : `error ${ap.s}`;
    if (ap.s === 200) {
      const t = await call(ws, "POST", `/api/rules/${a.rule}`, { body: { action: "test" } });
      row.rerun_passed = t.j?.run?.passed ?? null;
      if (row.kind !== "code") await sleep(PAUSE);
      // Does the clearer wording change what the check flags? Submit the first dismissed text again.
      const again = await call(ws, "POST", "/api/drafts", { role: "creator", body: { title: `Eval ${a.rule} again`, content_type: "social", text: first, useAI: false } });
      row.dismissed_text_still_flagged = again.j?.id ? !!(await openFinding(ws, again.j.id, a.rule)) : null;
    }
    console.log(`  new tests correct: ${row.new_tests_correct} (${row.tests_added} actually new); all tests pass: ${row.all_tests_pass_at_draft}; gate: ${row.gate}; re-run: ${row.rerun_passed}; dismissed text still flagged (code checks): ${row.dismissed_text_still_flagged}`);
    out.push(row);
  }
  const drafted = out.filter((x) => x.draft_status === 200);
  const summary = {
    rules: AMEND.length,
    rules_with_dismissals: out.filter((x) => x.dismissals.some((d) => d.dismissed === true)).length,
    dismissals: out.reduce((s, x) => s + x.dismissals.filter((d) => d.dismissed === true).length, 0),
    amendments_drafted: drafted.length,
    amendments_adding_two_new_tests: drafted.filter((x) => x.tests_added === 2).length,
    amendments_repeating_existing_tests: drafted.filter((x) => x.tests_added === 0).length,
    new_tests_correct: drafted.filter((x) => x.new_tests_correct).length, new_tests_correct_pct: pct(drafted.filter((x) => x.new_tests_correct).length, drafted.length),
    all_tests_pass: drafted.filter((x) => x.all_tests_pass_at_draft).length, all_tests_pass_pct: pct(drafted.filter((x) => x.all_tests_pass_at_draft).length, drafted.length),
    accepted_by_gate: drafted.filter((x) => x.gate === "accepted").length, accepted_by_gate_pct: pct(drafted.filter((x) => x.gate === "accepted").length, drafted.length),
    rerun_passed_after_apply: drafted.filter((x) => x.rerun_passed === true).length,
    dismissed_text_still_flagged_after_apply: drafted.filter((x) => x.dismissed_text_still_flagged === true).length,
    amendments_changing_the_check: drafted.filter((x) => x.check_changes?.length).length,
    amendments_saying_they_resolve: drafted.filter((x) => x.claims_to_resolve === true).length,
    resolve_claims_contradicted_by_resubmission: drafted.filter((x) => x.claims_to_resolve === true && x.dismissed_text_still_flagged === true).length,
  };
  return { summary, rules: AMEND, results: out };
}

const state = (await call(randomUUID(), "GET", "/api/state")).j;
console.log(`Guidewise helper evaluation against ${L}. AI: ${state?.ai?.available ? state.ai.model : "off"}${DRY ? " (dry run, no AI calls)" : ""}\n`);
if (!DRY && !state?.ai?.available) { console.log("The AI service is off on this deployment, so the helpers cannot be measured."); process.exit(1); }
const compiler = DRY ? null : await evalCompiler();
const amendment = await evalAmend();
if (DRY) process.exit(0);
const result = { date: new Date().toISOString(), base_url: L, ai_model: state.ai.model, ai_calls_counted: aiCalls, compiler: { summary: compiler.summary, passages: compiler.passages, results: compiler.results }, amendment };
writeFileSync(new URL("../src/lib/eval/helpers-results.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
console.log("\nCompiler:", JSON.stringify(compiler.summary, null, 1));
console.log("\nAmendment:", JSON.stringify(amendment.summary, null, 1));
console.log(`\n${aiCalls} AI calls counted (re-runs of judgment-rule tests come on top). Written to src/lib/eval/helpers-results.json`);
