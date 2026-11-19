# Threat model

What could go wrong, how Guidewise stops it, and the test that proves it. "Probe" is `e2e/api-probe.mjs`, which runs against the live site on every release and every morning (`.github/workflows/live.yml`). "Unit" is a Vitest file in `tests/`.

| # | Threat | How it is stopped | Proved by |
| --- | --- | --- | --- |
| T1 | One visitor reads or changes another visitor's drafts, rules, facts or API keys | Every query is scoped to the caller's workspace id on the server; browsers never receive database credentials | Probe: "other workspace cannot read / act on / approve the draft", "other workspace's list / kit / export does not include it", "another workspace cannot see these keys" |
| T2 | A content creator approves their own draft, changes rules or facts, or dismisses a critical finding | Roles are enforced on the server for every action | Probe: "creator cannot save rule / promote / save fact / delete fact / change kit / import / compile / approve", "brand cannot dismiss critical", "the brand reviewer cannot approve a high-risk draft" (journey) |
| T3 | A draft is approved with problems still open, or against rules that changed after it was checked | The approve action refuses while any violation is open; if the Brand Kit changed since the last check, the draft is checked again first and anything new blocks approval | Probe: "kit binding: approval re-checks against the new kit and refuses"; journey: dismiss with reasons, then approve |
| T4 | An approved piece silently stops being true when a fact or rule changes | Change impact re-checks every draft that used it and sends broken approvals back for re-approval | Probe: the six "impact:" checks; unit: `impact.test.ts`, `seed-approved.test.ts` |
| T5 | The AI invents a finding, a quote or a fact | The verifier drops any finding whose quote is not in the draft, image or document, or whose rule or fact does not exist; numbers are compared by code | Unit: `fake-ai.test.ts` (a deliberately wrong AI), `campaign-ai.test.ts` ("drops a quote that is in no document") |
| T6 | Prompt injection in a draft ("ignore all previous instructions") | One rule per call with the draft fenced as data; output must match a Zod schema; the verifier still applies | Unit: `fake-ai.test.ts`, `hardcases.test.ts` (prompt-injection hard case), `fuzz.test.ts` |
| T7 | Personal data or confidential text reaches an AI provider | Emails, phones (mobile and landline), Aadhaar, PAN and card numbers are masked in code first; confidential drafts are never sent | Unit: `privacy-eval.test.ts` (0 leaks in 144 prompts), `campaign-ai.test.ts` (documents masked; confidential campaign never sent) |
| T8 | The server is made to fetch an internal address (SSRF) through "read a web page" | http(s) on standard ports only; every resolved address and every redirect is checked and private, loopback, link-local and metadata ranges are refused; 8 s and 2 MB limits | Unit: `webpage.test.ts`; probe: "web page: cloud metadata address refused", "web page: localhost refused" |
| T9 | Hostile input crashes a review or hangs the server (ReDoS, huge input) | Inputs are validated with Zod; rule regexes are checked for catastrophic backtracking before saving; email patterns are bounded | Probe: "rule with catastrophic regex", "too long draft", bad JSON on every route; unit: `fuzz.test.ts` (26 inputs, slowest 25 ms) |
| T10 | Hidden characters smuggle a banned phrase past the checks | Invisible characters are flagged and removed by the fix, then the checks run again | Unit: `engine.test.ts`, `hardcases.test.ts` (hidden-characters hard case) |
| T11 | A stolen or over-powerful API key | Keys are shown once and stored as SHA-256; scopes limit each key; revocation is immediate; every call is audited; 30 calls a minute per key | Probe: "a wrong key is refused", "a key without the scope is refused", "a revoked key stops working at once", "every call is in the audit trail" |
| T12 | Clickjacking, script injection or content sniffing in the browser | Content-Security-Policy allowing only this site (plus the OCR worker), no framing, nosniff, strict referrer and permissions policies, HSTS | Probe: "security headers: …" |
| T13 | Tampering with an approved text after approval | The receipt stores the SHA-256 fingerprint of the exact approved text and the Brand Kit version; approved drafts are locked | Journey: "approval record opens"; the record page shows the fingerprint |
| T14 | The AI service is down or rate-limited during a review | Fallback chain (Groq, Groq's smaller model, Gemini), time caps, a circuit breaker; without AI the code checks and the whole workflow still run, and the review says so | Unit: `providers.test.ts`; the review page labels "Code checks only" |

## Not covered

- There is no sign-in: anyone with the link gets a private demo workspace and can switch roles with "Acting as". Production needs accounts and per-organisation row-level security (`docs/KNOWN_ISSUES.md`, item 1).
- The API rate limit is counted per server instance, so it is approximate (known issue 11).
- The web page reader checks a host's addresses before each request but does not pin the address it checked (known issue 14).
