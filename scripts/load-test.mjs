// Load test: N simulated visitors at once, each with its own workspace, each doing the real journey through the
// API (open the app, load the Brand Kit, list drafts, create a draft, read it, accept a fix, submit it, read the
// routed draft, insights, the Results data, health) plus the static pages a visitor opens on the way.
//
//   BASE_URL=https://guidewise-kohl.vercel.app VISITORS=20 npm run test:load
//   BASE_URL=… VISITORS=50 OUT=/tmp/run50.json npm run test:load
//
// Drafts are created with "useAI": false, so the load test never spends the free AI quota: it measures the app,
// the database and the code checks, not the AI providers. Every visitor starts at the same moment.
// A request fails if it is a network error, a timeout, or a non-2xx status where 2xx was expected. A step whose
// response is 2xx but wrong (no fix offered, draft not routed) is counted separately as a check failure.
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const L = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const N = Math.max(1, Number(process.env.VISITORS || process.argv[2] || 20));
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 60000);
const OUT = process.env.OUT;

const records = []; // { endpoint, status, ms, ok, error }
const checks = []; // { visitor, step, ok, detail }
const journeys = []; // { visitor, ms, completed }

async function hit(endpoint, method, path, { ws, role = "creator", body } = {}) {
  const headers = {};
  if (ws) { headers["x-workspace"] = ws; headers["x-role"] = role; }
  if (body !== undefined) headers["content-type"] = "application/json";
  const t0 = performance.now();
  try {
    const r = await fetch(L + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await r.text();
    const ms = performance.now() - t0;
    let json = null;
    try { json = JSON.parse(text); } catch { /* a page, not JSON */ }
    const ok = r.status >= 200 && r.status < 300;
    records.push({ endpoint, status: r.status, ms, ok, error: ok ? null : (json?.error ?? text.slice(0, 200)) });
    return { ok, status: r.status, json, text };
  } catch (e) {
    const ms = performance.now() - t0;
    const error = e?.name === "TimeoutError" ? `timeout after ${TIMEOUT_MS} ms` : String(e?.cause?.code ?? e?.message ?? e);
    records.push({ endpoint, status: 0, ms, ok: false, error });
    return { ok: false, status: 0, json: null, text: "" };
  }
}

function check(visitor, step, ok, detail = "") {
  checks.push({ visitor, step, ok: !!ok, detail });
  return !!ok;
}

async function visitor(i) {
  const ws = "load-" + randomUUID(); // a fresh workspace: the first API call seeds its Brand Kit
  const t0 = performance.now();
  let completed = false;
  try {
    await hit("GET /", "GET", "/");
    const st = await hit("GET /api/state", "GET", "/api/state", { ws });
    check(i, "state has rules and facts", st.ok && st.json?.rules?.length > 5 && st.json?.facts?.length > 0, `status ${st.status}`);
    const list = await hit("GET /api/drafts", "GET", "/api/drafts", { ws });
    check(i, "drafts list loads", list.ok && Array.isArray(list.json?.drafts), `status ${list.status}`);
    await hit("GET /review/new", "GET", "/review/new");
    const text = `India's #1 JEE coaching. 100% selection guaranteed!! Join 50,000+ toppers. Load-test visitor ${i}.`;
    const made = await hit("POST /api/drafts", "POST", "/api/drafts", { ws, body: { title: `Load test ${i}`, content_type: "social", text, useAI: false } });
    const id = made.json?.id;
    if (check(i, "draft created", made.ok && typeof id === "string", `status ${made.status} ${JSON.stringify(made.json)?.slice(0, 160)}`)) {
      const got = await hit("GET /api/drafts/:id", "GET", `/api/drafts/${id}`, { ws });
      const fix = (got.json?.findings ?? []).find((f) => f.state === "open" && f.fix !== null && f.fix !== undefined && (f.location ?? "text") === "text");
      check(i, "draft has findings with a text fix", got.ok && fix, `status ${got.status}, ${got.json?.findings?.length ?? 0} findings`);
      if (fix) {
        const acc = await hit("POST /api/drafts/:id accept", "POST", `/api/drafts/${id}`, { ws, body: { action: "accept", finding_id: fix.id } });
        check(i, "fix accepted", acc.ok, `status ${acc.status} ${JSON.stringify(acc.json)?.slice(0, 160)}`);
      }
      const sub = await hit("POST /api/drafts/:id submit", "POST", `/api/drafts/${id}`, { ws, body: { action: "submit" } });
      check(i, "draft submitted", sub.ok, `status ${sub.status} ${JSON.stringify(sub.json)?.slice(0, 160)}`);
      const after = await hit("GET /api/drafts/:id", "GET", `/api/drafts/${id}`, { ws });
      const status = after.json?.draft?.status;
      check(i, "draft routed to a reviewer", after.ok && (status === "brand_review" || status === "compliance_review"), `status ${after.status}, draft ${status}`);
      check(i, "accepted fix recorded", after.ok && (!fix || after.json.findings.some((f) => f.state === "accepted")), "");
    }
    const ins = await hit("GET /api/insights", "GET", "/api/insights", { ws });
    check(i, "insights load", ins.ok, `status ${ins.status}`);
    await hit("GET /facts", "GET", "/facts");
    const ev = await hit("GET /api/eval?split=test", "GET", "/api/eval?split=test", { ws });
    check(i, "results data loads", ev.ok && typeof ev.json?.report === "object", `status ${ev.status}`);
    await hit("GET /sample-landing.html", "GET", "/sample-landing.html");
    const h = await hit("GET /api/health", "GET", "/api/health", { ws });
    check(i, "health: database answers", h.ok && h.json?.database?.ok === true, `status ${h.status} ${JSON.stringify(h.json?.database)}`);
    completed = true;
  } finally {
    journeys.push({ visitor: i, ms: performance.now() - t0, completed });
  }
}

const q = (xs, p) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
};
const r0 = (x) => (Number.isFinite(x) ? Math.round(x) : "-");

console.log(`Load test: ${N} concurrent visitors against ${L} (AI off for drafts), ${new Date().toISOString()}`);
const start = performance.now();
await Promise.all(Array.from({ length: N }, (_, i) => visitor(i + 1)));
const wall = (performance.now() - start) / 1000;

const byEndpoint = new Map();
for (const r of records) {
  if (!byEndpoint.has(r.endpoint)) byEndpoint.set(r.endpoint, []);
  byEndpoint.get(r.endpoint).push(r);
}
const rows = [...byEndpoint.entries()].map(([endpoint, rs]) => {
  const ms = rs.map((r) => r.ms);
  return { endpoint, requests: rs.length, failed: rs.filter((r) => !r.ok).length, p50: r0(q(ms, 0.5)), p95: r0(q(ms, 0.95)), max: r0(Math.max(...ms)) };
});
const all = records.map((r) => r.ms);
const failures = records.filter((r) => !r.ok);
const badChecks = checks.filter((c) => !c.ok);
const summary = {
  base_url: L, visitors: N, started: new Date(Date.now() - wall * 1000).toISOString(), wall_s: Math.round(wall * 10) / 10,
  requests: records.length, failed: failures.length, throughput_rps: Math.round((records.length / wall) * 10) / 10,
  p50: r0(q(all, 0.5)), p95: r0(q(all, 0.95)), max: r0(Math.max(...all)),
  journeys_completed: journeys.filter((j) => j.completed).length,
  journey_p50_s: Math.round(q(journeys.map((j) => j.ms), 0.5) / 100) / 10, journey_max_s: Math.round(Math.max(...journeys.map((j) => j.ms)) / 100) / 10,
  checks: checks.length, checks_failed: badChecks.length,
  statuses: records.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {}),
};

console.log("\n| Endpoint | Requests | Failed | p50 ms | p95 ms | max ms |\n| --- | ---: | ---: | ---: | ---: | ---: |");
for (const r of rows) console.log(`| ${r.endpoint} | ${r.requests} | ${r.failed} | ${r.p50} | ${r.p95} | ${r.max} |`);
console.log(`| **All** | **${summary.requests}** | **${summary.failed}** | **${summary.p50}** | **${summary.p95}** | **${summary.max}** |`);
console.log(`\n${summary.requests} requests in ${summary.wall_s} s (${summary.throughput_rps} req/s), ${summary.failed} failed; status codes ${JSON.stringify(summary.statuses)}.`);
console.log(`${summary.journeys_completed} of ${N} journeys completed (median ${summary.journey_p50_s} s, slowest ${summary.journey_max_s} s); ${summary.checks - summary.checks_failed} of ${summary.checks} response checks passed.`);
for (const f of failures.slice(0, 20)) console.log(`FAILED ${f.endpoint}: ${f.status} ${f.error}`);
for (const c of badChecks.slice(0, 20)) console.log(`CHECK FAILED visitor ${c.visitor}: ${c.step} (${c.detail})`);
if (OUT) writeFileSync(OUT, JSON.stringify({ summary, endpoints: rows, failures, failed_checks: badChecks }, null, 2));
process.exit(failures.length || badChecks.length ? 1 : 0);
