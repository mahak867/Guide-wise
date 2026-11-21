// Probes every API route with bad input and the wrong role. Every answer must be a clean 4xx with a
// message, never a 500, and the app must still work afterwards.
//   BASE_URL=https://guidewise-kohl.vercel.app node e2e/api-probe.mjs
import { createHash, randomBytes, randomUUID } from "node:crypto";
const L = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const ws = "probe-" + randomUUID().slice(0, 12);
let bad = 0, checks = 0;
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
  checks++;
  if (!pass) bad++;
  console.log(`${pass ? "ok  " : "BAD "} ${r.s} ${name}${pass ? "" : "  → " + JSON.stringify(r.j).slice(0, 160)}`);
}
const is4xx = (r) => r.s >= 400 && r.s < 500 && typeof r.j?.error === "string" && r.j.error.length > 5;
const is = (code) => (r) => r.s === code;
/** Approve a draft in review: compliance first; a high-risk draft then needs the brand sign-off as well. Returns the draft. */
async function approveFully(draftId) {
  const first = await call("POST", `/api/drafts/${draftId}`, { role: "compliance", body: { action: "approve" } });
  if (first.s !== 200) return { s: first.s, j: first.j };
  if (first.j?.waiting_for === "brand") {
    const second = await call("POST", `/api/drafts/${draftId}`, { role: "brand", body: { action: "approve" } });
    if (second.s !== 200) return { s: second.s, j: second.j };
  }
  return call("GET", `/api/drafts/${draftId}`);
}

await call("GET", "/api/state");
{
  const h = (await fetch(L + "/")).headers;
  const csp = h.get("content-security-policy") ?? "";
  expect("security headers: CSP forbids framing and other origins", { s: 200, j: { csp } }, () => /default-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp));
  expect("security headers: nosniff, no framing, no x-powered-by", { s: 200, j: {} }, () => h.get("x-content-type-options") === "nosniff" && h.get("x-frame-options") === "DENY" && !h.get("x-powered-by"));
}
const { j: created } = await call("POST", "/api/drafts", { body: { title: "Probe", content_type: "social", text: "100% selection guaranteed!! Call 98765 43210.", useAI: false } });
const id = created?.id;
console.log("draft", id);

// Malformed and empty bodies on every POST route
for (const p of ["/api/drafts", `/api/drafts/${id}`, "/api/rules", "/api/rules/propose", "/api/rules/R-12", "/api/facts", "/api/kit", "/api/kit/import", "/api/compile"]) {
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
// Reading a live web page as a campaign document: a public page works; private addresses never reach the server's network.
expect("read a public web page: main content, no menus, scripts or footer", await call("POST", "/api/extract", { body: { url: L + "/sample-landing.html" } }),
  (r) => r.s === 200 && /₹14,999/.test(r.j?.text ?? "") && /EARLY10/.test(r.j.text) && !/<[a-z]|Courses|Privacy|Enrol now|sample page for trying/i.test(r.j.text)
    && r.j.hidden === 1 && /\[Hidden on the page[^\]]*\]\n100% selection guaranteed/.test(r.j.text));
expect("web page: cloud metadata address refused", await call("POST", "/api/extract", { body: { url: "http://169.254.169.254/latest/meta-data/" } }), is4xx);
expect("web page: localhost refused", await call("POST", "/api/extract", { body: { url: "http://localhost:3000/api/state" } }), is4xx);
expect("web page: not a web address", await call("POST", "/api/extract", { body: { url: "javascript:alert(1)" } }), is4xx);
expect("web page: malformed JSON", await call("POST", "/api/extract", { raw: "{not json" }), is4xx);

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

// Workspace isolation: a second visitor cannot see or touch the first visitor's work
{
  const other = { "x-workspace": "probe-" + randomUUID().slice(0, 12) };
  const as2 = async (method, path, body, role = "creator") => {
    const r = await fetch(L + path, { method, headers: { ...other, "x-role": role, "content-type": "application/json" }, body: body && JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch { /* not JSON */ }
    return { s: r.status, j };
  };
  expect("other workspace cannot read the draft", await as2("GET", `/api/drafts/${id}`), (r) => r.s === 404);
  expect("other workspace cannot act on the draft", await as2("POST", `/api/drafts/${id}`, { action: "comment", text: "intrusion" }), (r) => r.s === 404);
  expect("other workspace cannot approve the draft", await as2("POST", `/api/drafts/${id}`, { action: "approve" }, "compliance"), (r) => r.s === 404);
  expect("other workspace's list does not include it", await as2("GET", "/api/drafts"), (r) => r.s === 200 && !r.j.drafts.some((d) => d.id === id));
  await call("POST", "/api/rules", { role: "manager", body: { id: "ISO-1", kind: "code", category: "term", title: "Isolation probe", description: "d", config: { avoid: ["zzz"], prefer: "y" }, tests: [] } });
  expect("other workspace's kit does not include the new rule", await as2("GET", "/api/state"), (r) => r.s === 200 && !r.j.rules.some((x) => x.id === "ISO-1"));
  expect("other workspace's export does not include it", await as2("GET", "/api/kit/export"), (r) => r.s === 200 && !r.j.rules.some((x) => x.id === "ISO-1"));
}

// Cross-asset consistency: a fee in the creative that differs from the caption is flagged on the creative
{
  const px = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const mk = async (ocr) => {
    const { j } = await call("POST", "/api/drafts", { body: { title: "Consistency probe", content_type: "social", text: "December batch fee ₹39,999. Classes start 1 December.", useAI: false, images: [{ name: "c.png", alt: "Creative with the batch fee", dataUrl: px, colours: [], ocr }] } });
    return (await call("GET", `/api/drafts/${j.id}`)).j.findings.filter((f) => f.rule_id === "CONS-1");
  };
  const bad = await mk("December batch\nFee ₹34,999");
  expect("mismatched fee is flagged on the image", { s: 200, j: bad }, (r) => r.j.length === 1 && r.j[0].location === "image:1" && r.j[0].quote === "₹34,999");
  expect("matching fee is not flagged", { s: 200, j: await mk("December batch\nFee ₹39,999") }, (r) => r.j.length === 0);
}

// Round 3 improvement 1, change impact: change fact F-3 and every draft that used it is listed and re-checked;
// an approved piece that no longer passes is sent back for re-approval with the reason.
{
  const text = "4,200+ JEE selections in 2025 from our two-year classroom programme. Past results do not guarantee future selection.";
  const mk = async (title) => (await call("POST", "/api/drafts", { body: { title, content_type: "email", text, useAI: false } })).j.id;
  const approvedId = await mk("Impact probe: approved");
  const openId = await mk("Impact probe: in progress");
  await call("POST", `/api/drafts/${approvedId}`, { body: { action: "submit" } });
  for (const f of (await call("GET", `/api/drafts/${approvedId}`)).j.findings.filter((x) => x.state === "open" && x.level === "violation")) {
    await call("POST", `/api/drafts/${approvedId}`, { role: "compliance", body: { action: "dismiss", finding_id: f.id, reason: "Approved exception" } });
  }
  const ap = await approveFully(approvedId);
  expect("impact: draft approved before the change", ap, (r) => r.s === 200 && r.j?.draft?.status === "approved");
  const f3 = (await call("GET", "/api/state")).j.facts.find((f) => f.id === "F-3");
  const ch = await call("POST", "/api/facts", { role: "manager", body: { ...f3, value: 4500, statement: "4,500+ JEE selections in 2025 from our two-year classroom programme" } });
  const aff = ch.j?.impact?.affected ?? [];
  expect("impact: the change is described", ch, (r) => r.s === 200 && /F-3 changed: value 4200 to 4500/.test(r.j.impact.change.what));
  expect("impact: the approved piece is sent back for re-approval", { s: 200, j: aff }, (r) => r.j.some((a) => a.id === approvedId && a.outcome === "reapproval"));
  expect("impact: the open draft is listed and re-checked", { s: 200, j: aff }, (r) => r.j.some((a) => a.id === openId && a.outcome === "rechecked"));
  const back = (await call("GET", `/api/drafts/${approvedId}`)).j;
  expect("impact: re-approval shows the reason and a new open finding", { s: 200, j: back }, (r) => r.j.draft.status !== "approved" && /F-3 changed/.test(r.j.draft.impact?.reason ?? "") && r.j.findings.some((f) => f.state === "open" && f.fact_id === "F-3"));
  const again = await call("POST", "/api/facts", { role: "manager", body: { ...f3, value: 4500, statement: "4,500+ JEE selections in 2025 from our two-year classroom programme" } });
  expect("impact: saving the same change twice reopens nothing more", again, (r) => r.s === 200 && !r.j.impact.affected.some((a) => a.outcome === "reapproval"));
}

// Approval is bound to the Brand Kit in force: an asset change after the last check means the draft is checked again
// before it can be approved, and a new problem blocks approval.
{
  const st = (await call("GET", "/api/state")).j;
  const { j: dk } = await call("POST", "/api/drafts", { body: { title: "Kit binding probe", content_type: "email", text: "For the December batch, write to admissions@preppath.in.", useAI: false } });
  await call("POST", `/api/drafts/${dk.id}`, { body: { action: "submit" } });
  const k = await call("POST", "/api/kit", { role: "manager", body: { contacts: st.kit.contacts.filter((c) => !/admissions@/.test(c.value)) } });
  expect("kit binding: contact removed after the draft was checked", k, (r) => r.s === 200);
  const ap = await call("POST", `/api/drafts/${dk.id}`, { role: "brand", body: { action: "approve" } });
  expect("kit binding: approval re-checks against the new kit and refuses", ap, (r) => r.s === 409 && /Brand Kit changed/.test(r.j?.error ?? ""));
  await call("POST", "/api/kit", { role: "manager", body: { contacts: st.kit.contacts } });
  // With the contact approved again, the re-check at approval clears the finding and the draft is approved.
  expect("kit binding: once the kit allows it again, approval re-checks and goes through", await approveFully(dk.id), (r) => r.s === 200 && r.j?.draft?.status === "approved");
}

// Time-limited exceptions and dual sign-off. A high-risk draft (a guarantee, so it goes to compliance) with a
// non-critical violation (an unapproved phone number) and a missing disclaimer.
{
  const { j: dx } = await call("POST", "/api/drafts", { body: { title: "Exception and sign-off probe", content_type: "social", text: "100% selection guaranteed!! Call 98765 43210.", useAI: false } });
  const did = dx.id;
  const get = async () => (await call("GET", `/api/drafts/${did}`)).j;
  const find = async (rule) => (await get()).findings.find((f) => f.rule_id === rule);
  const dismiss = (role, rule, reason, until) => find(rule).then((f) => call("POST", `/api/drafts/${did}`, { role, body: { action: "dismiss", finding_id: f?.id, reason, ...(until !== undefined ? { until } : {}) } }));
  const contact = await find("R-15");
  expect("exceptions: the probe draft has a non-critical violation to try them on", { s: 200, j: contact }, (r) => r.j?.level === "violation" && r.j.severity !== "critical");
  expect("exceptions: a creator cannot grant an exception", await dismiss("creator", "R-15", "Approved exception", "2099-12-31"), (r) => r.s === 403 && /reviewer/i.test(r.j?.error ?? ""));
  expect("exceptions: a creator cannot slip one in through the reason text", await dismiss("creator", "R-15", "Approved exception (until 2099-12-31)"), is(403));
  expect("exceptions: the creator may still dismiss it with another reason", await dismiss("creator", "R-15", "The flag is wrong"), is(200));
  await call("POST", `/api/drafts/${did}`, { body: { action: "reopen", finding_id: contact.id } });
  await call("POST", `/api/drafts/${did}`, { body: { action: "submit" } });
  expect("sign-off: the high-risk draft is routed to compliance", { s: 200, j: (await get()).draft }, (r) => r.j.status === "compliance_review");
  expect("exceptions: an end date that is not a real date is a clear 400", await dismiss("compliance", "R-15", "Approved exception", "2026-02-30"), is(400));
  // A dated exception is stored readably in the dismiss reason; one whose date has passed lapses at the next re-check.
  const dated = await dismiss("compliance", "R-15", "Approved exception", "2099-12-31");
  expect("exceptions: a reviewer grants one until a date", dated, (r) => r.s === 200);
  expect("exceptions: stored as \"Approved exception (until …)\"", { s: 200, j: await find("R-15") }, (r) => r.j?.state === "dismissed" && r.j.dismiss_reason === "Approved exception (until 2099-12-31)" && r.j.resolved_by === "Kavya");
  await dismiss("compliance", "R-12", "Approved exception");
  await dismiss("compliance", "R-DISC", "Approved exception", "2020-01-01");
  expect("exceptions: every violation is settled before the re-check", { s: 200, j: await get() }, (r) => !r.j.findings.some((f) => f.state === "open" && f.level === "violation"));
  await call("POST", `/api/drafts/${did}`, { role: "compliance", body: { action: "recheck", useAI: false } });
  const after = await get();
  expect("exceptions: an expired exception reopens on re-check", { s: 200, j: after }, (r) => r.j.findings.find((f) => f.rule_id === "R-DISC")?.state === "open"
    && r.j.events.some((e) => e.action === "exception_lapsed" && e.detail.rule === "R-DISC" && e.detail.until === "2020-01-01"));
  expect("exceptions: one still in date stays settled", { s: 200, j: after }, (r) => r.j.findings.find((f) => f.rule_id === "R-15")?.state === "dismissed" && r.j.findings.find((f) => f.rule_id === "R-12")?.state === "dismissed");
  expect("exceptions: the reopened finding blocks approval", await call("POST", `/api/drafts/${did}`, { role: "compliance", body: { action: "approve" } }), (r) => r.s === 409);
  // Approval checks end dates itself too, without a re-check: an exception that has lapsed is reopened and refused.
  await dismiss("compliance", "R-DISC", "Approved exception", "2021-06-30");
  expect("exceptions: approval itself refuses a lapsed exception", await call("POST", `/api/drafts/${did}`, { role: "compliance", body: { action: "approve" } }), (r) => r.s === 409 && /lapsed/.test(r.j?.error ?? ""));
  await dismiss("compliance", "R-DISC", "Approved exception", "2099-06-30");
  // Dual sign-off: compliance first, then brand. Compliance alone does not approve.
  expect("sign-off: brand cannot sign off before compliance", await call("POST", `/api/drafts/${did}`, { role: "brand", body: { action: "approve" } }), is(403));
  const partial = await call("POST", `/api/drafts/${did}`, { role: "compliance", body: { action: "approve" } });
  expect("sign-off: compliance's approval is recorded as the first sign-off", partial, (r) => r.s === 200 && r.j.waiting_for === "brand");
  const mid = await get();
  expect("sign-off: compliance alone does not approve a high-risk draft", { s: 200, j: mid }, (r) => r.j.draft.status === "compliance_review" && !r.j.receipt
    && r.j.sign_off?.waiting_for === "brand" && r.j.events.some((e) => e.action === "approved_partial" && e.role === "compliance" && e.actor === "Kavya"));
  expect("sign-off: compliance cannot sign twice", await call("POST", `/api/drafts/${did}`, { role: "compliance", body: { action: "approve" } }), is(409));
  expect("sign-off: the creator cannot give the second sign-off", await call("POST", `/api/drafts/${did}`, { body: { action: "approve" } }), is(403));
  expect("sign-off: brand gives the second sign-off", await call("POST", `/api/drafts/${did}`, { role: "brand", body: { action: "approve" } }), is(200));
  const done = await get();
  expect("sign-off: compliance and brand together approve it", { s: 200, j: done }, (r) => r.j.draft.status === "approved");
  expect("sign-off: the receipt names both approvers", { s: 200, j: done.receipt }, (r) => /Kavya \(compliance\) and Arjun \(brand\)/.test(r.j?.approver ?? "")
    && JSON.stringify((r.j.findings_summary.approvers ?? []).map((a) => [a.name, a.role])) === JSON.stringify([["Kavya", "compliance"], ["Arjun", "brand"]]));
  expect("exceptions: the receipt lists each exception and its end date", { s: 200, j: done.receipt }, (r) => r.j.findings_summary.exceptions?.some((x) => x.rule === "R-15" && x.until === "2099-12-31")
    && r.j.findings_summary.exceptions.some((x) => x.rule === "R-12" && x.until === null));
}

// Round 3 improvement 2, API and MCP server: scoped keys, get_brief, check_draft (same findings as the app),
// a real MCP client over Streamable HTTP, and an audit entry per call.
{
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const made = await call("POST", "/api/keys", { role: "manager", body: { name: "Probe assistant", scopes: ["brief:read", "draft:check"] } });
  expect("api: manager creates a key, shown once", made, (r) => r.s === 200 && /^gw_[0-9a-f]{48}$/.test(r.j.key));
  expect("api: a creator cannot create keys", await call("POST", "/api/keys", { body: { name: "x", scopes: ["brief:read"] } }), is(403));
  const key = made.j.key;
  const v1 = async (method, path, body, k = key) => {
    const r = await fetch(L + path, { method, headers: { authorization: `Bearer ${k}`, "content-type": "application/json" }, body: body && JSON.stringify(body) });
    return { s: r.status, j: await r.json().catch(() => null) };
  };
  const brief = await v1("GET", "/api/v1/brief?content_type=ad");
  expect("api: brief lists rules in force and only facts valid today", brief, (r) => r.s === 200 && r.j.rules.length > 5 && r.j.facts.length > 0 && !r.j.facts.some((f) => f.id === "F-9" || f.id === "F-11"));
  const text = "India's #1 JEE coaching. 100% selection guaranteed!! Join 50,000+ toppers who cracked JEE with PrepPath.";
  const checked = await v1("POST", "/api/v1/check", { text, content_type: "social", use_ai: false });
  const appDraft = (await call("POST", "/api/drafts", { body: { title: "API parity", content_type: "social", text, useAI: false } })).j.id;
  const appFindings = (await call("GET", `/api/drafts/${appDraft}`)).j.findings.map((f) => `${f.rule_id}|${f.quote}`).sort();
  const apiFindings = (checked.j?.findings ?? []).map((f) => `${f.rule_id}|${f.quote}`).sort();
  expect("api: check_draft gives the same findings as the app", checked, (r) => r.s === 200 && apiFindings.length > 3 && JSON.stringify(apiFindings) === JSON.stringify(appFindings));
  expect("api: no key is refused", await v1("GET", "/api/v1/brief", undefined, ""), is(401));
  expect("api: a wrong key is refused", await v1("GET", "/api/v1/brief", undefined, "gw_" + "0".repeat(48)), is(401));
  expect("api: too-short draft is a clear 400", await v1("POST", "/api/v1/check", { text: "hi" }), is(400));
  const narrow = (await call("POST", "/api/keys", { role: "manager", body: { name: "Brief only", scopes: ["brief:read"] } })).j;
  expect("api: a key without the scope is refused", await v1("POST", "/api/v1/check", { text }, narrow.key), is(403));
  // A real MCP client, connected over Streamable HTTP with the key.
  const client = new Client({ name: "probe", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(L + "/api/mcp"), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  expect("mcp: lists get_brief and check_draft", { s: 200, j: tools }, (r) => JSON.stringify(r.j) === JSON.stringify(["check_draft", "get_brief"]));
  const res = await client.callTool({ name: "check_draft", arguments: { text, content_type: "social", use_ai: false } });
  const mcpFindings = (res.structuredContent?.findings ?? []).map((f) => `${f.rule_id}|${f.quote}`).sort();
  expect("mcp: check_draft gives the same findings as the app", { s: 200, j: mcpFindings }, (r) => !res.isError && JSON.stringify(r.j) === JSON.stringify(appFindings));
  await client.close();
  const listed = (await call("GET", "/api/keys")).j;
  expect("api: every call is in the audit trail", { s: 200, j: listed }, (r) => r.j.calls.some((c) => c.detail.via === "mcp" && c.detail.endpoint === "check_draft" && c.detail.status === 200) && r.j.calls.some((c) => c.detail.endpoint === "GET /api/v1/brief" && c.detail.status === 200));
  await call("DELETE", `/api/keys/${made.j.row.id}`, { role: "manager" });
  expect("api: a revoked key stops working at once", await v1("GET", "/api/v1/brief"), is(401));
  expect("api: another workspace cannot see these keys", { s: 200, j: await (await fetch(L + "/api/keys", { headers: { "x-workspace": "probe-" + randomUUID().slice(0, 12) } })).json() }, (r) => r.j.keys.length === 0);
}

// Round 3 improvement 3, campaign review with AI vision: a three-asset campaign with a price mismatch between
// the creative and the brochure, and a student shown with no consent. Both found, cited, routed to compliance.
{
  const { readFileSync } = await import("node:fs");
  const dataUrl = "data:image/png;base64," + readFileSync(new URL("../public/sample-campaign-creative.png", import.meta.url)).toString("base64");
  const r = await call("POST", "/api/drafts", { body: {
    title: "Campaign probe", content_type: "social",
    text: "JEE crash course for droppers. Starts 5 January. Fee ₹12,999. Use code EARLY20 when you enrol at admissions@preppath.in.",
    images: [{ name: "sample-campaign-creative.png", alt: "Crash course creative with an illustrated student holding a trophy", dataUrl, colours: [{ hex: "#0F6B5F", share: 0.8 }], ocr: "PrepPath Academy\nJEE Crash Course\nFee ₹12,999\nStarts 5 January\nCode EARLY20\nadmissions@preppath.in" }],
    assets: [{ name: "brochure", text: "PrepPath JEE Crash Course. Fee ₹14,999 including printed test papers. Classes start on 5 January. Early-bird code EARLY20." }],
  } });
  expect("campaign: a three-asset campaign is accepted", r, (x) => x.s === 200);
  const d = (await call("GET", `/api/drafts/${r.j.id}`)).j;
  const price = d.findings.find((f) => f.rule_id === "CONS-1" && f.quote === "₹14,999");
  expect("campaign: the price mismatch between creative and brochure is found and cited", { s: 200, j: price }, (x) => !!x.j && x.j.location === "asset:1" && /₹12,999/.test(x.j.message) && x.j.risk === "high");
  const person = d.findings.find((f) => f.rule_id === "VIS-PEOPLE");
  expect("campaign: AI vision finds the student shown, with no identity guessed", { s: 200, j: { person, mode: d.draft.mode, people: d.draft.images[0].vision?.people } }, (x) => !!x.j.person && x.j.person.location === "image:1" && x.j.people?.length >= 1);
  await call("POST", `/api/drafts/${r.j.id}`, { body: { action: "submit" } });
  const routed = (await call("GET", `/api/drafts/${r.j.id}`)).j.draft;
  expect("campaign: routed to compliance", { s: 200, j: routed }, (x) => x.j.status === "compliance_review");
  expect("campaign: more than 4 documents is a clear 400", await call("POST", "/api/drafts", { body: { text: "A valid draft text here.", assets: Array(5).fill({ name: "x", text: "Some document text here." }) } }), is4xx);
}

// Bulk check: up to 50 posts, code checks only, one result per post; bad lists are a clear 400.
{
  const two = await call("POST", "/api/bulk", { body: { posts: [
    { text: "100% selection guaranteed for every student. Enrol today, limited seats!!", title: "Promo" },
    { text: "Our adaptive practice classes adjust to how you learn. Write to admissions@preppath.in.", content_type: "email", date: "2026-12-05" },
  ] } });
  expect("bulk: 2 posts give 2 results, code checks only", two, (r) => r.s === 200 && r.j?.mode === "rules-only" && r.j.results?.length === 2
    && r.j.results[0].verdict === "fix_before_publishing" && r.j.results[0].top.some((f) => f.rule_id === "R-12" && f.rule_title && f.quote)
    && r.j.results[1].verdict === "ready_for_review" && typeof r.j.results[1].counts?.critical === "number");
  const post = { text: "A post that is long enough to check." };
  expect("bulk: 51 posts refused", await call("POST", "/api/bulk", { body: { posts: Array(51).fill(post) } }), (r) => is4xx(r) && r.s === 400 && /50/.test(r.j.error));
  expect("bulk: a post under 10 characters refused, naming the post", await call("POST", "/api/bulk", { body: { posts: [post, { text: "too short" }] } }), (r) => is4xx(r) && r.s === 400 && /post 2/.test(r.j.error));
  expect("bulk: malformed JSON refused", await call("POST", "/api/bulk", { raw: "{not json" }), (r) => is4xx(r) && r.s === 400);
  expect("bulk: an unknown content type refused", await call("POST", "/api/bulk", { body: { posts: [{ ...post, content_type: "fax" }] } }), (r) => is4xx(r) && r.s === 400);
}

// Read-only share links of an approval record: only for approved drafts; the public copy needs no workspace,
// shows the record and nothing that identifies the workspace; reviewers revoke; other workspaces cannot.
{
  expect("share: refused for a draft that is not approved", await call("POST", `/api/drafts/${id}`, { body: { action: "share" } }), (r) => is4xx(r) && r.s === 409);
  const approved = (await call("GET", "/api/drafts")).j.drafts.find((x) => x.status === "approved");
  const sh = await call("POST", `/api/drafts/${approved.id}`, { body: { action: "share" } });
  const days = (Date.parse(sh.j?.expires_at) - Date.now()) / 864e5;
  expect("share: an approved draft gives a /r/ link valid 30 days", sh, (r) => r.s === 200 && /\/r\/[A-Za-z0-9_-]{43}$/.test(r.j?.url ?? "") && days > 29.9 && days <= 30);
  const token = sh.j.url.split("/r/")[1];
  const rec = (await call("GET", `/api/drafts/${approved.id}`)).j;
  const pub = await fetch(`${L}/api/share/${token}`);
  const pj = await pub.json().catch(() => null);
  const pubText = JSON.stringify(pj);
  expect("share: the public copy needs no workspace, and has the approved text and fingerprint", { s: pub.status, j: pj }, (r) => r.s === 200
    && r.j?.record?.approved_text === rec.receipt.approved_text && r.j.record.fingerprint === rec.receipt.text_hash && r.j.record.approvers.length >= 1);
  expect("share: the public copy has no workspace id, draft id or token hash", { s: pub.status, j: pj }, () => !pubText.includes(ws) && !pubText.includes(approved.id) && !/"(hash|ws|draft_id)"/.test(pubText));
  expect("share: the public copy is not indexed or cached", { s: pub.status, j: {} }, () => /noindex/.test(pub.headers.get("x-robots-tag") ?? "") && /no-store/.test(pub.headers.get("cache-control") ?? ""));
  const page = await fetch(`${L}/r/${token}`);
  const html = await page.text();
  expect("share: the /r/ page shows the record, noindex, with the validity footer", { s: page.status, j: {} }, (r) => r.s === 200 && /<meta name="robots" content="noindex"/.test(html)
    && /Read-only copy shared from Guidewise; valid until/.test(html) && html.includes(rec.receipt.text_hash) && !html.includes(ws));
  const listed = (await call("GET", `/api/drafts/${approved.id}`)).j;
  expect("share: the draft lists its active link, without token or hash", { s: 200, j: listed }, (r) => r.j.shares?.length === 1 && r.j.shares[0].expires_at === sh.j.expires_at
    && !JSON.stringify(r.j).includes(token) && !JSON.stringify(r.j.events).includes('"hash"'));
  const shareId = listed.shares[0].id;
  expect("share: the creator cannot revoke", await call("POST", `/api/drafts/${approved.id}`, { body: { action: "unshare", share_id: shareId } }), is(403));
  const otherWs = { "x-workspace": "probe-" + randomUUID().slice(0, 12), "x-role": "brand", "content-type": "application/json" };
  const foreign = await fetch(`${L}/api/drafts/${approved.id}`, { method: "POST", headers: otherWs, body: JSON.stringify({ action: "unshare", share_id: shareId }) });
  expect("share: another workspace cannot revoke", { s: foreign.status, j: await foreign.json().catch(() => null) }, (r) => r.s === 404 || r.s === 403);
  expect("share: another workspace cannot list the shares", await fetch(`${L}/api/drafts/${approved.id}`, { headers: otherWs }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) })), (r) => r.s === 404 && !r.j?.shares);
  expect("share: a reviewer revokes it", await call("POST", `/api/drafts/${approved.id}`, { role: "brand", body: { action: "unshare", share_id: shareId } }), is(200));
  expect("share: a revoked link is not found", { s: (await fetch(`${L}/api/share/${token}`)).status, j: {} }, is(404));
  expect("share: the revoked /r/ page is a 404", { s: (await fetch(`${L}/r/${token}`)).status, j: {} }, is(404));
  expect("share: an unknown token is not found", { s: (await fetch(`${L}/api/share/${randomUUID().replace(/-/g, "")}${"x".repeat(11)}`)).status, j: {} }, is(404));
  expect("share: a malformed token is not found", { s: (await fetch(`${L}/api/share/not-a-token`)).status, j: {} }, is(404));
  expect("share: revoking again is refused", await call("POST", `/api/drafts/${approved.id}`, { role: "brand", body: { action: "unshare", share_id: shareId } }), (r) => is4xx(r) && r.s === 409);
  expect("share: an approved draft stays locked for other actions", await call("POST", `/api/drafts/${approved.id}`, { body: { action: "comment", comment: "x" } }), is(409));
}

// Bug hunt (20 Nov): repeated and racing calls, and odd bodies. Run in a workspace of their own.
{
  const other = { "x-workspace": "probe-race-" + randomUUID().slice(0, 12) };
  const inWs = (method, path, o = {}) => call(method, path, { ...o, headers: { ...other, ...(o.headers ?? {}) } });
  await Promise.all([1, 2, 3, 4].map(() => inWs("GET", "/api/state")));
  await Promise.all([1, 2, 3].map(() => inWs("POST", "/api/reset")));
  const seeded = await inWs("GET", "/api/drafts");
  expect("race: 3 resets at once leave one seeded approved draft", seeded, (r) => r.s === 200 && r.j.drafts.length === 1 && r.j.drafts[0].status === "approved");
  const v0 = (await inWs("GET", "/api/state")).j.kit.version;
  const fact = { id: "F-77", statement: "We run 12 study centres", value: 12, evidence: "Ops list", keywords: "centres" };
  const saves = await Promise.all([1, 2, 3, 4, 5].map(() => inWs("POST", "/api/facts", { role: "manager", body: fact })));
  const v1 = (await inWs("GET", "/api/state")).j.kit.version;
  expect("race: 5 fact saves at once make 5 Brand Kit versions", { s: saves.every((x) => x.s === 200) ? 200 : 500, j: { v0, v1 } }, (r) => r.s === 200 && v1 === v0 + 5);
  const keys = await Promise.all(Array.from({ length: 13 }, (_, i) => inWs("POST", "/api/keys", { role: "manager", body: { name: `race ${i}`, scopes: ["brief:read", "brief:read"] } })));
  const active = (await inWs("GET", "/api/keys")).j.keys.filter((k) => !k.revoked_at);
  expect("race: 13 key creations at once stop at 10 active keys", { s: 200, j: { active: active.length, codes: keys.map((k) => k.s) } }, () => active.length === 10 && keys.filter((k) => k.s === 200).length === 10);
  expect("keys: a scope listed twice is stored once", { s: 200, j: active[0] }, () => active[0].scopes.length === 1);
  for (const p of ["/api/drafts", "/api/facts", "/api/rules", "/api/rules/R-12", "/api/kit", "/api/compile", "/api/extract"]) {
    for (const raw of ["null", "\"x\"", "5"]) expect(`body ${raw} ${p} is a 400`, await inWs("POST", p, { role: "manager", raw }), (r) => is4xx(r) && r.s === 400);
  }
  expect("drafts: an unknown content type refused", await inWs("POST", "/api/drafts", { body: { text: "A normal post about our classes.", content_type: "<script>", useAI: false } }), (r) => is4xx(r) && r.s === 400);
  expect("drafts: invisible characters only refused", await inWs("POST", "/api/drafts", { body: { text: "​".repeat(20), useAI: false } }), (r) => is4xx(r) && r.s === 400);
  const long = await inWs("POST", "/api/drafts", { body: { title: "T".repeat(5000), text: "A normal post about our classes.", useAI: false } });
  expect("drafts: a 5,000-character title is cut to 200", long, (r) => r.s === 200);
  if (long.j?.id) expect("drafts: stored title is 200 characters", await inWs("GET", `/api/drafts/${long.j.id}`), (r) => r.j?.draft?.title?.length === 200);
  expect("facts: deleting a fact that is not there is a 404", await inWs("DELETE", "/api/facts/NOPE-1", { role: "manager" }), (r) => is4xx(r) && r.s === 404);
  expect("rules: deleting a rule that is not there is a 404", await inWs("DELETE", "/api/rules/NOPE-1", { role: "manager" }), (r) => is4xx(r) && r.s === 404);
  const rule = { id: "BAD-5", kind: "code", category: "pattern", title: "t", description: "d", tests: [] };
  expect("rule with an overlapping repeated choice (a|a)*$ refused", await inWs("POST", "/api/rules", { role: "manager", body: { ...rule, config: { patterns: ["(a|a)*$"] } } }), (r) => is4xx(r) && /options can match/.test(r.j.error));
  expect("import: a rule that can flag nothing refused", await inWs("POST", "/api/kit/import", { role: "manager", body: { format: "guidewise-brand-kit", rules: [{ ...rule, category: "term", config: {} }] } }), (r) => is4xx(r) && /could never flag/.test(r.j.error));
  expect("import: an overlapping pattern refused", await inWs("POST", "/api/kit/import", { role: "manager", body: { format: "guidewise-brand-kit", rules: [{ ...rule, config: { patterns: ["(\\w|\\d)+$"] } }] } }), is4xx);
  expect("logo: base64 that is not a PNG refused", await inWs("POST", "/api/kit", { role: "manager", body: { logo: "data:image/png;base64,notbase64!!!" } }), is4xx);
  expect("logo: a JPEG labelled PNG refused", await inWs("POST", "/api/kit", { role: "manager", body: { logo: "data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD" } }), is4xx);
  for (const n of ["abc", "-5", "1e400"]) expect(`profile: students coached "${n}" refused`, await inWs("POST", "/api/kit", { role: "manager", body: { profile: { students_coached: n } } }), (r) => is4xx(r) && r.s === 400);
}

// Undo after accepting a fix: the text before it comes back as a new version and the finding reopens; refused once the
// text has changed, while the draft is with a reviewer, and from another workspace. "Accept all" is undone as one step.
{
  const text = "100% selection guaranteed!! Call 98765 43210 to join Preppath.";
  const { j: du } = await call("POST", "/api/drafts", { body: { title: "Undo probe", content_type: "social", text, useAI: false } });
  const get = async () => (await call("GET", `/api/drafts/${du.id}`)).j;
  const fixable = (d) => d.findings.find((f) => f.state === "open" && f.fix !== null && f.fix !== undefined && (f.location ?? "text") === "text");
  const f = fixable(await get());
  expect("undo: the probe draft has a fix to accept", { s: 200, j: f }, (r) => !!r.j);
  const acc = await call("POST", `/api/drafts/${du.id}`, { body: { action: "accept", finding_id: f.id } });
  expect("undo: accepting a fix returns the version it made", acc, (r) => r.s === 200 && r.j.version === 2);
  expect("undo: a finding_id that is not accepted is refused", await call("POST", `/api/drafts/${du.id}`, { body: { action: "undo_accept", finding_id: randomUUID() } }), is4xx);
  const other = await fetch(L + `/api/drafts/${du.id}`, { method: "POST", headers: { "x-workspace": "probe-" + randomUUID().slice(0, 12), "x-role": "creator", "content-type": "application/json" }, body: JSON.stringify({ action: "undo_accept", finding_id: f.id }) });
  expect("undo: another workspace cannot undo the fix", { s: other.status, j: await other.json().catch(() => null) }, (r) => r.s === 404 || r.s === 403);
  const un = await call("POST", `/api/drafts/${du.id}`, { body: { action: "undo_accept", finding_id: f.id } });
  expect("undo: undo succeeds", un, (r) => r.s === 200 && r.j.version === 3 && r.j.reopened.includes(f.id));
  const after = await get();
  expect("undo: the text is restored as a new version and the finding is open again", { s: 200, j: after }, (r) => r.j.draft.text === text && r.j.draft.version === 3
    && r.j.versions[0].text === text && r.j.findings.find((x) => x.id === f.id)?.state === "open"
    && r.j.events.some((e) => e.action === "fix_undone" && e.detail.undid_version === 2 && e.detail.restored_version === 1));
  expect("undo: the same fix cannot be undone twice", await call("POST", `/api/drafts/${du.id}`, { body: { action: "undo_accept", finding_id: f.id } }), (r) => r.s === 409);
  // Accept again, then change the text: undo must refuse rather than overwrite the edit.
  await call("POST", `/api/drafts/${du.id}`, { body: { action: "accept", finding_id: f.id } });
  await call("POST", `/api/drafts/${du.id}`, { body: { action: "edit", text: (await get()).draft.text + " Classes start 1 December.", useAI: false } });
  expect("undo: refused with 409 once the text has changed since the accept", await call("POST", `/api/drafts/${du.id}`, { body: { action: "undo_accept", finding_id: f.id } }),
    (r) => r.s === 409 && /text has changed/.test(r.j?.error ?? ""));
  // Accept all is one step, and undoing it restores the version before it.
  const before = (await get()).draft;
  const all = await call("POST", `/api/drafts/${du.id}`, { body: { action: "accept_all" } });
  if (all.s === 200) {
    const ua = await call("POST", `/api/drafts/${du.id}`, { body: { action: "undo_accept", version: all.j.version } });
    const back = await get();
    expect("undo: Accept all is undone as one step", ua, (r) => r.s === 200 && back.draft.text === before.text && !back.findings.some((x) => x.state === "accepted" && x.draft_version === all.j.version));
  }
  await call("POST", `/api/drafts/${du.id}`, { body: { action: "accept", finding_id: fixable(await get()).id } });
  await call("POST", `/api/drafts/${du.id}`, { body: { action: "submit" } });
  const acceptedNow = (await get()).findings.find((x) => x.state === "accepted");
  expect("undo: refused with 409 while the draft is with a reviewer", await call("POST", `/api/drafts/${du.id}`, { body: { action: "undo_accept", finding_id: acceptedNow?.id } }), is(409));
}

// Precedents: after a finding is dismissed on one draft, a second draft with the same rule shows it, and the draft itself does not.
{
  const text = "For the December batch, call 98765 43210 today.";
  const mk = async () => (await call("POST", "/api/drafts", { body: { title: "Precedent probe", content_type: "social", text, useAI: false } })).j.id;
  const first = await mk();
  const f = (await call("GET", `/api/drafts/${first}`)).j.findings.find((x) => x.rule_id === "R-15" && x.state === "open");
  expect("precedents: the first draft has the contact finding", { s: 200, j: f }, (r) => !!r.j);
  await call("POST", `/api/drafts/${first}`, { role: "compliance", body: { action: "dismiss", finding_id: f?.id, reason: "The rule does not apply to this content" } });
  const second = (await call("GET", `/api/drafts/${await mk()}`)).j;
  const p = second.precedents?.["R-15"];
  expect("precedents: the second draft shows the dismissal, its reason, who and when", { s: 200, j: p }, (r) => r.j?.dismissed >= 1
    && r.j.last?.reason === "The rule does not apply to this content" && r.j.last.by === "Kavya" && typeof r.j.last.at === "string");
  const firstAgain = await call("GET", `/api/drafts/${first}`);
  expect("precedents: a draft's own dismissal is not its own precedent", firstAgain, (r) => r.s === 200 && r.j.precedents?.["R-15"]?.last?.reason !== "The rule does not apply to this content");
  // Another workspace's draft with the same rule has no history from this one.
  const h = { "x-workspace": "probe-" + randomUUID().slice(0, 12), "x-role": "creator", "content-type": "application/json" };
  const made = await (await fetch(L + "/api/drafts", { method: "POST", headers: h, body: JSON.stringify({ title: "Precedent isolation", content_type: "social", text, useAI: false }) })).json();
  const elsewhere = await (await fetch(L + `/api/drafts/${made.id}`, { headers: h })).json();
  expect("precedents: another workspace's draft shows none of this workspace's history", { s: 200, j: elsewhere }, (r) => !!r.j.draft && !r.j.precedents?.["R-15"]);
}

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
// Racing calls on one draft: only the first of several identical state changes wins; the others get a 409.
{
  const rw = { "x-workspace": "probe-drace-" + randomUUID().slice(0, 12) };
  const inR = (method, path, o = {}) => call(method, path, { ...o, headers: { ...rw, ...(o.headers ?? {}) } });
  await inR("GET", "/api/state");
  expect("drafts: a null body is a 400", await inR("POST", `/api/drafts/${randomUUID()}`, { raw: "null" }), (r) => r.s === 400 || r.s === 404);
  // Low risk: brand review, single sign-off.
  const mk = async (text) => (await inR("POST", "/api/drafts", { body: { title: "Race probe", content_type: "email", text, useAI: false } })).j.id;
  const low = await mk("Our evening doubt sessions run every weekday for the December batch. Write to admissions@preppath.in.");
  const subs = await Promise.all([1, 2, 3].map(() => inR("POST", `/api/drafts/${low}`, { body: { action: "submit" } })));
  const lowEv = (await inR("GET", `/api/drafts/${low}`)).j;
  expect("race: 3 submits at once log one submission", { s: 200, j: subs.map((x) => x.s) }, () => lowEv.events.filter((e) => e.action === "submitted").length === 1 && subs.filter((x) => x.s === 200).length === 1);
  for (const f of lowEv.findings.filter((x) => x.state === "open" && x.level === "violation")) {
    await inR("POST", `/api/drafts/${low}`, { role: "brand", body: { action: "dismiss", finding_id: f.id, reason: "Approved exception" } });
  }
  const aps = await Promise.all([1, 2, 3, 4, 5].map(() => inR("POST", `/api/drafts/${low}`, { role: "brand", body: { action: "approve" } })));
  const lowAfter = (await inR("GET", `/api/drafts/${low}`)).j;
  expect("race: 5 approvals at once give one receipt and one approval", { s: 200, j: aps.map((x) => x.s) }, () => lowAfter.draft.status === "approved"
    && lowAfter.events.filter((e) => e.action === "approved").length === 1 && aps.filter((x) => x.s === 200).length === 1 && aps.every((x) => x.s === 200 || x.s === 409));
  // High risk: compliance signs off once, however many times it is pressed at once.
  const high = await mk("100% selection guaranteed for every student who joins the December batch.");
  await inR("POST", `/api/drafts/${high}`, { body: { action: "submit" } });
  for (const f of (await inR("GET", `/api/drafts/${high}`)).j.findings.filter((x) => x.state === "open" && x.level === "violation")) {
    await inR("POST", `/api/drafts/${high}`, { role: "compliance", body: { action: "dismiss", finding_id: f.id, reason: "Approved exception" } });
  }
  const cs = await Promise.all([1, 2, 3, 4, 5].map(() => inR("POST", `/api/drafts/${high}`, { role: "compliance", body: { action: "approve" } })));
  const highEv = (await inR("GET", `/api/drafts/${high}`)).j;
  expect("race: 5 compliance sign-offs at once are recorded once", { s: 200, j: cs.map((x) => x.s) }, () => highEv.events.filter((e) => e.action === "approved_partial").length === 1 && highEv.draft.status === "compliance_review");
  const bs = await Promise.all([1, 2, 3].map(() => inR("POST", `/api/drafts/${high}`, { role: "brand", body: { action: "approve" } })));
  const highAfter = (await inR("GET", `/api/drafts/${high}`)).j;
  expect("race: 3 brand sign-offs at once give one receipt", { s: 200, j: bs.map((x) => x.s) }, () => highAfter.draft.status === "approved" && highAfter.events.filter((e) => e.action === "approved").length === 1);
  // Accept all, three times at once: versions stay unique.
  const fx = await mk("Join Preppath today. Call 98765 43210 for the December batch, admissions open now for every student.");
  await Promise.all([1, 2, 3].map(() => inR("POST", `/api/drafts/${fx}`, { body: { action: "accept_all" } })));
  const vs = (await inR("GET", `/api/drafts/${fx}`)).j.versions.map((v) => v.version);
  expect("race: 3 Accept all at once leave unique version numbers", { s: 200, j: vs }, () => new Set(vs).size === vs.length);
}

// "Make this a rule": propose a rule from selected words (nothing saved), then save it as advisory. A workspace of its own,
// so the rule it adds changes no counts elsewhere.
{
  const mw = { "x-workspace": "probe-make-" + randomUUID().slice(0, 12) };
  const inM = (method, path, o = {}) => call(method, path, { ...o, headers: { ...mw, ...(o.headers ?? {}) } });
  const words = { text: "India's #1 coaching", sentence: "Join India's #1 coaching for NEET 2027.", ai: false };
  const before = (await inM("GET", "/api/state")).j.rules.length;
  const prop = await inM("POST", "/api/rules/propose", { role: "brand", body: words });
  expect("make rule: a reviewer gets a pattern rule whose own tests pass by code", prop, (r) => r.s === 200 && r.j.proposal.rule.category === "pattern"
    && r.j.proposal.rule.status === "advisory" && r.j.run.passed && r.j.run.mode === "code" && r.j.run.results.length >= 4);
  expect("make rule: proposing saves nothing", await inM("GET", "/api/state"), (r) => r.j.rules.length === before);
  expect("make rule: a creator cannot propose", await inM("POST", "/api/rules/propose", { body: words }), (r) => is4xx(r) && r.s === 403);
  expect("make rule: a creator cannot save", await inM("POST", "/api/rules", { body: { made_from_words: words } }), (r) => is4xx(r) && r.s === 403);
  expect("make rule: too short refused", await inM("POST", "/api/rules/propose", { role: "brand", body: { text: "ab" } }), (r) => is4xx(r) && r.s === 400 && /at least 3/.test(r.j.error));
  expect("make rule: too long refused", await inM("POST", "/api/rules/propose", { role: "brand", body: { text: "word ".repeat(40) } }), (r) => is4xx(r) && r.s === 400);
  expect("make rule: a duplicate of TERM-2's word refused, naming the rule", await inM("POST", "/api/rules/propose", { role: "manager", body: { text: "cheap" } }), (r) => is4xx(r) && r.s === 409 && /TERM-2/.test(r.j.error));
  const saved = await inM("POST", "/api/rules", { role: "compliance", body: { made_from_words: words } });
  expect("make rule: a reviewer adds it as advisory, with its tests passed", saved, (r) => r.s === 200 && /^W-\d\d$/.test(r.j.id) && r.j.run.passed);
  const after = (await inM("GET", "/api/state")).j.rules;
  expect("make rule: one advisory rule added", { s: 200, j: { n: after.length } }, () => after.length === before + 1 && after.find((x) => x.id === saved.j?.id)?.status === "advisory");
  expect("make rule: the same words again are refused as a duplicate", await inM("POST", "/api/rules", { role: "brand", body: { made_from_words: words } }), (r) => is4xx(r) && r.s === 409 && r.j.error.includes(saved.j?.id ?? "W-"));
  expect("make rule: a reviewer still cannot change rules the normal way", await inM("POST", "/api/rules", { role: "brand", body: { id: "X-2", title: "t", description: "d" } }), is(403));
}

// "Invite a teammate": a reviewer makes a join link to this workspace; only its hash is stored. Joining hands the
// workspace id to the browser that presses Join; unknown, expired and revoked links are refused alike; other
// workspaces stay isolated. A workspace of its own, so its events change nothing elsewhere.
{
  const iw = "probe-inv-" + randomUUID().slice(0, 12);
  const inI = (method, path, o = {}) => call(method, path, { ...o, headers: { "x-workspace": iw, ...(o.headers ?? {}) } });
  await inI("GET", "/api/state"); // seeds the workspace with its approved sample draft
  const draft = (await inI("GET", "/api/drafts")).j.drafts[0];
  expect("invite: the creator cannot make a join link", await inI("POST", "/api/invites", { body: { draft_id: draft.id } }), (r) => is4xx(r) && r.s === 403);
  expect("invite: a bad draft id is refused", await inI("POST", "/api/invites", { role: "manager", body: { draft_id: "nope" } }), (r) => is4xx(r) && r.s === 400);
  expect("invite: another workspace's draft is not found", await inI("POST", "/api/invites", { role: "manager", body: { draft_id: id } }), (r) => is4xx(r) && r.s === 404);
  const made = await inI("POST", "/api/invites", { role: "manager", body: { draft_id: draft.id } });
  const days = (Date.parse(made.j?.expires_at) - Date.now()) / 864e5;
  expect("invite: the brand manager makes a /join/ link valid 7 days", made, (r) => r.s === 200 && /\/join\/[A-Za-z0-9_-]{43}$/.test(r.j?.url ?? "") && days > 6.9 && days <= 7);
  const token = (made.j?.url ?? "").split("/join/")[1] ?? "";
  const listed = await inI("GET", "/api/invites");
  expect("invite: listed without token or hash", listed, (r) => r.s === 200 && r.j.invites.some((x) => x.id === made.j?.invite?.id) && !JSON.stringify(r.j).includes(token) && !/"hash"/.test(JSON.stringify(r.j)));
  const acts = (await inI("GET", `/api/drafts/${draft.id}`)).j;
  expect("invite: the draft's activity shows it, without the hash", { s: 200, j: acts.events?.[0] }, (r) => r.j?.action === "invite_created" && !("hash" in (r.j?.detail ?? {})));
  const preview = await fetch(`${L}/api/join/${token}`);
  const pj = await preview.json().catch(() => null);
  expect("invite: the preview names who invited and the draft, not the workspace", { s: preview.status, j: pj }, (r) => r.s === 200 && r.j.invite.created_by === "Meera" && r.j.invite.draft_title === draft.title && !JSON.stringify(r.j).includes(iw));
  const page = await fetch(`${L}/join/${token}`);
  const html = await page.text();
  expect("invite: the /join/ page explains and asks before joining", { s: page.status, j: {} }, (r) => r.s === 200 && />Join</.test(html) && /<meta name="robots" content="noindex"/.test(html) && !html.includes(iw));
  expect("invite: GET does not join (no invite_accepted event)", await inI("GET", `/api/drafts/${draft.id}`), (r) => !r.j.events.some((e) => e.action === "invite_accepted"));
  const second = "probe-two-" + randomUUID().slice(0, 12);
  const asSecond = (path) => fetch(L + path, { headers: { "x-workspace": second } }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) }));
  expect("invite: before joining, a second workspace cannot see the draft", await asSecond(`/api/drafts/${draft.id}`), is(404));
  const joined = await fetch(`${L}/api/join/${token}`, { method: "POST", headers: { "x-workspace": second, "x-role": "compliance" } });
  const jj = await joined.json().catch(() => null);
  expect("invite: Join hands over the workspace and the draft", { s: joined.status, j: jj }, (r) => r.s === 200 && r.j.ws === iw && r.j.draft_id === draft.id);
  const seen = await fetch(`${L}/api/drafts/${draft.id}`, { headers: { "x-workspace": jj?.ws ?? "", "x-role": "compliance" } }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) }));
  expect("invite: with the joined workspace header, the second person sees the draft and the join", seen, (r) => r.s === 200 && r.j.draft.id === draft.id && r.j.events.some((e) => e.action === "invite_accepted" && e.actor === "Kavya"));
  expect("invite: other workspaces are still isolated", await asSecond(`/api/drafts/${draft.id}`), is(404));
  expect("invite: the probe's own workspace cannot see it either", await call("GET", `/api/drafts/${draft.id}`), is(404));
  expect("invite: the creator cannot revoke", await inI("DELETE", `/api/invites/${made.j?.invite?.id}`), (r) => is4xx(r) && r.s === 403);
  expect("invite: another workspace cannot revoke", await call("DELETE", `/api/invites/${made.j?.invite?.id}`, { role: "manager" }), (r) => is4xx(r) && r.s === 404);
  expect("invite: a reviewer revokes it", await inI("DELETE", `/api/invites/${made.j?.invite?.id}`, { role: "brand" }), is(200));
  expect("invite: revoking again is refused", await inI("DELETE", `/api/invites/${made.j?.invite?.id}`, { role: "brand" }), (r) => is4xx(r) && r.s === 409);
  expect("invite: a revoked link cannot join", { s: (await fetch(`${L}/api/join/${token}`, { method: "POST" })).status, j: {} }, is(404));
  expect("invite: the revoked /join/ page is a 404", { s: (await fetch(`${L}/join/${token}`)).status, j: {} }, is(404));
  expect("invite: an unknown token is not found", { s: (await fetch(`${L}/api/join/${randomUUID().replace(/-/g, "")}${"x".repeat(11)}`, { method: "POST" })).status, j: {} }, is(404));
  expect("invite: a malformed token is not found", { s: (await fetch(`${L}/api/join/not-a-token`, { method: "POST" })).status, j: {} }, is(404));
  expect("invite: a bad id to revoke is not found", await inI("DELETE", "/api/invites/abc", { role: "manager" }), (r) => is4xx(r) && r.s === 404);
  // An expired link: written straight to the database (the API only makes 7-day links), when the probe has its address.
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, SK = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (SB && SK) {
    const old = randomBytes(32).toString("base64url");
    const ins = await fetch(`${SB.replace(/\/$/, "")}/rest/v1/events`, {
      method: "POST", headers: { apikey: SK, authorization: `Bearer ${SK}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ ws: iw, draft_id: null, actor: "Meera", role: "manager", action: "invite_created", detail: { hash: createHash("sha256").update(old).digest("hex"), expires_at: new Date(Date.now() - 6e4).toISOString(), created_by: "Meera" } }),
    });
    // Since migration 011 the public key cannot write to the tables at all, so this setup is refused (checked below).
    if (ins.status === 201) {
      expect("invite: an expired link cannot join", { s: (await fetch(`${L}/api/join/${old}`, { method: "POST" })).status, j: {} }, is(404));
      expect("invite: an expired link is not listed as active", await inI("GET", "/api/invites"), (r) => r.s === 200 && r.j.invites.length === 0);
    } else console.log(`skip invite: expired link (the public key cannot write to events: ${ins.status}); expiry is covered by unit tests`);
  } else console.log("skip invite: expired link (set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_KEY to write one)");
}

// Accounts and organisations: a claimed workspace needs a member's sign-in, and the member's role from the table wins
// over x-role. Skipped until migration 010 (members) is applied, or when sign-up needs email confirmation.
{
  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, ""), SK = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  const table = SB && SK ? await fetch(`${SB}/rest/v1/rpc/workspace_claimed`, { method: "POST", headers: { apikey: SK, authorization: `Bearer ${SK}`, "content-type": "application/json" }, body: JSON.stringify({ p_ws: "probe-none-0000" }) }) : null;
  if (!table) console.log("skip accounts: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_KEY");
  else if (!table.ok) console.log(`skip accounts: migration 010 is not applied yet (apply supabase/migrations/010_accounts.sql); got ${table.status}`);
  else {
    const signUp = async () => {
      const r = await fetch(`${SB}/auth/v1/signup`, { method: "POST", headers: { apikey: SK, "content-type": "application/json" }, body: JSON.stringify({ email: `probe-${randomUUID().slice(0, 12)}@mailinator.com`, password: randomBytes(12).toString("base64url") }) });
      const j = await r.json().catch(() => null);
      return { status: r.status, token: j?.access_token ?? j?.session?.access_token ?? null, j };
    };
    const A = await signUp();
    if (!A.token) console.log(`skip accounts: sign-up returned no session (status ${A.status}); the Supabase project requires email confirmation, or refused: ${JSON.stringify(A.j).slice(0, 160)}`);
    else {
      const cw = "acct-" + randomUUID().slice(0, 12);
      const as = (token, method, path, { role = "creator", body, headers = {} } = {}) => call(method, path, { role, body, headers: { "x-workspace": cw, ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
      expect("accounts: a new account claims a fresh workspace as its manager", await as(A.token, "POST", "/api/account", { body: { action: "claim", name: "Probe Manager" } }), (r) => r.s === 200 && r.j?.member?.role === "manager");
      expect("accounts: an unauthenticated request to the claimed workspace is 401", await as(null, "GET", "/api/state", { role: "manager" }), (r) => is4xx(r) && r.s === 401);
      expect("accounts: forged member headers without a token are still 401", await as(null, "GET", "/api/state", { headers: { "x-gw-member-id": "00000000-0000-0000-0000-000000000000", "x-gw-member-name": "Mallory" } }), (r) => r.s === 401);
      expect("accounts: an invalid token is 401", await as("aaa.bbb.ccc", "GET", "/api/state"), (r) => r.s === 401);
      expect("accounts: the member's token opens it", await as(A.token, "GET", "/api/state"), is(200));
      expect("accounts: another workspace is unaffected", await call("GET", "/api/state"), is(200));
      const B = await signUp();
      expect("accounts: (setup) a second account", { s: B.token ? 200 : 0, j: B.j }, (r) => r.s === 200);
      expect("accounts: a signed-in non-member is refused", await as(B.token, "GET", "/api/state"), (r) => is4xx(r) && r.s === 403);
      // Straight to the database with the public key and B's own token: the members table and its functions refuse.
      const rest = (path, body, token = B.token) => fetch(`${SB}${path}`, { method: "POST", headers: { apikey: SK, authorization: `Bearer ${token}`, "content-type": "application/json", prefer: "return=minimal" }, body: JSON.stringify(body) }).then((r) => ({ s: r.status, j: {} }));
      expect("accounts: a direct REST insert into members is refused", await rest("/rest/v1/members", { ws: cw, user_id: "00000000-0000-0000-0000-000000000000", role: "manager", name: "Mallory" }), (r) => r.s >= 400);
      expect("accounts: a direct REST insert into members with the anon key alone is refused", await rest("/rest/v1/members", { ws: cw, user_id: "00000000-0000-0000-0000-000000000000", role: "manager", name: "Mallory" }, SK), (r) => r.s >= 400);
      expect("accounts: set_member_role on a workspace you do not manage fails", await rest("/rest/v1/rpc/set_member_role", { p_ws: cw, p_user: "00000000-0000-0000-0000-000000000000", p_role: "manager" }), (r) => r.s >= 400);
      expect("accounts: claim_workspace on a claimed workspace fails", await rest("/rest/v1/rpc/claim_workspace", { p_ws: cw, p_name: "Mallory" }), (r) => r.s >= 400);
      // A forged invite: an invite_created row written into the open events table for the claimed workspace.
      const forged = randomBytes(32).toString("base64url");
      await fetch(`${SB}/rest/v1/events`, { method: "POST", headers: { apikey: SK, authorization: `Bearer ${SK}`, "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({ ws: cw, draft_id: null, actor: "Mallory", role: "manager", action: "invite_created", detail: { hash: createHash("sha256").update(forged).digest("hex"), expires_at: new Date(Date.now() + 864e5).toISOString(), created_by: "Mallory", member_role: "manager" } }) });
      expect("accounts: a forged invite event cannot add a member", { s: (await fetch(`${L}/api/join/${forged}`, { method: "POST", headers: { authorization: `Bearer ${B.token}` } })).status, j: {} }, is(404));
      expect("accounts: (after the forged invite) still not a member", await as(B.token, "GET", "/api/state"), (r) => r.s === 403);
      const inv = await as(A.token, "POST", "/api/invites", { body: { role: "creator" } });
      const tok = inv.j?.url?.split("/join/")[1];
      expect("accounts: joining a claimed workspace without signing in is 401", { s: (await fetch(`${L}/api/join/${tok}`, { method: "POST" })).status, j: {} }, is(401));
      expect("accounts: joining with a sign-in adds the member", { s: (await fetch(`${L}/api/join/${tok}`, { method: "POST", headers: { authorization: `Bearer ${B.token}` } })).status, j: {} }, is(200));
      const dr = await as(B.token, "POST", "/api/drafts", { body: { title: "Accounts probe", content_type: "email", text: "Our December batch starts on 5 December. Fee ₹39,999.", useAI: false } });
      await as(B.token, "POST", `/api/drafts/${dr.j?.id}`, { body: { action: "submit" } });
      expect("accounts: x-role spoofing is ignored (a creator member cannot approve)", await as(B.token, "POST", `/api/drafts/${dr.j?.id}`, { role: "compliance", body: { action: "approve" } }), (r) => is4xx(r) && r.s === 403);
      const bId = (await as(A.token, "GET", "/api/members")).j?.members?.find((m) => !m.you)?.user_id;
      expect("accounts: a creator member cannot change roles", await as(B.token, "PATCH", "/api/members", { role: "manager", body: { user_id: bId, role: "manager" } }), (r) => r.s === 403);
      expect("accounts: the manager makes them compliance", await as(A.token, "PATCH", "/api/members", { body: { user_id: bId, role: "compliance" } }), is(200));
      expect("accounts: the role change applies on the very next request", await as(B.token, "POST", `/api/drafts/${dr.j?.id}`, { role: "creator", body: { action: "approve" } }), (r) => r.s !== 403 && r.s < 500);
      const aId = (await as(A.token, "GET", "/api/members")).j?.members?.find((m) => m.you)?.user_id;
      expect("accounts: the last manager cannot remove themselves", await as(A.token, "DELETE", "/api/members", { body: { user_id: aId } }), (r) => is4xx(r) && r.s === 409);
      expect("accounts: the audit log names the signed-in member", await as(A.token, "GET", `/api/drafts/${dr.j?.id}`), (r) => r.s === 200 && JSON.stringify(r.j).includes(bId));
      expect("accounts: a removed member loses access at once", await (async () => { await as(A.token, "DELETE", "/api/members", { body: { user_id: bId } }); return as(B.token, "GET", "/api/state"); })(), (r) => r.s === 403);
    }
  }
}

// Direct database access with only the public key (NEXT_PUBLIC_SUPABASE_KEY, which ships to every browser):
// since migration 011 every read and write on the app's tables is refused, so only the server can reach them.
{
  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, ""), SK = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!SB || !SK) console.log("skip public key: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_KEY");
  else {
    const h = { apikey: SK, authorization: `Bearer ${SK}`, "content-type": "application/json", prefer: "return=representation" };
    const rest = async (method, path, body) => {
      const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      const t = await r.text();
      let rows = null; try { const j = JSON.parse(t); rows = Array.isArray(j) ? j.length : null; } catch { /* not JSON */ }
      return { s: r.status, j: { rows, body: t.slice(0, 120) } };
    };
    // Refused means permission denied (401/403), not a bad request: each call names a real column of its table.
    // A 200 with an empty list would mean the read was allowed but filtered.
    const refused = (r) => r.s === 401 || r.s === 403;
    const col = { findings: ["draft_id", randomUUID()] };
    for (const t of ["drafts", "findings", "events", "rules", "facts", "kit"]) {
      const [c, v] = col[t] ?? ["ws", ws];
      expect(`public key: select on ${t} is refused`, await rest("GET", `${t}?select=${c}&limit=1`), refused);
      expect(`public key: insert into ${t} is refused`, await rest("POST", t, { [c]: v }), refused);
      expect(`public key: update on ${t} is refused`, await rest("PATCH", `${t}?${c}=eq.${v}`, { [c]: v }), refused);
      expect(`public key: delete on ${t} is refused`, await rest("DELETE", `${t}?${c}=eq.${v}`), refused);
    }
    // The one function the public key keeps: whether a workspace has members.
    expect("public key: workspace_claimed is still callable", await rest("POST", "rpc/workspace_claimed", { p_ws: "probe-none-0000" }), is(200));
  }
}

console.log(`${checks - bad} of ${checks} checks passed.`);
console.log(bad ? `${bad} problem(s).` : "No problems.");
process.exit(bad ? 1 : 0);
