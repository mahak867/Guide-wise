# Testing

Latest full run against the live site (19 Nov 2026 build): **76 unit tests, 20 of 20 journey steps, 51 of 51 sweep steps, 93 of 93 API probe checks**, no server or page errors.

| Suite | Command | What it covers | Where it runs |
| --- | --- | --- | --- |
| Unit tests (Vitest) | `npm test` | Engine rules, fact matching, logo matching on real images, verifier, fix re-testing, a deliberately wrong AI (8 tests), provider fallback, change impact, campaign consistency, input validation, every rule's own test sentences | Locally and in CI on every push |
| Evaluation | `npm run eval` | Precision and recall on 60 planted-error drafts (40 held out), with 95% Wilson intervals | Locally, CI, and live on the Results page |
| Browser journey (Playwright) | `BASE_URL=… npm run e2e` | The main journey end to end: review, edit a fix, accept all, replace an image, route, approve, record, PDF upload, channels, confidential, AI phrasings, Brand Kit export and import | Against the live site |
| UI sweep (Playwright) | `BASE_URL=… npm run e2e:sweep` | Every page at desktop and phone size (console errors, server errors, broken images, sideways scroll, broken links) and every control: facts, palette, logo, rules of each type, hard cases, campaign, API page, request changes, approval, reset | Against the live site |
| API probe | `BASE_URL=… npm run e2e:api` | Every route with bad input, wrong roles and another visitor's workspace; change impact; API keys, REST and a real MCP client; campaign review with AI vision | Against the live site |

## Accuracy and privacy evaluations

| Evaluation | Command | Result |
| --- | --- | --- |
| Text: 40 held-out planted-error drafts, code checks only | `npm run eval` | Precision 100% (93–100%), recall 74% (63–83%), 0 of 17 hard phrasings |
| Text: same drafts, code and AI checks, run twice on the live site | `npx tsx scripts/eval.ts --ai` | Precision 92% (83–96%), recall 98% (92–100%), 17 of 17 hard phrasings, 83% same result on both runs |
| Images: 20 generated creatives with planted colour, contrast and logo errors, and clean ones | `npm run eval:images` | 20 of 20 planted errors caught, 0 false alarms in 40 clean checks |
| Privacy: 8 kinds of personal data planted in 24 drafts, plus 3 confidential drafts with canary words | `npm run eval:privacy` | 0 leaks in 144 prompts sent to the AI |

The image labels were corrected once: three backgrounds first labelled "colour only" also fail WCAG contrast with white text (measured separately: 4.23, 3.68 and 2.82 against the 4.5 minimum), so they are contrast errors too. The privacy evaluation found one real leak on its first run — landline numbers written as 080-4123-5678 were not masked — which was fixed before publishing.

## How the three Round 3 improvements are tested (live, in `e2e/api-probe.mjs`)

1. **Change impact:** an approved draft and an open draft both use fact F-3. Changing F-3's value lists both, sends the approved one back for re-approval with the reason, re-checks the open one, and saving the same change again reopens nothing.
2. **API and MCP:** a key is created (manager only); `get_brief` excludes the expired fact F-11 and the embargoed F-9; `check_draft` returns exactly the same findings as the app, through REST and through a real MCP client (official SDK, Streamable HTTP); a missing, wrong, revoked or under-scoped key is refused; every call appears in the audit trail; another workspace cannot see the keys.
3. **Campaign with AI vision:** a caption, a creative showing an illustrated student and a brochure with a different fee: the price mismatch is found on the brochure and cited, AI vision finds the person shown without naming anyone, and the draft routes to compliance.

## Reliability checks a judge will do

Bad input (malformed JSON, corrupt files, impossible dates, unsafe patterns, too-long text), empty states, refreshing, and repeating an action (saving the same fact change twice, accepting all twice, revoking a key twice) are all covered by the sweep and the probe. None returns a server error.

## Fuzzing

Twenty-six hostile inputs (12,000 emoji, Hindi, regex characters, HTML, null bytes, invisible characters, repeated figures) through the whole engine, as a social post and as an ad: no crash, no finding quoting words not in the draft, slowest review 0.6 s.
