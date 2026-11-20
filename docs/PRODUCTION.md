# From demo to a real marketing team

The live site is built so a judge can open it with no sign-in: every visitor gets a private copy of a fictional brand, and roles are switched with "Acting as". This page says what changes for a real coaching centre's marketing team, what stays the same, and what it costs. Dates and costs match [ROADMAP.md](ROADMAP.md).

## What stays exactly the same

- **The review engine** (`src/lib/engine/`): redaction, code checks, AI checks, AI vision, campaign documents, consistency, the verifier, fix re-testing and risk routing. It already takes a team's own rules, facts and assets as data; nothing in it is specific to the demo brand.
- **The governance module** (`src/lib/governance.ts`) behind the app, the REST API, the MCP server, bulk check and the Chrome extension.
- **The workflow rules**: who may approve what, dual sign-off for high-risk content, time-limited exceptions, approval bound to the Brand Kit version, change impact and re-approval, the approval receipt with its SHA-256 fingerprint. They are enforced on the server and, for approval, by a database trigger.
- **The evidence**: every rule carries test sentences and cannot be enforced until its check passes them; the evaluations and the live probe keep running.

## What changes

| Demo today | For a real team | Effort |
| --- | --- | --- |
| A random workspace id per browser; anyone with the link gets a copy | Supabase Auth: email sign-in, an **organisation** per centre, invitations by email, the four roles stored per member. Every table already carries a workspace id, so the workspace becomes the organisation id and row-level security policies (`ws = organisation of the signed-in user`) replace today's open demo policy | About a week, plus a security test like the existing cross-workspace probe checks run per organisation |
| "Acting as" switches role | Each person has one role in their organisation; the switcher disappears; approvals record the real person | Part of the above |
| The fictional PrepPath Brand Kit | The team's own brand book through the guide compiler (PDF or Word in, proposed rules with test sentences out, each confirmed by the manager), their facts with evidence and owners, their logo and palette | A first session of about 2 hours per brand with the brand manager; measured in the December pilot |
| Free AI tiers (Groq, Gemini) with code-only fallback | A paid key first, free tiers as fallback, a monthly AI budget per organisation with a warning at 80%; confidential drafts still never leave | Configuration; about ₹1,500 a month for a centre doing 1,500 drafts (estimate in the roadmap) |
| Accuracy measured on drafts we wrote | Precision and recall re-measured on 50 real, anonymised drafts per pilot centre and published beside the synthetic numbers | The December pilot |
| Demo data reset by the visitor | Backups, retention and export per organisation (the Brand Kit already exports as one JSON file) | Supabase Pro plan |

## Where it fits a team's day

1. A writer drafts in Google Docs, Gmail, LinkedIn or the CMS and checks it with the **Chrome extension**, or an AI writing tool calls **`check_draft` over MCP** before handing text over.
2. A month's content calendar goes through **bulk check** at once; the posts that need fixes open as full reviews.
3. Reviews route themselves: outcome claims and regulated content to compliance, everything else to the brand reviewer, with two sign-offs where risk is high.
4. When a fact changes (a new results figure, a fee revision), **change impact** sends every approved piece that used it back for re-approval, so nothing published goes stale silently.
5. The manager watches **Insights**: rules people keep dismissing get clearer wording drafted for them, re-tested by code before they replace the old rule.

## Honest gaps before a paid pilot

- No sign-in or organisations yet (above).
- Visual checks are stronger on colour, contrast, text in images and the logo file than on layout and typography; fonts are not identified ([KNOWN_ISSUES.md](KNOWN_ISSUES.md)).
- All accuracy numbers come from our own test set; the pilot is where they are tested for real.
