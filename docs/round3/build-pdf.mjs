// Builds the Round 3 final product PDF from live numbers in the repo and screenshots in docs/round3/img.
// Usage: node docs/round3/build-pdf.mjs   (needs Playwright; screenshots from docs/round3/shots.mjs)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const dir = "docs/round3";
const code = JSON.parse(execSync("npx tsx scripts/eval-json.ts", { encoding: "utf8" }));
const ai = JSON.parse(readFileSync("src/lib/eval/ai-results.json", "utf8"));
const tests = (execSync("npx vitest run 2>&1", { encoding: "utf8" }).match(/Tests\s+(\d+) passed/) ?? [])[1] ?? "?";
const commits = execSync("git rev-list --count --since='2026-11-18T18:29:00Z' HEAD", { encoding: "utf8" }).trim();
const css = readFileSync("docs/round2/build-pdf.mjs", "utf8").match(/<style>([\s\S]*?)<\/style>/)[1];
const pct = (x) => `${Math.round(x * 100)}%`;
const ci = (c) => `${pct(c[0])}–${pct(c[1])}`;
const img = (f, alt, cap) => existsSync(`${dir}/img/${f}`)
  ? `<figure><img src="img/${f}" alt="${alt}"><figcaption>${cap}</figcaption></figure>` : "";

// Roadmap and known issues come from the docs, so the PDF and the repo never disagree.
const roadmap = readFileSync("docs/ROADMAP.md", "utf8").split("\n").filter((l) => /^\| (Dec|Jan|Feb|Mar|Q\d)/.test(l))
  .map((l) => l.split("|").slice(1, -1).map((c) => c.trim().replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>")));
const issues = readFileSync("docs/KNOWN_ISSUES.md", "utf8").split("\n").filter((l) => /^\d+\. /.test(l))
  .map((l) => l.replace(/^\d+\. /, "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\s*\(`[^)]*`[^)]*\)/g, "").replace(/`(.+?)`/g, "<code>$1</code>"));

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Guidewise · Round 3</title>
<style>${css}
.done { display:inline-block; font-size:7.5pt; letter-spacing:.08em; text-transform:uppercase; color:#fff; background:var(--brand); border-radius:2pt; padding:1pt 5pt; margin-left:6pt; vertical-align:middle; }
.promise { font-size:8.8pt; color:var(--muted); border-left:3px solid var(--line); padding:2pt 8pt; margin:4pt 0 6pt; }
code { font-size: 8.8pt; }
</style></head><body>

<p class="k">CodeNova India 2026 · Round 3, the final product · Team Guide Wise</p>
<h1 style="margin-top:6pt">Guidewise</h1>
<p class="lede">Brand rules that run. Guidewise checks marketing content against a team's own approved rules and dated facts before it is published. Every finding quotes the exact words and the rule it breaks, every fix is re-tested before it is offered, risky content goes to the right reviewer, and a person approves the final version. In Round 3 it learned to follow a change through everything it touches, to govern AI writing tools at the source, and to review a whole campaign at once.</p>

<table class="links" style="margin-top:12pt">
<tr><td>Live product</td><td><b>https://guidewise-kohl.vercel.app</b> · no sign-in; each visitor gets a private demo workspace</td></tr>
<tr><td>Source code</td><td>https://github.com/mahak867/Guide-wise · ${commits} commits in the Round 3 window, all after it opened (18 Nov, 11:59 PM IST)</td></tr>
<tr><td>Walkthrough video</td><td>https://guidewise-kohl.vercel.app/demo.webm (Round 2 journey, 100 seconds)</td></tr>
<tr><td>Documentation</td><td>In the repository: docs/ARCHITECTURE.md, TESTING.md, KNOWN_ISSUES.md, ROADMAP.md, API.md, CHANGELOG.md</td></tr>
<tr><td>Demo brand</td><td>PrepPath Academy, a fictional JEE/NEET coaching brand written by the team</td></tr>
<tr><td>Team</td><td>Mahak Fahad (team leader, Backend + AI/ML) · Roshini R (Frontend + Design/UI-UX) · Chennai Institute of Technology</td></tr>
</table>

<h2>At a glance</h2>
<div class="grid2">
<div class="box"><b>All three promised improvements are live.</b><p>Change impact, the API and MCP server, and campaign review with AI vision. Each was tested on the live site against the exact test we wrote down at Round 2 (next pages).</p></div>
<div class="box"><b>Measured, not claimed.</b><p>Text: ${pct(ai.precision)} precision and ${pct(ai.recall)} recall with AI on 40 held-out drafts. Images: 20 of 20 planted errors caught, no false alarms. Privacy: 0 leaks in 144 AI prompts. ${tests} unit tests; a 20-step journey, 51-step sweep and 93-check probe pass on the live site.</p></div>
</div>
<div style="width:78%">${img("01-home.png", "Home page", "The home page: the sample post, the sample campaign and every review in this visitor's private workspace.")}</div>

<h2>The three improvements we promised, delivered</h2>

<h3>1. Change impact <span class="done">Live</span></h3>
<p class="promise"><b>Promised at Round 2:</b> changing or expiring a fact, or amending a rule, lists every open draft and approved piece that used it, re-checks them, and marks approved pieces that no longer pass as needing re-approval. Each amended rule shows its dismissal rate before and after.</p>
<p><b>Delivered.</b> Saving a fact (value, dates, wording, delete) or a rule (enforce, demote, amend, delete) runs an impact check in the same request. A draft uses a fact if it quotes the value, names the subject near a figure, or names the student. Every such draft is re-checked; an <b>approved</b> one that now fails is moved back to the right reviewer with the reason and a "Back for re-approval" banner, and the event is logged. The Impact panel lists everything touched. Insights shows each amended rule's dismissal rate before and after the amendment. Saving the same change twice reopens nothing.</p>
<div class="grid2">
${img("03-impact.png", "Impact panel", "Fact F-3 changed from 4200 to 4500: the approved post that used it no longer passes and is sent back.")}
${img("04-reapproval.png", "Re-approval banner", "The approved post, back in review with the reason and the fact that changed.")}
</div>
<p class="note"><b>Tested:</b> live probe — an approved and an open draft both cite F-3; changing F-3 lists both, sends the approved one back with the reason, re-checks the open one, and a repeat save changes nothing (6 checks). Unit tests cover fact use by value, keyword and student name.</p>

<h3>2. Governance at the source: an API and MCP server <span class="done">Live</span></h3>
<p class="promise"><b>Promised:</b> a REST API with scoped keys and an MCP server exposing <code>get_brief</code> and <code>check_draft</code>; an in-app playground and a per-key audit trail. Test: call <code>check_draft</code> from the playground and from an MCP client → the same cited findings as the app, and a new audit entry.</p>
<p><b>Delivered.</b> The <b>API</b> page creates keys with scopes (<code>brief:read</code>, <code>check:write</code>); a key is shown once, stored only as a SHA-256 hash, and can be revoked. <code>get_brief</code> returns the rules in force for a channel and only the facts valid today, so an AI writer never sees an expired or embargoed figure. <code>check_draft</code> runs the same pipeline as the app and returns the same cited findings. Both are served over REST (<code>/api/v1/…</code>) and as an MCP server (<code>/api/mcp</code>, official SDK, Streamable HTTP) that Claude Desktop, Cursor or any MCP client can add with the config shown on the page. Every call is audited with key, route, status and time; keys are rate-limited.</p>
${img("05-api.png", "API page", "The API page: a scoped key, the playground calling check_draft over MCP, and the audit trail.")}
<p class="note"><b>Tested:</b> live probe, 13 checks — key creation is manager-only; <code>get_brief</code> excludes the expired F-11 and the embargoed F-9; <code>check_draft</code> returns exactly the app's findings through REST and through a real MCP SDK client; a missing, wrong, revoked or under-scoped key is refused; every call appears in the audit; another workspace cannot see the keys. Full reference in docs/API.md.</p>

<h3>3. Campaign and creative review with AI vision <span class="done">Live</span></h3>
<p class="promise"><b>Promised:</b> review a whole campaign (caption, creatives, landing-page copy, PDF brochure) and flag inconsistencies across assets — prices, dates, claims, promo codes; AI vision for stylised text and for photos of people, flagged for a consent check. Test: a three-asset campaign with a price mismatch and an unconsented student photo → both found, cited and routed to compliance.</p>
<p><b>Delivered.</b> A review now takes a caption, up to 4 creatives and up to 4 documents (landing page, brochure, email; pasted or uploaded as PDF or Word). Every text rule runs on every document, and the consistency check compares prices, percentages, counts, dates and promo codes across all sources, quoting both sides. AI vision reads text that OCR misses and reports people shown (described, never named), which raises a high-risk consent finding routed to compliance. If vision is unavailable the review says so rather than passing silently.</p>
<div class="grid2">
${img("06-campaign.png", "Campaign review", "The sample campaign: the brochure's ₹14,999 and the landing page's 12 January and EARLY10 contradict the caption.")}
${img("07-vision.png", "AI vision", "AI vision on a creative: the text it read and the person shown, flagged for a consent check.")}
</div>
<p class="note"><b>Tested:</b> live probe, 5 checks — caption, a creative with an illustrated student and a brochure with a different fee: the price mismatch is found on the brochure and cited, the person is found without being named, and the draft routes to compliance. Unit tests cover every unit compared and the format of the rule's own tests. <b>Try it:</b> New review → Use the sample campaign → Run review.</p>

<h2 class="page">Complete feature list</h2>
<table>
<tr><th style="width:34mm">Area</th><th>What it does</th></tr>
<tr><td>Review</td><td>Paste copy or upload DOCX/PDF; up to 4 images and 4 campaign documents; goal, audience, call to action, channel, and locked phrases no fix may remove; confidential mode (never sent to AI).</td></tr>
<tr><td>Code checks</td><td>Preferred terms, banned phrases, approved contacts, student results (course and dated consent), results disclaimer (same-language check for Hindi), brand-name spelling, capitals for emphasis, length per content type, sentence length, inclusive wording, invisible characters, and every figure against the Facts Register by subject then value (lakh and crore understood).</td></tr>
<tr><td>AI checks</td><td>Claims and voice rules, one rule per call, run twice when they find something; disagreement becomes a suggestion. Claude → Groq → Gemini with fallback, time caps and a circuit breaker; answers validated with Zod and cached.</td></tr>
<tr><td>Verifier</td><td>Code drops any finding whose quote is not in the draft, image or document, or whose rule or fact does not exist: no source, no flag.</td></tr>
<tr><td>Images</td><td>In the browser: OCR, palette (CIELAB), WCAG contrast, alt text, logo found by masked cross-correlation and checked for size and clear space. <b>New:</b> AI vision for stylised text and people shown.</td></tr>
<tr><td>Campaigns <b>new</b></td><td>Every rule on every document; prices, figures, dates and promo codes compared across caption, images and documents.</td></tr>
<tr><td>Facts Register</td><td>Evidence, owner, valid-from, valid-until, required disclosure; embargoed, expired and wrong-subject figures flagged. <b>New:</b> every change shows its impact.</td></tr>
<tr><td>Fixes</td><td>Each fix applied and re-checked before it is offered; edit before accepting; Accept all works through follow-ups.</td></tr>
<tr><td>Brand Kit</td><td>Rules with test sentences and an enforce gate, per-channel rules, versioning, JSON export and import, and a guide compiler for pasted text, PDF or Word.</td></tr>
<tr><td>Regulation pack</td><td>CCPA coaching-sector guidelines (2024), with penalty precedents as reported in the press.</td></tr>
<tr><td>Workflow</td><td>Four roles enforced on the server, risk routing by a fixed table, comments, versions with word-level changes, request changes, audit log, approval record with SHA-256 fingerprint. <b>New:</b> re-approval when a fact or rule change breaks an approved piece.</td></tr>
<tr><td>Insights</td><td>Most-flagged and most-dismissed rules, unclear rules, fact expiry watch, AI-drafted rule amendments re-tested by code. <b>New:</b> dismissal rate before and after each amendment.</td></tr>
<tr><td>API and MCP <b>new</b></td><td>Scoped, hashed, revocable keys; <code>get_brief</code> and <code>check_draft</code> over REST and MCP; playground; audit trail; rate limit.</td></tr>
<tr><td>Privacy</td><td>Emails, phones (mobile and landline), Aadhaar, PAN and card numbers masked before any AI call; confidential drafts never sent.</td></tr>
<tr><td>Hard cases</td><td>Seven one-click drafts built to beat a checker, each with what to look for.</td></tr>
<tr><td>Usability</td><td>One-click sample post and sample campaign, guided tour, private workspace per visitor, works on a phone, clear empty and error states.</td></tr>
</table>

<h2>Architecture and implementation</h2>
<div class="pipe">
<div><b>1 Redact</b>Personal data out</div>
<div><b>2 Code checks</b>Rules and every figure</div>
<div class="ai"><b>3 AI checks</b>One rule per call, twice</div>
<div class="ai"><b>4 AI vision</b>Text and people</div>
<div><b>5 Documents</b>Every rule on each</div>
<div><b>6 Consistency</b>Across all sources</div>
<div><b>7 Verifier</b>No source, no flag</div>
<div><b>8 Re-test fixes</b></div>
<div><b>9 Route</b>Fixed table, human approves</div>
</div>
<p class="note">Only steps 3 and 4 use AI. Numbers are never compared by AI: it only locates claims; code re-reads each value and compares it.</p>
<table>
<tr><th style="width:34mm">Layer</th><th>Choice and reason</th></tr>
<tr><td>App and API</td><td>Next.js 16 App Router (TypeScript), React 19, Tailwind CSS 4 on Vercel, functions in Mumbai next to the database.</td></tr>
<tr><td>Data</td><td>Supabase Postgres, 8 migrations; every row scoped by workspace. Round 3 added <code>drafts.impact</code>, <code>drafts.assets</code> and <code>api_keys</code> (hash only).</td></tr>
<tr><td>Change impact</td><td><code>src/lib/impact.ts</code>: finds drafts that use a fact or rule, re-checks them with code, moves approved ones back and logs the event; called from the fact and rule routes in the same request.</td></tr>
<tr><td>API and MCP</td><td><code>src/lib/governance.ts</code> holds <code>getBrief</code> and <code>checkDraft</code>, shared by REST (<code>/api/v1</code>), MCP (<code>/api/mcp</code>, @modelcontextprotocol/sdk, stateless Streamable HTTP) and the app, so all three give the same answer. <code>src/lib/apikeys.ts</code>: keys, scopes, rate limit, audit.</td></tr>
<tr><td>Campaigns and vision</td><td><code>src/lib/engine/consistency.ts</code> compares units across sources; <code>visual.ts</code> turns vision output into findings; the verifier grounds image findings in what vision read and document findings in the document.</td></tr>
<tr><td>AI adapter</td><td>Claude, Groq (gpt-oss-120b), Gemini (3.5 Flash Lite, low thinking); images go to Gemini first. 12 s cap (25 s for images), a provider that is rate-limited or slow is rested, answers cached by text and image hash.</td></tr>
</table>

<h2>Other improvements since Round 2</h2>
<ul>
<li><b>AI backup repaired.</b> Gemini 2.5 is not available to new keys and Gemini 3 models stalled while thinking; the adapter now uses 3.5 Flash Lite with thinking kept low (about 4 s per image) and a circuit breaker. The Groq vision model is discovered from the key instead of hard-coded.</li>
<li><b>Two new evaluations.</b> Images (20 generated creatives) and privacy (personal data planted in 24 drafts, canaries in 3 confidential ones). The privacy evaluation found a real leak — landlines like 080-4123-5678 were not masked — fixed before publishing.</li>
<li><b>Fewer false flags.</b> A number inside a promo code (EARLY10) and an offer cap ("the first 50 students") are no longer read as claims.</li>
<li><b>New rules in the demo kit:</b> consistency across the campaign (high risk), people shown in a creative, hidden characters.</li>
<li><b>Documentation:</b> architecture, testing, known issues with file references, dated and costed roadmap, API reference, changelog.</li>
</ul>

<h2 class="page">Testing</h2>
<table>
<tr><th>Suite</th><th>Result</th><th>What it covers</th></tr>
<tr><td>Unit tests (Vitest, CI)</td><td>${tests} pass</td><td>Engine rules, fact matching, logo matching, verifier, fix re-testing, a deliberately wrong AI (8 tests), provider fallback and circuit breaker, change impact, campaign consistency, input validation, every rule's own tests</td></tr>
<tr><td>Browser journey (live)</td><td>20 of 20</td><td>Review, edit a fix, accept all, replace an image, route, approve, record, PDF upload, channels, confidential, Brand Kit export and import</td></tr>
<tr><td>UI sweep (live)</td><td>51 of 51</td><td>Every page at desktop and phone size (console and server errors, broken images and links, sideways scroll) and every control, including the API page and campaign</td></tr>
<tr><td>API probe (live)</td><td>93 of 93</td><td>Every route with bad input, wrong role and another workspace; the three improvements end to end, including a real MCP client</td></tr>
<tr><td>Fuzzing</td><td>26 inputs</td><td>12,000 emoji, Hindi, regex characters, HTML, null bytes, invisible characters: no crash, no invented quote, slowest review 0.6 s</td></tr>
</table>
<h3>Accuracy and privacy</h3>
<table>
<tr><th>Evaluation</th><th>Precision</th><th>Recall</th><th>Other</th></tr>
<tr><td>Text, code checks only <span>(40 held-out drafts)</span></td><td>${pct(code.precision)} <span>(${ci(code.precisionCI)})</span></td><td>${pct(code.recall)} <span>(${ci(code.recallCI)})</span></td><td>${code.hardCaught} of ${code.hardPlanted} hard phrasings</td></tr>
<tr><td>Text, code and AI <span>(live, run twice)</span></td><td>${pct(ai.precision)} <span>(${ci(ai.precisionCI)})</span></td><td>${pct(ai.recall)} <span>(${ci(ai.recallCI)})</span></td><td>${ai.hardCaught} of ${ai.hardPlanted} hard; ${pct(ai.agreement)} same on both runs</td></tr>
<tr><td>Images <span>(20 creatives)</span></td><td>100% <span>(0 false alarms in 40 clean checks)</span></td><td>20 of 20</td><td>Colour, contrast, logo</td></tr>
<tr><td>Privacy <span>(24 + 3 drafts)</span></td><td colspan="2">0 leaks in 144 AI prompts</td><td>8 kinds of personal data; canaries in confidential drafts</td></tr>
</table>
<p class="note">95% Wilson intervals; test-set fingerprint <code>${code.fingerprint}</code>, shown on the live Results page, which re-runs the code checks on demand. The numbers are optimistic because the team wrote both the rules and the drafts; real drafts are the first step on the roadmap.</p>

<h2>Known issues and limits</h2>
<ol class="note" style="font-size:9pt">${issues.map((i) => `<li>${i}</li>`).join("")}</ol>

<h2>Roadmap</h2>
<table>
<tr><th style="width:18mm">When</th><th>Step</th><th style="width:44mm">Why</th><th style="width:40mm">Cost</th></tr>
${roadmap.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join("")}
</table>
<p class="note">What we will measure: precision and recall on real pilot drafts (target above 90% with AI), time from draft to approval before and after, and whether rule amendments bring dismissals down.</p>

<section style="break-inside: avoid"><h2>Team and disclosures</h2>
<table>
<tr><th>Member</th><th>Role</th><th>College</th><th>Course</th></tr>
<tr><td>Mahak Fahad (team leader)</td><td>Backend + AI / ML</td><td>Chennai Institute of Technology</td><td>B.E. Computer Science and Engineering, batch of 2029</td></tr>
<tr><td>Roshini R</td><td>Frontend + Design / UI-UX</td><td>Chennai Institute of Technology</td><td>B.E. Computer Science and Engineering, batch of 2029</td></tr>
</table>
<ul class="note">
<li><b>AI used in building:</b> Claude (Anthropic) was used to help write code and documents during the official build windows. The team reviewed it and is responsible for it.</li>
<li><b>AI in the product:</b> Groq and Gemini APIs (Claude supported), through one adapter. Personal data is masked before any call.</li>
<li><b>Build window:</b> all Round 3 code was committed after the window opened on 18 November 2026, 11:59 PM IST; the commit history shows it.</li>
<li><b>Open source:</b> Next.js, React, Tailwind CSS, supabase-js, Zod, Model Context Protocol SDK, Anthropic SDK, groq-sdk, @google/genai, mammoth, unpdf, tesseract.js, Vitest, Playwright.</li>
<li><b>Demo data:</b> PrepPath Academy, its rules, facts and students are fictional. Guidewise supports reviewers; it does not give legal advice.</li>
</ul></section>
</body></html>`;

writeFileSync(`${dir}/Guidewise_Round3.html`, html);
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("file://" + process.cwd() + `/${dir}/Guidewise_Round3.html`);
await p.waitForLoadState("networkidle");
await p.pdf({ path: `${dir}/Guidewise_Round3.pdf`, format: "A4", printBackground: true, displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:7pt;color:#8a857a;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>Guidewise · CodeNova India 2026 · Round 3</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: "16mm", bottom: "18mm", left: "16mm", right: "16mm" } });
await b.close();
console.log("wrote", `${dir}/Guidewise_Round3.pdf`);
