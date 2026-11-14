# Guidewise: Round 2 submission answers

Team **Guide Wise** · CodeNova India 2026 · Round 2, The Build

Ready to paste into the form. Your role line is the one part you must write yourself.

---

## Working project link

https://guidewise-kohl.vercel.app

No sign-in. Each visitor gets a private demo workspace, so judges never see or reset each other's work.

A 90-second captioned walkthrough, recorded on the live site: https://guidewise-kohl.vercel.app/demo.webm

## Source-code repository

https://github.com/mahak867/Guide-wise

## Completed features

1. **Review of text and images before publication.** Paste copy, or upload a DOCX or PDF, and add up to four images. State the goal, audience and call to action.
2. **Code checks.** These cover preferred terms, banned phrases, approved contact details, student results (course and consent record), the results disclaimer (including a same-language check for Hindi claims), and every figure compared with the Facts Register.
3. **Image checks.** Text inside each image is read (OCR in the browser) and goes through every rule and fact check. Dominant colours are checked against the brand palette (CIELAB colour difference), along with colour contrast (WCAG) and alt text. The Brand Kit logo is searched for in each creative at many sizes (plain code in the browser, no AI), then checked for a minimum size and clear space around it.
4. **Facts Register with dates.** Each fact has evidence, an owner, a valid-from and valid-until date, and a required disclosure. A figure used before its start date is flagged as embargoed; after its end date, as outdated. A figure used for the wrong subject is flagged as a contradiction.
5. **"No source, no flag" verifier.** Plain code drops any finding whose quoted words are not in the draft, or whose rule or fact does not exist.
6. **Cited findings.** Each finding quotes the exact words and cites its rule and the rule's source. Regulation findings cite a penalty order by India's Central Consumer Protection Authority (CCPA) as precedent, as reported in the linked press coverage. We have not read the orders themselves.
7. **Re-tested fixes.** Every suggested fix is applied and re-checked before it is offered. A fix that would introduce an issue with no automatic fix is withdrawn. Accepting a fix re-runs the checks on the new text, and "Accept all" works through follow-ups.
8. **Brand Kit with rule tests.** Every rule carries test sentences. A rule starts as advisory and can only be enforced when its own check passes those tests. Every change creates a new Brand Kit version.
9. **Brand-guide compiler.** Paste guide text and get proposed rules with test sentences, plus warnings about vague or contradictory passages. The manager confirms each rule. This needs the AI service.
10. **Regulation pack.** Central Consumer Protection Authority (CCPA, India) guidelines for the coaching sector (2024): guarantee claims, student results, and the results disclaimer, with an applicability gate. The guidelines apply above 50 students; at 50 or fewer, those rules show as suggestions.
11. **Approval workflow.**
    - Four roles: creator, brand reviewer, compliance reviewer, brand manager. Role rules are enforced on the server.
    - Accept, dismiss with a reason, or reopen findings. Only compliance can dismiss a critical finding.
    - Comments, version history, an activity log, and request changes.
12. **Risk routing.** A fixed rule table, not a model, sends outcome claims and regulated content to compliance and everything else to the brand reviewer.
13. **Approval receipt and record.** A SHA-256 fingerprint of the exact approved text, the Brand Kit version, every finding and how it was resolved, and the approver. Downloadable as JSON, or as a printable approval record (save as PDF).
14. **Writer control.** Locked phrases that no fix may remove, editing a suggested fix before accepting it (the checks run again on the edit), and version history with word-level changes.
15. **Insights.** Which rules fire most, which are dismissed and why (a rule two or more people call unclear is flagged), and a watch on facts that have expired, are embargoed, or expire within 60 days.
16. **Brief card.** Before writing, the creator sees the rules in force and the facts that are safe to use today.
17. **Measured results page.**
    - 60 planted-error drafts (40 held out), with precision, recall and 95% Wilson intervals, re-run live.
    - Held out, code checks only: precision 100% (93–100%), recall 74% (63–83%). Every miss is a deliberately hard phrasing.
    - With the AI checks, on all 40 held-out drafts on the live site, run twice with the cache off: precision 92% (83–96%), recall 98% (92–100%), every critical error and all 17 hard phrasings caught; the two runs agree on 83% of drafts. Four of the six false flags are the AI calling "cheapest" or "Best" an unsupported superlative where our answer key planted only the "cheap" term rule; we count them as false rather than change the key afterwards. One (a rating, "4 stars", read as a figure) has since been fixed and is covered by a test.
18. **Rules-only mode.** Without the AI service, the code checks and the whole workflow still run, and the app says so.
19. **Guided tour.** A checklist on each review ticks itself off as the visitor completes the journey.
20. **Confidential drafts.** A writer can mark a draft confidential; it is then never sent to any AI service, only the code checks run, and the review says so.
21. **Rules per content type.** A rule can apply to some content types only (for example, no shortened links on social posts and ads, but allowed in emails). The brief card shows the rules for the type being written.
22. **Brand Kit export and import.** The whole kit (assets, rules with tests, facts) as one JSON file. Imported rules that are new or changed arrive as advisory and must pass their own tests before they can be enforced.
23. **AI answer cache.** The same rule on the same text is answered from a cache, so many people reviewing the same sample do not use up the AI quota. The second, independent run of a rule and the accuracy measurement never use the cache.
24. **Writing-style rules.** Code rule types a manager can create: exact brand-name spelling ("Preppath" becomes "PrepPath", web addresses left alone), capitals used for emphasis (exam acronyms allowed), a length limit per content type (ad text past 125 characters, where "See more" cuts it off), a sentence-length limit, and inclusive wording. Each has test sentences and a fix where one is safe.
25. **Personal data protection.** Emails, phone numbers, Aadhaar, PAN and card numbers are masked in code before any AI call.
26. **Engineering.**
    - 50 automated tests, including logo matching on the real sample creatives, and eight that replace the AI with a deliberately wrong one (invented quotes, a forbidden fix, a wrong number, a time misread as a figure, personal data, a confidential draft, prompt injection, locked phrases) and check that code catches each.
    - CI on every push: lint, type-check, tests, evaluation, build.
    - A 20-step browser test of the whole journey (`npm run e2e`), a 44-step sweep that clicks every page and control at desktop and phone sizes (`npm run e2e:sweep`), and a 67-check probe that sends every API route bad input, the wrong role and requests from another visitor's workspace (`npm run e2e:api`). All three pass against the live site; unit tests and the evaluation run in CI on every push ([CI runs](https://github.com/mahak867/Guide-wise/actions/workflows/ci.yml)).
    - Every input is validated: malformed requests, corrupt files, impossible dates and unsafe patterns get a clear message, never a server error.
    - Functions run in Mumbai next to the database.

## Technology and implementation details

- **App:**
  - Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS 4. Deployed on Vercel, with functions in `bom1` (Mumbai).
  - The UI and the API are one codebase, so a team of two can work in one language.
- **Data:**
  - Supabase Postgres. Every table is scoped by a workspace ID, so each visitor's demo is isolated.
  - Schema in `supabase/migrations/`.
- **Review pipeline** (`src/lib/engine/`):
  1. **Redact** emails, phone numbers, Aadhaar, PAN and card numbers before any AI call (`redact.ts`).
  2. **Code checks** (`code.ts`): numbers are extracted into typed values (lakh and crore are understood) and compared with the Facts Register by subject first, value second. The AI never decides whether two numbers match.
  3. **AI checks** (`ai.ts`, one adapter for Groq, Gemini and Claude with automatic fallback; every answer must pass a Zod schema): one rule per call, each capped at 20 seconds. A rule that returns a finding is run a second time, and disagreement downgrades the finding to a suggestion. A rate-limited, slow or failed provider falls through to the next; if all fail, the review continues with code checks and says so.
  4. **Verifier** (`verify.ts`): plain code checks grounding — quote, rule and fact for text findings; colour, OCR text or alt text for image findings.
  5. **Fix re-test** (`review.ts`).
  6. **Visual checks** (`visual.ts`): sRGB to CIELAB, colour difference against the palette, WCAG contrast, alt text, and every text rule applied to the OCR text.
- **Image analysis in the browser** (`src/lib/image.ts`): dominant colours by quantisation, and OCR with tesseract.js. The OCR engine and English language data are served from our own site, not a CDN, so they work where CDNs are blocked.
- **Documents:** mammoth (DOCX) and unpdf (PDF), read in memory and never stored.
- **Evaluation** (`src/lib/eval/`, `scripts/eval.ts`): a seeded generator makes the same 60 drafts on every machine (the fingerprint is shown on the page). `--ai` measures the AI checks and repeat-run agreement.
- **Testing:** Vitest (`tests/engine.test.ts`; `tests/fake-ai.test.ts`, which swaps in a deliberately wrong AI; `tests/providers.test.ts`, which covers provider fallback) and GitHub Actions (`.github/workflows/ci.yml`).
- **Open source used:** Next.js, React, Tailwind CSS, supabase-js, Anthropic SDK, groq-sdk, @google/genai, Zod, mammoth, unpdf, tesseract.js. Licences are in their packages.
- **AI disclosure:** Claude (Anthropic) was used to help write code during the build window. The product calls an LLM through a provider adapter (Groq, Gemini or Claude, whichever keys are configured) for its AI checks and guide compiler.

## Changes from the Round 1 plan

| Plan | What we did | Why |
| --- | --- | --- |
| AI on Claude | One adapter tries Claude, Groq and Gemini in that order, whichever keys are set. The live site runs on Groq, with Gemini as backup. | Free tiers keep the AI checks available to judges at no cost. The schema, verifier and tests are the same for every provider. |
| Supabase Auth with four roles | No sign-in. A private workspace per visitor and a role switcher; role rules are enforced on the server, and browsers never receive database credentials. | Judges must be able to open the link directly, and isolated workspaces stop judges interfering with each other. Sign-in and per-organisation database security come with a production deployment. |
| Image and asset review in Round 3 | A first version ships now: palette, contrast, alt text, logo presence, size and clear space, and OCR text through every rule. | The brief names visual identity as part of the central workflow, so it could not wait. Round 3 deepens it instead (improvement 3). |
| Results page with measured accuracy | Shipped. Code checks and AI checks on all 40 held-out drafts; the AI checks run twice to measure agreement. | Done as planned. The runs were paced over two hours to stay inside the free AI tier. |
| alex, write-good, axe-core | Replaced by our own code rules: brand-name spelling, capitals, length per content type, sentence length, inclusive wording; contrast and alt text for images. | As Brand Kit rules they have test sentences, can be edited by the manager, and cite their source. The libraries' fixed word lists could not. |
| Eight findings on the demo caption | About 20 across the caption and the sample creative. | The two superlatives are flagged separately, and the disclaimer rule was added from the regulation pack. |
| Fixes withdrawn if they introduce any issue | Withdrawn only if the new issue has no automatic fix; otherwise it is shown as a follow-up. | Testing showed that fixing a guarantee claim correctly raises a disclaimer requirement, and withdrawing that fix was the wrong call. |
| Hands-on tests with fellow students in Round 2 | Not done yet. Moved to the start of Round 3. | Build time went into the image review and the measured evaluation. |
| Round 1 figure: CCPA maximum penalty "up to ₹10 lakh / ₹50 lakh" | **Withdrawn.** | We could not confirm these amounts against the Act and should not have stated them as fact. |

## The three major improvements for Round 3

1. **Guideline Health loop: the brand guide fixes itself.**
   - Round 2 already shows which rules are dismissed and flags those two or more people call unclear. Round 3 closes the loop.
   - Guidewise drafts an amendment with new test sentences. The manager approves it, which creates a new Brand Kit version that must pass its tests.
   - Changing a fact lists every draft and approved piece that used it.
   - **Test:** dismiss one rule as three different creators and see it marked unclear, with a drafted amendment that passes its tests. Change a fact and see every affected piece listed.
2. **Governance at the source: an API and an MCP server for AI writing tools.**
   - A REST API with scoped keys, and an MCP server (TypeScript SDK) exposing `get_brief` and `check_draft`.
   - AI writing tools then fetch the rules and the facts valid today, and check a draft before handing it over. An AI tool never sees an expired or embargoed fact.
   - Includes an in-app playground and a per-key audit trail.
   - **Test:** call `check_draft` from the playground and from an MCP client with a key, get the same cited findings as the app, and see a new audit entry.
3. **Campaign and creative review with AI vision.**
   - Review a whole campaign (caption, creatives, landing-page copy, PDF brochure) together, and flag inconsistencies across assets: prices, dates, claims, promo codes.
   - AI vision checks what OCR cannot see: a student photo with no consent record, a recoloured or redrawn logo, and claims set in stylised type.
   - **Test:** upload a three-asset campaign with a price mismatch between the creative and the brochure and an unconsented student photo. Both are found, cited, and routed to compliance.

We will also measure the AI checks on the same test set, and add real, anonymised drafts from coaching-centre marketers to it.

## Your role and the part you built

The certificate prints this exactly as written, so write it yourself, in your own words. Here are the facts to draw from; don't paste them.

- **Role:** Backend + AI / ML (team leader).
- **What exists in the backend and AI layer:**
  - the review pipeline: redaction, code checks, AI checks, verifier, fix re-test
  - the Facts Register logic
  - the visual checks, including logo matching
  - risk routing and approval receipts
  - workspace isolation
  - the evaluation set and results
  - the API routes, the database schema, and the deployment
- Be ready to explain any part you name. Judges may ask.
