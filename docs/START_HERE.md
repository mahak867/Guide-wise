# Start here (for judges)

Five minutes, no sign-in. **Live: https://guidewise-kohl.vercel.app**

## 1. Click these three things

1. **Review the sample post** (home page). Open a finding: it quotes the exact words, names the rule or fact it breaks, and offers a fix that was re-tested by code. Then **Accept all → Submit for review → Approve** and open the approval record (SHA-256 fingerprint).
2. **New review → Use the sample campaign → Run review.** Caption, creative, brochure and landing page checked together: price, date and promo-code mismatches across sources are cited, and a person in a creative is flagged for a consent check and routed to compliance (improvement 3).
3. **Facts and assets → act as Meera → Edit F-3 → change the figure → Save.** Every draft that cited F-3 is re-checked, and the approved WhatsApp post goes back for re-approval (improvement 1). Then **API → Create key → Call check_draft**: the same findings as the app, with an audit entry (improvement 2).

Want to try to break it? **New review → Try a hard case**: seven drafts built to slip past a checker.

## 2. Check the proof yourself

- **Results page** (`/results`) re-runs our accuracy evaluation live on two brands, with a brand selector.
- **Daily live probe:** [Live site check](https://github.com/mahak867/Guide-wise/actions/workflows/live.yml) runs every morning (03:17 UTC) on GitHub Actions against the deployed site: 268 API checks (bad input, wrong roles, other workspaces, races, forged invites, a real MCP client).
- **CI:** [334 unit and integration tests](https://github.com/mahak867/Guide-wise/actions/workflows/ci.yml) on every push.

| Measure | Result |
| --- | --- |
| Accuracy, 40 held-out drafts (PrepPath), with AI | 92% precision, 98% recall |
| Same, code checks only | 100% precision, 74% recall |
| Second brand (Suraksha Health), code only | 97% precision, 79% recall (91% on the first run, before the fix below) |
| Images | 26 of 26 planted errors caught, 0 false alarms in 66 clean checks |
| Privacy | 0 leaks in 144 AI prompts |
| Load | 50 concurrent visitors, 980 requests, 0 failed |
| Live suites, 21 Nov | journey 21/21, sweep 61/61 (0 axe issues), probe 268/268 |

How each is run: [docs/TESTING.md](TESTING.md).

## 3. The honest limits

- Accuracy comes from test sets we wrote (both brands are fictional and ours). The AI helpers have not been re-measured after their fixes.
- Two outside user tests so far.
- On the second brand, the first held-out run falsely flagged 2 of 10 clean drafts (an age and the approved helpline read as figures). We fixed both and re-ran the same drafts with labels unchanged; the set is no longer untouched for that fix.
- Row-level security per organisation covers members and invites; other tables are protected by the server. Sign-in is optional and has no password reset yet.
- In-browser OCR can misread ₹. A "$" before a number is put back as ₹ when the brand's facts are in rupees; other misreadings are not corrected (AI vision reads it correctly). Fonts in images are not identified.
- A person in a photo is flagged for consent; we do not identify who it is.

Full list: [docs/KNOWN_ISSUES.md](KNOWN_ISSUES.md). Architecture: [docs/ARCHITECTURE.md](ARCHITECTURE.md). Demo to a real team: [docs/PRODUCTION.md](PRODUCTION.md). Roadmap: [docs/ROADMAP.md](ROADMAP.md).
