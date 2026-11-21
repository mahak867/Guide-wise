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

- Checks before any push: `npx tsc --noEmit`, `npx eslint src tests e2e scripts --quiet`, `npm test` (324 unit tests), `npm run build`, `npm run eval`.
- Live suites (set env first): `export BASE_URL=https://guidewise-kohl.vercel.app NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`, then `npm run e2e` (21-step journey), `npm run e2e:sweep` (61 steps, axe-core), `npm run e2e:api` (268 checks; its accounts section needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_KEY`, from `.env.local`), `npm run e2e:extension`. Wait about 3 minutes after a push before running them. Do not push while a live suite runs.
- Local server: `NODE_USE_ENV_PROXY=1 NO_PROXY=localhost,127.0.0.1 PORT=3577 npm start` (needs `.env.local`, which is not in git).
- Screenshots: `node docs/round3/shots.mjs` and `node docs/round3/shots-extra.mjs` (with BASE_URL set). PDF: `node docs/round3/build-pdf.mjs` (reads `docs/round3/live-results.json` and `docs/round3/user-tests.json`).
- Supabase project id `dfgzvvyiuicyanvrowfu`; migrations 001–010 are applied (010 = accounts: closed `members` and `org_invites` tables, SECURITY DEFINER functions). "Confirm email" is off in Supabase Auth. Vercel project `prj_HfdLQbURNJftdSrcJ7bnfNPtfXly`, team `team_iKSOUOWMQZxdl9O1cA6WhZh6`.

## State at handover (all pushed, all live, all green)

- Live results 21 Nov: journey 21/21, sweep 61/61 with 0 axe issues on 29 page checks, probe 268/268 (incl. accounts: spoofed roles, forged invites, direct DB writes refused), extension passes. 324 unit tests.
- Accuracy (code checks only): PrepPath 40 held-out drafts 100% precision / 74% recall; Suraksha Health (second, fictional insurer) 40 drafts 90.9% / 78.9%, 2 of 10 clean drafts falsely flagged (an age and the approved helpline read as figures; "no questions asked" flagged as a guarantee); both brands 96.3% / 76.0%. With AI (PrepPath, measured earlier): 92% / 98%. Images: 26 of 26 planted errors, 0 false alarms in 66. Privacy: 0 leaks in 144 prompts.
- User tests: T.R. (2nd yr CSE) every feature, 12 min, no questions; K.K. about 20 min with his own draft, took a while to understand what happens after a review, so New review now explains it under Run review. Roshini (team) walked through it too; not counted.
- Built in Round 3, beyond the three promises: bulk check, Chrome extension, share links, channel previews, undo and keyboard review with precedents, exceptions and dual sign-off, database approval gate, web page reader with hidden-text detection, 31 Brand Kit rules, image inspector (recoloured or stretched logo, text size), make-this-a-rule, live updates, invite a teammate, optional sign-in and organisations, dark mode (system setting), second-brand evaluation, simplified main screens, threat model (16 threats), security headers and CSP.
- Docs ready: `docs/round3/FORM.md` (form answers field by field), `docs/round3/Guidewise_Round3.pdf` (13 pages), README with screenshots and a mermaid architecture diagram, `docs/TESTING.md`, `docs/KNOWN_ISSUES.md`, `docs/PRODUCTION.md`, `docs/THREAT_MODEL.md`, `docs/ROADMAP.md`.

## Known weak spots (stated honestly in the docs)

- Accuracy only on test sets we wrote; AI helpers not re-measured after fixes.
- Two outside user tests only.
- Row-level security per organisation covers members and invites only; other tables are protected by the server.
- In-browser OCR can read ₹ as $ (AI vision reads it correctly); fonts are not identified.
- Sign-in has no password reset or email verification.

## Rivals (from public READMEs; rough)

Harsh scores: Guidewise ~82, BrandGuard AI (Auritras/brandguard-ai: demo plus sign-up, 80 eval drafts, Render backend that can be slow to wake) ~76, Nova Blasters ~75–78 (not rechecked), Specfix ~71, PIXELPROOF ~70, Unwind BrandGuard ~68, InkloomGuard ~66, OFFSCRIPT ~62. Odds: first about 45–50%, top 3 about 75–80%.

## Optional work left (only before 4 PM Saudi, only if every test stays green)

1. A one-page "Start here for judges" (`docs/START_HERE.md`, linked at the top of the README): the 3 things to click, the proof to check (Results page re-runs accuracy; daily probe on GitHub Actions), the honest limits. Docs only, safe.
2. Fix the figures false flags (ages like "30-year-old" and the approved helpline number read as figures), then re-run `npm run eval` for both brands and update the numbers everywhere (README, TESTING, FORM, PDF). Riskier: engine change on submission day.
3. More user tests: add each to `docs/round3/user-tests.json`, `docs/TESTING.md`, KNOWN_ISSUES #13, FORM.md, README, then rebuild the PDF.

## Submission (the leader does this)

1. Upload `docs/round3/Guidewise_Round3.pdf` to Google Drive; sharing "Anyone with the link", Viewer.
2. Open the site, the repo and the PDF link in a private window.
3. Fill the Google Form from `docs/round3/FORM.md`: team name exactly as in Rounds 1 and 2; same email as in Rounds 1 and 2; members one per line (Mahak Fahad, Roshini R); the Drive link.
4. Tick all six boxes; submit once. No pushes afterwards.
