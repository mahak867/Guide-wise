# Guidewise

[![CI](https://github.com/mahak867/Guide-wise/actions/workflows/ci.yml/badge.svg)](https://github.com/mahak867/Guide-wise/actions/workflows/ci.yml)

**Brand rules that run.** Guidewise checks marketing copy and creatives against a team's approved brand rules and dated facts before they are published. Every finding quotes the exact words and the rule it breaks, every suggested fix is re-tested before it is offered, risky content is routed to the right reviewer, and a person approves the final version.

**Live: https://guidewise-kohl.vercel.app** · no sign-in · each visitor gets a private demo workspace · [90-second captioned walkthrough](https://guidewise-kohl.vercel.app/demo.webm) recorded on the live site

Team **Guide Wise** (Mahak Fahad, Roshini R · Chennai Institute of Technology) · CodeNova India 2026, Round 2. All product code was written inside the official build window, which opened on 13 November 2026 at 10:00 IST (see the commit history).

## Measured on our own test set

| | Precision | Recall | Hard phrasings caught |
| --- | --- | --- | --- |
| Code checks only (40 held-out drafts) | 100% (93–100%) | 74% (63–83%) | 0 of 17 |
| Code + AI checks (20 held-out drafts, live) | 96% (81–99%) | 100% (86–100%) | 10 of 10 |

95% Wilson intervals. The set is 60 planted-error drafts (20 development, 40 held out), generated from a fixed seed so anyone gets the same set; its fingerprint is shown on the live **Results** page, which re-runs the code checks on demand. The numbers are optimistic because the same team wrote the rules and the drafts.

**Tests:** 49 unit tests, a 20-step browser test of the whole journey, a 44-step sweep that clicks every page and control at desktop and phone sizes, and a 67-check probe that sends every API route bad input, the wrong role, and requests from another visitor's workspace. The browser test, the sweep and the probe pass against the live site; the unit tests and the evaluation run in CI on every push.

## Try it in two minutes

1. Open the link and click **Review the sample post**. It is an Instagram caption plus a creative from PrepPath Academy, a fictional coaching brand, with about 20 problems in it.
2. Open a finding. It quotes the words, cites its rule and source, and shows a fix that has already been re-tested. Regulation findings cite a penalty order by India's Central Consumer Protection Authority (CCPA) as precedent, as reported in the linked press coverage.
3. Click **Accept all**. The student-result finding has no automatic fix, because that student has no consent on record.
4. **Replace or edit images**, then **Use the corrected sample**. The new creative is read (OCR), its colours are measured and its logo is found, all in the browser.
5. **Submit for review.** Outcome claims route the draft to compliance. Switch **Acting as** to Kavya (compliance), dismiss what remains with a reason, and **Approve**.
6. Open the approval record: a SHA-256 fingerprint of the approved text, the Brand Kit version, every finding and how it was resolved, and the approver.

**Reset demo** starts again. A guided tour on each review ticks itself off as you go.

## What runs

| Area | What it does |
| --- | --- |
| Review pipeline | 1 personal data masked → 2 code checks → 3 AI checks, one rule per call, run twice when they find something → 4 verifier → 5 fixes re-tested → 6 risk routing by a fixed table → 7 approval receipt |
| Code checks | Preferred terms, banned phrases, approved contacts, student results (course and dated consent), results disclaimer (same-language check for Hindi), brand-name spelling, capitals for emphasis, length per content type, sentence length, inclusive wording, and every figure compared with the Facts Register by subject first, value second (lakh and crore understood) |
| Image checks | In the browser, with no AI: OCR (self-hosted tesseract.js) so every text rule runs on the words in the image, dominant colours vs the palette (CIELAB colour difference), WCAG contrast, alt text, and the Brand Kit logo found by masked cross-correlation at many sizes, then checked for minimum size and clear space |
| Verifier | Plain code drops any finding whose quote is not in the draft or image, or whose rule or fact does not exist: "no source, no flag" |
| Facts Register | Evidence, owner, valid-from, valid-until and a required disclosure. A figure used before its start date is flagged as embargoed; after its end date, as outdated; for the wrong subject, as a contradiction |
| Brand Kit | Every rule carries test sentences. It starts as advisory and can only be enforced when its own check passes them. Rules can apply to some content types only. Every change creates a new version. The whole kit exports and imports as one JSON file |
| Guide compiler | Paste brand-guide text; get proposed rules with test sentences, and warnings about vague or contradictory passages. The manager confirms each one |
| Workflow | Four roles enforced on the server; accept, edit a fix before accepting, dismiss with a reason, reopen; locked phrases no fix may remove; comments, versions with word-level changes, request changes, audit log |
| Insights | Rules that fire and get dismissed most, rules two or more people call unclear, and facts that are expired, embargoed or expiring within 60 days |
| Privacy | Emails, phone numbers, Aadhaar, PAN and card numbers are masked before any AI call. A draft marked confidential is never sent to AI |
| Reliability | One AI adapter (Claude → Groq → Gemini, whichever keys exist; Groq serves the live site) with a 20-second cap per call and automatic fallback; answers validated with Zod; an answer cache; every API input validated. Without AI, code checks and the whole workflow still run, and the app says so |


## Changes from the Round 1 plan (summary)

- **AI provider:** planned on Claude; built as one adapter (Claude, Groq, Gemini) so judges get AI checks on free tiers.
- **Sign-in:** planned Supabase Auth; replaced by a private workspace per visitor so judges can open the link directly. Roles are still enforced on the server.
- **Image review:** planned for Round 3; a first version ships now (palette, contrast, alt text, OCR, logo).
- **Writing-style libraries** (alex, write-good): replaced by Brand Kit rules with test sentences.
- **Hands-on tests with students:** not done in Round 2; moved to the start of Round 3.
- **Round 1 penalty figure** ("up to ₹10 lakh / ₹50 lakh"): withdrawn, because we could not confirm it.

Full table with reasons: [`docs/round2/SUBMISSION.md`](docs/round2/SUBMISSION.md).

## Round 3: three improvements, each with a test

1. **Guideline Health loop.** Rules that people dismiss as unclear get a drafted amendment with new test sentences for the manager to approve; changing a fact lists every piece that used it.
2. **Governance at the source.** A REST API and an MCP server (`get_brief`, `check_draft`) so AI writing tools fetch today's rules and facts and check drafts before handing them over.
3. **Campaign and creative review with AI vision.** A whole campaign checked together for mismatched prices, dates and claims; AI vision for what OCR cannot see, such as an unconsented student photo or a recoloured logo.

## Team

- **Mahak Fahad** (team leader): backend and AI/ML — review pipeline, Facts Register, visual checks, evaluation, API, database, deployment.
- **Roshini R:** frontend and design.

## Stack

Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS 4, Supabase Postgres, Vercel (functions in Mumbai, next to the database). Open source used: supabase-js, groq-sdk, @google/genai, Anthropic SDK, Zod, mammoth (DOCX), unpdf (PDF), tesseract.js (OCR), Vitest, Playwright.

## Tests

```bash
npm test                                                     # 49 unit tests, including a deliberately wrong AI
npm run eval                                                 # accuracy on the held-out set (code checks)
BASE_URL=https://guidewise-kohl.vercel.app npm run e2e       # 20-step journey
BASE_URL=https://guidewise-kohl.vercel.app npm run e2e:sweep # every page and control, desktop and phone
BASE_URL=https://guidewise-kohl.vercel.app npm run e2e:api   # bad input, wrong roles and cross-workspace access on every API route
```

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Apply the migrations in `supabase/migrations/` (001 to 005, in order) to a Supabase project first. The app seeds the PrepPath demo on first load.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY` | Supabase project URL and publishable key |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | Optional; set any. Keys present are tried in turn, falling through on errors, timeouts or rate limits. With none, Guidewise runs in rules-only mode |
| `GROQ_MODEL`, `GEMINI_MODEL`, `GUIDEWISE_MODEL` | Optional model overrides |

## Limits, stated plainly

- The logo check matches the logo file itself. A redrawn, recoloured or heavily stretched logo is reported as missing, and a reviewer can dismiss that with a reason. Photos are not judged yet (for example, whether a pictured student has consented); that is Round 3.
- Brand-name spelling catches case and spacing at capital letters ("Preppath", "Prep Path"), not every misspelling.
- There is no sign-in, so judges can open the link directly. Browsers never receive database credentials (none of the JavaScript sent to visitors contains them); every read and write goes through our API, which enforces the role rules and scopes each query to the visitor's random workspace ID, and the API probe checks that one workspace cannot read another's drafts. A production deployment adds sign-in and per-organisation row-level security in the database.
- The AI runs on free tiers, so heavy simultaneous use can hit rate limits. When that happens the review continues with code checks and says so.
- Guidewise supports reviewers. It does not give legal advice. Penalty precedents are cited as reported in the linked press coverage.

## Disclosures

- Claude (Anthropic) was used to help write the code during the build window.
- PrepPath Academy, its rules, facts and students are fictional and were written by the team.
