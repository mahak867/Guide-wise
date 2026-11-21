# Round 3 form: answers field by field

Submitted once, by the team leader. Paste each block into the matching field. Fields marked YOU are yours. Before submitting: rebuild the PDF (`node docs/round3/build-pdf.mjs`), upload it to Drive, set "Anyone with the link" as Viewer, and open every link in a private window.

## Your team

**Team Name:** Guide Wise (YOU: copy exactly as written in Rounds 1 and 2 and on the payment)

**Team Leader full name:** Mahak Fahad

**Team Leader email:** YOU: the same email used in Rounds 1 and 2

**Team members, one per line:**
Mahak Fahad
Roshini R

## Your final product

**Final working project link:** https://guidewise-kohl.vercel.app

**Source-code repository (public):** https://github.com/mahak867/Guide-wise

**Google Drive link to the final PDF:** YOU: upload docs/round3/Guidewise_Round3.pdf, share as "Anyone with the link: Viewer", paste the link

## The complete list of features

Proof you can check in a minute: the Results page re-runs our accuracy evaluation live on two brands, and an API probe runs against the live site every morning on GitHub Actions (the full 290-check probe, with accounts and direct database access, runs before each release)
Review a draft: paste copy or upload DOCX/PDF, with goal, audience, channel and locked phrases
Campaign review: caption, up to 4 creatives and 4 documents (pasted, uploaded or read from a live web page) reviewed together
Hidden-text detection on web pages read for a campaign
Cross-source consistency: prices, figures, dates and promo codes compared across caption, creatives and documents
31 Brand Kit rules checked by code, each with its own pass and fail test sentences
Facts Register: every figure checked against an approved fact with evidence, owner and valid dates; embargoed, expired and wrong-subject figures flagged
AI checks, one rule per call, run twice when they find something, with fallback across providers
Verifier: a finding whose quote, rule or fact does not exist is dropped (no source, no flag)
Every suggested fix re-tested by code before it is offered
Image checks in the browser: OCR, palette, WCAG contrast per text line, text size, alt text, logo size, clear space, recoloured or stretched logo
Image inspector: each image finding outlined on the image
AI vision for stylised text and for people shown, who are flagged for a consent check
Channel previews (Instagram, LinkedIn, Facebook ad, WhatsApp, email, web page) marking where text is cut
Risk routing to the brand or compliance reviewer
Four roles enforced on the server; dual sign-off for high-risk content
Time-limited exceptions that only a reviewer can grant
Approval bound to the Brand Kit version and blocked by a database trigger while a violation is open
Approval record with a SHA-256 fingerprint; read-only share link valid 30 days, revocable
Accept, edit, dismiss, reopen findings; undo a fix for 10 seconds; keyboard review
Each finding shows how the team settled the same rule before
Each finding of a rule compiled from a brand guide quotes the guide passage it came from, with its source
Make this a rule: select words in a draft and get a tested rule proposal
Change impact: changing a fact or rule re-checks every draft that used it and sends broken approved pieces back for re-approval
REST API and MCP server with scoped, hashed, revocable keys; get_brief and check_draft; playground and audit trail
Bulk check: a content calendar or CSV of up to 50 posts, verdict per post, results CSV
Chrome extension: check selected text on LinkedIn, Gmail, X or any page
Brand Kit: rule tests and enforce gate, per-channel rules, versions, JSON export and import
Guide compiler: a PDF or Word brand guide turned into proposed rules with test sentences
Insights: most-dismissed and unclear rules, AI-drafted amendments re-tested by code, dismissal rate before and after
Privacy: personal data masked before any AI call; confidential drafts never sent to AI
Comments, versions with word-level changes, audit log
Optional sign-in and organisations: members with roles, invite links with a role, approvals signed by the named signed-in person; the demo still opens in one click with no sign-in
Dark mode that follows the system setting
Accuracy measured live on two brands (Results page, with a brand selector)
Sample post, sample campaign, sample calendar, seven hard cases, guided tour; a private workspace per visitor; works on a phone

## Technical architecture and implementation summary

One Next.js 16 (TypeScript) app on Vercel in Mumbai, next to a Supabase Postgres database (11 migrations; every row scoped to a workspace). The browser talks to the app's API routes; only the app, with a server-only key, can reach the tables (the public key is refused), and it talks to Postgres and to the AI providers. One governance module serves the web app, the REST API, the MCP server (official SDK), bulk check and the Chrome extension, so all of them return the same findings.

Data flow of a review: redact personal data, then code checks, AI checks, AI vision, campaign documents, cross-source consistency, the verifier, fix re-test, risk routing, and human approval with a fingerprinted record. Image analysis (OCR with tesseract.js, palette, contrast, logo matching) runs in the browser. Only the AI steps use AI.

Models: one adapter covers Claude, Groq (gpt-oss-120b, with its smaller model as backup) and Gemini, with time caps, a circuit breaker, Zod validation of every answer and a cache. Without AI, code checks and the whole workflow still run.

Hardest problem: making AI findings trustworthy enough to block a publication. AI may propose a finding, but code decides: the verifier drops any finding whose quote is not in the source or whose rule or fact does not exist, numbers are only ever compared by code, and every fix is re-checked before it is offered. On 40 held-out drafts this gives 92% precision and 98% recall with AI. The second hard problem was concurrency: approvals, sign-offs and saves are conditional database updates, and a trigger refuses approval while a violation is open, so racing clicks cannot approve twice or approve a broken draft.

Details: docs/ARCHITECTURE.md; what changes for a real team: docs/PRODUCTION.md.

## Testing details

Unit and integration: 341 tests on every push (CI), including a deliberately wrong AI, fuzzing with 26 hostile inputs, and the sample checked at three future dates.

Live end-to-end, on the deployed site: a 21-step browser journey; a sweep of every page and control at desktop and phone size with axe-core (0 accessibility issues); an API probe of 290 checks (bad input, wrong roles, other workspaces, races, accounts: spoofed roles, forged invites refused; every table refuses the public key, the three improvements end to end with a real MCP client); the Chrome extension end to end. The probe also runs every morning from GitHub Actions (without the accounts and public-key sections, which need the Supabase settings).

Accuracy: 40 held-out drafts, 92% precision and 98% recall with AI, 100% and 74% with code only. A second, contrasting brand (a fictional health insurer, 40 more drafts labelled before the checker ran): 97% precision and 79% recall with code only (91% on the first run; an age and the approved helpline were read as figures, fixed after that run with labels unchanged); 99% and 76% across all 80 drafts. Images: 26 of 26 planted errors caught, 0 false alarms in 66 clean checks. Privacy: 0 leaks in 144 AI prompts. Load: 50 concurrent visitors, 980 requests, 0 failed.

User testing: two students outside the team. One used every feature without help in about 12 minutes, asked no questions and liked the built-in demo. The other spent about 20 minutes on every tab with his own draft instead of the demo, and took a while to understand what happens after a review runs; New review now says that under Run review.

What we found and fixed: a bug hunt on the live site found lost Brand Kit versions under concurrent saves, duplicate approvals from racing requests, a bypassable key limit, server errors on odd request bodies and a rule pattern that could stall reviews; all fixed, each with a test. The AI helpers were measured live and their gaps fixed.

Still imperfect: our in-browser text reader can misread ₹ in images (a "$" before a number is now put back as ₹ when the brand's facts are in rupees; other misreadings are not corrected, AI vision reads it correctly); only two outside user tests; accuracy numbers come from our own test sets (both brands written by us); the second-brand false flags were fixed after its first held-out run, so that set is no longer untouched for the fix; sign-in is optional; the tables are closed to the public key, but isolation between organisations is enforced by the server, not by per-organisation row-level security policies; fonts in images are not identified; the AI helpers have not been re-measured after their fixes. Full list: docs/KNOWN_ISSUES.md; tests: docs/TESTING.md.

## Improvement 1

Committed: change impact. Changing or expiring a fact, or amending a rule, lists every open draft and approved piece that used it, re-checks them, marks approved pieces that no longer pass as needing re-approval, and shows each amended rule's dismissal rate before and after. Test: change fact F-3 and see every draft that cited it listed, approved ones marked for re-approval.

Delivered: all of it, live. Saving a fact or rule re-checks every affected draft in the same request; approved pieces that now fail go back for re-approval with the reason; Insights shows the dismissal rate before and after each amendment. The Round 2 test passes in the live browser journey and the API probe.

## Improvement 2

Committed: a REST API and an MCP server with scoped keys, exposing get_brief (rules in force, facts valid today) and check_draft (the same findings as the app), with an in-app playground and an audit entry per call. Test: call check_draft from the playground and an MCP client and get the same findings as the app, with an audit entry.

Delivered: all of it, live. Keys are scoped, stored only as hashes, and revocable; get_brief never returns an expired or embargoed fact; check_draft returns the app's findings over REST and MCP. The live probe runs the Round 2 test with a real MCP client. Beyond the commitment, the same API now powers bulk check and the Chrome extension.

## Improvement 3

Committed: campaign review with AI vision. Caption, creatives, landing-page copy and PDF brochure reviewed together; figures, dates and claims that disagree across documents flagged; AI vision reads stylised text and flags photos of people for a consent check. Test: a three-asset campaign with a price mismatch between creative and brochure and a student photo without consent; both found, cited and routed to compliance.

Delivered: live, and the Round 2 test passes. Documents can be pasted, uploaded or read from a live web page (with hidden text flagged); prices, figures, dates and promo codes are compared by code across every source and cited. AI vision reads stylised text and flags people shown, which routes the draft to compliance. One honest limit: a person in a photo is flagged for a consent check, but we do not identify who it is or match the face to a student record; the compliance reviewer confirms consent.

## Anything else you improved after Round 2

Bulk check of a content calendar; a Chrome extension; read-only share links; channel previews; make this a rule from selected words; an image inspector with recoloured-logo, stretched-logo and text-size checks; undo and keyboard review with precedents; time-limited exceptions and dual sign-off; approval bound to the Brand Kit version and a database approval gate; a web page reader with hidden-text detection; 31 Brand Kit rules (from 24); simpler main screens; security headers, a strict Content-Security-Policy and a threat model of 17 threats each mapped to a test; optional sign-in and organisations; dark mode; a second-brand evaluation; a bug hunt with fixes; accessibility checks on every page; a load test; a daily live probe; the first hands-on user test.

## Product roadmap and future development plan

For: marketing teams at Indian coaching centres first (outcome claims and results ads are where regulatory risk is highest), then ed-tech, health and finance marketing teams.

1. Dec 2026: pilot with 3 coaching centres. Per-organisation row-level security policies on every table (the tables are already closed to the public key, and every table carries a workspace id); password reset and email invitations. Re-measure accuracy on 50 real, anonymised drafts per centre and publish it beside our own numbers.
2. Jan 2027: a paid AI tier with a monthly budget per organisation; scheduled fact expiry with impact emails to the fact's owner.
3. Feb 2027: Instagram, WhatsApp Business and Google Docs integrations through the existing API, so drafts are checked where they are written.
4. Mar 2027: deeper visual checks: logo variants, layout rules and fonts.
5. Q2 2027: regulation packs for ed-tech, health and finance; pricing at ₹1,999 a month per centre.

What it takes: two developers part-time, about ₹1,500 a month of AI per centre at 1,500 drafts, and Supabase Pro. Costed in docs/ROADMAP.md; demo to real team in docs/PRODUCTION.md.

## Final confirmation (YOU)

Tick all six boxes only after: every link opened in a private window, the PDF link opens signed out, and nothing is pushed after submitting.
