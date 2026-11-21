# Handover: last steps before submission (21 Nov)

If a new session picks this up, do only these, in order. Commit as `git -c user.name="Mahak Fahad" -c user.email="mahak867@users.noreply.github.com" commit` (no co-author lines). Last push by 4 PM Saudi; nothing after submitting.

1. Live checks: `BASE_URL=https://guidewise-kohl.vercel.app NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npm run e2e:api` (also `e2e`, `e2e:sweep`, `e2e:extension`). The probe's accounts section needs "Confirm email" OFF in Supabase Auth.
2. Put the real counts into docs/round3/FORM.md, README.md and docs/round3/live-results.json: unit tests (`npm test`), probe ok count, journey steps, sweep steps and axe checks; eval: PrepPath 100%/74%, Suraksha Health 91%/79%, both 96%/76% (code only); 31 Brand Kit rules.
3. FORM.md feature list: add optional sign-in and organisations (members, roles, invites, named signed-in approvers), dark mode (follows the system), second-brand evaluation.
4. Screenshots: `BASE_URL=https://guidewise-kohl.vercel.app node docs/round3/shots.mjs` and `node docs/round3/shots-extra.mjs`.
5. PDF: `node docs/round3/build-pdf.mjs`; check every page; commit and push.
6. The team leader uploads docs/round3/Guidewise_Round3.pdf to Drive ("Anyone with the link", Viewer), opens every link in a private window, and submits the form once.
