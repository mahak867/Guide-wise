# Guidewise

**Brand rules that run.** Guidewise checks marketing content against a team's approved brand rules and dated facts before it is published. Every finding quotes the rule it breaks and the exact words, every suggested fix is re-tested, risky content goes to the right reviewer, and a person makes the final approval.

Built by team **Guide Wise** for CodeNova India 2026, Round 2. All product code was written inside the official build window, which opened on 13 November 2026 at 10:00 IST (see commit history).

## Try it

Open the deployed link. There is no sign-in.

1. Click **Review the sample caption**. It is an Instagram caption from PrepPath Academy, a fictional coaching brand, with eight problems in it.
2. Read the findings. Each one cites its rule, quotes the words, and shows a re-tested fix. Regulation findings show a real penalty order as precedent.
3. Accept the fixes. The student-result finding has no automatic fix, because the student has no consent on record.
4. Submit. Outcome claims route the draft to the compliance reviewer.
5. Switch **Acting as** to Kavya (compliance). Dismiss the remaining finding with a reason and approve.
6. Read the approval receipt: SHA-256 fingerprint of the approved text, Brand Kit version, findings resolved, approver.

Use **Reset demo** to start again.

## What runs

| Area | What it does |
| --- | --- |
| Review engine | Personal data removed, then code checks (terms, phrases, approved contacts, student records, every figure against the Facts Register), then AI checks one rule per call, then a verifier, then fix re-testing |
| Verifier | Plain code drops any finding whose quote is not in the draft, whose rule doesn't exist, or whose fact doesn't exist ("no source, no flag") |
| Facts Register | Facts with evidence, owner, valid-from, valid-until and a required disclosure. A figure used before its start date is flagged as embargoed; after its end date, as outdated |
| Brand Kit | Rules with test sentences. A rule starts advisory and can only be enforced when its own check passes its tests. Every change creates a new Brand Kit version |
| Guide compiler | Paste brand-guide text, get proposed rules with tests and warnings about vague passages. Each rule is confirmed by the manager |
| Workflow | Four roles, accept or dismiss with a reason, comments, version history, audit log, a fixed rule table that routes to brand or compliance, approval receipts |
| Rules-only mode | If the AI service is unavailable, the code checks and the whole workflow still run, and the app says so |

## Stack

Next.js 16 (TypeScript, App Router), Tailwind CSS 4, Supabase Postgres, AI through one adapter that supports Groq, Gemini and Claude with automatic fallback (structured outputs validated with Zod), mammoth (DOCX text), Vercel.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Apply `supabase/migrations/001_init.sql` to a Supabase project first. The app seeds the PrepPath demo on first load.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY` | Supabase project URL and publishable key |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | Optional; set any. Keys present are tried Claude, then Groq, then Gemini, falling through on errors or rate limits. With none, Guidewise runs in rules-only mode |
| `GROQ_MODEL`, `GEMINI_MODEL`, `GUIDEWISE_MODEL` | Optional model overrides (defaults: `openai/gpt-oss-120b`, `gemini-flash-latest`, `claude-opus-5-5`) |
| `GUIDEWISE_MODEL` | Optional. Defaults to `claude-opus-5-5` |

## Limits, stated plainly

- Images are checked for palette colours, contrast, alt text and the text inside them (OCR in the browser). Layout, logo placement and photo content are not checked yet.
- There is no sign-in, so judges can open the link directly. Role rules are enforced on the server, but the database is open to the demo app by design; real workspaces need authentication.
- Accuracy is measured on 60 planted-error drafts written by the team (`npx tsx scripts/eval.ts`), with a live Results page. The numbers are optimistic because the same team wrote the rules and the drafts.
- Guidewise supports reviewers. It does not give legal advice. Penalty precedents are cited as reported in the linked press coverage.

## Disclosures

- Claude (Anthropic) was used to help write the code during the build window.
- PrepPath Academy, its rules, facts and students are fictional and were written by the team.
- Open-source components: Next.js, React, Tailwind CSS, supabase-js, Anthropic SDK, Zod, mammoth. Licences are in their packages.
