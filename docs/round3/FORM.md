# Round 3 submission: form answers

Paste each block into the matching field. Submitted once, by the team leader (Mahak Fahad).

## Final working link
https://guidewise-kohl.vercel.app

## Repository
https://github.com/mahak867/Guide-wise

## Final product PDF
docs/round3/Guidewise_Round3.pdf (upload the file; it is also in the repository)

## Complete feature list
- Review: paste copy or upload DOCX/PDF, up to 4 images and 4 campaign documents; goal, audience, channel and locked phrases; confidential mode (never sent to AI).
- Code checks: preferred terms, banned phrases, approved contacts, student results with dated consent, results disclaimer (Hindi too), brand-name spelling, capitals, length per channel, sentence length, inclusive wording, hidden characters, and every figure checked against the Facts Register.
- AI checks: one rule per call, run twice when they find something; Claude → Groq → Gemini fallback with time caps, a circuit breaker and an answer cache.
- Verifier: no source, no flag. A finding whose quote, rule or fact does not exist is dropped.
- Images: OCR, palette, WCAG contrast, alt text and logo size and clear space, all in the browser; AI vision for stylised text and for people shown.
- Campaign review (new): every code check and AI check on every document and on the text in each creative; prices, figures, dates and promo codes compared across the caption, images and documents.
- Facts Register: evidence, owner, valid dates and disclosures; flags embargoed, expired and wrong-subject figures.
- Change impact (new): changing a fact or rule re-checks every draft that used it and sends broken approved pieces back for re-approval.
- API and MCP server (new): scoped, hashed, revocable keys; get_brief and check_draft over REST and MCP; a playground and an audit trail.
- Fixes re-tested before they are offered; Accept all; edit a fix before accepting.
- Brand Kit: rules with test sentences and an enforce gate, per-channel rules, versions, export and import, and a guide compiler for PDF and Word guides.
- Workflow: four roles enforced on the server, risk routing, comments, versions, request changes, an audit log and an approval record with a SHA-256 fingerprint.
- Insights: most-dismissed rules and unclear rules, AI-drafted amendments re-tested by code, and the dismissal rate before and after each amendment.
- Privacy: personal data masked before any AI call.
- Hard cases: seven drafts built to beat a checker. Plus a sample post, a sample campaign and a guided tour.

## Architecture and implementation summary
Next.js 16 (TypeScript) on Vercel in Mumbai, with Supabase Postgres (8 migrations; every row scoped to a private workspace per visitor). A review runs a fixed pipeline: redact personal data → code checks → AI checks → AI vision → campaign documents → cross-source consistency → verifier → fix re-test → risk routing → approval record. Only the two AI steps use AI, and numbers are always compared by code, never by AI. One AI adapter covers Claude, Groq and Gemini with fallback, time caps, a circuit breaker, Zod validation and caching. Change impact (src/lib/impact.ts) runs in the same request as a fact or rule save. The REST API, the MCP server (official SDK, Streamable HTTP) and the app share one governance module (src/lib/governance.ts), so all three return the same findings. Details: docs/ARCHITECTURE.md.

## Improvements made after Round 2
The three we promised, all live and tested against the exact tests written at Round 2:
1. Change impact. Change a fact or rule, and every draft that used it is re-checked. Approved pieces that no longer pass go back for re-approval with the reason. An Impact panel lists everything touched, and Insights shows each amended rule's dismissal rate before and after.
2. API and MCP server. Scoped keys, get_brief (only the facts valid today) and check_draft (the same findings as the app), over REST and MCP, with a playground and an audit trail.
3. Campaign review with AI vision. Caption, creatives and documents are reviewed together. Price, date and promo-code mismatches across them are found and cited. People shown in creatives are flagged for consent and routed to compliance.

Also new: the Gemini backup was repaired (it now uses Gemini 3.5 Flash Lite and a circuit breaker), and Groq's smaller model takes over while the main one is rate-limited. We added image and privacy evaluations, and the privacy evaluation found and fixed a landline-masking leak. False flags on promo codes and offer caps were fixed. One new rule (people shown in a creative) was added and the consistency rule was extended to dates, promo codes and documents. The documentation was completed (architecture, testing, known issues, roadmap, API reference, changelog).

## Testing details
- 86 unit tests (CI on every push).
- On the live site: a 20-step browser journey, a 51-step sweep of every page and control at desktop and phone sizes, and a 93-check API probe (bad input, wrong roles, cross-workspace access, the three improvements end to end, including a real MCP client). All pass.
- Text accuracy on 40 held-out drafts: 92% precision and 98% recall with AI; 100% and 74% with code only.
- Images: 20 of 20 planted errors caught, with 0 false alarms.
- Privacy: 0 leaks in 144 AI prompts.
- Fuzzing: 26 hostile inputs, with no crash; slowest review 25 ms.

Details: docs/TESTING.md.

## Roadmap
- Dec 2026: pilot with 3 coaching centres, re-measuring accuracy on their real drafts; accounts, organisations and row-level security.
- Jan 2027: a paid AI tier with per-organisation budgets; scheduled fact expiry with impact emails.
- Feb 2027: Instagram, WhatsApp Business and Google Docs integrations through the API.
- Mar 2027: deeper visual checks (logo variants, layout rules).
- Q2 2027: regulation packs for ed-tech, health and finance; pricing at ₹1,999 a month per centre.

Costed in docs/ROADMAP.md.
