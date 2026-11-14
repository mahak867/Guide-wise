// Probes every API route with bad input and the wrong role. Every answer must be a clean 4xx with a
// message, never a 500, and the app must still work afterwards.
//   BASE_URL=https://guidewise-kohl.vercel.app node e2e/api-probe.mjs
import { randomUUID } from "node:crypto";
const L = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const ws = "probe-" + randomUUID().slice(0, 12);
let bad = 0;
async function call(method, path, { role = "creator", body, raw, form, headers = {} } = {}) {
  const h = { "x-workspace": ws, "x-role": role, ...headers };
  let payload;
  if (form) payload = form;
  else if (raw !== undefined) { payload = raw; h["content-type"] = "application/json"; }
  else if (body !== undefined) { payload = JSON.stringify(body); h["content-type"] = "application/json"; }
  const r = await fetch(L + path, { method, headers: h, body: payload });
  let j = null; try { j = await r.json(); } catch { /* not JSON */ }
  return { s: r.status, j };
}
function expect(name, r, ok) {
  const pass = ok(r);
  if (!pass) bad++;
  console.log(`${pass ? "ok  " : "BAD "} ${r.s} ${name}${pass ? "" : "  → " + JSON.stringify(r.j).slice(0, 160)}`);
}
const is4xx = (r) => r.s >= 400 && r.s < 500 && typeof r.j?.error === "string" && r.j.error.length > 5;
const is = (code) => (r) => r.s === code;

await call("GET", "/api/state");
const { j: created } = await call("POST", "/api/drafts", { body: { title: "Probe", content_type: "social", text: "100% selection guaranteed!! Call 98765 43210.", useAI: false } });
const id = created?.id;
console.log("draft", id);

// Malformed and empty bodies on every POST route
for (const p of ["/api/drafts", `/api/drafts/${id}`, "/api/rules", "/api/rules/R-12", "/api/facts", "/api/kit", "/api/kit/import", "/api/compile"]) {
  expect(`malformed JSON ${p}`, await call("POST", p, { role: "manager", raw: "{not json" }), is4xx);
  expect(`empty body ${p}`, await call("POST", p, { role: "manager", body: {} }), is4xx);
}
expect("extract with no file", await call("POST", "/api/extract", { form: new FormData() }), is4xx);
const fd = new FormData(); fd.append("file", new Blob(["this is not a docx"]), "fake.docx");
expect("extract corrupt docx", await call("POST", "/api/extract", { form: fd }), is4xx);
const fp = new FormData(); fp.append("file", new Blob(["%PDF-1.4 broken"]), "fake.pdf");
expect("extract corrupt pdf", await call("POST", "/api/extract", { form: fp }), is4xx);
const ft = new FormData(); ft.append("file", new Blob(["hello"]), "notes.txt");
expect("extract wrong type", await call("POST", "/api/extract", { form: ft }), is4xx);

// Bad IDs
expect("GET non-uuid draft", await call("GET", "/api/drafts/not-a-uuid"), (r) => r.s === 404);
expect("GET unknown draft", await call("GET", `/api/drafts/${randomUUID()}`), (r) => r.s === 404);
expect("POST non-uuid draft", await call("POST", "/api/drafts/not-a-uuid", { body: { action: "recheck" } }), (r) => r.s === 404);
expect("unknown rule", await call("POST", "/api/rules/NOPE-9", { body: { action: "test" } }), (r) => r.s === 404);
expect("unknown draft action", await call("POST", `/api/drafts/${id}`, { body: { action: "explode" } }), is4xx);
expect("unknown rule action", await call("POST", "/api/rules/R-12", { role: "manager", body: { action: "explode" } }), is4xx);

// Draft input limits
expect("too short draft", await call("POST", "/api/drafts", { body: { text: "hi" } }), is4xx);
expect("too long draft", await call("POST", "/api/drafts", { body: { text: "a ".repeat(7000) } }), is4xx);
expect("bad image", await call("POST", "/api/drafts", { body: { text: "A valid draft text here.", images: [{ dataUrl: "javascript:alert(1)" }] } }), is4xx);
expect("images not an array", await call("POST", "/api/drafts", { body: { text: "A valid draft text here.", images: "x", useAI: false } }), (r) => r.s === 200);
expect("unknown content type", await call("POST", "/api/drafts", { body: { text: "A valid draft text here.", content_type: "<script>", useAI: false } }), (r) => r.s === 400 || r.s === 200);
expect("weird role header", await call("POST", "/api/drafts", { role: "constructor", body: { text: "A valid draft text here.", useAI: false } }), (r) => r.s === 200);
expect("hindi + emoji draft", await call("POST", "/api/drafts", { body: { text: "आईआईटी में 100% चयन की गारंटी! 🚀🚀 Join now.", useAI: false } }), (r) => r.s === 200);

// Roles
expect("creator cannot save rule", await call("POST", "/api/rules", { body: { id: "X-1", title: "t", description: "d" } }), is(403));
expect("creator cannot promote", await call("POST", "/api/rules/T-5", { body: { action: "promote" } }), is(403));
expect("creator cannot save fact", await call("POST", "/api/facts", { body: { id: "F-X", statement: "s", evidence: "e" } }), is(403));
expect("creator cannot delete fact", await call("DELETE", "/api/facts/F-3"), is(403));
expect("creator cannot change kit", await call("POST", "/api/kit", { body: { palette: [] } }), is(403));
expect("creator cannot import", await call("POST", "/api/kit/import", { body: { format: "guidewise-brand-kit" } }), is(403));
expect("creator cannot compile", await call("POST", "/api/compile", { body: { guide: "x".repeat(50) } }), is(403));
expect("creator cannot approve", await call("POST", `/api/drafts/${id}`, { body: { action: "approve" } }), is4xx);
expect("brand cannot dismiss critical", await call("POST", `/api/drafts/${id}`, { role: "brand", body: { action: "dismiss", finding_id: "x", reason: "r" } }), is4xx);

// Bad values in otherwise valid requests
expect("fact with bad date", await call("POST", "/api/facts", { role: "manager", body: { id: "F-BAD", statement: "s", evidence: "e", valid_from: "not a date" } }), is4xx);
expect("fact with bad value", await call("POST", "/api/facts", { role: "manager", body: { id: "F-BAD2", statement: "s", evidence: "e", value: "lots" } }), is4xx);
expect("rule with tests not a list", await call("POST", "/api/rules", { role: "manager", body: { id: "BAD-1", title: "t", description: "d", tests: "x", config: "y" } }), is4xx);
expect("rule with bad severity", await call("POST", "/api/rules", { role: "manager", body: { id: "BAD-2", title: "t", description: "d", severity: "apocalyptic" } }), is4xx);
expect("rule with broken regex", await call("POST", "/api/rules", { role: "manager", body: { id: "BAD-3", kind: "code", category: "pattern", title: "t", description: "d", config: { patterns: ["(unclosed"] }, tests: [] } }), (r) => r.s === 400 || r.s === 200);
expect("rule with catastrophic regex", await call("POST", "/api/rules", { role: "manager", body: { id: "BAD-4", kind: "code", category: "pattern", title: "t", description: "d", config: { patterns: ["(a+)+$"] }, tests: [] } }), is4xx);
expect("palette with bad colour", await call("POST", "/api/kit", { role: "manager", body: { palette: [{ name: "x", hex: "red" }] } }), is4xx);
expect("logo not an image", await call("POST", "/api/kit", { role: "manager", body: { logo: "https://evil.example/x.png" } }), is4xx);
expect("import wrong format", await call("POST", "/api/kit/import", { role: "manager", body: { format: "other" } }), is4xx);
expect("dismiss without reason", await call("POST", `/api/drafts/${id}`, { role: "compliance", body: { action: "dismiss", finding_id: randomUUID() } }), is4xx);
expect("empty comment", await call("POST", `/api/drafts/${id}`, { body: { action: "comment", text: "  " } }), is4xx);
expect("edit to empty text", await call("POST", `/api/drafts/${id}`, { body: { action: "edit", text: "" } }), is4xx);

// Still healthy afterwards
const st = await call("GET", "/api/state");
expect("state still loads", st, (r) => r.s === 200 && Array.isArray(r.j?.rules));
expect("kit page data has no broken rules", st, (r) => r.j.rules.every((x) => Array.isArray(x.tests) && x.config && typeof x.config === "object"));
expect("drafts list loads", await call("GET", "/api/drafts"), (r) => r.s === 200);
expect("insights load", await call("GET", "/api/insights"), (r) => r.s === 200);
expect("export loads", await call("GET", "/api/kit/export"), (r) => r.s === 200);
expect("health", await call("GET", "/api/health"), (r) => r.s === 200);
expect("eval endpoint without token", await call("GET", "/api/eval/ai"), (r) => r.s === 401 || r.s === 403);
await call("POST", "/api/reset");
console.log(bad ? `${bad} problem(s).` : "No problems.");
process.exit(bad ? 1 : 0);
