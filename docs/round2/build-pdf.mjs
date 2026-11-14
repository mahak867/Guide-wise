// Builds the Round 2 project PDF from live numbers in the repo and screenshots in docs/round2/img.
// Usage: node docs/round2/build-pdf.mjs   (needs Playwright; run `npx tsx scripts/eval.ts` numbers first)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const dir = "docs/round2";
const code = JSON.parse(execSync("npx tsx scripts/eval-json.ts", { encoding: "utf8" }));
const ai = JSON.parse(readFileSync("src/lib/eval/ai-results.json", "utf8"));
const tests = (execSync("npx vitest run 2>&1", { encoding: "utf8" }).match(/Tests\s+(\d+) passed/) ?? [])[1] ?? "?";
const pct = (x) => `${Math.round(x * 100)}%`;
const ci = (c) => `${pct(c[0])}–${pct(c[1])}`;
const img = (f, alt, cap) => existsSync(`${dir}/img/${f}`)
  ? `<figure><img src="img/${f}" alt="${alt}"><figcaption>${cap}</figcaption></figure>` : "";

const aiBlock = ai.measured
  ? `<tr><td>Code and AI checks <span>(${ai.docs} drafts)</span></td><td>${pct(ai.precision)} <span>(${ci(ai.precisionCI)})</span></td><td>${pct(ai.recall)} <span>(${ci(ai.recallCI)})</span></td><td>${pct(ai.criticalRecall)}</td><td>${ai.hardCaught} of ${ai.hardPlanted}</td><td>${ai.agreement !== undefined ? pct(ai.agreement) : "not measured"}</td></tr>`
  : `<tr><td>Code and AI checks</td><td colspan="5">Not measured yet.</td></tr>`;
const aiNote = ai.measured ? `The AI row is measured on ${ai.docs} of the 40 held-out drafts (every second one), one run each, on the live site; repeat-run agreement was not measured because a second run would have used most of the free AI tier's daily allowance. Its one false flag (a time, "4 pm", read as a figure) was fixed afterwards and is covered by a test.` : "";

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Guidewise · Round 2</title>
<style>
@page { size: A4; margin: 16mm 16mm 18mm; }
:root { --ink:#1c1b18; --muted:#6b665c; --line:#e2dccf; --paper:#fffdf9; --brand:#1f4d3f; --crit:#a8281c; }
* { box-sizing: border-box; }
body { margin:0; color:var(--ink); font: 10.2pt/1.5 "Helvetica Neue", Arial, sans-serif; }
h1,h2,h3 { font-family: Georgia, "Times New Roman", serif; font-weight: 500; letter-spacing: -0.01em; margin: 0; }
h1 { font-size: 34pt; line-height: 1.05; }
h2 { font-size: 17pt; margin: 22pt 0 6pt; padding-top: 8pt; border-top: 1px solid var(--line); break-after: avoid; }
h3 { font-size: 12pt; margin: 12pt 0 4pt; break-after: avoid; }
p { margin: 0 0 6pt; }
.k { font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
.lede { font-size: 12pt; color: #3b3a35; max-width: 150mm; margin-top: 8pt; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0 8pt; font-size: 9.2pt; break-inside: auto; }
th { text-align: left; font-weight: 600; font-size: 7.8pt; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); border-bottom: 1px solid var(--ink); padding: 4pt 6pt 4pt 0; }
td { border-bottom: 1px solid var(--line); padding: 4pt 6pt 4pt 0; vertical-align: top; }
td span { color: var(--muted); }
tr { break-inside: avoid; }
ul, ol { margin: 0 0 6pt; padding-left: 14pt; }
li { margin-bottom: 2pt; }
figure { margin: 8pt 0 10pt; break-inside: avoid; }
figure img { width: 100%; max-height: 120mm; object-fit: contain; object-position: top left; border: 1px solid var(--line); border-radius: 3pt; }
figcaption { font-size: 8.5pt; color: var(--muted); margin-top: 3pt; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; }
.box { border: 1px solid var(--line); border-radius: 4pt; padding: 8pt 10pt; break-inside: avoid; }
.box b { font-family: Georgia, serif; font-weight: 500; font-size: 11pt; }
.links td:first-child { width: 34mm; color: var(--muted); }
.pipe { display: flex; gap: 4pt; margin: 6pt 0 4pt; }
.pipe div { flex: 1; border: 1px solid var(--line); border-radius: 3pt; padding: 5pt 6pt; font-size: 8.2pt; }
.pipe div.ai { background: var(--brand); color: #fff; border-color: var(--brand); }
.pipe b { display: block; font-size: 8.8pt; margin-bottom: 2pt; }
.note { font-size: 8.6pt; color: var(--muted); }
.corr { border-left: 3px solid var(--crit); padding: 4pt 8pt; background: #faf3ef; }
.page { break-before: page; }
</style></head><body>

<p class="k">CodeNova India 2026 · Round 2, the build · Team Guide Wise</p>
<h1 style="margin-top:6pt">Guidewise</h1>
<p class="lede">Brand rules that run. Guidewise checks marketing content against a team's own approved rules and dated facts before it is published. Every finding quotes the rule it breaks and the exact words, every fix is re-tested before it is offered, risky content goes to the right reviewer, and a person makes the final approval.</p>

<table class="links" style="margin-top:12pt">
<tr><td>Live product</td><td><b>https://guidewise-kohl.vercel.app</b> · no sign-in; each visitor gets a private demo workspace</td></tr>
<tr><td>Walkthrough video</td><td>https://guidewise-kohl.vercel.app/demo.webm · 90 seconds, captioned, recorded on the live site</td></tr>
<tr><td>Source code</td><td>https://github.com/mahak867/Guide-wise</td></tr>
<tr><td>Demo brand</td><td>PrepPath Academy, a fictional JEE/NEET coaching brand written by the team</td></tr>
<tr><td>Team</td><td>Mahak Fahad (team leader, Backend + AI/ML) · Roshini R (Frontend + Design/UI-UX) · Chennai Institute of Technology</td></tr>
</table>

<h2>Where Round 2 stands</h2>
<div class="grid2">
<div class="box"><b>The central workflow runs end to end.</b><p>Paste copy or upload a DOCX, PDF or images → cited findings with re-tested fixes → accept, edit or dismiss with a reason → a fixed rule table routes to the brand or compliance reviewer → approval with a fingerprinted record. Tested end to end on the live site with the AI checks on.</p></div>
<div class="box"><b>Measured on our own test set.</b><p>On 40 held-out drafts with planted errors, code checks alone reach ${pct(code.precision)} precision and ${pct(code.recall)} recall${ai.measured ? `; with the AI checks, ${pct(ai.precision)} precision and ${pct(ai.recall)} recall` : ""}. ${tests} automated tests and CI run on every push.</p></div>
</div>

<h2>The product</h2>
${img("02-review.png", "Review of the sample Instagram post", "The sample Instagram post: the draft set as a manuscript with findings underlined, and one finding open with its rule, source, precedent and re-tested fix.")}
<div class="grid2">
${img("03-image.png", "Image findings", "Text read from the creative is checked against every rule and fact; colours are checked against the palette.")}
${img("05-receipt.png", "Approval record", "Approval: the SHA-256 fingerprint of the exact approved text, the Brand Kit version, and every finding with how it was resolved.")}
</div>
<div class="grid2">
${img("06-kit.png", "Brand Kit", "Brand Kit: each rule carries test sentences and can only be enforced when its own check passes them.")}
${img("08-insights.png", "Insights", "Insights: which rules fire most, which are dismissed and why, and facts about to expire.")}
</div>

<h2>Completed features</h2>
<table>
<tr><th style="width:32mm">Area</th><th>What a judge can do with it</th></tr>
<tr><td>Review</td><td>Paste copy, or upload DOCX, PDF and up to four images; state goal, audience, call to action and locked phrases no fix may remove.</td></tr>
<tr><td>Code checks</td><td>Preferred terms, banned phrases, approved contacts, student results (course and consent record), the results disclaimer (with a same-language check for Hindi claims), and every figure against the Facts Register.</td></tr>
<tr><td>AI checks</td><td>Claims and voice rules judged one rule per call, run twice when they find something; disagreement becomes a suggestion. One adapter tries Claude, Groq and Gemini in that order, whichever keys are set (the live site runs on Groq, with Gemini as backup), with a 20-second cap per call; the app keeps working in rules-only mode if none answers.</td></tr>
<tr><td>Verifier</td><td>Plain code drops any finding whose quoted words, rule or fact does not exist ("no source, no flag").</td></tr>
<tr><td>Images</td><td>OCR in the browser (served from our own site), palette check in CIELAB, WCAG contrast, alt text; image text runs through every rule and fact. Logo check: the Brand Kit logo is searched for at many sizes (masked normalised cross-correlation, no AI), then checked for minimum size and clear space.</td></tr>
<tr><td>Writing style</td><td>Code rule types for exact brand-name spelling, capitals used for emphasis, maximum length per content type (ad text cut off at "See more"), maximum sentence length, and inclusive wording, each with a fix where one is safe.</td></tr>
<tr><td>Facts Register</td><td>Facts with evidence, owner, valid-from, valid-until and required disclosure; embargoed, expired and wrong-subject figures are each flagged.</td></tr>
<tr><td>Fixes</td><td>Each fix is applied and re-checked before it is offered; AI-written fixes may not introduce any violation; edit a fix before accepting; "Accept all" works through follow-ups.</td></tr>
<tr><td>Brand Kit</td><td>Rules with test sentences, an enforce gate, versioning, and a guide compiler that drops any proposed rule whose quoted passage is not in the guide.</td></tr>
<tr><td>Regulation pack</td><td>Central Consumer Protection Authority (CCPA, India) guidelines for the coaching sector (2024), with a penalty order shown on each regulation finding as reported in the press, and the "more than 50 students" applicability gate.</td></tr>
<tr><td>Workflow</td><td>Four roles enforced on the server; risk routing by a fixed rule table; comments, version history with word-level diffs, activity log, approval record (save as PDF).</td></tr>
<tr><td>Insights</td><td>Most-flagged rules, dismissal reasons, rules two or more people call unclear, fact expiry watch.</td></tr>
<tr><td>Privacy</td><td>Emails, phone numbers, Aadhaar, PAN and card numbers are masked in code before any AI call. A draft marked confidential is never sent to AI at all.</td></tr>
<tr><td>Channels</td><td>A rule can apply to some content types only (for example, no shortened links on social posts and ads); the brief card shows the rules for the type being written.</td></tr>
<tr><td>Portability</td><td>The Brand Kit exports and imports as one JSON file; imported new or changed rules arrive as advisory until they pass their tests.</td></tr>
<tr><td>Reliability</td><td>AI answers are cached by rule and text, so many judges reviewing the same sample spend no extra quota; a 20-second cap on every AI call; a 20-step browser test of the whole journey runs against the live site.</td></tr>
<tr><td>Usability</td><td>One-click sample post, a guided tour that ticks itself off, private workspace per visitor, works on a phone.</td></tr>
</table>

<h2>How it is built</h2>
<div class="pipe">
<div><b>1 Redact</b>Personal data out before any AI call</div>
<div><b>2 Code checks</b>Terms, contacts, students, every figure vs the register</div>
<div class="ai"><b>3 AI checks</b>One rule per call, run twice</div>
<div><b>4 Verifier</b>Quote, rule and fact must exist</div>
<div><b>5 Re-test fixes</b>New issue → fix withdrawn</div>
<div><b>6 Route</b>Fixed rule table, human approves</div>
</div>
<p class="note">Only step 3 uses AI. The AI only locates number claims; code re-reads each value and compares it with the Facts Register.</p>
<table>
<tr><th style="width:32mm">Layer</th><th>Choice and reason</th></tr>
<tr><td>App and API</td><td>Next.js 16 (TypeScript), React 19, Tailwind CSS 4 on Vercel, functions in Mumbai next to the database. One codebase, one language for a team of two.</td></tr>
<tr><td>Data</td><td>Supabase Postgres; every table scoped by a workspace ID so each visitor's demo is isolated.</td></tr>
<tr><td>AI</td><td>One adapter for Groq (openai/gpt-oss-120b), Gemini and Claude with automatic fallback; every answer must pass a Zod schema.</td></tr>
<tr><td>Documents and images</td><td>mammoth (DOCX), unpdf (PDF), tesseract.js (OCR) — read in memory, never stored.</td></tr>
<tr><td>Quality</td><td>${tests} Vitest tests, including eight that swap in a deliberately wrong AI (invented quotes, a forbidden fix, a wrong number, a time misread as a figure, personal data, a confidential draft, prompt injection, locked phrases); CI runs lint, type-check, tests, evaluation and build on every push.</td></tr>
</table>

<h2>Measured results</h2>
<p>60 short drafts for PrepPath with errors planted in known places (20 used while building, <b>40 held out</b>). A finding counts as correct when it cites the planted error's rule and quotes overlapping words; anything else is a false flag. Intervals are 95% Wilson intervals. Test-set fingerprint <code>${code.fingerprint}</code>.</p>
<table>
<tr><th>Held-out set</th><th>Precision</th><th>Recall</th><th>Critical recall</th><th>Hard phrasings</th><th>Repeat-run agreement</th></tr>
<tr><td>Code checks only <span>(40 drafts)</span></td><td>${pct(code.precision)} <span>(${ci(code.precisionCI)})</span></td><td>${pct(code.recall)} <span>(${ci(code.recallCI)})</span></td><td>${pct(code.criticalRecall)}</td><td>${code.hardCaught} of ${code.hardPlanted}</td><td>n/a <span>(no randomness)</span></td></tr>
${aiBlock}
</table>
<div style="width:70%">${img("07-results.png", "Results page", "The live Results page: the code checks re-run on every visit; the AI checks were measured on the live site.")}</div>
<p class="note">${aiNote}</p>
<p class="note">These numbers are optimistic: the team wrote both the rules and the test drafts. "Hard" errors were written on purpose to avoid keyword patterns. The next step is real, anonymised drafts from coaching-centre marketers.</p>

<section style="break-inside: avoid"><h2>Changes from the Round 1 plan</h2>
<table>
<tr><th style="width:42mm">Plan</th><th style="width:52mm">What we did</th><th>Why</th></tr>
<tr><td>Supabase Auth with four roles</td><td>No sign-in; a private workspace per visitor and a role switcher, role rules enforced on the server; browsers never receive database credentials</td><td>Judges must be able to open the link directly. Sign-in and per-organisation database security come with a production deployment.</td></tr>
<tr><td>Image review in Round 3</td><td>A first version ships now (palette, contrast, alt text, logo presence, size and clear space, OCR text through every rule)</td><td>The brief names visual identity as part of the central workflow. Round 3 deepens it.</td></tr>
<tr><td>AI on Claude</td><td>One adapter: Claude, Groq, Gemini in that order, whichever keys are set; the live site runs on Groq with Gemini as backup</td><td>Free tiers make the AI checks available to judges at no cost; the schema and verifier are the same for all.</td></tr>
<tr><td>Fixes withdrawn on any new issue</td><td>Withdrawn only when the new issue has no automatic fix (AI-written fixes: any new issue)</td><td>Fixing a guarantee correctly raises a disclaimer requirement; withdrawing that fix was wrong.</td></tr>
<tr><td>alex, write-good, axe-core</td><td>Replaced by our own code rules: brand-name spelling, capitals, length, sentence length, inclusive wording; contrast and alt text for images</td><td>As Brand Kit rules they carry test sentences, can be edited by the manager and cite their source, which the libraries' fixed word lists could not.</td></tr>
<tr><td>Hands-on tests with students</td><td>Moved to the start of Round 3</td><td>Build time went into image review and the measured evaluation.</td></tr>
</table>
<p class="corr"><b>Correction to Round 1.</b> The Round 1 PDF stated CCPA maximum penalties of "up to ₹10 lakh / ₹50 lakh" on pages 2 and 14. We could not confirm these amounts against the Act and withdraw them. The penalty orders shown in the product are cited as reported in the linked press coverage.</p></section>

<h2>The three major improvements for Round 3</h2>
<div class="box"><b>1. Guideline Health loop — the brand guide fixes itself</b>
<p>Round 2 already flags rules that two or more people dismiss as unclear. Round 3 closes the loop: Guidewise drafts an amendment with new test sentences, the manager approves it, and a new Brand Kit version must pass its tests. Changing a fact lists every draft and approved piece that used it.</p>
<p class="note"><b>Test:</b> dismiss one rule as three different creators → it is marked unclear with a drafted amendment that passes its tests; change a fact → every affected piece is listed.</p></div>
<div class="box" style="margin-top:8pt"><b>2. Governance at the source — an API and MCP server for AI writing tools</b>
<p>A REST API with scoped keys and an MCP server exposing <code>get_brief</code> and <code>check_draft</code>, so AI writing tools fetch the rules and the facts valid today and check a draft before handing it over. An in-app playground and a per-key audit trail.</p>
<p class="note"><b>Test:</b> call <code>check_draft</code> from the playground and from an MCP client with a key → the same cited findings as the app, and a new audit entry.</p></div>
<div class="box" style="margin-top:8pt"><b>3. Campaign and creative review with AI vision</b>
<p>Review a whole campaign together (caption, creatives, landing-page copy, PDF brochure) and flag inconsistencies across assets: prices, dates, claims, promo codes. AI vision checks what OCR cannot see: a student photo with no consent record, a recoloured or redrawn logo, stylised claims.</p>
<p class="note"><b>Test:</b> upload a three-asset campaign with a price mismatch and an unconsented student photo → both found, cited and routed to compliance.</p></div>

<section style="break-inside: avoid"><h2>Team and disclosures</h2>
<table>
<tr><th>Member</th><th>Role</th><th>College</th><th>Course</th></tr>
<tr><td>Mahak Fahad (team leader)</td><td>Backend + AI / ML</td><td>Chennai Institute of Technology</td><td>B.E. Computer Science and Engineering, batch of 2029</td></tr>
<tr><td>Roshini R</td><td>Frontend + Design / UI-UX</td><td>Chennai Institute of Technology</td><td>B.E. Computer Science and Engineering, batch of 2029</td></tr>
</table>
<ul class="note">
<li><b>AI used in building:</b> Claude (Anthropic) was used to help write code and documents during the official build window. The team reviewed it and is responsible for it.</li>
<li><b>AI in the product:</b> Groq and Gemini APIs (Claude supported), through one adapter. Personal data is masked before any call.</li>
<li><b>Reused code or templates:</b> none, apart from the Next.js starter (create-next-app). All product code was written inside the build window; the commit history starts on 13 November 2026 at 10:09 IST.</li>
<li><b>Open source:</b> Next.js, React, Tailwind CSS, supabase-js, Zod, Anthropic SDK, groq-sdk, @google/genai, mammoth, unpdf, tesseract.js.</li>
<li><b>Demo data:</b> PrepPath Academy, its rules, facts and students are fictional. Penalty orders are cited as reported in the linked press coverage; we have not read the orders themselves. Guidewise supports reviewers; it does not give legal advice.</li>
</ul></section>
</body></html>`;

writeFileSync(`${dir}/Guidewise_Round2.html`, html);
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("file://" + process.cwd() + `/${dir}/Guidewise_Round2.html`);
await p.waitForLoadState("networkidle");
await p.pdf({ path: `${dir}/Guidewise_Round2.pdf`, format: "A4", printBackground: true, displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:7pt;color:#8a857a;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>Guidewise · CodeNova India 2026 · Round 2</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: "16mm", bottom: "18mm", left: "16mm", right: "16mm" } });
await b.close();
console.log("wrote", `${dir}/Guidewise_Round2.pdf`);
