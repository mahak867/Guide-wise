// The browser extension's popup logic (extension/check.js): the request it sends, how it reads the
// answer, and that server text reaches the popup only as text, never as HTML.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCheckRequest, DEFAULT_SITE, isKey, normaliseSite, pickSelection, readResponse, readSelectionInPage, renderResult, ruleTitle, verdictText } from "../extension/check.js";

const KEY = "gw_" + "ab12".repeat(12);
const DRAFT = "India's #1 JEE coaching. 100% selection guaranteed!!";

// A tiny DOM: enough for createElement, text nodes, attributes and click handlers. Any HTML parsing throws.
class Node {
  children: Node[] = [];
  attrs: Record<string, string> = {};
  className = "";
  listeners: Record<string, (() => void)[]> = {};
  constructor(public tagName: string, public text = "") {}
  appendChild(c: Node) { this.children.push(c); return c; }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  addEventListener(t: string, f: () => void) { (this.listeners[t] ??= []).push(f); }
  get textContent(): string { return this.tagName === "#text" ? this.text : this.children.map((c) => c.textContent).join(""); }
  set textContent(v: string) { this.children = [new Node("#text", String(v))]; }
  set innerHTML(_v: string) { throw new Error("innerHTML used"); }
  insertAdjacentHTML() { throw new Error("insertAdjacentHTML used"); }
  all(): Node[] { return [this, ...this.children.flatMap((c) => c.all())]; }
  find(cls: string) { return this.all().filter((n) => n.className.split(" ").includes(cls)); }
}
const doc = { createElement: (t: string) => new Node(t.toUpperCase()), createTextNode: (t: string) => new Node("#text", t) } as unknown as Document;
const asNode = (x: unknown) => x as Node;

describe("site address", () => {
  it("defaults to the live site and keeps only the origin", () => {
    expect(normaliseSite("")).toEqual({ origin: DEFAULT_SITE });
    expect(normaliseSite("  https://guidewise-kohl.vercel.app/developers?x=1#y ")).toEqual({ origin: DEFAULT_SITE });
    expect(normaliseSite("guidewise.example.com")).toEqual({ origin: "https://guidewise.example.com" });
    expect(normaliseSite("http://localhost:3000/")).toEqual({ origin: "http://localhost:3000" });
  });
  it("refuses plain http, other schemes and credentials in the address", () => {
    for (const bad of ["http://guidewise.example.com", "javascript:alert(1)", "file:///etc/passwd", "ftp://x.example", "https://user:pw@guidewise.example.com", "https://"]) {
      expect(normaliseSite(bad).error, bad).toBeTruthy();
    }
  });
});

describe("building the request", () => {
  it("posts JSON to /api/v1/check with the key as a bearer token and no cookies", () => {
    const r = buildCheckRequest({ site: DEFAULT_SITE, key: ` ${KEY} `, text: `  ${DRAFT}  `, contentType: "ad", useAi: true });
    expect(r.error).toBeUndefined();
    expect(r.url).toBe(`${DEFAULT_SITE}/api/v1/check`);
    expect(r.init!.method).toBe("POST");
    expect(r.init!.headers).toEqual({ authorization: `Bearer ${KEY}`, "content-type": "application/json" });
    expect(r.init!.credentials).toBe("omit");
    expect(r.init!.referrerPolicy).toBe("no-referrer");
    expect(JSON.parse(r.init!.body)).toEqual({ text: DRAFT, content_type: "ad", use_ai: true });
  });
  it("sends the key only to the saved site's origin", () => {
    const r = buildCheckRequest({ site: "https://brand.example.com/some/path", key: KEY, text: DRAFT });
    expect(r.url).toBe("https://brand.example.com/api/v1/check");
    expect(buildCheckRequest({ site: "http://evil.example", key: KEY, text: DRAFT }).url).toBeUndefined();
  });
  it("falls back to a social post for an unknown content type and sends use_ai as a boolean", () => {
    const body = JSON.parse(buildCheckRequest({ key: KEY, text: DRAFT, contentType: "<script>" }).init!.body);
    expect(body).toEqual({ text: DRAFT, content_type: "social", use_ai: false });
  });
  it("says what is missing instead of sending a call that would fail", () => {
    expect(buildCheckRequest({ key: "", text: DRAFT }).error).toMatch(/Add your API key/);
    expect(buildCheckRequest({ key: "gw_123", text: DRAFT }).error).toMatch(/does not look right/);
    expect(buildCheckRequest({ key: KEY, text: "   short " }).error).toMatch(/at least 10/);
    expect(buildCheckRequest({ key: KEY, text: "a".repeat(12001) }).error).toMatch(/12,000/);
    expect(isKey(KEY)).toBe(true);
    expect(isKey(KEY + "0")).toBe(false);
  });
});

const API_ANSWER = {
  kit_version: 1, content_type: "social", mode: "rules-only", verdict: "fix_before_publishing",
  summary: { findings: 2, violations: 2, critical: 1 },
  findings: [
    { rule_id: "R-12", severity: "critical", level: "violation", quote: "100% selection guaranteed!!", message: "Never promise a guaranteed selection.", fix: "4,200+ JEE selections in 2025.", fix_note: "Strongest claim the Facts Register can prove (F-3).", rule: "R-12 · No guaranteed outcomes: Never promise or imply a guaranteed selection.", location: "text" },
    { rule_id: "R-08", severity: "major", level: "violation", quote: "India's #1 JEE coaching", message: "Words like \"#1\" need an approved fact.", fix: null, fix_note: null, rule: "R-08 · Superlatives need an approved fact: …", location: "text" },
  ],
};

describe("reading the answer", () => {
  it("keeps the verdict and each finding's rule, quote, message and fix", () => {
    const out = readResponse(200, API_ANSWER);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.verdict).toBe("fix_before_publishing");
    expect(out.result.violations).toBe(2);
    expect(out.result.critical).toBe(1);
    expect(out.result.findings[0]).toMatchObject({ rule_id: "R-12", title: "No guaranteed outcomes", quote: "100% selection guaranteed!!", fix: "4,200+ JEE selections in 2025." });
    expect(verdictText(out.result)).toBe("Fix before publishing: 2 violations (1 critical).");
  });
  it("never trusts a ready verdict that comes with violations", () => {
    const out = readResponse(200, { ...API_ANSWER, verdict: "ready_for_review" });
    expect(out.ok && out.result.verdict).toBe("fix_before_publishing");
    const clean = readResponse(200, { verdict: "ready_for_review", findings: [] });
    expect(clean.ok && verdictText(clean.result)).toBe("No violations: ready for a person to review.");
  });
  it("turns errors into what to do next", () => {
    expect(readResponse(401, { error: "x" })).toMatchObject({ ok: false, message: expect.stringMatching(/refused.*revoked/) });
    expect(readResponse(403, { error: "x" })).toMatchObject({ ok: false, message: expect.stringMatching(/draft:check/) });
    expect(readResponse(429, { error: "Rate limit: 30 calls a minute per key." })).toMatchObject({ ok: false, message: "Rate limit: 30 calls a minute per key." });
    expect(readResponse(400, { error: "Bad request (send at least 10 characters of draft text)." })).toMatchObject({ ok: false, message: expect.stringMatching(/Bad request/) });
    expect(readResponse(0, null)).toMatchObject({ ok: false, message: expect.stringMatching(/Could not reach/) });
    expect(readResponse(500, "<html>")).toMatchObject({ ok: false, message: expect.stringMatching(/HTTP 500/) });
    expect(readResponse(200, { findings: "nope" }).ok).toBe(false);
  });
  it("reads the rule title from the rule text", () => {
    expect(ruleTitle({ rule: "R-CLAIM · Numbers must match the Facts Register: Every figure…" })).toBe("Numbers must match the Facts Register");
    expect(ruleTitle({ rule: "no title here" })).toBe("");
    expect(ruleTitle({})).toBe("");
  });
});

describe("rendering findings", () => {
  const out = readResponse(200, API_ANSWER);
  if (!out.ok) throw new Error("fixture");

  it("shows the verdict, rule, quoted words, message and fix, with a Copy fix button per fix", () => {
    const copied: string[] = [];
    const root = asNode(renderResult(doc, out.result, { onCopy: (fix) => copied.push(fix) }));
    expect(root.find("verdict")[0].textContent).toMatch(/Fix before publishing/);
    const items = root.find("finding");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("R-12");
    expect(items[0].textContent).toContain("No guaranteed outcomes");
    expect(items[0].textContent).toContain("“100% selection guaranteed!!”");
    expect(items[0].textContent).toContain("Never promise a guaranteed selection.");
    expect(items[0].textContent).toContain("Suggested fix: 4,200+ JEE selections in 2025.");
    const buttons = root.all().filter((n) => n.tagName === "BUTTON");
    expect(buttons).toHaveLength(1); // R-08 has no fix, so no button
    expect(buttons[0].attrs["aria-label"]).toBe("Copy fix 1 (R-12)");
    buttons[0].listeners.click[0]();
    expect(copied).toEqual(["4,200+ JEE selections in 2025."]);
  });

  it("puts hostile server text in text nodes only: no tags, attributes or links are created from it", () => {
    const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a>';
    const hostile = readResponse(200, { verdict: evil, mode: evil, findings: [{ rule_id: evil, severity: '" onmouseover="x', level: "violation", quote: evil, message: evil, fix: evil, fix_note: evil, rule: `R-1 · ${evil}: x` }] });
    if (!hostile.ok) throw new Error("hostile");
    expect(hostile.result.findings[0].rule_id).toBe(""); // a rule ID is letters, digits and dashes, or nothing
    const root = asNode(renderResult(doc, hostile.result, { aiRequested: true }));
    const tags = new Set(root.all().map((n) => n.tagName));
    for (const t of ["IMG", "SCRIPT", "A", "IFRAME"]) expect(tags.has(t)).toBe(false);
    expect(root.textContent).toContain(evil); // shown, as text
    for (const n of root.all()) {
      for (const [k, v] of Object.entries(n.attrs)) {
        expect(k).toMatch(/^(type|aria-label)$/);
        expect(v).not.toMatch(/<|javascript:/);
      }
      expect(n.className).not.toMatch(/onmouseover|"/); // an unknown severity never reaches a class name
    }
  });

  it("no extension script builds HTML from strings", () => {
    const dir = new URL("../extension/", import.meta.url);
    const scripts = readdirSync(dir).filter((f) => f.endsWith(".js"));
    expect(scripts).toEqual(expect.arrayContaining(["check.js", "popup.js"]));
    for (const f of scripts) {
      const src = readFileSync(new URL(f, dir), "utf8");
      expect(src, f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
      expect(src, f).not.toMatch(/console\.(log|info|debug|warn|error)/); // never log the key or the draft
    }
  });
});

describe("the selection", () => {
  it("prefers the top frame, then any frame with text", () => {
    expect(pickSelection([{ frameId: 3, result: "in a frame" }, { frameId: 0, result: "  top  " }])).toBe("top");
    expect(pickSelection([{ frameId: 0, result: "" }, { frameId: 2, result: "frame text" }])).toBe("frame text");
    expect(pickSelection([{ frameId: 0, result: 42 }])).toBe("");
    expect(pickSelection(undefined)).toBe("");
  });
  it("reads a selection inside a text box, where getSelection() is empty", () => {
    const g = globalThis as Record<string, unknown>;
    const before = { document: g.document, window: g.window };
    try {
      g.document = { activeElement: { tagName: "TEXTAREA", value: "Hello 100% selection guaranteed", selectionStart: 6, selectionEnd: 31 } };
      g.window = { getSelection: () => ({ toString: () => "" }) };
      expect(readSelectionInPage()).toBe("100% selection guaranteed");
      g.document = { activeElement: { tagName: "BODY" } };
      g.window = { getSelection: () => ({ toString: () => "page selection" }) };
      expect(readSelectionInPage()).toBe("page selection");
    } finally { g.document = before.document; g.window = before.window; }
  });
  it("the manifest asks for the current tab only, and for no site but Guidewise", () => {
    const m = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
    expect(m.manifest_version).toBe(3);
    expect(m.permissions.sort()).toEqual(["activeTab", "scripting", "storage"]);
    expect(m.host_permissions).toEqual([`${DEFAULT_SITE}/*`]);
    expect(m.content_scripts).toBeUndefined();
    expect(m.background).toBeUndefined();
  });
});
