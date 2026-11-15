# Round 2 form: answers field by field

Copy each block into the matching field of https://forms.gle/gyRiHtQT3AnC3MdV6. Fields marked YOU are yours to fill.

---

## Enter the name of the hackathon

CodeNova India

## Team Name

YOU: exactly as written in Round 1 (our records say: Guide Wise)

## Team Leader — Full Name

Mahak Fahad

## Team Leader — Email Address

YOU: the same email you used in Round 1

## Team Member Name each in one line

Mahak Fahad
Roshini R

## Link to the functioning project

https://guidewise-kohl.vercel.app

## Source-code repository

https://github.com/mahak867/Guide-wise

## Google Drive link to your updated project PDF

YOU: your Drive link (latest PDF, "Anyone with the link" as Viewer, tested in a private window)

## The list of features you completed

Review text before publication: paste copy or upload a DOCX or PDF, with goal, audience and call to action
Review images with the text: up to four creatives per draft, analysed in the browser
Cited findings: each one quotes the exact words, the rule and the rule's source
Code checks: preferred terms, banned phrases, approved contacts, student results (course and dated consent), results disclaimer
Facts Register: every figure checked against approved facts with evidence, owner, start date and end date; embargoed, outdated and wrong-subject figures are flagged
AI checks: one rule per call, run twice when they find something; disagreement becomes a suggestion
"No source, no flag" verifier: code drops any finding whose quoted words, rule or fact does not exist
Re-tested fixes: every suggested fix is applied and re-checked before it is offered; accept one, edit one, or accept all
Image text (OCR) run through every text rule
Brand palette check on creatives (CIELAB colour difference), contrast check (WCAG) and alt-text check
Logo check: the Brand Kit logo is found in each creative, with minimum size and clear space
Cross-asset consistency: a fee, percentage or count that differs between the caption and a creative is flagged
Writing-style rules: exact brand-name spelling, capitals for emphasis, length limit per content type, sentence length, inclusive wording
Hidden-character check: invisible characters that could hide a banned phrase are flagged and removed
Rules per content type: a rule can apply to social posts and ads only, for example
Brand Kit with rule tests: every rule carries test sentences and can only be enforced when its own check passes them; every change makes a new version
Brand-guide compiler: paste a guide or upload it as PDF or DOCX and get proposed rules with tests; the manager confirms each
Guideline Health: for a rule people dismiss, Guidewise drafts clearer wording and new tests; code re-tests it and the manager approves
Brand Kit export and import as one JSON file
Regulation pack: Central Consumer Protection Authority (India) coaching guidelines 2024, with the 50-student applicability gate and press-reported penalty orders as precedent
Approval workflow: four roles enforced on the server, dismiss with a reason, reopen, comments, request changes, version history, activity log
Risk routing: a fixed rule table sends outcome claims to compliance and the rest to the brand reviewer
Approval receipt: SHA-256 fingerprint of the approved text, Brand Kit version, every finding and how it was resolved; JSON download and printable record
Locked phrases that no fix may remove
Confidential drafts: never sent to any AI service
Personal data protection: emails, phone numbers, Aadhaar, PAN and card numbers masked before any AI call
Insights: most-flagged rules, dismissal reasons, rules people call unclear, fact expiry watch
Brief card: rules in force and facts safe to use today, shown before writing
Measured results page: 60 planted-error drafts, 40 held out, re-run live
Seven one-click hard cases (hidden characters, prompt injection, wrong-subject figure, Hindi claim, personal data, paraphrase, ad cut-off)
Guided tour and a 100-second captioned walkthrough video
Rules-only mode: without the AI service, code checks and the whole workflow still run, and the app says so
Private workspace per visitor: no sign-in, and one visitor cannot see or change another's work

## Technology and implementation details

Stack: Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS 4, Supabase Postgres, Vercel with functions in Mumbai next to the database. UI and API are one codebase.

Review pipeline (src/lib/engine): 1) personal data is masked; 2) code checks run, with numbers parsed into typed values (lakh and crore understood) and compared with the Facts Register by subject first, value second, so the AI never decides whether two numbers match; 3) AI checks run one rule per call through one adapter (Claude, Groq, Gemini in that order, whichever keys are set; the live site runs on Groq openai/gpt-oss-120b with Gemini 2.5 Flash as backup), every answer validated with Zod, a 12-second cap per call, a circuit breaker that skips a rate-limited provider, and an answer cache in Postgres; 4) a verifier in plain code drops any finding whose quote, rule or fact does not exist; 5) every fix is applied and re-checked before it is offered; 6) a fixed rule table routes by risk; 7) approval writes a receipt with a SHA-256 fingerprint.

Image analysis runs in the browser with no AI: OCR with self-hosted tesseract.js, dominant colours by quantisation, sRGB to CIELAB colour difference against the palette, WCAG contrast, and logo detection by masked normalised cross-correlation searched coarse-to-fine across sizes (0.97 on the real logo against 0.58 at best without it; threshold 0.70).

Hardest parts: making fixes safe (a fix that adds a new violation with no automatic fix is withdrawn); grounding every finding in code so an AI mistake cannot reach the user; the logo matcher; and keeping the demo usable on free AI tiers (cache, breaker, fallback to rules-only).

Measured on our own seeded test set, 40 held-out drafts: code checks alone, precision 100% (93–100%), recall 74% (63–83%); with AI checks on the live site, run twice with the cache off, precision 92% (83–96%), recall 98% (92–100%), all 17 hard phrasings caught, same result on 83% of drafts across the two runs. The numbers are optimistic because we wrote both the rules and the drafts.

Testing: 63 unit tests (including eight that swap in a deliberately wrong AI), CI on every push, a 20-step browser journey, a 46-step sweep of every page and control at desktop and phone sizes, and a 69-check API probe (bad input, wrong roles, cross-workspace access). The last three pass against the live site.

Open source used: supabase-js, groq-sdk, @google/genai, Anthropic SDK, Zod, mammoth, unpdf, tesseract.js, Vitest, Playwright. AI disclosure: Claude (Anthropic) was used to help write code during the build window.

## What changed from your original proposal, and why?

AI provider: planned on Claude only; built as one adapter (Claude, Groq, Gemini) so judges get AI checks on free tiers. The schema, verifier and tests are the same for every provider.

Sign-in: planned Supabase Auth with four roles; replaced by a private workspace per visitor and a role switcher, so judges can open the link directly. Role rules are still enforced on the server.

Image review: planned for Round 3; a first version ships now (palette, contrast, alt text, OCR, logo, cross-asset figures), because the brief names visual identity as part of the core workflow.

Guideline amendments drafted from dismissals: planned for Round 3; shipped now, because it reuses the rule-test gate we already had.

Writing-style libraries (alex, write-good, axe-core): replaced by our own Brand Kit rules, which carry test sentences, can be edited by the manager and cite their source.

Fix safety: planned to withdraw any fix that introduces an issue; now withdrawn only if the new issue has no automatic fix, because fixing a guarantee claim correctly raises a disclaimer requirement.

Hands-on tests with fellow students: planned for Round 2; not done. Moved to the start of Round 3. Build time went into image review and the measured evaluation.

Correction: our Round 1 PDF stated CCPA maximum penalties of "up to ₹10 lakh / ₹50 lakh". We could not confirm these amounts and have withdrawn them.

## What does NOT work yet?

No testing with real users yet. Usability has only been checked by us and by automated browser tests.

There is no sign-in. Roles are switched with the "Acting as" menu. A real deployment needs accounts and per-organisation database security.

The AI checks run on free tiers. Under heavy simultaneous use they can hit a rate limit; the review then finishes with code checks only, says so, and "Re-check" brings the AI checks back about a minute later.

The logo check matches the logo file itself. A redrawn, recoloured or stretched logo is reported as missing, and a reviewer has to dismiss that with a reason.

Photos are not judged: the app cannot tell whether a pictured student has given consent.

Cross-asset consistency compares a caption with its own creatives only, not separate documents in a campaign.

Brand-name spelling catches wrong capitals and spacing ("Preppath", "Prep Path"), not every misspelling.

OCR reads English text. Hindi text inside an image is not read reliably; Hindi in the caption is checked.

A code rule built from phrases matches those exact phrases; paraphrases need the AI checks. With AI off, hard paraphrases are missed (0 of 17 in our test set).

Penalty precedents are cited as reported in press coverage. We have not read the orders themselves.

## Improvement 1

Change impact. Today a manager can change a fact or amend a rule without knowing what it affects. In Round 3, changing or expiring a fact, or amending a rule, lists every open draft and every approved piece that used it, re-checks them, and marks approved pieces that no longer pass as needing re-approval. Each amended rule shows its dismissal rate before and after, so the manager can see whether the new wording worked. Test: change the value of fact F-3 and see every draft and approved piece that cited it listed, with approved ones marked for re-approval.

## Improvement 2

Governance at the source: an API and an MCP server for AI writing tools. A REST API with scoped keys and an MCP server exposing get_brief (the rules in force and the facts valid today) and check_draft (the same cited findings as the app). AI writing tools can then fetch the rules before writing and check a draft before handing it over, so content arrives already compliant and an AI tool never sees an expired or embargoed fact. Includes an in-app playground and an audit entry per call. Test: call check_draft from the playground and from an MCP client with a key, get the same findings as the app, and see the audit entry.

## Improvement 3

Campaign review with AI vision. Review a whole campaign together (caption, creatives, landing-page copy, PDF brochure) and flag figures, dates and claims that disagree across separate documents, extending today's caption-and-creative check. AI vision reads what OCR cannot: text in stylised type, and photos of people, which are flagged for a consent check against the student records. Test: upload a three-asset campaign with a price mismatch between the creative and the brochure and a student photo with no consent on record; both are found, cited and routed to compliance.

## Final confirmation

Tick all five boxes, and the declaration, only after you have:
- opened the live link, the repo link and the Drive PDF link in a private window
- confirmed the Drive link is "Anyone with the link" as Viewer
