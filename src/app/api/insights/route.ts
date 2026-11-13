import { db, fail, loadKit, must, wsOf } from "@/lib/db";

// Insights for the brand manager: which rules fire most, which get dismissed and why, and which facts are about to expire.
export async function GET(req: Request) {
  try {
    const ws = wsOf(req);
    const { rules, facts } = await loadKit(ws);
    const d = db();
    const drafts = must(await d.from("drafts").select("id,status").eq("ws", ws)) as { id: string; status: string }[];
    const ids = drafts.map((x) => x.id);
    const findings = ids.length
      ? (must(await d.from("findings").select("rule_id,state,dismiss_reason,resolved_by,draft_id").in("draft_id", ids)) as { rule_id: string; state: string; dismiss_reason: string | null; resolved_by: string | null; draft_id: string }[])
      : [];
    const perRule = rules.map((r) => {
      const fs = findings.filter((f) => f.rule_id === r.id);
      const dismissed = fs.filter((f) => f.state === "dismissed");
      const unclear = dismissed.filter((f) => f.dismiss_reason === "The rule is unclear");
      return {
        id: r.id, title: r.title, status: r.status,
        raised: fs.length, drafts: new Set(fs.map((f) => f.draft_id)).size,
        fixed: fs.filter((f) => f.state === "accepted" || f.state === "resolved").length,
        dismissed: dismissed.length,
        unclearBy: [...new Set(unclear.map((f) => f.resolved_by ?? "?"))],
        reasons: Object.entries(dismissed.reduce<Record<string, number>>((m, f) => ((m[f.dismiss_reason ?? "?"] = (m[f.dismiss_reason ?? "?"] ?? 0) + 1), m), {})),
      };
    }).filter((r) => r.raised > 0).sort((a, b) => b.raised - a.raised);
    const today = new Date();
    const soon = new Date(today.getTime() + 60 * 864e5).toISOString().slice(0, 10);
    const t = today.toISOString().slice(0, 10);
    const watch = facts.filter((f) => f.kind === "fact").map((f) => ({
      id: f.id, statement: f.statement, owner: f.owner, valid_from: f.valid_from, valid_until: f.valid_until,
      state: f.valid_until && f.valid_until < t ? "expired" : f.valid_from && f.valid_from > t ? "embargoed" : f.valid_until && f.valid_until <= soon ? "expiring" : "valid",
    })).filter((f) => f.state !== "valid");
    return Response.json({
      totals: { drafts: drafts.length, approved: drafts.filter((x) => x.status === "approved").length, findings: findings.length, dismissed: findings.filter((f) => f.state === "dismissed").length },
      perRule, watch,
    });
  } catch (e) {
    return fail(e, 500);
  }
}
