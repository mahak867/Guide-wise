# Changelog

## Round 3 — The Finish (19–21 November 2026)

- **Change impact** (improvement 1): any fact or rule change re-checks every draft that used it; approved pieces that no longer pass go back for re-approval with the reason; Impact panel; dismissal rate before and after each rule amendment on Insights.
- **API and MCP server** (improvement 2): scoped, hashed, revocable keys; `get_brief` and `check_draft` over REST and MCP (official SDK); playground; audit trail; per-key rate limit.
- **Campaign review with AI vision** (improvement 3): up to 4 campaign documents reviewed with the caption and creatives; prices, figures, dates and promo codes compared across all of them; AI vision reads stylised text and flags people shown for a consent check; sample campaign.
- **Reliability:** Gemini backup repaired (the old default model was retired for new keys; minimal thinking so it answers in seconds); a rate-limited AI provider is skipped for a short while instead of making every review wait; numbers inside codes ("EARLY10") are no longer read as figures; vision errors are recorded.
- **Usability:** the home page links straight to the three new features; the sample campaign opens from one link; facts can be edited in place (Edit fills the form and keeps the owner and holding line), so a judge can try change impact without retyping a fact.
- **Accuracy:** an offer cap ("the first 50 students") is no longer compared with the student-count fact; a "$" that OCR reads in place of "₹" is treated as a price, so prices in creatives are still compared across the campaign.
- **Docs:** architecture, testing, known issues, roadmap, API reference, contributions.

## Round 2 — The Build (13–16 November 2026)

Review pipeline (redaction, code checks, AI checks, verifier, fix re-test, routing, receipt), Facts Register with dates, Brand Kit with rule tests, guide compiler, image checks (OCR, palette, contrast, alt text, logo), Insights and Guideline Health, hard cases, measured results, and the test suites. See `docs/round2/SUBMISSION.md`.
