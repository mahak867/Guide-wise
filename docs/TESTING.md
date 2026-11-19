# Testing

| Suite | Command | What it covers | Where it runs |
| --- | --- | --- | --- |
| Unit tests (Vitest) | `npm test` | Engine rules, fact matching, logo matching on real images, verifier, fix re-testing, a deliberately wrong AI (8 tests), provider fallback, change impact, campaign consistency, input validation, every rule's own test sentences | Locally and in CI on every push |
| Evaluation | `npm run eval` | Precision and recall on 60 planted-error drafts (40 held out), with 95% Wilson intervals | Locally, CI, and live on the Results page |
| Browser journey (Playwright) | `BASE_URL=… npm run e2e` | The main journey end to end: review, edit a fix, accept all, replace an image, route, approve, record, PDF upload, channels, confidential, AI phrasings, Brand Kit export and import | Against the live site |
| UI sweep (Playwright) | `BASE_URL=… npm run e2e:sweep` | Every page at desktop and phone size (console errors, server errors, broken images, sideways scroll, broken links) and every control: facts, palette, logo, rules of each type, hard cases, campaign, API page, request changes, approval, reset | Against the live site |
| API probe | `BASE_URL=… npm run e2e:api` | Every route with bad input, wrong roles and another visitor's workspace; change impact; API keys, REST and a real MCP client; campaign review with AI vision | Against the live site |

## How the three Round 3 improvements are tested (live, in `e2e/api-probe.mjs`)

1. **Change impact:** an approved draft and an open draft both use fact F-3. Changing F-3's value lists both, sends the approved one back for re-approval with the reason, re-checks the open one, and saving the same change again reopens nothing.
2. **API and MCP:** a key is created (manager only); `get_brief` excludes the expired fact F-11 and the embargoed F-9; `check_draft` returns exactly the same findings as the app, through REST and through a real MCP client (official SDK, Streamable HTTP); a missing, wrong, revoked or under-scoped key is refused; every call appears in the audit trail; another workspace cannot see the keys.
3. **Campaign with AI vision:** a caption, a creative showing an illustrated student and a brochure with a different fee: the price mismatch is found on the brochure and cited, AI vision finds the person shown without naming anyone, and the draft routes to compliance.

## Reliability checks a judge will do

Bad input (malformed JSON, corrupt files, impossible dates, unsafe patterns, too-long text), empty states, refreshing, and repeating an action (saving the same fact change twice, accepting all twice, revoking a key twice) are all covered by the sweep and the probe. None returns a server error.

## Fuzzing

Twenty-six hostile inputs (12,000 emoji, Hindi, regex characters, HTML, null bytes, invisible characters, repeated figures) through the whole engine, as a social post and as an ad: no crash, no finding quoting words not in the draft, slowest review 0.6 s.
