# Measuring the two AI helpers

Guidewise has two AI helpers besides the review itself: the **guide compiler** on the Brand Kit page, which turns pasted brand-guide text into proposed rules with test sentences and warns about vague or contradictory passages, and the **rule-amendment helper** on the Insights page (Guideline Health), which drafts clearer wording and new test sentences for a rule that reviewers keep dismissing. This page measures both on the live site, once, with an answer key written before the run.

- **Run:** 19 November 2026, 21:20 UTC, against https://guidewise-kohl.vercel.app
- **AI:** Groq `openai/gpt-oss-120b` (fallbacks: Groq `openai/gpt-oss-20b`, then Gemini `gemini-3.5-flash-lite`)
- **Command:** `npm run eval:helpers` (`scripts/eval-helpers.mjs`; `BASE_URL` to point it elsewhere, `--dry` to check the amendment drafts without any AI call)
- **Raw results:** `src/lib/eval/helpers-results.json` (every proposal, warning, test result and amendment)
- **Cost:** one run, sequential, 2.5 s pauses; 26 AI calls counted (10 compiles, 8 amendment drafts, 8 for judgment-rule tests), plus a few re-runs of judgment-rule tests during the code gate

Each part ran in its own fresh workspace (a random UUID in `x-workspace`, role `manager`), so nothing else touched the rules.

## Results

| Guide compiler, 10 passages | Result |
| --- | --- |
| Expected rules proposed | **16 of 17 (94%)** |
| Proposed rules that pass their own test sentences | **15 of 18 (83%)** |
| Planted problems warned about | **7 of 8 (88%)**: vague 5 of 5, contradictions 2 of 3 |
| False warnings (a warning on a passage we did not plant) | **0 of 8 warnings** |
| Rules made from a planted problem passage | 2 (both sides of the missed contradiction) |
| Proposals dropped by the "no source, no rule" check | 1 (the contact rule; see below) |

| Rule amendment, 8 seeded rules, 16 dismissals | Result |
| --- | --- |
| Amendments drafted | 8 of 8 |
| Amendments whose two example sentences behave as labelled when code re-runs them | **7 of 8 (88%)** |
| Amendments accepted by the code gate (every test, old and new, passes) | **7 of 8 (88%)** |
| Accepted amendments that pass an independent re-run of their tests afterwards | 7 of 7 |
| Amendments that actually added two new tests | 5 of 8 (3 returned the rule's existing tests word for word, so nothing was added) |
| Accepted amendments after which the dismissed text is **still flagged** | **7 of 7** |

The last row matters most and is explained under Limitations.

## Method: guide compiler

Each passage was sent to `POST /api/compile`. Each proposed rule was then saved exactly as the Brand Kit page's **Add as advisory** button saves it (`POST /api/rules`, with the proposal's flag and pass sentences as its tests) and its tests were run (`POST /api/rules/:id` with `action: "test"`): code rules by code, judgment rules by the AI judge.

**Scoring.** An expected rule counts as proposed when a proposal quotes the sentence it comes from (distinctive words from that sentence appear in the proposal's `source_passage`) or, for a term rule, lists the banned word. A planted problem counts as warned when a warning quotes it (either side, for a contradiction). A warning that quotes none of the planted passages is a false warning. "Passes its own tests" means the rule's check flags its flag sentence and passes its pass sentence; a proposal that cannot be saved counts as not passing.

**Passages and answer key** (written before the run):

| # | Passage | Expected rules | Planted problems |
| --- | --- | --- | --- |
| P1 | Call our teachers mentors, never tutors. Write "online classes", not "e-learning". Never describe our fees as cheap; say affordable. | 3 terms | none |
| P2 | Never promise a guaranteed rank or a guaranteed seat. Be professional where appropriate. Any post that mentions results must end with: Past results do not guarantee future selection. | no guarantees; required disclaimer | vague: "professional where appropriate" |
| P3 | Spell the brand name as BrightPath, one word, never Bright Path. Always use emoji in Instagram captions to feel friendly. Never use emoji in any post. | brand name | contradiction: emoji |
| P4 | Only publish the approved admissions contacts: admissions@brightpath.in and 1800 123 4567. Never share a teacher's personal phone number or email. Keep it engaging. | approved contacts | vague: "keep it engaging" |
| P5 | Do not use countdowns or phrases like "last chance" or "only a few seats left". Give the real start date instead. Do not use more than one exclamation mark in a sentence. | false urgency; exclamation marks | none |
| P6 | Headlines must be under eight words. Headlines should be long and descriptive, at least twelve words, so they rank in search. Write numbers as digits, not words. | numbers as digits | contradiction: headline length |
| P7 | Do not call students weak or slow learners; say students who need more support. Address the reader as "you". Avoid "hey guys"; write "hi everyone". | 2 terms; second person | none |
| P8 | Do not call us the best or number one coaching institute unless an approved fact supports it. Use a modern, premium feel. Mention the fee only with the line: Fees are subject to the published fee policy. | superlatives; fee disclaimer | vague: "modern, premium feel" |
| P9 | Content should resonate with our audience. Try to sound on-brand at all times. Never use the word "revolutionary" about our courses. | banned word | vague: two passages |
| P10 | Write every post in English only. Posts for Hindi-speaking parents must be written in Hindi. Never mention a competitor by name. | no competitor names | contradiction: language |

**What failed, case by case**

- **P4, contact rule missing.** The API dropped one proposal because its quoted source was not in the guide. The most likely cause: the guide is redacted before it reaches the AI (the email address becomes a placeholder), so the AI quotes the placeholder and the source check, which compares against the original text, rejects it. Any guide passage that contains an email address or phone number can lose its rule this way. Not fixed in this change.
- **P5, exclamation-mark rule fails its tests.** It was proposed as category `pattern` with `avoid: ["!!"]`, but the Brand Kit page only carries `avoid` over for `term` rules, so the saved rule has no pattern and flags nothing. A real gap between the compiler's output and the page that saves it. The test gate kept it from being enforced.
- **P8, fee disclaimer fails its tests.** Proposed as a term rule that bans the words "fee" and "fees", so its own pass sentence ("Fees are subject to the published fee policy.") is flagged. Required disclaimers do not fit the compiler's four categories (term, pattern, tone, claim). The test gate caught it.
- **P10, competitor rule cannot be saved.** Proposed as a term rule with an empty banned word; input validation refused it.
- **P10, contradiction missed.** "English only" and "must be written in Hindi" were not warned about; each became its own tone rule, and both pass their own tests, so a manager could enforce two rules that contradict each other.

**Passing is not the same as right.** Some rules that pass their own tests are broader than the guide: "numbers as digits" bans the words one to ten (so "one of our mentors" would be flagged), and the superlatives rule bans "best" outright and drops "unless an approved fact supports it". The manager reviews every proposal and each starts as advisory, but these numbers do not measure rule quality beyond the rule's own two sentences.

## Method: rule amendment

For each of 8 seeded demo rules we wrote two short drafts in which the rule's finding is a plausible over-reach (for example "Cheap tricks do not crack JEE" for the "affordable, not cheap" rule, or "Read the NCERT textbook" for the capitals rule). Each draft was created with code checks only, submitted, and the rule's finding dismissed with a reason the review page offers ("The rule is unclear", "The rule does not apply to this content", "The flag is wrong", "Approved exception"): one by the brand reviewer and one by the compliance reviewer, so each rule had two dismissals from two people. Then:

1. `amend_draft`: the AI drafts new wording and two example sentences; code runs every test (old and new) on the amended rule.
2. `amend_apply` with that proposal: the code gate saves it only if every test passes.
3. `test`: the saved rule's tests are run again, independently.
4. The first dismissed text is submitted as a new draft, to see whether the rule still flags it.

| Rule | Dismissed text (example) | Gate | Notes |
| --- | --- | --- | --- |
| TERM-2 "affordable", not "cheap" | Cheap tricks do not crack JEE. | accepted | Wording now bans "cheap" "regardless of context": clearer, but the reviewers' point is not taken up |
| TERM-4 "adaptive practice", not "AI-powered" | Our exam hall bans AI-powered gadgets | accepted | Wording limits the rule to describing the product; returned the existing tests, so no tests added |
| STY-CAPS no capitals for emphasis | Read the NCERT textbook | accepted | Wording now allows NCERT, but the check's allow list is unchanged, so NCERT is still flagged |
| INC-1 inclusive language | We never call anyone weak students | accepted | Wording hardened; existing tests returned, none added |
| R-10 no false urgency | No need to hurry: admissions stay open | accepted | Wording ties the rule to false urgency; the "hurry" pattern still fires |
| T-2 confident, never hype | Happy Diwali!! Classes resume | accepted | Wording hardened; existing tests returned, none added |
| R-DISC results need the disclaimer | Weekly tests show your rank in the batch | **refused** | Wording broadened (the opposite of what the dismissals asked); its new flag sentence has none of the words the check looks for, so the check passes it and the gate refused the amendment |
| R-08 superlatives need a fact | How to choose the best coaching institute | accepted | Adds "leading" to the wording; dismissals not addressed |

## Limitations

- **The helper changes wording, not the check.** For code rules, and for the code patterns inside judgment rules, an amendment changes only the description, guidance and tests. In 7 of 7 accepted amendments the exact text reviewers dismissed was still flagged afterwards, and in 3 (TERM-4, STY-CAPS, R-10) the new wording says that text is allowed while the check still flags it. So the helper makes a rule easier to read, but it does not yet stop the false flags that triggered it. The gate proves the tests pass; it does not prove the wording and the check agree.
- **The tests an amendment adds are easy.** The AI writes both example sentences and the gate checks them against the same rule, so "7 of 8 accepted" mainly shows the examples are consistent with the existing check. Three amendments added no tests at all.
- **Small sets, one run.** 10 passages and 8 rules, run once; with numbers this small, one case moves a percentage by 6 to 12 points. The AI is not deterministic, so a second run can differ.
- **We wrote the passages, the key and the drafts**, and the scoring by quoted passage is lenient: a proposal counts as found when it quotes the right sentence, even if its category is poor (the fee disclaimer above counts as found).
- **No comparison with other tools.** Other teams publish figures for their own helpers on their own sets; these numbers are not comparable with those.
- Judgment-rule tests are scored by the same AI service that proposed the rule.
