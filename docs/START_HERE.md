# Start here (for judges)

Five minutes, no sign-in. **Live: https://guidewise-kohl.vercel.app**

## Five things to check, a minute each

1. **Accuracy, re-run live on two brands.** Open [Results](https://guidewise-kohl.vercel.app/results): the code-check evaluation runs again in front of you, on PrepPath and on a second, fictional health insurer (brand selector at the top).
2. **A live probe of the deployed site.** [Live site check](https://github.com/mahak867/Guide-wise/actions/workflows/live.yml) runs every morning on GitHub Actions against the deployed site: 242 checks of bad input, wrong roles, other workspaces, races and the three improvements end to end with a real MCP client. Before each release we also run the full probe, 290 checks, which adds accounts and direct database access with the public key.
3. **An MCP server and a REST API with the same findings as the app.** [API page](https://guidewise-kohl.vercel.app/developers): Create key, then Call check_draft, over REST or MCP; each call is in the audit trail.
4. **Change impact.** [Facts and assets](https://guidewise-kohl.vercel.app/facts): act as Meera, Edit F-3, change the figure, Save. Every draft that used F-3 is re-checked, and the approved post that cites it goes back for re-approval.
5. **The database is closed to the public key.** Only the server can read or write the tables; with the public key every read and write is refused (migration 011, checked by the probe's "public key" checks, threat T17 in [THREAT_MODEL.md](THREAT_MODEL.md)).


## Then click through the product

1. **Review the sample post** (home page). Open a finding: it quotes the exact words, names the rule or fact it breaks, and offers a fix that was re-tested by code. Then **Accept all → Submit for review → Approve** and open the approval record (SHA-256 fingerprint).
2. **New review → Use the sample campaign → Run review.** Caption, creative, brochure and landing page checked together: price, date and promo-code mismatches across sources are cited, and a person in a creative is flagged for a consent check and routed to compliance (improvement 3).
3. **Facts and assets → act as Meera → Edit F-3 → change the figure → Save.** Every draft that cited F-3 is re-checked, and the approved WhatsApp post goes back for re-approval (improvement 1). Then **API → Create key → Call check_draft**: the same findings as the app, with an audit entry (improvement 2).

Want to try to break it? **New review → Try a hard case**: seven drafts built to slip past a checker.

## The numbers

- **CI:** [341 unit and integration tests](https://github.com/mahak867/Guide-wise/actions/workflows/ci.yml) on every push.

| Measure | Result |
| --- | --- |
| Accuracy, 40 held-out drafts (PrepPath), with AI | 92% precision, 98% recall |
| Same, code checks only | 100% precision, 74% recall |
| Second brand (Suraksha Health), code only | 97% precision, 79% recall (91% on the first run, before the fix below) |
| Images | 26 of 26 planted errors caught, 0 false alarms in 66 clean checks |
| Privacy | 0 leaks in 144 AI prompts |
| Load | 50 concurrent visitors, 980 requests, 0 failed |
| Live suites, 21 Nov | journey 21/21, sweep 61/61 (0 axe issues), probe 290/290 |

How each is run: [docs/TESTING.md](TESTING.md).

## The honest limits

- Accuracy comes from test sets we wrote (both brands are fictional and ours). The AI helpers have not been re-measured after their fixes.
- Two outside user tests (two students, about 12 and 20 minutes).
- On the second brand, the first held-out run falsely flagged 2 of 10 clean drafts (an age and the approved helpline read as figures). We fixed both and re-ran the same drafts with labels unchanged; the set is no longer untouched for that fix.
- Only the server can reach the database tables: the public key is refused on every table (checked by the live API probe). Isolation between organisations is enforced by the server, not by per-organisation row-level security policies. Sign-in is optional and has no password reset yet.
- In-browser OCR can misread ₹. A "$" before a number is put back as ₹ when the brand's facts are in rupees; other misreadings are not corrected (AI vision reads it correctly). Fonts in images are not identified.
- A person in a photo is flagged for consent; we do not identify who it is.

Full list: [docs/KNOWN_ISSUES.md](KNOWN_ISSUES.md). Architecture: [docs/ARCHITECTURE.md](ARCHITECTURE.md). Demo to a real team: [docs/PRODUCTION.md](PRODUCTION.md). Roadmap: [docs/ROADMAP.md](ROADMAP.md).
