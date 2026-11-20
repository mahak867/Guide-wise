// Loads the unpacked browser extension (extension/) in Playwright's Chromium and checks selected text
// on a local page against a live Guidewise site, with a key created for a fresh workspace.
//   BASE_URL=https://guidewise-kohl.vercel.app NODE_USE_ENV_PROXY=1 node e2e/extension.mjs
// Needs Playwright: `npm i --no-save playwright && npx playwright install chromium`.
//
// One stand-in: a person grants the popup the current tab (activeTab) by clicking the toolbar button,
// which automation cannot do. The test copies the extension and adds the local test page's origin to
// host_permissions instead, and opens the popup in a tab of its own (popup.html?tab=<id>).
import { createHash, randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const L = (process.env.BASE_URL || "https://guidewise-kohl.vercel.app").replace(/\/$/, "");
const OUT = process.env.OUT_DIR || tmpdir();
let bad = 0;
const expect = (name, pass, detail = "") => { if (!pass) bad++; console.log(`${pass ? "ok  " : "BAD "} ${name}${pass ? "" : "  → " + detail}`); };

// 1. A fresh workspace and a key with the draft:check scope.
const ws = "ext-" + randomUUID();
const mk = await fetch(L + "/api/keys", { method: "POST", headers: { "x-workspace": ws, "x-role": "manager", "content-type": "application/json" }, body: JSON.stringify({ name: "Browser extension test", scopes: ["draft:check"] }) });
const { key, row } = await mk.json();
expect("key created on the live site", mk.status === 200 && /^gw_/.test(key ?? ""), String(mk.status));

// 2. A local "compose" page: a rich-text box (like LinkedIn or Gmail) and a plain text box.
const DRAFT = "India's #1 JEE coaching. 100% selection guaranteed!! Join 50,000+ toppers.";
const html = `<!doctype html><meta charset="utf-8"><title>Compose</title>
<div id="rich" contenteditable="true">Draft: ${DRAFT}</div>
<textarea id="plain" rows="3" cols="60">Before. Our results speak: 100% selection guaranteed for every student!! After.</textarea>`;
const server = createServer((_q, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PAGE = `http://127.0.0.1:${server.address().port}/compose.html`;

// 3. The extension, with the stand-in for activeTab.
const extDir = mkdtempSync(join(tmpdir(), "guidewise-ext-"));
cpSync(new URL("../extension/", import.meta.url).pathname, extDir, { recursive: true });
const manifest = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf8"));
manifest.host_permissions.push("http://127.0.0.1/*");
writeFileSync(join(extDir, "manifest.json"), JSON.stringify(manifest, null, 2));
// Chrome names an unpacked extension after its folder: SHA-256 of the path, first 32 hex digits written as a–p.
const extId = createHash("sha256").update(resolve(extDir)).digest("hex").slice(0, 32).replace(/./g, (c) => String.fromCharCode(97 + parseInt(c, 16)));

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" } : undefined;
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "guidewise-profile-")), {
  channel: "chromium", // the new headless mode, which runs extensions
  headless: process.env.HEADED ? false : true,
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  proxy, ignoreHTTPSErrors: true, viewport: { width: 1100, height: 800 },
});
const errors = [];
try {
  const page = await ctx.newPage();
  await page.goto(PAGE);
  // Select the draft inside the rich-text box.
  await page.evaluate((draft) => {
    const node = document.getElementById("rich").firstChild;
    const start = node.textContent.indexOf(draft);
    const r = document.createRange(); r.setStart(node, start); r.setEnd(node, start + draft.length);
    getSelection().removeAllRanges(); getSelection().addRange(r);
  }, DRAFT);

  const popup = await ctx.newPage();
  popup.on("pageerror", (e) => errors.push(e.message));
  // The popup never writes to the console; Chrome's own note on a refused request (the wrong-key step) is expected.
  popup.on("console", (m) => { if (!/^Failed to load resource: the server responded with a status of 401/.test(m.text())) errors.push("console: " + m.text()); });
  const POPUP = `chrome-extension://${extId}/popup.html`;
  await popup.goto(POPUP);
  expect("the unpacked extension loaded and its popup opened", (await popup.title()) === "Check with Guidewise", await popup.title());
  const tabId = await popup.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0]?.id);

  // 4. Settings: site and key, kept in chrome.storage.local.
  expect("settings open while no key is saved", await popup.locator("#settings").evaluate((d) => d.open));
  await popup.fill("#site", L);
  await popup.fill("#key", key);
  await popup.click("button[type=submit]");
  await popup.locator("#settings-status", { hasText: "Saved." }).waitFor();
  const stored = await popup.evaluate(async () => (await chrome.storage.local.get("settings")).settings);
  expect("site and key saved in chrome.storage.local", stored?.key === key && stored?.site === new URL(L).origin, JSON.stringify({ ...stored, key: stored?.key ? "…" : "" }));
  const granted = await popup.evaluate(async () => chrome.permissions.getAll());
  expect("host access only for Guidewise (plus the test page's stand-in)", JSON.stringify(granted.origins.sort()) === JSON.stringify(["http://127.0.0.1/*", "https://guidewise-kohl.vercel.app/*"]), JSON.stringify(granted.origins));

  // 5. Reopen over the compose page: the selection fills the box; check it against the live API.
  await popup.goto(`${POPUP}?tab=${tabId}`);
  await popup.locator("#status", { hasText: "selected on the page" }).waitFor();
  expect("the selected text fills the box", (await popup.inputValue("#text")) === DRAFT, await popup.inputValue("#text"));
  expect("settings stay closed once a key is saved", !(await popup.locator("#settings").evaluate((d) => d.open)));
  await popup.selectOption("#type", "social");
  await popup.click("#check-selection");
  await popup.locator(".verdict").waitFor({ timeout: 60_000 });
  const verdict = await popup.textContent(".verdict");
  const findings = await popup.locator(".finding").allTextContents();
  expect("live verdict shown", /^Fix before publishing: \d+ violations? \(\d+ critical\)\.$/.test(verdict), verdict);
  expect("the guarantee is cited with its rule, quoted words, message and fix",
    findings.some((f) => f.includes("R-12") && f.includes("No guaranteed outcomes") && f.includes("“100% selection guaranteed!!”") && f.includes("Suggested fix:")), findings.join(" | ").slice(0, 400));
  expect("every finding quotes words from the draft", findings.every((f) => { const q = f.match(/“(.+?)”/); return q && DRAFT.includes(q[1]); }), findings.join(" | ").slice(0, 400));
  expect("no element in the results came from server text", await popup.locator("#result img, #result script, #result a, #result iframe").count() === 0);
  await popup.screenshot({ path: join(OUT, "extension-popup.png"), fullPage: true });

  // 6. Copy fix. (Chrome will not grant clipboard reading to an extension page under automation, so the
  // test records what the popup hands to navigator.clipboard.writeText.)
  await popup.evaluate(() => { window.__copied = []; const real = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = (t) => { window.__copied.push(t); return real(t).catch(() => {}); }; });
  const firstFix = (await popup.locator(".fix-text").first().textContent()).replace(/^Suggested fix: /, "");
  await popup.locator("button.copy").first().click();
  await popup.locator("button.copy", { hasText: "Copied" }).first().waitFor();
  const clip = await popup.evaluate(() => window.__copied);
  expect("Copy fix copies that finding's fix", clip.length === 1 && clip[0] === firstFix && /Fix copied/.test(await popup.textContent("#status")), `${clip} vs ${firstFix}`);

  // 7. A selection inside a plain text box (getSelection() is empty there in Chrome).
  await page.bringToFront();
  await page.evaluate(() => { const t = document.getElementById("plain"); t.focus(); const s = t.value.indexOf("Our"); t.setSelectionRange(s, t.value.indexOf(" After.")); });
  await popup.goto(`${POPUP}?tab=${tabId}`);
  await popup.click("#check-selection");
  await popup.locator(".verdict").waitFor({ timeout: 60_000 });
  expect("a selection inside a text box is read and checked", (await popup.inputValue("#text")) === "Our results speak: 100% selection guaranteed for every student!!" && /R-12/.test(await popup.textContent("#result")), await popup.inputValue("#text"));

  // 8. Pasted text, with nothing selected; and the errors a person can hit.
  await page.evaluate(() => { document.activeElement.blur(); getSelection().removeAllRanges(); });
  await popup.goto(`${POPUP}?tab=${tabId}`);
  await popup.click("#check-selection");
  expect("nothing selected: says so", /Nothing is selected/.test(await popup.textContent("#status")), await popup.textContent("#status"));
  await popup.fill("#text", "Our brochure: Join the best coaching in India today, with guaranteed results.");
  await popup.click("#check-text");
  await popup.locator(".verdict").waitFor({ timeout: 60_000 });
  expect("pasted text is checked", (await popup.locator(".finding").count()) > 0);
  await popup.fill("#text", "short");
  await popup.click("#check-text");
  expect("too-short text is refused before any call", /at least 10/.test(await popup.textContent("#status")));

  const browserTab = await ctx.newPage();
  await browserTab.goto("chrome://version");
  const chromeTabId = await popup.evaluate(async () => (await chrome.tabs.query({ url: "chrome://version/*" }))[0]?.id);
  await popup.goto(`${POPUP}?tab=${chromeTabId}`);
  await popup.click("#check-selection");
  expect("a browser page cannot be read: says to paste instead", /cannot read this page/.test(await popup.textContent("#status")), await popup.textContent("#status"));
  await browserTab.close();

  await popup.locator("#settings summary").click();
  await popup.fill("#key", "gw_" + "0".repeat(48));
  await popup.click("button[type=submit]");
  await popup.locator("#settings-status", { hasText: "Saved." }).waitFor();
  await popup.fill("#text", DRAFT);
  await popup.click("#check-text");
  await popup.locator("#status.error").waitFor({ timeout: 30_000 });
  expect("a wrong key: says it was refused", /refused/.test(await popup.textContent("#status")), await popup.textContent("#status"));

  // 9. CORS is unchanged: a web page cannot call the API with the key, only the extension can.
  const fromPage = await page.evaluate(async ({ url, key }) => {
    try { const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ text: "A draft of some length." }) }); return `status ${r.status}`; }
    catch (e) { return `blocked: ${e.message}`; }
  }, { url: L + "/api/v1/check", key });
  expect("a web page's call to the API is still blocked by CORS", fromPage.startsWith("blocked"), fromPage);

  expect("no script errors or console output in the popup", errors.length === 0, errors.join(" | "));
} finally {
  await ctx.close();
  server.close();
  if (row?.id) await fetch(`${L}/api/keys/${row.id}`, { method: "DELETE", headers: { "x-workspace": ws, "x-role": "manager" } }).catch(() => {});
}
console.log(bad ? `\n${bad} check(s) failed` : "\nAll extension checks passed");
process.exit(bad ? 1 : 0);
