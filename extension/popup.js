// The popup: Chrome APIs and the page's controls. The logic it uses is in check.js.
// The API key lives in chrome.storage.local (this browser only, never synced), is sent only to the
// saved Guidewise site, and is never written to the console.
import { CONTENT_TYPES, DEFAULT_SITE, MAX_CHARS, buildCheckRequest, normaliseSite, originPattern, pickSelection, readResponse, readSelectionInPage, renderResult } from "./check.js";

const $ = (id) => document.getElementById(id);
const els = {
  settings: $("settings"), form: $("settings-form"), site: $("site"), key: $("key"), forget: $("forget"), settingsStatus: $("settings-status"), apiPage: $("api-page"),
  type: $("type"), ai: $("ai"), text: $("text"), count: $("count"), checkSelection: $("check-selection"), checkText: $("check-text"), status: $("status"), result: $("result"),
};
let saved = { site: DEFAULT_SITE, key: "", contentType: "social", useAi: false };
let busy = false;

for (const t of CONTENT_TYPES) {
  const o = document.createElement("option");
  o.value = t.v; o.textContent = t.l;
  els.type.appendChild(o);
}

function say(text, error = false) {
  els.status.textContent = text;
  els.status.classList.toggle("error", error);
}
function updateCount() {
  const n = els.text.value.trim().length;
  els.count.textContent = n ? `(${n.toLocaleString("en-IN")} of up to ${MAX_CHARS.toLocaleString("en-IN")} characters)` : "";
}
function showApiPage(origin) { els.apiPage.href = `${origin}/developers`; }

async function load() {
  const { settings } = await chrome.storage.local.get("settings");
  saved = { ...saved, ...(settings ?? {}) };
  els.site.value = saved.site;
  els.key.value = saved.key;
  els.type.value = CONTENT_TYPES.some((c) => c.v === saved.contentType) ? saved.contentType : "social";
  els.ai.checked = !!saved.useAi;
  showApiPage(normaliseSite(saved.site).origin ?? DEFAULT_SITE);
  if (!saved.key) els.settings.open = true;
}
const store = () => chrome.storage.local.set({ settings: saved });

/** The tab the popup was opened over. The ?tab= parameter lets the popup be opened in a tab of its own (the automated test does this). */
async function targetTab() {
  const asked = Number(new URLSearchParams(location.search).get("tab"));
  if (Number.isInteger(asked) && asked > 0) return asked;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}
async function readSelection() {
  const tabId = await targetTab();
  if (tabId === undefined) throw new Error("no tab");
  let results;
  try { results = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: readSelectionInPage }); }
  catch { results = await chrome.scripting.executeScript({ target: { tabId }, func: readSelectionInPage }); }
  return pickSelection(results);
}

async function check(text) {
  if (busy) return;
  const req = buildCheckRequest({ site: saved.site, key: saved.key, text, contentType: els.type.value, useAi: els.ai.checked });
  if (req.error !== undefined) {
    say(req.error, true);
    if (/Settings|API key/.test(req.error)) { els.settings.open = true; els.key.focus(); }
    return;
  }
  const origin = new URL(req.url).origin;
  if (!(await chrome.permissions.contains({ origins: [originPattern(origin)] }))) {
    say(`This extension may not call ${origin} yet. Open Settings and save the site address to allow it.`, true);
    els.settings.open = true;
    return;
  }
  busy = true; els.checkSelection.disabled = els.checkText.disabled = true;
  els.result.replaceChildren();
  say(els.ai.checked ? "Checking… the AI checks can take up to a minute." : "Checking…");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 70_000);
  let status = 0, body = null;
  try {
    const res = await fetch(req.url, { ...req.init, signal: ctrl.signal });
    status = res.status;
    body = await res.json().catch(() => null);
  } catch { status = 0; }
  clearTimeout(timer);
  const out = readResponse(status, body);
  if (out.ok) {
    say("");
    els.result.replaceChildren(renderResult(document, out.result, { onCopy: copy, aiRequested: els.ai.checked }));
  } else say(out.message, true);
  busy = false; els.checkSelection.disabled = els.checkText.disabled = false;
}

async function copy(fix, button) {
  try { await navigator.clipboard.writeText(fix); }
  catch {
    // Fallback for a popup that lost focus: copy from a temporary text box.
    const t = document.createElement("textarea");
    t.value = fix; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy");
    t.remove();
    if (!ok) { say("Copying was blocked. Select the fix and copy it by hand.", true); return; }
  }
  button.textContent = "Copied";
  say("Fix copied. Paste it over the quoted words in your draft.");
  setTimeout(() => { button.textContent = "Copy fix"; }, 2000);
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const s = normaliseSite(els.site.value);
  if (s.error !== undefined) { els.settingsStatus.textContent = s.error; els.site.focus(); return; }
  // Ask for this one origin while the click still counts as a user gesture; the default site is granted at install.
  const allowed = s.origin === new URL(DEFAULT_SITE).origin ? Promise.resolve(true) : chrome.permissions.request({ origins: [originPattern(s.origin)] });
  allowed.then(async (granted) => {
    if (!granted) { els.settingsStatus.textContent = `Not saved: the extension needs your permission to call ${s.origin}.`; return; }
    saved = { ...saved, site: s.origin, key: els.key.value.trim() };
    els.site.value = s.origin;
    await store();
    showApiPage(s.origin);
    els.settingsStatus.textContent = saved.key ? "Saved." : "Saved. Add an API key to check drafts.";
  }).catch(() => { els.settingsStatus.textContent = "Could not save the settings. Try again."; });
});
els.forget.addEventListener("click", async () => {
  saved = { ...saved, key: "" };
  els.key.value = "";
  await store();
  els.settingsStatus.textContent = "Key removed from this browser.";
});
els.type.addEventListener("change", () => { saved.contentType = els.type.value; store(); });
els.ai.addEventListener("change", () => { saved.useAi = els.ai.checked; store(); });
els.text.addEventListener("input", updateCount);
els.checkText.addEventListener("click", () => check(els.text.value));
els.checkSelection.addEventListener("click", async () => {
  let text = "";
  try { text = await readSelection(); }
  catch { say("Guidewise cannot read this page (browser pages and the Chrome Web Store are off limits). Paste the text in the box instead.", true); return; }
  if (!text) { say("Nothing is selected on the page. Select the draft and try again, or paste it in the box.", true); return; }
  els.text.value = text; updateCount();
  check(text);
});

await load();
// Fill the box with the current selection, if there is one, so it can be checked or edited first.
readSelection().then((t) => {
  if (t && !els.text.value) { els.text.value = t; updateCount(); say("The text selected on the page is in the box."); }
}).catch(() => { /* a page the extension cannot read: pasting still works */ });
