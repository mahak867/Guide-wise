# Architecture

Guidewise is one Next.js 16 application (TypeScript, App Router) deployed on Vercel in Mumbai (`bom1`), next to its Supabase Postgres database. The pages and the API live in the same codebase.

```
Browser (Next.js pages)                         Server (Next.js route handlers, Vercel bom1)                 Services
──────────────────────                          ─────────────────────────────────────────────                ────────
New review ─ text, DOCX/PDF, images, ──────────► POST /api/drafts ─► workflow.runReview ─► engine/review ──► Groq · Gemini · Claude
  campaign documents                                                                                      (one adapter, fallback)
  image.ts: OCR (tesseract.js), colours,                                                                ──► Supabase Postgres
  logo match (logo.ts) — all in the browser    /api/drafts/[id]   accept · dismiss · edit · images ·         (every table scoped by
Review page ─ findings, fixes, approval ───────►                   assets · submit · approve · …            workspace)
Brand Kit · Facts · Insights · Results ───────► /api/rules · /api/facts · /api/kit · /api/insights
                                                 └─ impact.assessImpact on every fact or rule change
API page ─ keys, playground, audit ───────────► /api/keys ·  /api/v1/brief · /api/v1/check · /api/mcp (MCP, Streamable HTTP)
AI writing tools (MCP clients, scripts) ──────►            └─ governance.getBrief / checkDraft (same engine as the app)
```

## The review pipeline (`src/lib/engine/review.ts`)

1. **Redact** (`redact.ts`): emails, phone numbers, Aadhaar, PAN and card numbers are replaced with placeholders before any AI call. A draft marked confidential is never sent to AI at all.
2. **Code checks** (`code.ts`): preferred terms, banned phrases, approved contacts, student results, disclaimers, brand-name spelling, capitals, length, sentence length, inclusive wording, hidden characters, and every figure compared with the Facts Register (subject first, value second; lakh and crore understood).
3. **AI checks** (`ai.ts`): one judgment rule per call; a rule that returns a finding is asked a second time, and disagreement downgrades the finding to a suggestion. Every answer must pass a Zod schema.
4. **AI vision** (`ai.ts` `readCreative`): each creative is read once (cached by image hash) for text OCR missed and for people shown. It never identifies anyone.
5. **Campaign** (`consistency.ts`): prices, figures, dates and promo codes compared across the caption, every creative and every campaign document; every text rule runs on each document.
6. **Verifier** (`verify.ts`): plain code drops any finding whose quoted words, rule or fact does not exist — in the draft, the image (OCR or vision text) or the document it cites.
7. **Fix re-test**: every fix is applied and checked again; a fix that introduces a problem with no automatic fix is withdrawn; locked phrases cannot be removed.
8. **Risk routing**: a fixed rule table sends outcome claims, regulated content, mismatched prices and people shown to compliance; the rest to the brand reviewer.
9. **Approval receipt**: SHA-256 fingerprint of the approved text, Brand Kit version, every finding and how it was resolved, and the approver.

## Round 3 additions

- **Change impact** (`src/lib/impact.ts`): after any fact or rule change, every draft that used it (`factsUsed`: by value, by subject, by named student; or a finding that cites it) is re-checked against the new Brand Kit. An approved piece that now fails is moved back to review with the reason (`drafts.impact`). The result is shown in the Impact panel and logged (`events.action = impact_assessed`).
- **API and MCP** (`src/lib/governance.ts`, `src/lib/apikeys.ts`, `src/app/api/v1/*`, `src/app/api/mcp`): keys are shown once and stored as SHA-256; scopes `brief:read` and `draft:check`; 30 calls a minute per key; every call is audited (`events.action = api_call`). The MCP server uses the official TypeScript SDK (`WebStandardStreamableHTTPServerTransport`, stateless). `get_brief` returns only facts valid today.
- **Campaign review with AI vision**: `drafts.assets` holds up to 4 documents; `DraftImage.vision` stores what vision read.

## AI providers (`src/lib/engine/ai.ts`)

Claude, Groq and Gemini are tried in that order, whichever keys are set (the live site: Groq `openai/gpt-oss-120b`, then Gemini `gemini-3.5-flash-lite`). Images go to Gemini first. Each call has a time cap (12 s for text, 25 s for images); a provider that is rate-limited or slow is rested for 30–60 s so later calls do not wait on it; answers are cached in Postgres (`ai_cache`). With no provider, the code checks and the whole workflow still run, and the app says so.

## Data (`supabase/migrations/001`–`008`)

`kit`, `rules`, `facts`, `drafts`, `findings`, `events`, `versions`, `receipts`, `ai_cache`, `api_keys`. Every table carries a workspace id; each visitor gets a random workspace, so judges never see each other's work. Browsers never receive database credentials — every read and write goes through the API, which enforces roles.
