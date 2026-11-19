# Known issues and limits

Stated plainly, with where each one lives in the code.

1. **No sign-in.** Roles are switched with "Acting as" so judges can use the link directly. Roles are enforced on the server and each visitor gets a private workspace (`src/lib/db.ts:21`, `wsOf`), but a real deployment needs accounts and per-organisation row-level security.
2. **Free AI tiers.** Heavy simultaneous use can hit rate limits. The review then finishes with code checks only and says so; "Re-check" brings the AI back about a minute later (`src/lib/engine/ai.ts:200`, three calls at a time).
3. **AI vision needs the AI service.** With no provider available, people in creatives are not detected and the review says so (`src/lib/engine/review.ts`, `visionError` in the stats).
4. **Logo check matches the logo file itself.** A redrawn, recoloured or heavily stretched logo is reported as missing; a reviewer dismisses it with a reason (`src/lib/logo.ts:112`).
5. **OCR reads English.** Hindi text inside an image is not read reliably by OCR; AI vision usually reads it. Hindi in the caption is checked (`src/lib/image.ts:85`).
6. **Brand-name spelling** catches wrong capitals and spacing at capital letters ("Preppath", "Prep Path"), not every misspelling (`src/lib/engine/code.ts:363`).
7. **Code-only recall is 74%.** Paraphrased claims ("your seat is assured") need the AI checks; with AI on, recall is 98% on our held-out set.
8. **Our test set was written by us.** Accuracy numbers are optimistic; real drafts from marketers would be harder.
9. **Change impact re-checks with code only.** AI findings on a re-checked draft are kept from its last AI review rather than re-run, to save quota (`src/lib/impact.ts`).
10. **Campaign documents and image text get the code checks only.** A PDF brochure is read as text and its images are not checked; the AI checks (paraphrased claims, tone) run on the caption, not on each document or on text read from a creative, to keep a review inside the free-tier limits (`src/lib/engine/review.ts:183`, `src/lib/engine/visual.ts:186`).
11. **API rate limit is per server instance.** 30 calls a minute per key, counted in memory, so it is approximate across instances (`src/lib/apikeys.ts:31`).
12. **Penalty precedents** are cited as reported in press coverage; we have not read the orders themselves.
13. **No hands-on tests with real users yet.** At Round 2 we moved hands-on tests with students to Round 3; they had not been run when this was written. Usability rests on our own browser tests at desktop and phone sizes. The December pilot on the roadmap is where real marketers use it.
