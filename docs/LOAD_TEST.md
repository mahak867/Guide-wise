# Load test

**Result:** two runs against the live site on 19 November 2026 sent 980 requests in total, from 70 simulated visitors who each did the full review journey. None failed: every response was a 200, and all 770 response checks passed.

| Run | Visitors at once | Requests | Failed | Throughput | p50 | p95 | Max | Journeys completed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 (21:13:34 UTC) | 20 | 280 | 0 | 33.5 req/s | 393 ms | 2,868 ms | 3,075 ms | 20 of 20 (median 8.2 s) |
| 2 (21:13:46 UTC) | 50 | 700 | 0 | 98.4 req/s | 369 ms | 1,463 ms | 1,724 ms | 50 of 50 (median 6.8 s) |

Command: `BASE_URL=https://guidewise-kohl.vercel.app VISITORS=20 npm run test:load`, then the same with `VISITORS=50`. The script is `scripts/load-test.mjs`.

## Method

- **Concurrent visitors.** All visitors in a run start at the same moment. Each one makes its requests in order, as a person would, so a run of 50 has up to 50 requests in flight at once.
- **One workspace per visitor.** Each visitor sends its own `x-workspace` header (`load-` followed by a random UUID). Its first API call therefore creates and seeds a new workspace (the Brand Kit, the rules, the facts and the approved demo post), which is the heaviest thing a new visitor does. No visitor shares data with another, so the runs also exercise workspace isolation under concurrency.
- **The journey, 14 requests per visitor:**
  1. `GET /` (the home page)
  2. `GET /api/state` (Brand Kit, rules and facts; seeds the new workspace)
  3. `GET /api/drafts`
  4. `GET /review/new`
  5. `POST /api/drafts` with a short social post containing three planted problems and `"useAI": false`. This creates the draft, saves version 1 and runs the code checks.
  6. `GET /api/drafts/:id` (the findings, events, versions and receipt)
  7. `POST /api/drafts/:id` with `accept`, on the first open finding that has a text fix. The text is rewritten, saved as a new version and checked again.
  8. `POST /api/drafts/:id` with `submit`. The checks run again and the draft is routed by risk tier.
  9. `GET /api/drafts/:id`, to confirm that the draft went to brand or compliance review and that the fix is recorded as accepted
  10. `GET /api/insights`
  11. `GET /facts`
  12. `GET /api/eval?split=test` (the data behind the Results page: the 40-draft held-out evaluation, re-run live)
  13. `GET /sample-landing.html`
  14. `GET /api/health` (includes a one-row database read)
- **What counts as a failure.** A request fails on a network error, on a timeout (60 s), or on any status outside 2xx where 2xx was expected. Each response is also checked for content, separately from its status: for example, the state has rules and facts, the draft has a fixable finding, the submitted draft is routed, and the health check's database read succeeded. There were 11 such checks per visitor.
- **Latency** runs from sending the request to reading the full response body. It is measured at the load generator, so it includes the network path (below). Percentiles are nearest-rank.
- **Request budget.** A 1-visitor trial run (14 requests, all 200) came before the two runs, so the session sent 994 requests in all.

## Per endpoint

### Run 1: 20 visitors

| Endpoint | Requests | Failed | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| GET / | 20 | 0 | 489 | 569 | 649 |
| GET /api/state (seeds the workspace) | 20 | 0 | 2,887 | 3,038 | 3,075 |
| GET /api/drafts | 20 | 0 | 969 | 1,034 | 1,046 |
| GET /review/new | 20 | 0 | 59 | 124 | 212 |
| POST /api/drafts | 20 | 0 | 580 | 697 | 722 |
| GET /api/drafts/:id | 40 | 0 | 318 | 381 | 432 |
| POST /api/drafts/:id accept | 20 | 0 | 580 | 661 | 846 |
| POST /api/drafts/:id submit | 20 | 0 | 479 | 528 | 534 |
| GET /api/insights | 20 | 0 | 429 | 518 | 597 |
| GET /facts | 20 | 0 | 258 | 376 | 381 |
| GET /api/eval?split=test | 20 | 0 | 363 | 377 | 406 |
| GET /sample-landing.html | 20 | 0 | 41 | 58 | 145 |
| GET /api/health | 20 | 0 | 274 | 322 | 451 |
| **All** | **280** | **0** | **393** | **2,868** | **3,075** |

### Run 2: 50 visitors

| Endpoint | Requests | Failed | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| GET / | 50 | 0 | 462 | 491 | 555 |
| GET /api/state (seeds the workspace) | 50 | 0 | 1,513 | 1,666 | 1,724 |
| GET /api/drafts | 50 | 0 | 301 | 414 | 717 |
| GET /review/new | 50 | 0 | 55 | 112 | 135 |
| POST /api/drafts | 50 | 0 | 837 | 950 | 1,008 |
| GET /api/drafts/:id | 100 | 0 | 371 | 482 | 890 |
| POST /api/drafts/:id accept | 50 | 0 | 1,030 | 1,163 | 1,212 |
| POST /api/drafts/:id submit | 50 | 0 | 648 | 932 | 1,092 |
| GET /api/insights | 50 | 0 | 443 | 570 | 590 |
| GET /facts | 50 | 0 | 51 | 205 | 224 |
| GET /api/eval?split=test | 50 | 0 | 265 | 334 | 428 |
| GET /sample-landing.html | 50 | 0 | 45 | 67 | 173 |
| GET /api/health | 50 | 0 | 269 | 330 | 380 |
| **All** | **700** | **0** | **369** | **1,463** | **1,724** |

## Reading the numbers

- **The first call in a new workspace is the slow one.** `GET /api/state` writes the whole seed: the kit, every rule, every fact, and the approved demo post with its version, receipt and event. This happens once per visitor. A returning visitor reads only.
- **Run 1 was slower than run 2,** even though it had fewer visitors. Before run 1, the site had been idle for about 90 minutes, so run 1 started on cold functions. Its seeding requests (p50 2.9 s) and its first drafts list (p50 1.0 s) include that start-up. Run 2 came 12 seconds later on warm functions, and the same calls took 1.5 s and 0.3 s. Throughput is total requests divided by wall time. It is higher in run 2 because there were more visitors and the functions were warm, not because the site was idle.
- **Writes slow down under concurrency, but only moderately.** From 20 to 50 visitors, accepting a fix (which saves a version and re-runs the checks) went from a p50 of 580 ms to 1,030 ms, and creating a draft went from 580 ms to 837 ms. Reads stayed flat, at about 300 to 450 ms.
- **Static pages** (`/review/new`, `/facts`, `/sample-landing.html`) come from Vercel's CDN in 40 to 60 ms. `/` takes about 460 ms because it is rendered on the server.

## Context: the free tier

- **Vercel**, Hobby plan. The serverless functions run in one region, Mumbai (`bom1`, set in `vercel.json`), so that they sit next to the database and the users. Functions scale out on their own. Cold starts are included in run 1 as measured.
- **Supabase**, free tier: one shared Postgres instance, reached through its HTTP API (PostgREST). Every API request above makes between one and about a dozen database round trips. At 50 concurrent visitors, the database answered every one of them with no errors, no timeouts and no connection exhaustion.
- **Network path.** The load generator ran in a cloud sandbox outside India, and every request passed through that sandbox's outbound HTTPS proxy, all from one IP address. The ~250 ms floor on the API calls is mostly round-trip time to Mumbai plus the proxy, not server time. A visitor in India would see lower numbers.

## What was and was not exercised

**Exercised:** page rendering; workspace creation and seeding; listing, creating and reading drafts; the code checks (claims, facts, terms, contacts, disclaimers, risk tier) on every create, accept and submit; versioning; the event log; routing; insights; the live evaluation; the health check; and Postgres reads and writes on the free tier. Every visitor's work was confirmed by reading it back.

**Not exercised, on purpose:**

- **AI checks.** Every draft was created with `"useAI": false`, and `/api/health` was called without `?ai=1`. The AI checks run on free tiers (Groq, then Gemini as a backup), with per-minute and per-day limits shared by every visitor to the live site. Seventy AI reviews in a few seconds would have used up the quota that judges need, and the result would have measured the provider's rate limits, not Guidewise. When a provider is rate-limited, the app already skips it for a while and falls back to code checks only, marking the review as partial (see `docs/ARCHITECTURE.md`). The time to run the AI checks is reported by `/api/health?ai=1` and by `scripts/eval.ts --ai`, not here.
- **Approval.** The journey is the creator's, and approval needs a second role and a dismissal step. Approval is tested for correctness in `e2e/api-probe.mjs`.
- **File and web-page extraction** (`/api/extract`), **image analysis**, the **REST and MCP API** (`/api/v1/*`, `/api/mcp`, rate-limited per key) and **Brand Kit edits.** All of these are tested for correctness in the API probe and the UI sweep, not for load.
- **Sustained load.** Each run is one burst of journeys lasting under 10 seconds, not a soak test. The runs were kept small, about 1,000 requests in total, so as not to be a burden on a free-tier site that others were using during judging.

## Failures

None. All 980 requests returned 200, and all 770 content checks passed.

## Data left behind

Each run creates one workspace per visitor (`load-<uuid>`), holding the seed data plus one submitted draft. The app has no endpoint for deleting a workspace, so the 71 workspaces from these runs (including the trial run's) stay in the database. They are invisible to every other visitor, because each workspace is isolated.
