// The popup's logic, with no Chrome APIs, so it can be tested in Node (tests/extension.test.ts).
// Server text is only ever placed with textContent: nothing here builds HTML from a string.

export const DEFAULT_SITE = "https://guidewise-kohl.vercel.app";
export const MIN_CHARS = 10;
export const MAX_CHARS = 12000;
export const CONTENT_TYPES = [
  { v: "social", l: "Social post" },
  { v: "ad", l: "Advertisement" },
  { v: "email", l: "Email" },
  { v: "landing", l: "Landing page" },
  { v: "document", l: "Document or brochure" },
];
const KEY = /^gw_[0-9a-f]{48}$/i;

/** True for a Guidewise API key: gw_ and 48 hex characters. */
export function isKey(key) {
  return KEY.test(String(key ?? "").trim());
}

/**
 * The Guidewise site's origin from what the user typed. HTTPS only, except a local copy on
 * localhost or 127.0.0.1. Returns { origin } or { error }.
 * @param {string | undefined} input
 * @returns {{ origin: string, error?: undefined } | { error: string, origin?: undefined }}
 */
export function normaliseSite(input) {
  const raw = String(input ?? "").trim() || DEFAULT_SITE;
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return { error: "That is not a web address. Use the address of your Guidewise site, such as " + DEFAULT_SITE + "." }; }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.username || u.password) return { error: "Leave the user name and password out of the site address." };
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return { error: "The site address must start with https:// (http:// only for localhost)." };
  return { origin: u.origin };
}

/** The match pattern Chrome needs to let the popup call this origin. */
export const originPattern = (origin) => `${origin}/*`;

/**
 * The POST /api/v1/check call. Returns { url, init } or { error } when the input cannot be sent.
 * @param {{ site?: string, key?: string, text?: string, contentType?: string, useAi?: boolean }} o
 * @returns {{ url: string, init: { method: string, headers: Record<string, string>, body: string, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" }, error?: undefined } | { error: string, url?: undefined, init?: undefined }}
 */
export function buildCheckRequest({ site, key, text, contentType, useAi }) {
  const s = normaliseSite(site);
  if (s.error !== undefined) return { error: s.error };
  const k = String(key ?? "").trim();
  if (!k) return { error: "Add your API key in Settings first. Create one on the API page of your Guidewise site, with the draft:check scope." };
  if (!isKey(k)) return { error: "That API key does not look right: it starts with gw_ and has 48 more letters and digits. Copy it again from the API page." };
  const t = String(text ?? "").trim();
  if (t.length < MIN_CHARS) return { error: `Select or paste at least ${MIN_CHARS} characters of draft text.` };
  if (t.length > MAX_CHARS) return { error: `That is ${t.length.toLocaleString("en-IN")} characters; Guidewise checks up to ${MAX_CHARS.toLocaleString("en-IN")} at a time. Select a shorter part.` };
  const type = CONTENT_TYPES.some((c) => c.v === contentType) ? contentType : "social";
  return {
    url: `${s.origin}/api/v1/check`,
    init: {
      method: "POST",
      headers: { authorization: `Bearer ${k}`, "content-type": "application/json" },
      body: JSON.stringify({ text: t, content_type: type, use_ai: !!useAi }),
      credentials: "omit", // the key is the only credential; never send the site's cookies
      cache: "no-store",
      referrerPolicy: "no-referrer",
    },
  };
}

const str = (v, max = 4000) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);

/** "R-12 · No guaranteed outcomes: Never promise…" → "No guaranteed outcomes". */
export function ruleTitle(f) {
  const m = str(f?.rule).match(/^[^·:]*·\s*([^:]{1,120}):/);
  return m ? m[1].trim() : "";
}

/**
 * @typedef {{ rule_id: string, title: string, severity: string, level: string, quote: string, message: string, fix: string | null, fix_note: string | null }} Finding
 * @typedef {{ verdict: string, mode: string, content_type: string, violations: number, critical: number, findings: Finding[] }} CheckResult
 */

/**
 * Reads the API's answer. Returns { ok: true, result } with findings cleaned to plain strings,
 * or { ok: false, message } with what to do next.
 * @param {number} status
 * @param {any} body
 * @returns {{ ok: true, result: CheckResult, message?: undefined } | { ok: false, message: string, result?: undefined }}
 */
export function readResponse(status, body) {
  const err = body && typeof body === "object" && typeof body.error === "string" ? body.error : "";
  if (status === 200 && body && typeof body === "object" && Array.isArray(body.findings)) {
    const findings = body.findings.slice(0, 200).map((f) => ({
      rule_id: /^[A-Za-z0-9_.-]{1,40}$/.test(str(f?.rule_id)) ? str(f.rule_id) : "", title: ruleTitle(f), severity: str(f?.severity, 20), level: str(f?.level, 20),
      quote: str(f?.quote), message: str(f?.message), fix: f?.fix == null ? null : str(f.fix), fix_note: f?.fix_note == null ? null : str(f.fix_note),
    }));
    const violations = findings.filter((f) => f.level === "violation").length;
    return {
      ok: true,
      result: {
        verdict: body.verdict === "ready_for_review" && !violations ? "ready_for_review" : violations ? "fix_before_publishing" : str(body.verdict, 40),
        mode: str(body.mode, 20), content_type: str(body.content_type, 20), findings, violations,
        critical: findings.filter((f) => f.level === "violation" && f.severity === "critical").length,
      },
    };
  }
  if (status === 401) return { ok: false, message: "The API key was refused: it may be mistyped, incomplete or revoked. Create a new one on the API page and save it in Settings." };
  if (status === 403) return { ok: false, message: "This key cannot check drafts. Create a key with the draft:check scope ticked." };
  if (status === 429) return { ok: false, message: err || "Too many checks in a minute. Wait a moment and try again." };
  if (status === 400 && err) return { ok: false, message: err };
  if (status === 0) return { ok: false, message: "Could not reach the Guidewise site. Check the site address in Settings and your connection." };
  return { ok: false, message: err ? `The check failed (${status}): ${err}` : `The check failed (HTTP ${status}). Try again in a moment.` };
}

/** One line for the top of the results. @param {CheckResult} r */
export function verdictText(r) {
  if (r.verdict === "ready_for_review") return r.findings.length ? `No violations: ready for a person to review. ${r.findings.length} suggestion${r.findings.length === 1 ? "" : "s"} below.` : "No violations: ready for a person to review.";
  return `Fix before publishing: ${r.violations} violation${r.violations === 1 ? "" : "s"}${r.critical ? ` (${r.critical} critical)` : ""}.`;
}

/** Element with attributes and children; strings become text nodes. Never parses HTML. */
function h(doc, tag, attrs, ...children) {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k === "class") el.className = v; else el.setAttribute(k, v);
  }
  for (const c of children) if (c != null && c !== false) el.appendChild(typeof c === "string" ? doc.createTextNode(c) : c);
  return el;
}

/**
 * The results as DOM nodes, built with createElement and text nodes only.
 * @param {Document} doc
 * @param {CheckResult} result
 * @param {{ onCopy?: (fix: string, button: HTMLElement) => void, aiRequested?: boolean }} [opts]
 */
export function renderResult(doc, result, opts = {}) {
  const ok = result.verdict === "ready_for_review";
  const section = h(doc, "section", { class: "result", "aria-label": "Check result" },
    h(doc, "p", { class: `verdict ${ok ? "verdict-ok" : "verdict-fix"}` }, verdictText(result)));
  if (opts.aiRequested && result.mode === "rules-only") section.appendChild(h(doc, "p", { class: "note" }, "The AI checks were unavailable, so only the code checks ran."));
  if (!result.findings.length) return section;
  const list = h(doc, "ol", { class: "findings" });
  result.findings.forEach((f, i) => {
    const head = h(doc, "p", { class: "finding-head" },
      h(doc, "span", { class: "rule-id" }, f.rule_id || "Rule"),
      f.title ? h(doc, "span", { class: "rule-title" }, f.title) : null,
      h(doc, "span", { class: `badge badge-${/^(critical|major|minor)$/.test(f.severity) ? f.severity : "minor"}` }, `${f.severity || "note"}${f.level && f.level !== "violation" ? ` ${f.level}` : ""}`));
    const item = h(doc, "li", { class: "finding" }, head,
      f.quote ? h(doc, "blockquote", { class: "quote" }, `“${f.quote}”`) : null,
      f.message ? h(doc, "p", { class: "message" }, f.message) : null);
    if (f.fix) {
      const btn = h(doc, "button", { type: "button", class: "copy", "aria-label": f.rule_id ? `Copy fix ${i + 1} (${f.rule_id})` : `Copy fix ${i + 1}` }, "Copy fix");
      btn.addEventListener("click", () => opts.onCopy?.(f.fix, btn));
      item.appendChild(h(doc, "div", { class: "fix" },
        h(doc, "p", { class: "fix-text" }, h(doc, "span", { class: "fix-label" }, "Suggested fix: "), f.fix), btn));
      if (f.fix_note) item.appendChild(h(doc, "p", { class: "note" }, f.fix_note));
    }
    list.appendChild(item);
  });
  section.appendChild(list);
  return section;
}

/**
 * Runs inside the page (chrome.scripting.executeScript), so it must not use anything outside itself.
 * Text selected in a text box is not in getSelection() in Chrome, so read it from the box.
 */
export function readSelectionInPage() {
  const el = document.activeElement;
  if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) {
    try {
      const s = el.selectionStart, e = el.selectionEnd;
      if (typeof s === "number" && typeof e === "number" && e > s) return el.value.slice(s, e);
    } catch { /* inputs such as type=email have no selection range */ }
  }
  const sel = window.getSelection();
  return sel ? sel.toString() : "";
}

/** The selection from executeScript's per-frame results: the top frame first, then any frame with text. */
export function pickSelection(results) {
  const texts = (Array.isArray(results) ? results : [])
    .slice().sort((a, b) => (a?.frameId ?? 0) - (b?.frameId ?? 0))
    .map((r) => (typeof r?.result === "string" ? r.result.trim() : ""));
  return texts.find((t) => t.length > 0) ?? "";
}
