// Builds the Round 3 final product PDF from numbers in the repo and screenshots in docs/round3/img.
// Usage: node docs/round3/build-pdf.mjs   (needs Playwright; screenshots from docs/round3/shots.mjs and shots-extra.mjs)
//
// Where each number comes from, so the PDF and the repo never disagree:
//   - unit tests: counted by running `npx vitest run` now
//   - text accuracy, code only: `npx tsx scripts/eval-json.ts` (re-run now); with AI: src/lib/eval/ai-results.json
//   - live-site results: docs/round3/live-results.json, written by hand after each full run against the live site:
//       { "date": "20 Nov 2026",                          when the run finished
//         "journey": "21/21",                              npm run e2e         (browser journey)
//         "sweep": "59/59",                                npm run e2e:sweep   (every page and control, with axe-core)
//         "probe": "206/206",                              npm run e2e:api     (API probe, incl. race checks)
//         "axe": "0 issues across 27 page checks" }        axe-core serious/critical issues in the sweep
//   - roadmap, known issues and the demo-to-production table: docs/ROADMAP.md, docs/KNOWN_ISSUES.md, docs/PRODUCTION.md
//   - hands-on user tests: docs/round3/user-tests.json; the section is left out until that file exists. Schema:
//       { date, participants: [{ initials, year_branch, tasks: ["Y"|"help"|"N" x4], minutes, confused, liked }], changes_made: [string] }
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const dir = "docs/round3";
const code = JSON.parse(execSync("npx tsx scripts/eval-json.ts", { encoding: "utf8" }));
const ai = JSON.parse(readFileSync("src/lib/eval/ai-results.json", "utf8"));
const live = JSON.parse(readFileSync(`${dir}/live-results.json`, "utf8"));
const tests = (execSync("npx vitest run 2>&1", { encoding: "utf8" }).match(/Tests\s+(\d+) passed/) ?? [])[1] ?? "?";
const commits = execSync("git rev-list --count --since='2026-11-18T18:29:00Z' HEAD", { encoding: "utf8" }).trim();
const migrations = execSync("ls supabase/migrations", { encoding: "utf8" }).split("\n").filter((f) => f.endsWith(".sql")).length;
const css = readFileSync("docs/round2/build-pdf.mjs", "utf8").match(/<style>([\s\S]*?)<\/style>/)[1];
const pct = (x) => `${Math.round(x * 100)}%`;
const ci = (c) => `${pct(c[0])}–${pct(c[1])}`;
const frac = (s) => s.replace("/", " of ");
const md = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
const img = (f, alt, cap) => existsSync(`${dir}/img/${f}`)
  ? `<figure><img src="img/${f}" alt="${alt}"><figcaption>${cap}</figcaption></figure>` : "";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Roadmap, known issues and the demo-to-production table come from the docs.
const roadmap = readFileSync("docs/ROADMAP.md", "utf8").split("\n").filter((l) => /^\| (Dec|Jan|Feb|Mar|Q\d)/.test(l))
  .map((l) => l.split("|").slice(1, -1).map((c) => md(c.trim())));
const issues = readFileSync("docs/KNOWN_ISSUES.md", "utf8").split("\n").filter((l) => /^\d+\. /.test(l))
  .map((l) => md(l.replace(/^\d+\. /, "").replace(/\s*\(`[^)]*`[^)]*\)/g, "")));
const prodDoc = readFileSync("docs/PRODUCTION.md", "utf8");
const prodRows = (prodDoc.split("## What changes")[1] ?? "").split("\n## ")[0].split("\n")
  .filter((l) => /^\| /.test(l) && !/^\| (Demo today|---)/.test(l))
  .map((l) => l.split("|").slice(1, -1).map((c) => md(c.trim())));

// Hands-on user tests: rendered only when the results file exists.
const utPath = `${dir}/user-tests.json`;
const ut = existsSync(utPath) ? JSON.parse(readFileSync(utPath, "utf8")) : null;
const userTests = !ut ? "" : (() => {
  const ps = ut.participants ?? [];
  const unaided = ps.reduce((n, p) => n + (p.tasks ?? []).filter((t) => t === "Y").length, 0);
  const total = ps.reduce((n, p) => n + (p.tasks ?? []).length, 0);
  return `<section style="break-inside: avoid"><h2>Hands-on user test</h2>
<p>${ps.length} people who had not seen Guidewise before tried four tasks on the live site on ${esc(ut.date)} (review the sample post; find the cross-document mismatches in the sample campaign; update fact F-3 and say what happened to the approved post; create an API key and check a sentence). We watched and did not help unless asked. Tasks done without help: <b>${unaided} of ${total}</b>.</p>
<table><tr><th>Person</th><th>Task 1</th><th>Task 2</th><th>Task 3</th><th>Task 4</th><th>Minutes</th><th>What confused them</th><th>What they liked</th></tr>
${ps.map((p) => `<tr><td>${esc(p.initials)} <span>${esc(p.year_branch)}</span></td>${[0, 1, 2, 3].map((i) => `<td>${esc(p.tasks?.[i])}</td>`).join("")}<td>${esc(p.minutes)}</td><td>${esc(p.confused)}</td><td>${esc(p.liked)}</td></tr>`).join("")}
</table>
${(ut.changes_made ?? []).length ? `<p><b>What we changed because of it</b></p><ul>${ut.changes_made.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
<p class="note">Y = done without help, help = done with a hint, N = not done. A small group of students, not marketers; the December pilot is the real test.</p></section>`;
})();

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Guidewise · Round 3</title>
<style>${css}
.done { display:inline-block; font-size:7.5pt; letter-spacing:.08em; text-transform:uppercase; color:#fff; background:var(--brand); border-radius:2pt; padding:1pt 5pt; margin-left:6pt; vertical-align:middle; }
.promise { font-size:8.8pt; color:var(--muted); border-left:3px solid var(--line); padding:2pt 8pt; margin:4pt 0 6pt; }
code { font-size: 8.8pt; }
.grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8pt; }
.grid3 .box p { font-size: 8.8pt; margin: 3pt 0 0; }
.pdt { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border: 1px solid var(--line); border-radius: 3pt; margin: 4pt 0 6pt; font-size: 8.8pt; }
.pdt div { padding: 5pt 7pt; border-right: 1px solid var(--line); }
.pdt div:last-child { border-right: 0; }
.pdt b { display: block; font-size: 7.5pt; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin-bottom: 2pt; }
.beyond { display: grid; grid-template-columns: 62mm 1fr; gap: 10pt; align-items: start; break-inside: avoid; margin: 8pt 0 4pt; }
.beyond figure { margin: 0; }
.beyond figure img { max-height: 58mm; }
.beyond h3 { margin-top: 0; }
.beyond p { font-size: 9.4pt; }
.extra { columns: 2; column-gap: 14pt; font-size: 9.2pt; }
.extra li { break-inside: avoid; }
.grid2 figure img { max-height: 62mm; }
figure img { width: auto; max-width: 100%; }
.apiimg figure img { max-height: 80mm; }
</style></head><body>

<p class="k">CodeNova India 2026 · Round 3, the final product · Team Guide Wise</p>
<h1 style="margin-top:6pt">Guidewise</h1>
<p class="lede">Brand rules that run. Guidewise checks marketing content against a team's own approved rules and dated facts before it is published. Every finding quotes the exact words and the rule it breaks, every fix is re-tested before it is offered, risky content goes to the right reviewer, and a person approves the final version. In Round 3 it learned to follow a change through everything it touches, to govern AI writing tools at the source, and to review a whole campaign at once, and it went out to where people write: a Chrome extension, bulk checks of a content calendar, and read-only links for people outside the team.</p>

<table class="links" style="margin-top:12pt">
<tr><td>Live product</td><td><b>https://guidewise-kohl.vercel.app</b> · no sign-in; each visitor gets a private demo workspace</td></tr>
<tr><td>Source code</td><td>https://github.com/mahak867/Guide-wise · ${commits} commits in the Round 3 window, all after it opened (18 Nov, 11:59 PM IST)</td></tr>
<tr><td>Chrome extension</td><td>https://github.com/mahak867/Guide-wise/tree/main/extension · load unpacked; install steps in extension/README.md</td></tr>
<tr><td>Documentation</td><td>In docs/: <b>PRODUCTION.md</b> (from demo to a real team), <b>THREAT_MODEL.md</b>, <b>LOAD_TEST.md</b>, <b>EVAL_HELPERS.md</b>, TESTING.md, ARCHITECTURE.md, API.md, KNOWN_ISSUES.md, ROADMAP.md, CHANGELOG.md</td></tr>
<tr><td>Walkthrough video</td><td>https://guidewise-kohl.vercel.app/demo.webm (the Round 2 journey, 100 seconds)</td></tr>
<tr><td>Demo brand</td><td>PrepPath Academy, a fictional JEE/NEET coaching brand written by the team</td></tr>
<tr><td>Team</td><td>Mahak Fahad (team leader, Backend + AI/ML) · Roshini R (Frontend + Design/UI-UX) · Chennai Institute of Technology</td></tr>
</table>

<h2>At a glance</h2>
<div class="grid3">
<div class="box"><b>All three promises are live.</b><p>Change impact, the API and MCP server, and campaign review with AI vision, each tested on the live site against the exact test we wrote down at Round 2.</p></div>
<div class="box"><b>And more than we promised.</b><p>Bulk check, a Chrome extension, read-only share links, channel previews, undo and keyboard review, exceptions with end dates and dual sign-off, a database approval gate, 30 Brand Kit rules.</p></div>
<div class="box"><b>Measured, not claimed.</b><p>${pct(ai.precision)} precision, ${pct(ai.recall)} recall with AI on 40 held-out drafts. ${tests} unit tests. Live (${live.date}): journey ${live.journey}, sweep ${live.sweep}, probe ${live.probe}, axe ${live.axe}. Load: 980 requests, 0 failed.</p></div>
</div>

<h2 class="page">The three improvements we promised, delivered</h2>

<h3>1. Change impact <span class="done">Live</span></h3>
<div class="pdt">
<div><b>Promised at Round 2</b>Changing or expiring a fact, or amending a rule, lists every draft and approved piece that used it, re-checks them, and marks approved pieces that no longer pass as needing re-approval; each amended rule shows its dismissal rate before and after.</div>
<div><b>Delivered</b>Saving a fact (value, dates, wording, delete) or a rule (enforce, demote, amend, delete) runs the impact check in the same request. An approved piece that now fails goes back to the right reviewer with the reason and a "Back for re-approval" banner. The Impact panel lists everything touched; Insights shows dismissal rates before and after.</div>
<div><b>Tested</b>Live probe, 6 checks: an approved and an open draft both cite F-3; changing F-3 lists both, sends the approved one back with the reason, re-checks the open one; a repeat save reopens nothing. A conditional update means a draft is sent back only if it is still approved.</div>
</div>
<div class="grid2">
${img("03-impact.png", "Impact panel", "Fact F-3 changed from 4,200 to 4,500: the approved posts that used it no longer pass and are sent back, each with the reason.")}
${img("04-reapproval.png", "Re-approval banner", "The approved post, back in review with the reason and the fact that changed.")}
</div>
<p class="note"><b>Try it:</b> Facts and assets → act as Meera → Edit on F-3 → change the figure → Save.</p>

<h3>2. Governance at the source: an API and MCP server <span class="done">Live</span></h3>
<div class="pdt">
<div><b>Promised</b>A REST API with scoped keys and an MCP server exposing <code>get_brief</code> and <code>check_draft</code>; an in-app playground and a per-key audit trail. Test: <code>check_draft</code> from the playground and from an MCP client gives the app's cited findings and a new audit entry.</div>
<div><b>Delivered</b>Keys with scopes (<code>brief:read</code>, <code>draft:check</code>), shown once, stored as SHA-256, revocable, 30 calls a minute. <code>get_brief</code> returns rules in force and only facts valid today; <code>check_draft</code> runs the app's pipeline. REST (<code>/api/v1</code>) and MCP (<code>/api/mcp</code>, official SDK, Streamable HTTP). The Chrome extension and bulk check build on it.</div>
<div><b>Tested</b>Live probe, 13 checks: key creation is manager-only; the brief excludes expired F-11 and embargoed F-9; <code>check_draft</code> returns exactly the app's findings over REST and through a real MCP SDK client; missing, wrong, revoked or under-scoped keys are refused; every call is audited; another workspace cannot see the keys.</div>
</div>
<div class="apiimg">${img("05-api.png", "API page", "The API page: a scoped key, the playground calling check_draft over MCP, and the audit trail.")}</div>

<h3>3. Campaign and creative review with AI vision <span class="done">Live</span></h3>
<div class="pdt">
<div><b>Promised</b>Review a whole campaign (caption, creatives, landing page, PDF brochure) and flag inconsistencies across assets in prices, dates, claims and promo codes; AI vision for stylised text and for people shown, flagged for consent. Test: a price mismatch and an unconsented person, both found, cited and routed to compliance.</div>
<div><b>Delivered</b>A caption, up to 4 creatives and up to 4 documents (pasted, PDF or Word, or read from a live web page, with text the page hides from readers flagged). Every code and AI check runs on every document; code compares prices, figures, dates and promo codes across all sources, quoting both sides. Vision reads text OCR missed and describes people shown, never naming them.</div>
<div><b>Tested</b>Live probe, 5 campaign checks plus 5 for the web page reader: caption, a creative with an illustrated student and a brochure with a different fee: the mismatch is found on the brochure and cited, the person is found without being named, and the draft routes to compliance; private and metadata addresses are refused.</div>
</div>
<div class="grid2">
${img("06-campaign.png", "Campaign review", "The sample campaign: the AI finds a reworded guarantee in the brochure; code finds that its ₹14,999 and the landing page's 12 January and EARLY10 contradict the caption.")}
${img("07-vision.png", "AI vision", "AI vision on a creative: the text it read and the person shown, flagged for a consent check.")}
</div>
<p class="note"><b>Try it:</b> New review → Use the sample campaign → Run review.</p>

<h2>Beyond the three promises</h2>
<p>We asked what a marketing team would need on its first real day, and built that too. Each item has unit tests, live probe checks and a sweep step.</p>

<div class="beyond">${img("10-bulk.png", "Bulk check", "Bulk check on the six-post sample calendar.")}
<div><h3>Bulk check</h3><p>A content calendar goes through at once: paste it or upload a CSV (quoted commas, semicolons and line breaks handled; every problem names its row), up to 50 posts. Each gets the review's code checks with AI off, against one read of the Brand Kit, so 50 posts take seconds and spend no AI quota. The result: a verdict per post, severity counts, the top findings quoted, the rules broken most often, a results CSV guarded against spreadsheet formulas, and <b>Open as a review</b> for the full AI review. <b>Try it:</b> Bulk check → Use a sample calendar → Check 6 posts.</p></div></div>

<div class="beyond">${img("14-extension.png", "Chrome extension", "The extension's popup on a selected draft: verdict, cited findings, Copy fix.")}
<div><h3>Chrome extension: check where you write</h3><p>"Check with Guidewise" (Manifest V3, in <code>extension/</code>) checks text selected in LinkedIn, Gmail, X or any page through <code>POST /api/v1/check</code> with a <code>draft:check</code> key, and shows the verdict and each cited finding with <b>Copy fix</b>. It reads a page only when its button is clicked (activeTab), can reach no site but Guidewise, never logs the key, and renders server text as text only. The API sends no CORS header, so web pages still cannot call it with someone's key. Tested by <code>npm run e2e:extension</code>, which loads it in Chromium against the live API.</p></div></div>

<div class="beyond">${img("13-share.png", "Share link", "A read-only share link on the approval record of the seeded WhatsApp post.")}
<div><h3>Read-only share links</h3><p>An approved record can be sent to someone outside the workspace (a franchise owner, an agency, a lawyer) as <code>/r/&lt;token&gt;</code>: valid 30 days, revocable by a reviewer or the brand manager, never by the creator. The token is 32 random bytes and only its SHA-256 hash is stored; unknown, expired and revoked links give the same 404; the public copy shows only the record (no workspace id, author, images or activity) and is noindex and no-store. 17 probe checks.</p></div></div>

<div class="beyond">${img("11-preview.png", "Channel preview", "New review with the sample caption: the channel preview summary says 125 of 274 characters show before the cut, with 2 warnings.")}
<div><h3>Channel previews</h3><p>As you write, the draft is shown as an Instagram caption, a LinkedIn post, a Facebook ad, a WhatsApp message, an email in an inbox or a page's first screen, with the cut marked ("… more"). It warns when a required disclaimer is missing or falls after the cut, when the call to action is hidden, and notes a price or promo code after it. Characters are counted as readers see them: an emoji is one and is never split. Cut-offs are approximate and vary by device, and the panel says so.</p></div></div>

<div class="beyond">${img("12-review-undo.png", "Review page", "The review page: routing explained in plain words, findings by severity, and the keyboard hint (J/K, A, D, ?).")}
<div><h3>Undo, keyboard review and precedents</h3><p>"Undo fix" for 10 seconds after accepting a fix, an edited fix or Accept all: the old text returns as a new version and the findings reopen; refused with a clear 409 once the draft has moved on. Keyboard review: J/K move, A accept, D dismiss, U undo, ? help, with a visible focus ring and screen-reader announcements. Each finding says how the team settled the same rule before ("fixed 4 times, dismissed 2 times; last: Approved exception by Kavya").</p></div></div>

<h3>Also beyond the promises</h3>
<ul class="extra">
<li><b>Time-limited exceptions and dual sign-off.</b> Only a reviewer can grant an exception, optionally until a date; after it, the finding reopens. High-risk drafts need compliance, then brand; the receipt names both.</li>
<li><b>Approval bound to the Brand Kit version.</b> If the kit changed since the last check, approval re-checks first, and anything new blocks it.</li>
<li><b>A database approval gate.</b> A trigger (migration 009) refuses to mark a draft approved while a violation is open, whatever writes to the database.</li>
<li><b>Web page reader with hidden-text detection.</b> Text a page hides from readers (display:none, zero-size, same colour as the background) is separated, labelled and checked; private and metadata addresses refused.</li>
<li><b>30 Brand Kit rules,</b> six new: paid-partnership labels, offer end dates, competitor names, vague link text, CamelCase hashtags, stacked "!!" and emoji. An expired fact points to its successor.</li>
<li><b>Security headers and a threat model.</b> CSP, no framing, nosniff, HSTS; 15 threats, each mapped to the test that proves it.</li>
<li><b>Load test.</b> 20 and then 50 concurrent visitors through the full creator journey: 980 requests, 0 failed.</li>
<li><b>Accessibility checks.</b> axe-core on every page at desktop and phone size in every sweep run.</li>
</ul>

<h2>Complete feature list</h2>
<table>
<tr><th style="width:34mm">Area</th><th>What it does</th></tr>
<tr><td>Review</td><td>Paste copy or upload DOCX/PDF; up to 4 images and 4 campaign documents; goal, audience, call to action, channel, locked phrases no fix may remove; confidential mode (never sent to AI); live word, character and sentence counts; channel previews; a summary of what will be checked before it runs.</td></tr>
<tr><td>Code checks</td><td>Preferred terms, banned phrases, approved contacts, student results with dated consent, results disclaimer (same-language for Hindi), brand-name spelling, capitals, length per content type, sentence length, inclusive wording, invisible characters, paid-partnership labels, offer end dates, competitor names, vague link text, hashtags, emoji and "!!", and every figure against the Facts Register by subject then value (lakh and crore understood).</td></tr>
<tr><td>AI checks</td><td>Claims and voice rules, one rule per call, run twice when they find something; disagreement becomes a suggestion. Claude → Groq → Groq's smaller model → Gemini, with time caps, a circuit breaker, Zod validation and a cache.</td></tr>
<tr><td>Verifier</td><td>Code drops any finding whose quote is not in the draft, image or document, or whose rule or fact does not exist: no source, no flag.</td></tr>
<tr><td>Images</td><td>In the browser: OCR, palette (CIELAB), WCAG contrast, alt text, logo found by masked cross-correlation and checked for size and clear space. AI vision for stylised text and people shown.</td></tr>
<tr><td>Campaigns</td><td>Every check on every document and on the text in each creative; prices, figures, dates and promo codes compared across all sources; documents read from a live web page, hidden text flagged.</td></tr>
<tr><td>Facts Register</td><td>Evidence, owner, valid-from, valid-until, required disclosure, successor; embargoed, expired and wrong-subject figures flagged; every change shows its impact.</td></tr>
<tr><td>Fixes</td><td>Each fix applied and re-checked before it is offered; edit before accepting; Accept all; undo for 10 seconds.</td></tr>
<tr><td>Brand Kit</td><td>30 rules with test sentences and an enforce gate, per-channel rules, versions, JSON export and import, and a guide compiler for pasted text, PDF or Word.</td></tr>
<tr><td>Workflow</td><td>Four roles enforced on the server; risk routing by a fixed table; dual sign-off for high risk; time-limited exceptions; approval bound to the kit version and gated in the database; comments, versions with word-level changes, request changes, audit log; keyboard review; precedents per rule; approval record with SHA-256 fingerprint; read-only share links; re-approval when a fact or rule change breaks an approved piece.</td></tr>
<tr><td>Insights</td><td>Most-flagged and most-dismissed rules, unclear rules, fact expiry watch, AI-drafted rule amendments re-tested by code, dismissal rate before and after each amendment.</td></tr>
<tr><td>API, MCP, extension, bulk</td><td>Scoped, hashed, revocable keys; <code>get_brief</code> and <code>check_draft</code> over REST and MCP; playground; audit trail; rate limit. The Chrome extension and bulk check (up to 50 posts, CSV in and out) use the same governance module.</td></tr>
<tr><td>Privacy and security</td><td>Emails, phones, Aadhaar, PAN and card numbers masked before any AI call; confidential drafts never sent; CSP and security headers; every route validated with Zod.</td></tr>
<tr><td>Usability</td><td>One-click sample post, sample campaign and sample calendar; seven hard cases; guided tour; private workspace per visitor; works on a phone; clear empty and error states.</td></tr>
</table>

<section style="break-inside: avoid"><h2>Architecture and implementation</h2>
<div class="pipe">
<div><b>1 Redact</b>Personal data out</div>
<div><b>2 Code checks</b>Rules and every figure</div>
<div class="ai"><b>3 AI checks</b>One rule per call, twice</div>
<div class="ai"><b>4 AI vision</b>Text and people</div>
<div class="ai"><b>5 Documents</b>Every check on each</div>
<div><b>6 Consistency</b>Across all sources</div>
<div><b>7 Verifier</b>No source, no flag</div>
<div><b>8 Re-test fixes</b></div>
<div><b>9 Route</b>Fixed table, human approves</div>
</div>
<p class="note">Only steps 3, 4 and 5 use AI. Numbers are never compared by AI: it only locates claims; code re-reads each value and compares it.</p></section>
<table>
<tr><th style="width:34mm">Layer</th><th>Choice and reason</th></tr>
<tr><td>App and API</td><td>Next.js 16 App Router (TypeScript), React 19, Tailwind CSS 4 on Vercel, functions in Mumbai next to the database. Content-Security-Policy allowing only this site (plus the OCR worker), no framing, nosniff, strict referrer and permissions policies, HSTS.</td></tr>
<tr><td>Data</td><td>Supabase Postgres, ${migrations} migrations; every row scoped by workspace. Round 3 added <code>drafts.impact</code>, <code>drafts.assets</code>, <code>api_keys</code> (hash only) and an <b>approval trigger</b> (009) that refuses approval while a violation is open. State changes are conditional updates, so the loser of a race gets a 409.</td></tr>
<tr><td>Change impact</td><td><code>src/lib/impact.ts</code>: finds drafts that use a fact or rule, re-checks them, moves approved ones back and logs the event, in the same request as the save.</td></tr>
<tr><td>Governance module</td><td><code>src/lib/governance.ts</code> holds <code>getBrief</code> and <code>checkDraft</code>, shared by the app, REST, MCP (official SDK, stateless Streamable HTTP), <b>bulk check</b> (<code>/api/bulk</code>, code checks against one read of the kit) and the <b>Chrome extension</b> (popup, not content script, so no CORS opening is needed). All give the same answer.</td></tr>
<tr><td>Share links</td><td>32 random bytes per link; only the SHA-256 hash is kept, in the events log (no migration); public route rate-limited, noindex, no-store; personal data masked outside the approved text.</td></tr>
<tr><td>Campaigns and vision</td><td><code>consistency.ts</code> compares units across sources; <code>webpage.ts</code> reads a page (address checked before every request and redirect, one 8 s deadline, 2 MB); the verifier grounds each finding in the source it cites.</td></tr>
<tr><td>AI adapter</td><td>Claude, Groq (gpt-oss-120b, with gpt-oss-20b while it is rate-limited), Gemini 3.5 Flash Lite; 12 s cap (25 s for images); a limited or slow provider is rested; answers cached by text and image hash.</td></tr>
</table>

<h2>Other improvements since Round 2</h2>
<ul>
<li><b>Bug hunt and race fixes.</b> We attacked the live site as a judge might: racing and repeated actions, odd bodies, huge input, two tabs, phone size, keyboard only. Fixed: lost Brand Kit versions under concurrent saves (now compare-and-set), duplicated seed posts, a bypassable key limit, 500s on non-object bodies, a rule pattern that could stall reviews, and racing approvals that wrote several receipts (every state change is now conditional; 8 live race checks).</li>
<li><b>AI helpers measured, then fixed.</b> The guide compiler and the rule-amendment helper were measured live with an answer key written first (below). The run found real gaps (a contact rule lost to redaction, proposals saved without their check, amendments that changed wording but not the check); each is fixed with unit tests.</li>
<li><b>Accessibility.</b> axe-core now runs in every sweep at desktop and phone size; its first run found an unnamed role switcher and phone tables unreachable by keyboard, both fixed.</li>
<li><b>Load test.</b> 20 and 50 concurrent visitors, each in its own workspace, through the full creator journey: 980 requests, 0 failed, p95 2.9 s cold and 1.5 s warm.</li>
<li><b>Demo dates.</b> The sample's embargoed fee would have become valid on 1 December, during judging; it now lifts on 1 March 2027, and a test runs the sample at three future dates.</li>
<li><b>AI capacity and backup.</b> Groq's smaller model takes over while the main one is rate-limited; the Gemini backup was repaired (3.5 Flash Lite, low thinking, a circuit breaker).</li>
<li><b>Fewer false flags.</b> Numbers inside promo codes and offer caps are no longer read as claims; a "$" that OCR reads for "₹" is still compared as a price. The privacy evaluation found and fixed a landline-masking leak.</li>
<li><b>Easier to try.</b> One link per Round 3 feature from the home page; facts edited in place; the demo starts with an approved post citing F-3; every page explains its fields and empty states.</li>
</ul>

<h2>Testing</h2>
<table>
<tr><th>Suite</th><th>Result</th><th>What it covers</th></tr>
<tr><td>Unit tests (Vitest, CI)</td><td>${tests} pass</td><td>Engine rules, fact matching, logo matching, verifier, fix re-testing, a deliberately wrong AI, provider fallback, change impact, campaign consistency, share links, previews, bulk CSV, the extension's logic, bug-hunt regressions, fuzzing (26 hostile inputs), the sample at three future dates, every rule's own tests</td></tr>
<tr><td>Browser journey (live)</td><td>${frac(live.journey)}</td><td>Review, edit a fix, accept all, replace an image, route, exceptions with an end date, two sign-offs, record, PDF upload, channels, confidential, Brand Kit export and import</td></tr>
<tr><td>UI sweep (live)</td><td>${frac(live.sweep)}</td><td>Every page at desktop and phone size and every control, with axe-core: ${live.axe} (serious or critical)</td></tr>
<tr><td>API probe (live, daily)</td><td>${frac(live.probe)}</td><td>Every route with bad input, wrong role and another workspace; the three improvements end to end with a real MCP client; share links, undo, exceptions, sign-off, races, security headers</td></tr>
<tr><td>Extension (live)</td><td>passes</td><td>The unpacked extension in Chromium: selections, pasted text, Copy fix, a wrong key, and that web pages still cannot call the API</td></tr>
<tr><td>Load test (live)</td><td>980 requests, 0 failed</td><td>20 then 50 concurrent visitors through the creator journey, AI off to keep the free quota for judges</td></tr>
</table>
<p class="note">Live results from the run of ${live.date}. The API probe also runs against the live site every morning from GitHub Actions.</p>
<h3>Accuracy and privacy</h3>
<table>
<tr><th>Evaluation</th><th>Precision</th><th>Recall</th><th>Other</th></tr>
<tr><td>Text, code checks only <span>(40 held-out drafts)</span></td><td>${pct(code.precision)} <span>(${ci(code.precisionCI)})</span></td><td>${pct(code.recall)} <span>(${ci(code.recallCI)})</span></td><td>${code.hardCaught} of ${code.hardPlanted} hard phrasings</td></tr>
<tr><td>Text, code and AI <span>(live, run twice)</span></td><td>${pct(ai.precision)} <span>(${ci(ai.precisionCI)})</span></td><td>${pct(ai.recall)} <span>(${ci(ai.recallCI)})</span></td><td>${ai.hardCaught} of ${ai.hardPlanted} hard; ${pct(ai.agreement)} same on both runs</td></tr>
<tr><td>Images <span>(20 creatives)</span></td><td>100% <span>(0 false alarms in 40 clean checks)</span></td><td>20 of 20</td><td>Colour, contrast, logo</td></tr>
<tr><td>Privacy <span>(24 + 3 drafts)</span></td><td colspan="2">0 leaks in 144 AI prompts</td><td>Personal data of 5 kinds; canaries in confidential drafts</td></tr>
<tr><td>Guide compiler <span>(10 passages, before the fixes)</span></td><td colspan="2">16 of 17 expected rules; 7 of 8 planted problems warned</td><td>0 false warnings; 15 of 18 proposals pass their own tests</td></tr>
<tr><td>Rule amendment <span>(8 rules, before the fixes)</span></td><td colspan="2">7 of 8 accepted by the code gate</td><td>Dismissed text still flagged after 7 of 7: the gap the fixes address</td></tr>
</table>
<p class="note">95% Wilson intervals; test-set fingerprint <code>${code.fingerprint}</code>, shown on the live Results page, which re-runs the code checks on demand. The AI-helper numbers were measured once, before the fixes listed above, and have not yet been re-measured (docs/EVAL_HELPERS.md). All numbers are optimistic because the team wrote both the rules and the test drafts; real drafts are the first step on the roadmap.</p>

<h2>From demo to a real team</h2>
<p>The live site is built so a judge can open it with no sign-in. For a coaching centre's marketing team, <b>the engine, the governance module, the workflow rules and the evidence stay exactly the same</b>; these change (docs/PRODUCTION.md):</p>
<table>
<tr><th style="width:42mm">Demo today</th><th>For a real team</th><th style="width:44mm">Effort</th></tr>
${prodRows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}
</table>
<p><b>Where it fits a team's day:</b> a writer checks a draft with the Chrome extension, or an AI writing tool calls <code>check_draft</code> over MCP; a month's calendar goes through bulk check; reviews route themselves, with two sign-offs where risk is high; when a fact changes, change impact sends every approved piece that used it back; the manager watches Insights for rules people keep dismissing.</p>

${userTests}

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
<li><b>Open source:</b> Next.js, React, Tailwind CSS, supabase-js, Zod, Model Context Protocol SDK, Anthropic SDK, groq-sdk, @google/genai, mammoth, unpdf, tesseract.js, axe-core, Vitest, Playwright.</li>
<li><b>Demo data:</b> PrepPath Academy, its rules, facts and students are fictional. Guidewise supports reviewers; it does not give legal advice. Penalty precedents are cited as reported in the press.</li>
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
