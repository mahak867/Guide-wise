// Turns two AI-mode runs of the held-out set (from /api/eval/ai) into src/lib/eval/ai-results.json.
// Usage: npx tsx scripts/publish-ai-eval.ts runs.json
import { readFileSync, writeFileSync } from "node:fs";
import { summarise, type DocResult } from "../src/lib/eval/score";
import { SEED_RULES } from "../src/lib/seed";

type Run = { results: (DocResult & { mode: string; aiError?: string })[]; notes: { last: string | null; chain: string }[] };
const runs: Run[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
const [a, b] = runs;
const strip = (r: Run["results"][number]): DocResult => ({ id: r.id, split: r.split, text: r.text, planted: r.planted, extra: r.extra });
const aiDocs = a.results.filter((r) => r.mode === "ai").length;
const report = summarise(a.results.map(strip), SEED_RULES, "ai", "test");
const sig = (r: DocResult) => JSON.stringify([...r.planted.map((p) => p.caught), ...r.extra.map((e) => e.rule + e.quote).sort()]);
const same = a.results.filter((r, i) => b && sig(r) === sig(b.results[i])).length;
const answered = [...new Set(a.notes.map((n) => n.last).filter(Boolean))];
const { results: _r, ...summary } = report;
void _r;
const out = { measured: true, ...summary, mode: `AI checks (${answered.join("; ") || a.notes[0]?.chain})`, agreement: b ? same / a.results.length : undefined, aiDocs, results: report.results };
writeFileSync("src/lib/eval/ai-results.json", JSON.stringify(out, null, 2) + "\n");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`AI drafts ${aiDocs}/${a.results.length} | precision ${pct(report.precision)} [${report.precisionCI.map(pct).join("-")}] | recall ${pct(report.recall)} [${report.recallCI.map(pct).join("-")}] | critical ${pct(report.criticalRecall)} | hard ${report.hardCaught}/${report.hardPlanted} | agreement ${b ? pct(same / a.results.length) : "-"}`);
for (const r of report.results) for (const e of r.extra) console.log("  false flag", r.id, e.rule, JSON.stringify(e.quote), e.level);
for (const r of report.results) for (const p of r.planted) if (!p.caught) console.log("  missed", r.id, p.rule, JSON.stringify(p.quote), p.hard ? "(hard)" : "");
