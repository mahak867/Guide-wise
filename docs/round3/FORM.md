# Round 3 submission: form answers

Paste each block into the matching field. Submitted once, by the team leader (Mahak Fahad). Before submitting, fill in the user-test line under "Testing details" and rebuild the PDF (`node docs/round3/build-pdf.mjs`) if `docs/round3/user-tests.json` was added.

## Final working link
https://guidewise-kohl.vercel.app

## Repository
https://github.com/mahak867/Guide-wise

## Final product PDF
docs/round3/Guidewise_Round3.pdf (upload the file; it is also in the repository)

## Complete feature list
Core loop: draft → code checks and AI checks → cited findings with re-tested fixes → routed to the right reviewer → human approval with a fingerprinted record.

- Review: paste copy or upload DOCX/PDF, up to 4 images and 4 campaign documents; goal, audience, channel, locked phrases; confidential mode (never sent to AI); channel previews (Instagram, LinkedIn, Facebook ad, WhatsApp, email, web page) that mark the cut and warn when a disclaimer or call to action falls after it.
- Code checks: 31 Brand Kit rules (one checks text size in images), each with its own test sentences (preferred terms, banned phrases, approved contacts, student results with dated consent, disclaimers incl. Hindi, brand-name spelling, hidden characters, paid-partnership labels, offer end dates, competitor names, vague link text, hashtags, emoji), and every figure checked against the Facts Register.
- AI checks: one rule per call, run twice when they find something; Claude → Groq → Groq's smaller model → Gemini, with time caps, a circuit breaker and a cache. Without AI, code checks and the whole workflow still run.
- Verifier: no source, no flag. Numbers are compared by code, never by AI.
- Images: OCR, palette, WCAG contrast, alt text, logo size and clear space, in the browser; AI vision for stylised text and people shown.
- Campaign review (Round 3): caption, creatives and documents (pasted, uploaded, or read from a live web page, with hidden text flagged) reviewed together; prices, figures, dates and promo codes compared across all of them.
- Facts Register: evidence, owner, valid dates, disclosures, successors; embargoed, expired and wrong-subject figures flagged.
- Change impact (Round 3): changing a fact or rule re-checks every draft that used it and sends broken approved pieces back for re-approval.
- API and MCP server (Round 3): scoped, hashed, revocable keys; get_brief and check_draft over REST and MCP; playground and audit trail.
- Workflow: four roles enforced on the server; risk routing; dual sign-off (compliance, then brand) for high risk; time-limited exceptions only a reviewer can grant; approval bound to the Brand Kit version and blocked by a database trigger while a violation is open; undo a fix for 10 seconds; keyboard review; each finding shows how the team settled the same rule before; comments, versions, audit log; approval record with a SHA-256 fingerprint.
- Read-only share links: an approved record sent outside the workspace, valid 30 days, revocable.
- Bulk check: a content calendar or CSV of up to 50 posts, a verdict per post in seconds, results CSV.
- Chrome extension: check selected text in LinkedIn, Gmail, X or any page through the API.
- Brand Kit: rule tests and an enforce gate, per-channel rules, versions, JSON export and import, a guide compiler for PDF and Word guides.
- Insights: most-dismissed and unclear rules, AI-drafted amendments re-tested by code, dismissal rate before and after.
- Privacy and security: personal data masked before any AI call; CSP and security headers; a threat model of 15 threats, each mapped to a test.
- Easy to try: sample post, sample campaign, sample calendar, seven hard cases, guided tour, private workspace per visitor, works on a phone.

## Architecture and implementation summary
One Next.js 16 (TypeScript) app on Vercel in Mumbai, with Supabase Postgres (9 migrations; every row scoped to a workspace; migration 009 adds a trigger that refuses approval while a violation is open). A review runs a fixed pipeline: redact personal data → code checks → AI checks → AI vision → campaign documents → cross-source consistency → verifier → fix re-test → risk routing → human approval and record. Only the AI steps use AI; numbers are always compared by code. One adapter covers Claude, Groq and Gemini with fallback, time caps, a circuit breaker, Zod validation and caching. Change impact (src/lib/impact.ts) runs in the same request as a fact or rule save. One governance module (src/lib/governance.ts) serves the app, the REST API, the MCP server (official SDK), bulk check and the Chrome extension, so all return the same findings. State changes on a draft are conditional updates, so racing actions get a 409 instead of duplicate approvals. Share links store only a SHA-256 hash. Security headers include a strict Content-Security-Policy. Details: docs/ARCHITECTURE.md; from demo to a real team: docs/PRODUCTION.md.

## Improvements made after Round 2
The three we promised, all live and tested against the exact tests written at Round 2:
1. Change impact: change a fact or rule, and every draft that used it is re-checked; approved pieces that no longer pass go back for re-approval with the reason; Insights shows each amended rule's dismissal rate before and after.
2. API and MCP server: scoped keys, get_brief (only facts valid today) and check_draft (the same findings as the app) over REST and MCP, with a playground and an audit trail.
3. Campaign review with AI vision: caption, creatives and documents reviewed together; price, date and promo-code mismatches found and cited; people shown in creatives flagged for consent and routed to compliance.

Beyond the promises: bulk check, a Chrome extension, read-only share links, channel previews, undo and keyboard review with precedents, time-limited exceptions and dual sign-off, approval bound to the Brand Kit version and a database approval gate, a web page reader with hidden-text detection, 31 Brand Kit rules, security headers and a threat model.

Reliability: a bug hunt on the live site found and fixed lost Brand Kit versions under concurrent saves, duplicate approvals from racing requests, a bypassable key limit, server errors on odd request bodies and a rule pattern that could stall reviews; each now has a test. The AI helpers (guide compiler, rule amendment) were measured live, and the gaps found were fixed. Accessibility checks (axe-core) now run on every page; a load test passed; the demo's embargoed fact was moved so the sample still works throughout judging.

## Testing details
- 238 unit tests (CI on every push), including a deliberately wrong AI, fuzzing (26 hostile inputs) and the sample at three future dates.
- On the live site (20 Nov 2026): browser journey 21/21; sweep 59/59 of every page and control at desktop and phone size; API probe 206/206 (bad input, wrong roles, other workspaces, the three improvements end to end with a real MCP client, race checks); Chrome extension end to end passes. The probe also runs every morning from GitHub Actions.
- Accessibility: axe-core in the sweep, 0 serious or critical issues across 27 page checks.
- Load test: 20 and then 50 concurrent visitors, 980 requests, 0 failed (docs/LOAD_TEST.md).
- Text accuracy on 40 held-out drafts: 92% precision and 98% recall with AI; 100% and 74% with code only. Images: 20 of 20 planted errors caught, 0 false alarms. Privacy: 0 leaks in 144 AI prompts.
- AI helpers, measured before the fixes: the guide compiler proposed 16 of 17 expected rules and warned about 7 of 8 planted problems with 0 false warnings; the amendment helper passed the code gate 7 of 8 times but left the dismissed text flagged, which is now fixed and awaits re-measurement (docs/EVAL_HELPERS.md).
- Hands-on user test: (fill in after tonight's sessions) [N] students, [X] of [4N] tasks done without help, median [M] minutes; what we changed: [...].
- Threat model: 15 threats, each mapped to the test that proves it (docs/THREAT_MODEL.md). All numbers come from our own test set and are optimistic.

Details: docs/TESTING.md.

## Roadmap
- Dec 2026: pilot with 3 coaching centres, re-measuring accuracy on their real drafts; accounts, organisations and row-level security.
- Jan 2027: a paid AI tier with per-organisation budgets; scheduled fact expiry with impact emails.
- Feb 2027: Instagram, WhatsApp Business and Google Docs integrations through the API.
- Mar 2027: deeper visual checks (logo variants, layout rules).
- Q2 2027: regulation packs for ed-tech, health and finance; pricing at ₹1,999 a month per centre.

Costed in docs/ROADMAP.md; what changes from demo to a real team in docs/PRODUCTION.md.
