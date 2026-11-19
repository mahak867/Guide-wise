# Guidewise

[![CI](https://github.com/mahak867/Guide-wise/actions/workflows/ci.yml/badge.svg)](https://github.com/mahak867/Guide-wise/actions/workflows/ci.yml)

**Brand rules that run.** Guidewise checks marketing copy and creatives against a team's approved brand rules and dated facts before they are published. Every finding quotes the exact words and the rule it breaks, every suggested fix is re-tested before it is offered, risky content is routed to the right reviewer, and a person approves the final version.

**Live: https://guidewise-kohl.vercel.app** · no sign-in · each visitor gets a private demo workspace · [100-second captioned walkthrough](https://guidewise-kohl.vercel.app/demo.webm) recorded on the live site

Team **Guide Wise** (Mahak Fahad, Roshini R · Chennai Institute of Technology) · CodeNova India 2026 finalist. Round 2 code was written in its window (13–16 November 2026); the Round 3 work in its window (from 18 November 2026, 11:59 PM IST). The commit history shows both.

## Measured on our own test set

| 40 held-out drafts | Precision | Recall | Critical errors caught | Hard phrasings caught | Same result on a second run |
| --- | --- | --- | --- | --- | --- |
| Code checks only | 100% (93–100%) | 74% (63–83%) | 68% | 0 of 17 | n/a (no randomness) |
| Code + AI checks (live, Groq) | 92% (83–96%) | 98% (92–100%) | 100% | 17 of 17 | 83% |

95% Wilson intervals. Images: 20 generated creatives with planted colour, contrast and logo errors, all 20 caught with no false alarms (`npm run eval:images`). Privacy: personal data planted in 24 drafts and canaries in 3 confidential ones, 0 leaks in 144 AI prompts (`npm run eval:privacy`). The AI row ran twice on the live site with the answer cache off; the first run is reported. Four of its six false flags are the AI calling "cheapest" or "Best" an unsupported superlative where our answer key planted only the "cheap" term rule; we count them as false rather than change the key afterwards. The set is 60 planted-error drafts (20 development, 40 held out), generated from a fixed seed so anyone gets the same set; its fingerprint is shown on the live **Results** page, which re-runs the code checks on demand. The numbers are optimistic because the same team wrote the rules and the drafts.

**Tests:** 77 unit tests, a 20-step browser test of the whole journey, a 51-step sweep that clicks every page and control at desktop and phone sizes, and a 93-check probe that sends every API route bad input, the wrong role, and requests from another visitor's workspace. The browser test, the sweep and the probe pass against the live site; the unit tests and the evaluation run in CI on every push.

## Try it in two minutes

1. Open the link and click **Review the sample post**. It is an Instagram caption plus a creative from PrepPath Academy, a fictional coaching brand, with about 20 problems in it.
2. Open a finding. It quotes the words, cites its rule and source, and shows a fix that has already been re-tested. Regulation findings cite a penalty order by India's Central Consumer Protection Authority (CCPA) as precedent, as reported in the linked press coverage.
3. Click **Accept all**. The student-result finding has no automatic fix, because that student has no consent on record.
4. **Replace or edit images**, then **Use the corrected sample**. The new creative is read (OCR), its colours are measured and its logo is found, all in the browser.
5. **Submit for review.** Outcome claims route the draft to compliance. Switch **Acting as** to Kavya (compliance), dismiss what remains with a reason, and **Approve**.
6. Open the approval record: a SHA-256 fingerprint of the approved text, the Brand Kit version, every finding and how it was resolved, and the approver.

Then try to break it: **New review → Try a hard case** offers seven drafts built to get past a checker (hidden characters, prompt injection, the right number for the wrong subject, and more), each with a note on what to look for.

**Reset demo** starts again. A guided tour on each review ticks itself off as you go.

## What runs

| Area | What it does |
| --- | --- |
| Review pipeline | 1 personal data masked → 2 code checks → 3 AI checks, one rule per call, run twice when they find something → 4 AI vision on creatives → 5 code checks on campaign documents → 6 prices, dates and codes compared across everything → 7 verifier → 8 fixes re-tested → 9 risk routing by a fixed table → approval receipt |
| Code checks | Preferred terms, banned phrases, approved contacts, student results (course and dated consent), results disclaimer (same-language check for Hindi), brand-name spelling, capitals for emphasis, length per content type, sentence length, inclusive wording, invisible characters that could hide a banned phrase, and every figure compared with the Facts Register by subject first, value second (lakh and crore understood) |
| Image checks | In the browser, with no AI: OCR (self-hosted tesseract.js) so every code check runs on the words in the image, dominant colours vs the palette (CIELAB colour difference), WCAG contrast, alt text, and the Brand Kit logo found by masked cross-correlation at many sizes, then checked for minimum size and clear space. Figures are compared across the caption and every creative, and a mismatch is flagged |
| Verifier | Plain code drops any finding whose quote is not in the draft or image, or whose rule or fact does not exist: "no source, no flag" |
| Facts Register | Evidence, owner, valid-from, valid-until and a required disclosure. A figure used before its start date is flagged as embargoed; after its end date, as outdated; for the wrong subject, as a contradiction |
| Brand Kit | Every rule carries test sentences. It starts as advisory and can only be enforced when its own check passes them. Rules can apply to some content types only. Every change creates a new version. The whole kit exports and imports as one JSON file |
| Guide compiler | Paste brand-guide text or upload a PDF or Word file; get proposed rules with test sentences, and warnings about vague or contradictory passages. The manager confirms each one |
| Workflow | Four roles enforced on the server; accept, edit a fix before accepting, dismiss with a reason, reopen; locked phrases no fix may remove; comments, versions with word-level changes, request changes, audit log |
| Insights and Guideline Health | Rules that fire and get dismissed most, rules two or more people call unclear, and facts that are expired, embargoed or expiring within 60 days. For a rule with dismissals, Guidewise drafts clearer wording and new tests; code re-runs every test and the manager approves |
| Privacy | Emails, phone numbers, Aadhaar, PAN and card numbers are masked before any AI call. A draft marked confidential is never sent to AI |
| Reliability | One AI adapter (Claude → Groq → Gemini, whichever keys exist; Groq serves the live site) with a 12-second cap per call (25 for images), automatic fallback, and a provider that is rate-limited or slow rested for a minute; answers validated with Zod; an answer cache; every API input validated. Without AI, code checks and the whole workflow still run, and the app says so |


## Changes from the Round 1 plan (summary)

- **AI provider:** planned on Claude; built as one adapter (Claude, Groq, Gemini) so judges get AI checks on free tiers.
- **Sign-in:** planned Supabase Auth; replaced by a private workspace per visitor so judges can open the link directly. Roles are still enforced on the server.
- **Image review:** planned for Round 3; a first version ships now (palette, contrast, alt text, OCR, logo).
- **Writing-style libraries** (alex, write-good): replaced by Brand Kit rules with test sentences.
- **Hands-on tests with students:** not done in Round 2; moved to the start of Round 3.
- **Round 1 penalty figure** ("up to ₹10 lakh / ₹50 lakh"): withdrawn, because we could not confirm it.

Full table with reasons: [`docs/round2/SUBMISSION.md`](docs/round2/SUBMISSION.md).

## Round 3: the three improvements, delivered

1. **Change impact.** Change, expire or delete a fact, or change a rule, and Guidewise re-checks every draft that used it. An approved piece that no longer passes goes back for re-approval with the reason; the Impact panel lists everything touched; Insights shows each amended rule's dismissal rate before and after. *Try it:* the demo starts with an approved WhatsApp post that cites fact F-3. On **Facts and assets**, act as Meera, click **Edit** on F-3, change the figure and save: the post goes back for re-approval.
2. **API and MCP server.** Scoped keys (shown once, stored hashed, revocable), `get_brief` (rules in force and only facts valid today) and `check_draft` (the same cited findings as the app) over REST and MCP, a playground and an audit trail. *Try it:* **API** page → Create key → Call check_draft. Reference: [`docs/API.md`](docs/API.md).
3. **Campaign review with AI vision.** A caption, up to 4 creatives and up to 4 documents (landing page, brochure, email) reviewed together: every code check on every document, and prices, figures, dates and promo codes compared across all of them. AI vision reads stylised text and flags people shown for a consent check, routed to compliance. *Try it:* **New review → Use the sample campaign → Run review**.

Each one is tested live against exactly what we promised at Round 2 ([`docs/TESTING.md`](docs/TESTING.md)).

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Testing](docs/TESTING.md) · [Known issues](docs/KNOWN_ISSUES.md) · [Roadmap](docs/ROADMAP.md) · [API and MCP](docs/API.md) · [Changelog](docs/CHANGELOG.md) · [Contributions](docs/CONTRIBUTIONS.md)

## Team

- **Mahak Fahad** (team leader): backend and AI/ML — review pipeline, Facts Register, visual checks, evaluation, API, database, deployment.
- **Roshini R:** frontend and design.

## Stack

Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS 4, Supabase Postgres, Vercel (functions in Mumbai, next to the database). Open source used: supabase-js, groq-sdk, @google/genai, Anthropic SDK, Zod, mammoth (DOCX), unpdf (PDF), tesseract.js (OCR), Vitest, Playwright.

## Tests

```bash
npm test                                                     # 77 unit tests, including a deliberately wrong AI
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

Apply the migrations in `supabase/migrations/` (001 to 008, in order) to a Supabase project first. The app seeds the PrepPath demo on first load.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY` | Supabase project URL and publishable key |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | Optional; set any. Keys present are tried in turn, falling through on errors, timeouts or rate limits. With none, Guidewise runs in rules-only mode |
| `GROQ_MODEL`, `GEMINI_MODEL`, `GUIDEWISE_MODEL`, `GROQ_VISION_MODEL` | Optional model overrides (Gemini defaults to `gemini-3.5-flash-lite`) |
| `EVAL_TOKEN` | Optional; protects the endpoint that measures AI accuracy |

## Limits, stated plainly

- The logo check matches the logo file itself. A redrawn, recoloured or heavily stretched logo is reported as missing, and a reviewer can dismiss that with a reason. AI vision flags people shown for a consent check but does not recognise who they are; a reviewer confirms consent against the student records.
- The AI checks run on the caption; campaign documents and text read from images get the code checks.
- Brand-name spelling catches case and spacing at capital letters ("Preppath", "Prep Path"), not every misspelling.
- There is no sign-in, so judges can open the link directly. Browsers never receive database credentials (none of the JavaScript sent to visitors contains them); every read and write goes through our API, which enforces the role rules and scopes each query to the visitor's random workspace ID, and the API probe checks that one workspace cannot read another's drafts. A production deployment adds sign-in and per-organisation row-level security in the database.
- The AI runs on free tiers, so heavy simultaneous use can hit rate limits. When that happens the review continues with code checks and says so.
- Guidewise supports reviewers. It does not give legal advice. Penalty precedents are cited as reported in the linked press coverage.

## Disclosures

- Claude (Anthropic) was used to help write the code during the build window.
- PrepPath Academy, its rules, facts and students are fictional and were written by the team.
