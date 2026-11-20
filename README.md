# Guidewise

[![CI](https://github.com/mahak867/Guide-wise/actions/workflows/ci.yml/badge.svg)](https://github.com/mahak867/Guide-wise/actions/workflows/ci.yml)

**Brand rules that run.** Guidewise checks marketing copy and creatives against a team's approved brand rules and dated facts before they are published. Every finding quotes the exact words and the rule it breaks. Every suggested fix is re-tested before it is offered. Risky content goes to the right reviewer, and a person approves the final version.

**Live: https://guidewise-kohl.vercel.app** · no sign-in · each visitor gets a private demo workspace · [100-second walkthrough](https://guidewise-kohl.vercel.app/demo.webm) (Round 2 journey)

Team **Guide Wise** (Mahak Fahad, Roshini R · Chennai Institute of Technology) · CodeNova India 2026 finalist · Final product PDF: [`docs/round3/Guidewise_Round3.pdf`](docs/round3/Guidewise_Round3.pdf)

> **Going from demo to a real marketing team?** Read [**docs/PRODUCTION.md**](docs/PRODUCTION.md): what stays the same, what changes (sign-in, organisations, row-level security, a paid AI key), what it costs, and where it fits a team's day.

## In 60 seconds

**What it is.** A brand-governance reviewer for regulated marketing (the demo is PrepPath Academy, a fictional JEE/NEET coaching brand). The core loop: **draft → code checks and AI checks → cited findings with re-tested fixes → routed to the right reviewer → human approval with a fingerprinted record.** Numbers are always compared by code, never by AI, and a finding with no source in the draft is dropped.

**How to try it** (each path takes under a minute from the home page):

| Try | Path |
| --- | --- |
| The core loop | **Review the sample post** → open a finding (quote, rule, source, tested fix) → **Accept all** → **Submit for review** → act as Kavya (compliance), then Arjun (brand) → **Approve** → open the approval record |
| Round 3, improvement 1: change impact | **Facts and assets** → act as Meera → **Edit** on F-3 → change the figure → Save. The approved WhatsApp post that cites it goes back for re-approval |
| Round 3, improvement 2: API and MCP | **API** page → Create key → **Call check_draft** in the playground. Same findings as the app, logged in the audit trail |
| Round 3, improvement 3: campaign with AI vision | **New review → Use the sample campaign → Run review**. Price, date and promo-code mismatches across caption, creative, brochure and landing page; a person in a creative flagged for consent |
| Try to break it | **New review → Try a hard case**: seven drafts built to get past a checker |

**What is measured.** Accuracy on 40 held-out drafts, image and privacy evaluations, the AI helpers, a load test, and live test suites on every release (below). **What is not:** accuracy on real marketers' drafts (our test set is our own), use by real users (hands-on tests not yet run when this was written), and the AI helpers after their fixes.

## Measured on our own test set

| 40 held-out drafts | Precision | Recall | Critical errors caught | Hard phrasings caught | Same result on a second run |
| --- | --- | --- | --- | --- | --- |
| Code checks only | 100% (93–100%) | 74% (63–83%) | 68% | 0 of 17 | n/a (no randomness) |
| Code + AI checks (live, Groq) | 92% (83–96%) | 98% (92–100%) | 100% | 17 of 17 | 83% |

95% Wilson intervals. The set is 60 planted-error drafts (20 development, 40 held out), generated from a fixed seed; its fingerprint is shown on the live **Results** page, which re-runs the code checks on demand. The AI row ran twice on the live site with the answer cache off; the first run is reported. Four of its six false flags are the AI calling "cheapest" or "Best" an unsupported superlative where our answer key planted only the "cheap" term rule; we count them as false rather than change the key afterwards. **The numbers are optimistic because the same team wrote the rules and the drafts.**

| Other evaluation | Result |
| --- | --- |
| Images: 28 generated creatives with planted colour, contrast, logo (incl. recoloured, stretched) and text-size errors | 26 of 26 caught, 0 false alarms in 66 clean checks |
| Privacy: personal data in 24 drafts, canaries in 3 confidential ones | 0 leaks in 144 AI prompts |
| AI helpers, live, **measured before the fixes** ([EVAL_HELPERS.md](docs/EVAL_HELPERS.md)) | Guide compiler: 16 of 17 expected rules, 7 of 8 planted problems warned, 0 false warnings. Rule amendment: 7 of 8 pass the code gate, but the dismissed text was still flagged after all 7 (fixed since; not yet re-measured) |
| Load test, live ([LOAD_TEST.md](docs/LOAD_TEST.md)) | 20 then 50 concurrent visitors through the creator journey, AI off: 980 requests, 0 failed |

**Tests** (latest full run on the live site, 20 Nov 2026): **238 unit tests**; a **21-step** browser journey; a **59-step** sweep of every page and control at desktop and phone size, with axe-core accessibility checks (**0 serious or critical issues across 27 page checks**); a **206-check** API probe (bad input, wrong roles, another visitor's workspace, the three improvements end to end with a real MCP client, and race checks); the Chrome extension end to end. Unit tests and the evaluation run in CI on every push; the probe also runs against the live site every morning. Details: [docs/TESTING.md](docs/TESTING.md).

## Round 3: the three improvements we promised

1. **Change impact.** Change, expire or delete a fact, or change a rule, and every draft that used it is re-checked. An approved piece that no longer passes goes back for re-approval with the reason; the Impact panel lists everything touched; Insights shows each amended rule's dismissal rate before and after. *Tested live:* 6 probe checks.
2. **API and MCP server.** Scoped keys (shown once, stored hashed, revocable, rate-limited); `get_brief` (rules in force and only facts valid today) and `check_draft` (the same cited findings as the app) over REST and MCP; a playground and an audit trail. *Tested live:* 13 probe checks including a real MCP SDK client. Reference: [docs/API.md](docs/API.md).
3. **Campaign review with AI vision.** A caption, up to 4 creatives and up to 4 documents (pasted, PDF or Word, or read from a live web page) reviewed together: every check on every document; prices, figures, dates and promo codes compared across all of them; AI vision reads stylised text and flags people shown for a consent check, routed to compliance. *Tested live:* 5 campaign checks and 5 web-page-reader checks.

Each is tested against exactly the test we wrote down at Round 2 ([docs/TESTING.md](docs/TESTING.md)).

## Beyond the three promises

- **Bulk check** (`/bulk`): paste a content calendar or upload a CSV of up to 50 posts; a verdict per post in seconds, with no AI quota spent, a results CSV and "Open as a review".
- **Chrome extension** ([extension/](extension/README.md)): check selected text in LinkedIn, Gmail, X or any page through the API; reads a page only when clicked.
- **Read-only share links**: send an approved record outside the workspace; valid 30 days, revocable, only a hash stored.
- **Channel previews**: the draft as an Instagram caption, LinkedIn post, Facebook ad, WhatsApp message, email or page, with the cut marked and warnings for a disclaimer or call to action hidden after it.
- **Undo and keyboard review, with precedents**: undo a fix for 10 seconds; J/K, A, D, U, ?; each finding says how the team settled the same rule before.
- **Time-limited exceptions and dual sign-off**: only a reviewer grants an exception, which reopens when it expires; high-risk drafts need compliance, then brand.
- **Approval bound to the Brand Kit version, and a database approval gate**: approval re-checks against the current kit, and a trigger (migration 009) refuses approval while a violation is open.
- **Web page reader with hidden-text detection**: text a page hides from readers is labelled and checked; private and metadata addresses are refused.
- **31 Brand Kit rules**, each with its own flag and pass test sentences, including paid-partnership labels, offer end dates, competitor names and vague link text.
- **Security headers and a threat model**: CSP, no framing, HSTS; 15 threats, each mapped to the test that proves it ([THREAT_MODEL.md](docs/THREAT_MODEL.md)).
- **Load test** and **accessibility checks** (axe-core in every sweep), above.

## What runs

| Stage | What it does |
| --- | --- |
| 1 Redact | Emails, phones, Aadhaar, PAN and card numbers masked before any AI call; confidential drafts never sent |
| 2 Code checks | 31 Brand Kit rules and every figure compared with the Facts Register (subject first, then value; embargoed, expired and wrong-subject figures flagged) |
| 3–5 AI checks, vision, documents | One rule per call, run twice when it finds something; vision for text OCR missed and people shown; every check on each campaign document |
| 6 Consistency | Prices, figures, dates and promo codes compared across caption, creatives and documents, by code |
| 7 Verifier | A finding whose quote, rule or fact does not exist is dropped: no source, no flag |
| 8 Fix re-test | Every fix applied and checked again before it is offered |
| 9 Route and approve | A fixed table routes to brand or compliance; a person approves; the record carries a SHA-256 fingerprint and the Brand Kit version |
| Workflow | Image inspector outlines each creative's problems; select words in a draft to make them a rule; the review page updates live when a teammate acts; "Invite a teammate" makes a 7-day, revocable join link to the workspace |

Without any AI key, the code checks and the whole workflow still run, and the app says so. Area-by-area detail (image checks, Facts Register, Brand Kit, workflow, Insights, reliability): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#features-in-detail).

## Changes from the Round 1 plan (summary)

- **AI provider:** planned on Claude; built as one adapter (Claude, Groq, Gemini) so judges get AI checks on free tiers.
- **Sign-in:** planned Supabase Auth; replaced by a private workspace per visitor so judges can open the link directly. Roles are still enforced on the server.
- **Image review:** planned for Round 3; a first version shipped in Round 2 (palette, contrast, alt text, OCR, logo), and AI vision in Round 3.
- **Writing-style libraries** (alex, write-good): replaced by Brand Kit rules with test sentences.
- **Hands-on tests with students:** moved from Round 2 to Round 3; not yet run when this was written (see [known issue 13](docs/KNOWN_ISSUES.md)).
- **Round 1 penalty figure** ("up to ₹10 lakh / ₹50 lakh"): withdrawn, because we could not confirm it.

Full table with reasons: [`docs/round2/SUBMISSION.md`](docs/round2/SUBMISSION.md).

## Documentation

[**From demo to a real team**](docs/PRODUCTION.md) · [Architecture](docs/ARCHITECTURE.md) · [Testing](docs/TESTING.md) · [Threat model](docs/THREAT_MODEL.md) · [Load test](docs/LOAD_TEST.md) · [AI helper evaluation](docs/EVAL_HELPERS.md) · [API and MCP](docs/API.md) · [Known issues](docs/KNOWN_ISSUES.md) · [Roadmap](docs/ROADMAP.md) · [Changelog](docs/CHANGELOG.md) · [Contributions](docs/CONTRIBUTIONS.md) · [Chrome extension](extension/README.md)

## Team

- **Mahak Fahad** (team leader): backend and AI/ML — review pipeline, Facts Register, visual checks, evaluation, API, database, deployment.
- **Roshini R:** frontend and design — directed the home page, the visual style and the review page ([details](docs/CONTRIBUTIONS.md)).

## Stack

Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS 4, Supabase Postgres, Vercel (functions in Mumbai, next to the database). Open source used: supabase-js, Model Context Protocol SDK, groq-sdk, @google/genai, Anthropic SDK, Zod, mammoth (DOCX), unpdf (PDF), tesseract.js (OCR), axe-core, Vitest, Playwright.

## Tests

```bash
npm test                                                         # 238 unit tests, including a deliberately wrong AI and fuzzing
npm run eval                                                     # accuracy on the held-out set (code checks)
npm run eval:images                                              # 28 creatives with planted colour, contrast, logo and text-size errors
npm run eval:privacy                                             # personal data and confidential canaries never reach the AI
npm run eval:helpers                                             # the guide compiler and the rule-amendment helper, live (about 30 AI calls)
BASE_URL=https://guidewise-kohl.vercel.app npm run e2e           # 21-step journey
BASE_URL=https://guidewise-kohl.vercel.app npm run e2e:sweep     # 59 steps: every page and control, desktop and phone, with axe-core
BASE_URL=https://guidewise-kohl.vercel.app npm run e2e:api       # 206 checks: bad input, wrong roles, other workspaces, races
BASE_URL=https://guidewise-kohl.vercel.app npm run e2e:extension # the Chrome extension in Chromium against the live API
BASE_URL=https://guidewise-kohl.vercel.app VISITORS=20 npm run test:load  # concurrent visitors, AI off
```

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Apply the migrations in `supabase/migrations/` (001 to 009, in order) to a Supabase project first. The app seeds the PrepPath demo on first load. To check the setup, open `http://localhost:3000/api/health`: `database.ok` should be `true`, and `ai.chain` lists the AI services your keys switched on ("none" means rules-only mode, which still runs every code check and the whole workflow). Verified on a clean checkout: `npm ci`, `npm test` (all pass, no keys needed) and `npm run build`.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY` | Supabase project URL and publishable key |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | Optional; set any. Keys present are tried in turn, falling through on errors, timeouts or rate limits. With none, Guidewise runs in rules-only mode |
| `GROQ_MODEL`, `GROQ_BACKUP_MODEL`, `GEMINI_MODEL`, `GUIDEWISE_MODEL`, `GROQ_VISION_MODEL` | Optional model overrides (Groq defaults to `openai/gpt-oss-120b` with `openai/gpt-oss-20b` as backup, `off` to disable; Gemini defaults to `gemini-3.5-flash-lite`) |
| `EVAL_TOKEN` | Optional; protects the endpoint that measures AI accuracy |

## Limits, stated plainly

- **No sign-in.** Judges open the link directly and switch roles with "Acting as". Browsers never receive database credentials; every read and write goes through our API, which enforces the role rules and scopes each query to the visitor's random workspace ID, and the API probe checks that one workspace cannot read another's drafts. A real deployment adds sign-in and per-organisation row-level security ([PRODUCTION.md](docs/PRODUCTION.md)).
- **Our numbers come from our own test set.** Real marketers' drafts will be harder; the December pilot re-measures on them. The AI-helper numbers are from before their fixes.
- **No hands-on tests with real users yet** at the time of writing; usability rests on our own browser tests at desktop and phone size.
- **Free AI tiers.** Heavy simultaneous use can hit rate limits; the review then continues with code checks and says so. The load test ran with AI off to keep the quota for judges.
- The logo check matches the logo file itself: a redrawn, recoloured or heavily stretched logo is reported as missing, and a reviewer can dismiss that with a reason. AI vision flags people shown for a consent check but does not recognise who they are.
- A PDF brochure is read as text; pictures inside it are not checked. The web page reader reads the HTML the server sends, so a page built entirely in JavaScript shows little text.
- Brand-name spelling catches case and spacing at capital letters ("Preppath", "Prep Path"), not every misspelling.
- The API rate limit is counted per server instance, so it is approximate.
- Guidewise supports reviewers. It does not give legal advice. Penalty precedents are cited as reported in the linked press coverage.

All 14 known issues, with where each lives in the code: [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).

## Disclosures

- Claude (Anthropic) was used to help write the code and documents during the build windows. The team reviewed it and is responsible for it.
- Round 2 code was written in its window (13–16 November 2026); the Round 3 work in its window (from 18 November 2026, 11:59 PM IST). The commit history shows both.
- In the product, AI checks run on Groq and Gemini (Claude supported) through one adapter; personal data is masked before any call.
- PrepPath Academy, its rules, facts and students are fictional and were written by the team.
