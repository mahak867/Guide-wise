# API and MCP reference

Create a key on the **API** page (brand manager only). The key is shown once; only its SHA-256 fingerprint is stored. Send it as `Authorization: Bearer gw_…`.

| Scope | Allows |
| --- | --- |
| `brief:read` | `GET /api/v1/brief` and the MCP tool `get_brief` |
| `draft:check` | `POST /api/v1/check` and the MCP tool `check_draft` |

Limits: 30 calls a minute per key; draft text 10–12,000 characters. Every call, successful or not, is recorded in the audit trail on the API page.

## REST

```bash
curl -H "Authorization: Bearer $GW_KEY" "https://guidewise-kohl.vercel.app/api/v1/brief?content_type=ad"

curl -X POST -H "Authorization: Bearer $GW_KEY" -H "content-type: application/json" \
  -d '{"text":"100% selection guaranteed!","content_type":"social","use_ai":true}' \
  https://guidewise-kohl.vercel.app/api/v1/check
```

`brief` returns the rules in force for the content type, **only the facts valid today** (never expired or embargoed ones), disclaimers, contacts and palette. `check` returns `verdict` (`fix_before_publishing` or `ready_for_review`), a summary, and each finding: `rule_id`, `severity`, `level`, `quote` (exact words), `message`, `fix` (re-tested) and the rule text — the same findings the app shows.

Errors: `400` bad input, `401` missing, wrong or revoked key, `403` missing scope, `429` rate limit.

## Shared approval records (public)

```bash
curl https://guidewise-kohl.vercel.app/api/share/<token>
```

No key or workspace header: the 43-character token from a read-only share link (`/r/<token>`, made on an approved draft's approval record) is the only credential. Returns `{ record }` with `title`, `content_type`, `approved_text`, `fingerprint` (SHA-256 of the approved text), `approved_at`, `approvers` (name, role, time), `sign_off`, `risk_tier`, `kit_version`, `draft_version`, `findings` (rule, words, fix, outcome, by), `exceptions` (rule, words, end date, granted by), `checks` (ran or skipped), `still_approved`, `shared_at` and `expires_at`. Nothing identifies the workspace. Errors: `404` unknown, expired or revoked link (all alike); `429` more than 30 look-ups a minute from one address. Responses are `no-store` and `X-Robots-Tag: noindex`.

Inside the app, `POST /api/drafts/<id>` with `{"action":"share"}` creates a link (approved drafts only, else `409`) and returns `url` and `expires_at`; `{"action":"unshare","share_id":<id>}` revokes one (reviewers and the brand manager only, else `403`); `GET /api/drafts/<id>` lists the active links as `shares` (never tokens or hashes).

## Browser extension

"Check with Guidewise" ([`extension/`](../extension/README.md), Chrome Manifest V3) checks a draft where it is written: select text in LinkedIn, Gmail, X or any page, click the toolbar button, and the popup calls `POST /api/v1/check` with a `draft:check` key and shows the verdict and each finding with a Copy fix button. Install: `chrome://extensions` → Developer mode → Load unpacked → the `extension` folder. It reads the page only when clicked (`activeTab` + `scripting`), has host access to the Guidewise site only, and keeps the key in `chrome.storage.local`. No CORS change was needed: Chrome exempts an extension page's requests to its host permissions from CORS, so the API still sends no `Access-Control-Allow-Origin` header and web pages cannot call it with a key. A bookmarklet is not offered, because it would run under the CSP of the page it is used on.

## MCP

Streamable HTTP at `https://guidewise-kohl.vercel.app/api/mcp`, built on the official MCP TypeScript SDK. Tools: `get_brief(content_type?)`, `check_draft(text, content_type?, use_ai?)`. Example client configuration (for a client that reads remote servers with headers from JSON, such as Cursor):

```json
{ "mcpServers": { "guidewise": { "url": "https://guidewise-kohl.vercel.app/api/mcp", "headers": { "Authorization": "Bearer gw_your_key" } } } }
```

Claude Code:

```bash
claude mcp add --transport http guidewise https://guidewise-kohl.vercel.app/api/mcp --header "Authorization: Bearer gw_your_key"
```
