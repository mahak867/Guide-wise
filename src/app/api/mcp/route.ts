import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { ApiError, audit, authorise, rateLimit, type ApiKey, type Scope } from "@/lib/apikeys";
import { checkDraft, getBrief } from "@/lib/governance";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// MCP server (Streamable HTTP, stateless) exposing get_brief and check_draft to AI writing tools.
// Connect with: URL https://guidewise-kohl.vercel.app/api/mcp, header Authorization: Bearer gw_…
function server(req: Request): McpServer {
  const s = new McpServer({ name: "guidewise", version: "1.0.0" });
  const guarded = async <T,>(scope: Scope, tool: string, run: (k: ApiKey) => Promise<T>, detail: (out: T) => Record<string, unknown>) => {
    const t = Date.now();
    let k: ApiKey | null = null;
    try {
      k = await authorise(req, scope);
      rateLimit(k.id);
      const out = await run(k);
      await audit(k, k.ws, "mcp", tool, 200, Date.now() - t, detail(out));
      return { content: [{ type: "text" as const, text: JSON.stringify(out, null, 2) }], structuredContent: out as Record<string, unknown> };
    } catch (e) {
      if (k) await audit(k, k.ws, "mcp", tool, e instanceof ApiError ? e.status : 500, Date.now() - t).catch(() => {});
      return { isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] };
    }
  };
  s.registerTool("get_brief", {
    title: "Get the brand brief",
    description: "Rules in force for a content type, and only the facts that are valid today, plus approved disclaimers and contacts. Call this before writing.",
    inputSchema: { content_type: z.enum(["social", "ad", "email", "landing", "document"]).optional().describe("Defaults to social") },
  }, async ({ content_type }) => guarded("brief:read", "get_brief", (k) => getBrief(k.ws, content_type), (o) => ({ rules: o.rules.length, facts: o.facts.length })));
  s.registerTool("check_draft", {
    title: "Check a draft",
    description: "Check marketing copy against the brand's approved rules and facts. Returns cited findings: the exact words, the rule broken, and a re-tested fix where one exists. Call this before handing a draft to a person.",
    inputSchema: {
      text: z.string().min(10).max(12000).describe("The draft text"),
      content_type: z.enum(["social", "ad", "email", "landing", "document"]).optional(),
      use_ai: z.boolean().optional().describe("Also run the AI checks (default true)"),
    },
  }, async (args) => guarded("draft:check", "check_draft", (k) => checkDraft(k.ws, args), (o) => ({ findings: o.summary.findings, violations: o.summary.violations })));
  return s;
}

async function handle(req: Request): Promise<Response> {
  if (!req.headers.get("authorization")) {
    return Response.json({ jsonrpc: "2.0", error: { code: -32001, message: "Send an API key as: Authorization: Bearer gw_… Create one on the Developers page." }, id: null }, { status: 401 });
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server(req).connect(transport);
  return transport.handleRequest(req);
}
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
