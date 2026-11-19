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

## MCP

Streamable HTTP at `https://guidewise-kohl.vercel.app/api/mcp`, built on the official MCP TypeScript SDK. Tools: `get_brief(content_type?)`, `check_draft(text, content_type?, use_ai?)`. Example client configuration:

```json
{ "mcpServers": { "guidewise": { "url": "https://guidewise-kohl.vercel.app/api/mcp", "headers": { "Authorization": "Bearer gw_your_key" } } } }
```
