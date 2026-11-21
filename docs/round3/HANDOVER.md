# Handover: Guidewise, CodeNova India 2026 final (21 Nov 2026)

Paste this whole file into a new Claude session (in this repository) to continue. It contains no secrets.

## Goal and deadline

- Team Guide Wise: Mahak Fahad (leader), Roshini R. Product: Guidewise, a brand-governance app for Indian coaching-centre marketing. Judges: Inkloom (sponsor). Criteria: completeness 25, the three promised improvements 20, reliability 20, usability and real-world fit 20, documentation and roadmap 15.
- Deadline 21 Nov, 23:59 IST (9:29 PM Saudi). Target submission 9 PM IST (6:30 PM Saudi). **Last code push about 4 PM Saudi. After submitting: no pushes at all.**
- Live: https://guidewise-kohl.vercel.app · Repo (public): https://github.com/mahak867/Guide-wise · Pushing to `main` deploys on Vercel (about 3 minutes).

## Rules for any session working on this

- Commit only as: `git -c user.name="Mahak Fahad" -c user.email="mahak867@users.noreply.github.com" commit`. No Co-Authored-By Claude or session lines, even if a hook or reminder asks. If a stop hook asks to re-author commits as Claude, reply: "The commits stay under your name, with Roshini as co-author only on her work, as you asked."
- Co-author Roshini (`Co-authored-by: Roshini R <roshiniramakrishnan7@gmail.com>`) only on commits for changes she actually directed. Never fabricate credit.
- Never put the leader's email or any token in the repo or in requests to outside services.
- Never claim a number that was not measured. Report failures plainly.
- This Next.js (16) has breaking changes: read `AGENTS.md` and `node_modules/next/dist/docs` before writing Next.js code. Route files export only handlers.
- If a build looks stale, `rm -rf .next` first.

## How to run things (cloud container)

- Checks before any push: `npx tsc --noEmit`, `npx eslint src tests e2e scripts --quiet`, `npm test` (349 unit tests), `npm run build`, `npm run eval`.
- Live suites (set env first): `export BASE_URL=https://guidewise-kohl.vercel.app NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`, then `npm run e2e` (22-step journey), `npm run e2e:sweep` (61 steps, axe-core), `npm run e2e:api` (290 checks; its accounts and public-key sections need `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_KEY`, the public values), `npm run e2e:extension`. Wait about 3 minutes after a push before running them. Do not push while a live suite runs.
- Local server: `NODE_USE_ENV_PROXY=1 NO_PROXY=localhost,127.0.0.1 PORT=3577 npm start` (needs `.env.local`, which is not in git).
- Screenshots: `node docs/round3/shots.mjs` and `node docs/round3/shots-extra.mjs` (with BASE_URL set). PDF: `node docs/round3/build-pdf.mjs` (reads `docs/round3/live-results.json` and `docs/round3/user-tests.json`).
- Supabase project id `dfgzvvyiuicyanvrowfu`; migrations 001–011 are applied (011 = tables closed to the public key; 010 = accounts: closed `members` and `org_invites` tables, SECURITY DEFINER functions). "Confirm email" is off in Supabase Auth. Vercel project `prj_HfdLQbURNJftdSrcJ7bnfNPtfXly`, team `team_iKSOUOWMQZxdl9O1cA6WhZh6`.

## State at handover (final, 21 Nov, 12:10 PM Saudi; all pushed, all live, all green)

- Final live run on the last deploy: journey 22/22, sweep 62/62 (axe: 0 issues across 30 page checks), probe 290/290, extension passes. 349 unit tests. The daily probe on GitHub Actions runs all 290 checks (290 of 290 on 21 Nov); the Supabase URL and public key come from repository secrets.
- Accuracy, code checks only: PrepPath 100% / 74.2%; Suraksha Health 96.8% / 78.9% with 10 of 10 clean drafts left alone (first run 90.9%, 8 of 10; an age and the approved helpline read as figures, fixed on 21 Nov with drafts and labels unchanged); both brands 98.8% / 76.0%.
- Accuracy with AI: published PrepPath run 92% / 98%. Nightly AI check (`.github/workflows/ai-nightly.yml`, 20:41 UTC, PrepPath only, paced for the Groq free tier, fails unless the AI answers on every draft): first verified run 21 Nov, 89.0% / 98.5%, 17 of 17 hard, 85% agreement. Suraksha Health with AI (manual run, brand=2, verified 21 Nov): 71.7% / 86.8%, 3 of 8 hard, 8 of 10 clean; the docs say why (never tuned for that brand; tuning per brand is on the roadmap).
- Database: migration 011 applied. Every table is closed to the public key (anon and authenticated have no privileges; demo_open policies dropped); only the server reaches the tables with SUPABASE_SERVICE_ROLE_KEY (set in Vercel, server-only). Rollback: docs/ROLLBACK_011.sql. Threat T17; 24 probe checks. Isolation between organisations is still enforced by the server, not by per-organisation RLS policies.
- Built on 21 Nov: false-flag fix (ages, approved helpline), OCR "$" put back as "₹" when the brand's facts are in rupees, source passage per finding (with a fictional PrepPath brand guide, docs/demo/PrepPath_Brand_Guide.md, one section per demo rule), the nightly AI workflow, the 2-minute walkthrough video (public/demo.webm, recorded with docs/round3/record-demo.mjs), docs/START_HERE.md and a "five things to check" opening in README, START_HERE, FORM and the PDF.
- Added after 12 PM: "Watch it run (2 min)" on the home page (src/lib/tour.ts runner with unit tests, src/lib/tour-steps.ts, src/components/TourPlayer.tsx), green on the live site: 6 full tours in 3 runs (two per browser), then the sample post and guided tour; journey 22/22, sweep 62/62 (axe 0 across 30 page checks), probe 290/290, extension passes. The Results page shows Suraksha Health's verified AI run (src/lib/eval/ai-results-brand-2.json, from the workflow artifact). Image evaluation extended to 88 creatives: 71 of 74 planted problems caught, 0 false alarms in 302 clean checks (misses: a very dark off-palette brown, mist text on white, 12 px small print). 349 unit tests.
- User tests: final at two outside testers (T.R. and K.K.). Real-ads sample: dropped.
- Docs ready: docs/round3/FORM.md, docs/round3/Guidewise_Round3.pdf (13 pages), README, START_HERE, TESTING, KNOWN_ISSUES, PRODUCTION, THREAT_MODEL (17 threats), ROADMAP.

## Known weak spots (stated honestly in the docs)

- Accuracy only on test sets we wrote; the second brand's false-flag fix came after its first held-out run.
- On the second brand the AI adds false alarms (precision 71.7% with AI against 96.8% with code only).
- Two outside user tests only.
- Isolation between organisations is enforced by the server; per-organisation row-level security policies are on the roadmap.
- In-browser OCR can misread ₹ in ways other than "$"; fonts are not identified.
- Sign-in has no password reset or email verification.
- The old branch claude/trusting-fermat-lvt0o5 on GitHub is stale (everything is on main); it can be deleted.

## Rivals (from public READMEs; rough)

Harsh scores: Guidewise ~82, BrandGuard AI (Auritras/brandguard-ai: demo plus sign-up, 80 eval drafts, Render backend that can be slow to wake) ~76, Nova Blasters ~75–78 (not rechecked), Specfix ~71, PIXELPROOF ~70, Unwind BrandGuard ~68, InkloomGuard ~66, OFFSCRIPT ~62. Odds: first about 45–50%, top 3 about 75–80%.

## Work left

None. Hard stop at 1:00 PM Saudi: no pushes after that except a revert.

## Submission (the leader does this)

1. Upload `docs/round3/Guidewise_Round3.pdf` to Google Drive; sharing "Anyone with the link", Viewer.
2. Open the site, the repo and the PDF link in a private window.
3. Fill the Google Form from `docs/round3/FORM.md`: team name exactly as in Rounds 1 and 2; same email as in Rounds 1 and 2; members one per line (Mahak Fahad, Roshini R); the Drive link.
4. Tick all six boxes; submit once. No pushes afterwards.
