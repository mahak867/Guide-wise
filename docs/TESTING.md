# Testing

Latest full run against the live site (20 Nov 2026): **238 unit tests, 21 of 21 journey steps, 59 of 59 sweep steps (axe-core: 0 serious or critical issues across 27 page checks), 206 of 206 API probe checks (including the race checks)**, the browser extension end to end, no server or page errors. Load test: 980 requests, 0 failed.

| Suite | Command | What it covers | Where it runs |
| --- | --- | --- | --- |
| Unit tests (Vitest) | `npm test` | Engine rules, fact matching, logo matching on real images, verifier, fix re-testing, a deliberately wrong AI (8 tests), provider fallback, change impact, campaign consistency, input validation, every rule's own test sentences, the Round 3 kit-coverage rules and fact successors (`kit-coverage.test.ts`) | Locally and in CI on every push |
| Evaluation | `npm run eval` | Precision and recall on 60 planted-error drafts (40 held out), with 95% Wilson intervals | Locally, CI, and live on the Results page |
| Browser journey (Playwright) | `BASE_URL=… npm run e2e` | The main journey end to end: review, edit a fix, accept all, replace an image, route, approve, record, PDF upload, channels, confidential, AI phrasings, Brand Kit export and import | Against the live site |
| UI sweep (Playwright) | `BASE_URL=… npm run e2e:sweep` | Every page at desktop and phone size (console errors, server errors, broken images, sideways scroll, broken links, axe-core accessibility) and every control: facts, palette, logo, rules of each type, hard cases, campaign, API page, request changes, approval, reset | Against the live site |
| API probe | `BASE_URL=… npm run e2e:api` | Every route with bad input, wrong roles and another visitor's workspace; change impact; API keys, REST and a real MCP client; campaign review with AI vision | Against the live site |
| Browser extension (Playwright) | `BASE_URL=… npm run e2e:extension` | Loads the unpacked extension in Chromium; a selection in a rich-text box and in a text box, pasted text, Copy fix, a browser page it cannot read, a wrong key, and that a web page still cannot call the API (CORS) | Against the live site |
| Load test | `BASE_URL=… VISITORS=20 npm run test:load` | Concurrent visitors, each with its own workspace, doing the full creator journey through the API plus the static pages; AI off. 20 and 50 at once: 980 requests, 0 failed ([LOAD_TEST.md](LOAD_TEST.md)) | Against the live site |

**Every day:** the API probe also runs against the live site from GitHub Actions every morning at 03:17 UTC (`.github/workflows/live.yml`), so a break in the site, the database or the AI service is reported while judging is under way.

## Accuracy and privacy evaluations

| Evaluation | Command | Result |
| --- | --- | --- |
| Text: 40 held-out planted-error drafts, code checks only | `npm run eval` | Precision 100% (93–100%), recall 74% (63–83%), 0 of 17 hard phrasings, 10 of 10 clean drafts left alone |
| Text: second brand (fictional insurer Suraksha Health, its own kit and facts), 40 held-out drafts, code checks only | `npm run eval` (or `npx tsx scripts/eval.ts --brand 2` / `--brand all`) | Precision 91% (76–97%), recall 79% (64–89%), 0 of 8 hard phrasings, 8 of 10 clean drafts left alone; both brands (80 drafts): precision 96% (90–99%), recall 76% (67–83%), 18 of 20 clean drafts left alone. AI checks not yet run on it |
| Text: same drafts, code and AI checks, run twice on the live site | `npx tsx scripts/eval.ts --ai` | Precision 92% (83–96%), recall 98% (92–100%), 17 of 17 hard phrasings, 83% same result on both runs, 10 of 10 clean drafts left alone (first run) |
| Images: 28 generated creatives with planted colour, contrast, logo (missing, small, crowded, recoloured, stretched) and text-size errors, and clean ones; the 8 with real text are read by the same OCR as the browser | `npm run eval:images` | 26 of 26 planted errors caught, 0 false alarms in 66 clean checks (Round 2 set: 20 of 20, 0 in 40) |
| Privacy: 8 pieces of personal data of 5 kinds (emails, mobile and landline numbers, Aadhaar, PAN, a card number) planted in 24 drafts, plus 3 confidential drafts with canary words | `npm run eval:privacy` | 0 leaks in 144 prompts sent to the AI |
| AI helpers, live: guide compiler on 10 passages with planted vague and contradictory text; rule amendment on 8 seeded rules with 16 real dismissals | `npm run eval:helpers` | Compiler: 16 of 17 expected rules, 15 of 18 proposals pass their own tests, 7 of 8 planted problems warned, 0 false warnings. Amendment: 7 of 8 accepted by the code gate, but the dismissed text is still flagged after all 7 |

**Clean drafts left alone:** about a quarter of the drafts (10 of the 40 held out) have nothing planted. The evaluation counts how many of them come back with no violation flagged, and with no finding at all (suggestions included): code checks only, 10 of 10 and 10 of 10, computed live; code and AI checks, 10 of 10 and 10 of 10, computed from the per-draft results stored in `src/lib/eval/ai-results.json`. It is printed by `npm run eval`, included as `cleanDrafts` in `scripts/eval-json.ts` output, shown on the Results page, and unit-tested in `tests/clean-drafts.test.ts`.

The image labels were corrected once: three backgrounds first labelled "colour only" also fail WCAG contrast with white text (measured separately: 4.23, 3.68 and 2.82 against the 4.5 minimum), so they are contrast errors too. The privacy evaluation found one real leak on its first run — landline numbers written as 080-4123-5678 were not masked — which was fixed before publishing.

## The AI helpers (`npm run eval:helpers`)

`scripts/eval-helpers.mjs` measures the guide compiler and the Guideline Health amendment helper on the live site, in a fresh random workspace, sequentially and once (about 30 AI calls). The compiler gets 10 short brand-guide passages with an answer key of expected rules and planted vague or contradictory passages; each proposal is saved as the Brand Kit page saves it and its own tests are run. The amendment helper gets 8 seeded rules, each with two drafts that trigger it, submitted and dismissed through the API by two reviewers with the reasons the review page offers; the amendment is drafted, put through the code gate, re-tested, and the dismissed text is checked again. Method, passages, every failure and the limitations: [`docs/EVAL_HELPERS.md`](EVAL_HELPERS.md); raw results: `src/lib/eval/helpers-results.json`. The run found two main gaps, a guide sentence with an email address losing its rule to the source check (redaction), and an amendment changing a rule's wording but not its check, so the text reviewers dismissed was still flagged. Both are now fixed in code, with unit tests in `tests/helpers.test.ts` (details under "Fixes after the first run" in `docs/EVAL_HELPERS.md`). **The helper numbers above are from before the fixes** and have not yet been re-measured.

## How the three Round 3 improvements are tested (live, in `e2e/api-probe.mjs`)

1. **Change impact:** an approved draft and an open draft both use fact F-3. Changing F-3's value lists both, sends the approved one back for re-approval with the reason, re-checks the open one, and saving the same change again reopens nothing.
2. **API and MCP:** a key is created (manager only); `get_brief` excludes the expired fact F-11 and the embargoed F-9; `check_draft` returns exactly the same findings as the app, through REST and through a real MCP client (official SDK, Streamable HTTP); a missing, wrong, revoked or under-scoped key is refused; every call appears in the audit trail; another workspace cannot see the keys.
3. **Campaign with AI vision:** a caption, a creative showing an illustrated student and a brochure with a different fee: the price mismatch is found on the brochure and cited, AI vision finds the person shown without naming anyone, and the draft routes to compliance.

## Reliability checks a judge will do

Bad input (malformed JSON, corrupt files, impossible dates, unsafe patterns, too-long text), empty states, refreshing, and repeating an action (saving the same fact change twice, accepting all twice, revoking a key twice) are all covered by the sweep and the probe. None returns a server error.

## The demo over the judging period

`tests/demo-dates.test.ts` runs the sample post with the clock set to 21 November 2026, 15 December 2026 and 15 February 2027: the embargoed fee (F-9) and the expired rating (F-11) are still flagged on every date. The whole unit suite was also run with the clock set to 28 November, 15 December and 15 January: all pass. This found that F-9's embargo ended on 1 December 2026, during judging; it now ends on 1 March 2027.

## Accessibility

**Automated, on every sweep run.** `e2e/sweep.mjs` injects axe-core (pinned at 4.10.3, a dev dependency, loaded with `require.resolve("axe-core/axe.min.js")`) into each page it already visits: 12 pages at desktop size and the 10 that do not need a draft ID at phone size (iPhone 13). A violation of impact "serious" or "critical" fails that page's step and names the rule and an example element; "moderate" and "minor" counts are printed on the step and the whole log is saved as `axe.json` next to the screenshots.

The first automated run (19 Nov 2026, live site) passed all 12 desktop pages (one moderate issue: the not-found review page has no top-level heading, `page-has-heading-one`) and **failed all 10 phone pages**, which the earlier manual run had not covered:

- `select-name` (critical, every page): the **Acting as** label is hidden on narrow screens with `display: none`, which also removes it as the role switcher's accessible name. Fixed: the select carries `aria-label="Acting as"`.
- `scrollable-region-focusable` (serious, Facts): the Facts Register and Student records tables scroll sideways on a phone but could not be reached by keyboard when the viewer is not the manager (no buttons inside). Fixed: both panels are focusable and named.

Both fixes were checked against the live pages by applying the same attributes in the browser and re-running axe: 0 serious or critical violations on all 10 phone pages. Since deployment the sweep passes on the live site; the 20 Nov run found 0 serious or critical issues across 27 page checks.

The earlier manual run (axe-core 4.10, 12 desktop pages) found two minor issues, both fixed: the approval record had no top-level heading before a draft was approved, and the facts table's actions column had no label.

## Fuzzing

`tests/fuzz.test.ts` (runs with the unit tests): 26 hostile inputs (12,000 emoji, Hindi, regex characters, HTML, null bytes, invisible characters, right-to-left overrides, prompt injection, broken surrogate pairs, an 11,000-letter word, repeated figures) through the whole engine, as a social post and as an ad: no crash, no finding quoting words not in the draft, slowest review 25 ms. Writing it as a test found one real problem: the email pattern took quadratic time on a long run of letters (about 1 s for 11,000), now bounded to the 64-character limit of an email address.

## Hands-on user test (20 Nov)

Two students outside the team used the live site with no instructions beyond the link. T.R. (2nd year CSE) used every feature in about 12 minutes, asked no questions, and liked the built-in demo and how simple it was. K.K. spent about 20 minutes on every tab and button, using his own draft instead of the demo; it took him a while to understand what was happening after a review ran. What we changed: New review now says, under Run review, what happens next (findings quote your words and the rule; fix or dismiss; submit to the right reviewer). A team member (who owns the UI) also walked through every screen in about 8 minutes; that is not counted. Two testers are not a study: the December pilot is where real marketers use it.

## Bug hunt (20 Nov)

A deliberate hunt for hidden faults on the live site (build 7d921e8), using it the way a judge would: repeated and racing actions, refresh and navigation, invalid input, empty states, phone size and the keyboard. Every check ran in its own fresh workspace; AI was off (`useAI: false` or a confidential draft) except where a page turns it on itself.

**What was tried.** Five or more identical API calls fired at once on every write route (fact, rule, key, reset, accept, accept all, dismiss, submit, approve as compliance and as brand); in the browser, a double-click on Run review, Accept all, Submit and Approve, two tabs on the same draft (compliance signs in one, the stale tab signs again; brand approves, the stale tab acts on the approved draft), reload in the middle of Run review, back and forward after approval, a review URL from another workspace, the approval record of an unapproved draft. Bodies of `null`, a list, a string, a number and malformed JSON on every POST route; 12,000 and 12,001 characters, 6,000 and 6,001 emoji, zero-width-only text, right-to-left overrides, HTML and script tags, a 100,000-character title, an unknown content type; fact dates (30 February, end before start, start equal to end, year 99999), huge and negative values; rule patterns (unclosed, nested repeats, overlapping choices, patterns that match everything or nothing); logos (SVG, garbage base64, a JPEG labelled PNG, over 300 KB); CSV with a byte-order mark, quoted commas and doubled quotes, empty cells, an unclosed quote, semicolons, CR-only line ends, 51 rows; the web page reader with a slow page, 3 and 4 redirects, a 404, JSON and an address without https://; API keys with the wrong scope, a lowercase "bearer", a duplicated scope; MCP with malformed JSON-RPC, an unknown method or tool, wrong argument types, a 2 MB argument, no Accept header. Every page at desktop and iPhone 13 size, fresh and with every fact and rule deleted, with the guided tour, dismiss form, edit-fix and edit-text forms open; the main journey by keyboard only. Console errors, page errors, network 4xx/5xx and page timings were recorded throughout. The hunt itself used throwaway scripts; every fault it found is now covered by a check anyone can re-run: the "Bug hunt" section of `e2e/api-probe.mjs` (for example "body null /api/drafts is a 400") and its "race:" checks, and the unit tests named below.

**What held up.** The browser side: a double-click never created a second draft, version, submission or approval (buttons are disabled while busy); the stale tab got a clear "already given the compliance sign-off" or "approved and locked" message; reload, back and forward kept the right state; another workspace's draft and an unapproved record say so; no sideways scroll or cut-off content on any page or open form at phone size; no console errors, hydration warnings or page errors (the only 4xx were the deliberate not-found pages); every page loaded in under 5 s. Accepting the same fix five times at once applied it once. CSV parsing, bulk limits, MCP errors, key scopes and the page reader's address checks all answered with clear 4xx messages.

**Found and fixed** (each with a unit test in `tests/bughunt.test.ts`, `tests/schemas.test.ts` or `tests/webpage.test.ts`, and a live check in `e2e/api-probe.mjs` under "Bug hunt"):

| Fault | Repro | Severity | Fix |
| --- | --- | --- | --- |
| Lost Brand Kit versions | 5 fact saves at once: version 1 → 3, not 6; rule saves at once returned versions 4, 5, 6, 6, 4 | data corruption | `bumpKit` is compare-and-set with retry (`src/lib/db.ts`) |
| Seeded approved post duplicated | 3 Reset demo calls at once left 3 approved copies | data corruption | the seeded draft has a fixed ID per workspace and is inserted once |
| Key limit bypassed | 13 key creations at once: 13 active keys (limit 10) | data corruption | the count is checked again after creating; a key past the 10th is deleted and refused |
| Server error on a non-object body | `null` to /api/drafts, /api/facts, /api/rules, /api/rules/R-12, /api/compile, /api/extract; `"x"`, `5` or `true` to /api/kit: 500 "Cannot read properties of null" | crash | `readBody` turns these into 400 "must be a JSON object" |
| Deleting nothing made a new version | DELETE /api/facts/NOPE: 200, kit version bumped, impact said `Fact undefined was deleted ("undefined")`; same for rules | misleading | 404, nothing changed |
| A rule pattern could stall reviews | `(a|a)*$` was accepted; it takes 6.6 s on 27 letters (exponential) | crash (stall) | `patternProblem` refuses a repeated choice whose options are not distinct plain words |
| Import skipped the page's rule checks | /api/kit/import accepted a term rule with no words and the pattern above | misleading | import applies `flagsNothing` and the pattern check |
| Logo that is not an image | `data:image/png;base64,notbase64!!!` saved through the API; every creative then reported the logo missing | misleading | `logoProblem` checks the PNG or WebP signature (page upload was already safe) |
| Students coached cleared silently | profile `students_coached` "abc" or "1e400" stored null, "-5" stored 0 | misleading | 400 unless a whole number of 0 or more |
| Draft fields not validated | content type `<script>` or an object stored; 100,000-character title stored; 20 zero-width spaces accepted as a draft | misleading | content type must be one of the five; title cut to 200; invisible characters do not count towards the 10 |
| Fact keywords as an object | `keywords: {a:1}` stored the keyword "[object Object]" | cosmetic | only strings and numbers are kept |
| Duplicate key scope | `["brief:read","brief:read"]` stored twice | cosmetic | scopes de-duplicated |
| Page reader timing | each redirect had its own 8 s (4 hops = 32 s, past the 30 s route limit); a page that stops sending half-way surfaced as a 500 | crash | one 8 s deadline for all hops and the body; a stalled body is a 400 "took too long" |
| Page reader text | a windows-1252 page was decoded as UTF-8; `example.com` (no https://) was refused | cosmetic | the server's charset is used; https:// is added to a bare address |

**Found later in the same hunt, fixed afterwards** (they were in files other work was changing at the time). Each state change on a draft is now a conditional update: approval moves the draft only from the review state that request saw, before the receipt is written; a compliance sign-off is claimed on the draft's last update; submit moves it only from the creator's state; a text save writes version N+1 only if the draft is still at version N; change impact sends a draft back only if it is still approved. The loser of a race gets a 409. Checked live by the probe's "race:" checks:

1. **Approve five times at once → several receipts** (data corruption). Low-risk draft in brand review, 5 concurrent `approve` as brand: 4 returned 200, 4 "approved" events (and receipts) for one draft. High-risk: 5 concurrent brand approvals after the compliance sign-off gave 2 "approved" events. The database trigger (migration 009) still stops approval with open violations; it does not stop a second receipt.
2. **Compliance signs off three times** (data corruption, misleading record). 5 concurrent compliance `approve` on a high-risk draft: 3 returned 200 and 3 `approved_partial` events were logged before the "already given" check saw any of them.
3. **Accept all twice at once → duplicate version numbers** (data corruption). 3 concurrent `accept_all`: all 200, versions list `2, 2, 2, 1` (three rows numbered 2). The text came out right.
4. **Submit three times at once** (cosmetic): 3 `submitted` events for one submission.
5. **`null` body to /api/drafts/[id]** (crash): 500 "Cannot read properties of null (reading 'action')". `readBody` from `src/lib/db.ts` fixes it in one line.
6. **Concurrent impact assessments** (not observed, by reading): `assessImpact` can run twice at once for two saves; each may log its own `reapproval_needed` event for the same draft.

Also noted, and fixed afterwards: an empty Brand Kit now says that nothing was checked (on the review page, in bulk check and in the API's `warning` and `rules_in_force`) instead of a plain "Ready for review"; the not-found review page has a heading and links back; promoting an already-enforced rule (or demoting an advisory one) changes nothing and makes no new Brand Kit version; the page reader names the type it got ("a PDF" or the content type) instead of always suggesting a PDF.
