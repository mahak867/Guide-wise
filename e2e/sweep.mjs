// Clicks through every page and control of the app in a fresh workspace, at desktop and phone sizes.
// Fails on any page error, console error, server error (5xx), broken image, broken internal link,
// sideways scrolling on a phone, or a control that does not do what it says.
//   BASE_URL=https://guidewise-kohl.vercel.app node e2e/sweep.mjs
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const L = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const tmp = mkdtempSync(join(tmpdir(), "guidewise-sweep-"));
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY && L.startsWith("https") ? { server: process.env.HTTPS_PROXY } : undefined });
const problems = [];
let failed = 0;

function watch(page, tag) {
  page.on("pageerror", (e) => problems.push(`[${tag}] page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Failed to load resource: the server responded with a status of 4\d\d/.test(t)) return; // expected refusals, checked separately
    problems.push(`[${tag}] console: ${t.slice(0, 200)}`);
  });
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`[${tag}] ${r.status()} ${r.request().method()} ${r.url().replace(L, "")}`); });
  page.on("dialog", (d) => d.accept());
}

async function step(page, name, fn) {
  const t = Date.now();
  try {
    const note = await fn();
    console.log(`PASS  ${name} (${Date.now() - t} ms)${note ? "  " + note : ""}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${String(e.message).split("\n")[0]}`);
    await page.screenshot({ path: join(tmp, `fail-${name.replace(/\W+/g, "-")}.png`), fullPage: true }).catch(() => {});
  }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

// ---------- 1. Every page, desktop and phone ----------
const desk = await browser.newContext({ viewport: { width: 1360, height: 900 }, ignoreHTTPSErrors: true, acceptDownloads: true });
const page = await desk.newPage();
watch(page, "desktop");
const role = (r) => page.getByRole("combobox").first().selectOption(r).then(() => page.waitForTimeout(500));
const msg = (re, timeout = 30000) => page.getByText(re).first().waitFor({ timeout });
/** Open a page and wait until its data has loaded (the Brand Kit badge shows a version). */
async function go(path, ready) {
  await page.goto(L + path);
  await page.getByText(/Kit v\d+/i).first().waitFor({ timeout: 30000 });
  if (ready) await page.getByText(ready).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
}
/** The rule card on the Brand Kit page that carries this rule ID. */
const ruleCard = (id) => page.getByText(id, { exact: true }).locator("xpath=ancestor::div[.//button[normalize-space()='Run tests']][1]");

let rid = "";
await step(page, "sample review created", async () => {
  await page.goto(L);
  await page.getByText("Review the sample post").click();
  await page.waitForURL(/review\/[0-9a-f-]{36}/, { timeout: 120000 });
  await msg(/open finding/, 60000);
  rid = page.url().split("/review/")[1];
});

const PAGES = ["/", "/review/new", `/review/${rid}`, `/review/${rid}/record`, "/kit", "/facts", "/insights", "/results", "/about", "/review/00000000-0000-4000-8000-000000000000", "/nope"];
async function checkPage(p, path) {
  await p.goto(L + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 60)),
    links: [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")),
    h1: document.querySelector("h1")?.textContent ?? "",
    text: document.body.innerText.length,
  }));
  must(r.text > 80, "page is nearly empty");
  must(r.h1.trim() || /not found|not been approved/i.test(await p.locator("main").innerText()), "no page heading or explanation");
  must(!r.broken.length, `broken images: ${r.broken.join(", ")}`);
  must(r.overflow <= 1, `scrolls sideways by ${r.overflow}px`);
  return r.links;
}
const links = new Set();
for (const path of PAGES) {
  await step(page, `desktop ${path.replace(rid, "ID")}`, async () => { (await checkPage(page, path)).forEach((l) => links.add(l)); });
}
const phone = await browser.newContext({ ...devices["iPhone 13"], ignoreHTTPSErrors: true });
const mp = await phone.newPage();
watch(mp, "phone");
await mp.goto(L); await mp.waitForTimeout(1000);
for (const path of PAGES.filter((p) => !p.includes(rid))) {
  await step(mp, `phone ${path}`, () => checkPage(mp, path).then(() => undefined));
}
await step(mp, "phone: sample review works and does not scroll sideways", async () => {
  await mp.goto(L);
  await mp.getByText("Review the sample post").click();
  await mp.waitForURL(/review\/[0-9a-f-]{36}/, { timeout: 120000 });
  await mp.getByText(/open finding/).first().waitFor({ timeout: 60000 });
  const o = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  must(o <= 1, `review page scrolls sideways by ${o}px`);
  await mp.locator("button[aria-expanded]", { hasText: "Approved contacts only" }).first().click();
  await mp.getByRole("button", { name: "Dismiss" }).first().waitFor({ timeout: 5000 });
});
await step(page, "internal links all resolve", async () => {
  const bad = [];
  for (const l of links) {
    if (l.includes("/review/")) continue;
    const r = await page.request.get(L + l);
    if (r.status() >= 400) bad.push(`${l} ${r.status()}`);
  }
  must(!bad.length, bad.join(", "));
  return `${links.size} links`;
});

// ---------- 2. Shell: roles, tour ----------
await step(page, "role switcher changes what is allowed", async () => {
  await page.goto(L + "/kit");
  await role("creator");
  await page.getByRole("button", { name: "Act as Meera to edit" }).first().waitFor();
  await page.getByRole("button", { name: "Act as Meera to edit" }).first().click();
  await page.getByRole("button", { name: "Save as advisory" }).waitFor({ timeout: 5000 });
  must((await page.getByRole("combobox").first().inputValue()) === "manager", "role did not switch to the manager");
  await page.reload(); await page.waitForTimeout(800);
  must((await page.getByRole("combobox").first().inputValue()) === "manager", "role was not remembered after reload");
});

// ---------- 3. Facts and assets ----------
await step(page, "facts: add a dated fact, refuse a bad one, delete it", async () => {
  await go("/facts", "Facts Register"); await role("manager");
  const f = page.locator("form").filter({ has: page.getByRole("button", { name: "Save fact" }) });
  await f.getByPlaceholder("F-12").fill("F-77");
  await f.getByPlaceholder(/NEET selections/).fill("1,150+ NEET selections in 2025 from our classroom programme");
  await f.getByPlaceholder("1150").fill("1150");
  await f.getByPlaceholder("selections, selected").fill("selections");
  await f.getByPlaceholder("Where the figure comes from").fill("Results register 2025, audited");
  const dates = f.locator("input[type=date]");
  if (await dates.count() >= 2) { await dates.nth(0).fill("2026-06-01"); await dates.nth(1).fill("2026-01-01"); }
  await f.getByRole("button", { name: "Save fact" }).click();
  if (await dates.count() >= 2) {
    await page.getByText(/valid from must be on or before valid until/).first().waitFor({ timeout: 15000 });
    await dates.nth(1).fill("2026-12-31");
    await f.getByRole("button", { name: "Save fact" }).click();
  }
  await page.locator("tr", { hasText: "1,150+ NEET selections" }).waitFor({ timeout: 15000 });
  await page.locator("tr", { hasText: "1,150+ NEET selections" }).getByRole("button", { name: "Delete" }).click();
  await page.locator("tr", { hasText: "1,150+ NEET selections" }).waitFor({ state: "detached", timeout: 15000 });
});
await step(page, "facts: profile, palette, disclaimer, logo", async () => {
  await go("/facts", "Facts Register"); await role("manager");
  const n = page.locator("input[name=n]");
  await n.fill("40"); await n.locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
  await msg(/shown as suggestions/);
  await n.fill("50000"); await n.locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
  await msg(/CCPA coaching rules apply/);
  await page.getByLabel("Colour name").fill("Sky");
  await page.getByRole("button", { name: "Add colour" }).click();
  await page.getByRole("button", { name: "Remove Sky" }).click({ timeout: 15000 });
  await page.waitForTimeout(1500);
  must(!(await page.getByRole("button", { name: "Remove Sky" }).count()), "colour not removed");
  const dForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Add disclaimer" }) });
  const inputs = dForm.locator("input, textarea");
  await inputs.nth(0).fill("Scholarships are subject to the published policy.");
  if (await inputs.count() > 1) await inputs.nth(1).fill("Any post that mentions a scholarship");
  await dForm.getByRole("button", { name: "Add disclaimer" }).click();
  await msg("Scholarships are subject to the published policy.");
  await page.locator("li").filter({ hasText: "Scholarships are subject" }).getByRole("button", { name: "Remove" }).click();
  await page.waitForTimeout(1500);
  must(!(await page.getByText("Scholarships are subject").count()), "disclaimer not removed");
  const logoBox = page.locator("div").filter({ has: page.getByRole("heading", { name: "Logo", exact: true }) }).last();
  await logoBox.getByRole("button", { name: "Remove", exact: true }).click();
  await msg("No logo uploaded");
  must(await page.getByText("Fees are subject to the published fee policy").count(), "removing the logo touched the disclaimers");
  await page.locator("input[type=file][accept*='png']").setInputFiles("public/brand/preppath-mark.png");
  await page.getByAltText("Approved logo").waitFor({ timeout: 15000 });
});

// ---------- 4. Brand Kit ----------
await step(page, "kit: every rule passes its own tests", async () => {
  await go("/kit", "Enforced rules"); await role("manager");
  const btns = page.getByRole("button", { name: "Run tests" });
  const n = await btns.count();
  for (let i = 0; i < n; i++) { await btns.nth(i).click(); await page.waitForTimeout(150); }
  await page.waitForFunction(() => !document.body.innerText.includes("Running…"), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const fails = await page.getByText("Tests fail").count();
  const passes = await page.getByText("Tests pass").count();
  must(fails === 0, `${fails} rule(s) fail their own tests`);
  return `${passes} of ${n} rules pass`;
});
for (const [type, param, flag, pass] of [
  ["brand-name", "Guidewise", "Try guide wise today.", "Try Guidewise today."],
  ["caps", "NEET", "This is HUGE news.", "This is big news for NEET aspirants."],
  ["length", "40", "This sentence is much longer than forty characters in total.", "Short and sweet."],
  ["readability", "8", "This sentence has far more than eight words in it, clearly.", "Short sentence here."],
  ["term", "", "Our teachers are great.", "Our mentors are great."],
  ["pattern", "", "Money-back promise on every course.", "Clear fees on every course."],
]) {
  await step(page, `kit: create, test, enforce, demote and delete a ${type} rule`, async () => {
    await go("/kit", "Enforced rules"); await role("manager");
    const id = `QA-${type.slice(0, 4).toUpperCase()}`;
    await page.getByPlaceholder("TERM-7").fill(id);
    await page.getByPlaceholder(/Say "mentor"/).fill(`QA ${type}`);
    await page.locator("form textarea").first().fill(`Test rule for ${type}.`);
    await page.locator("form select").first().selectOption(type);
    if (type === "term") { await page.getByPlaceholder("teacher, tutor").fill("teachers"); await page.getByPlaceholder("mentor", { exact: true }).fill("mentors"); }
    else if (type === "pattern") await page.getByPlaceholder("money-back, risk-free").fill("money-back");
    else await page.getByLabel(/Names, spelled|Words allowed|Maximum characters|Maximum words/).fill(param);
    await page.getByLabel("A sentence that should be flagged").fill(flag);
    await page.getByLabel("A sentence that should pass").fill(pass);
    await page.getByRole("button", { name: "Save as advisory" }).click();
    await msg(`${id} saved as advisory`);
    const card = ruleCard(id);
    await card.getByRole("button", { name: "Enforce" }).click();
    await msg(`${id} is now enforced.`, 60000);
    await card.getByRole("button", { name: "Make advisory" }).click();
    await msg(`${id} is now advisory.`);
    await card.getByRole("button", { name: `QA ${type}` }).click();
    await card.getByRole("button", { name: "Delete rule" }).click();
    await msg(`${id} deleted.`);
  });
}
await step(page, "kit: a rule failing its own tests cannot be enforced", async () => {
  await go("/kit", "Enforced rules"); await role("manager");
  await page.getByPlaceholder("TERM-7").fill("QA-BAD");
  await page.getByPlaceholder(/Say "mentor"/).fill("QA bad");
  await page.locator("form textarea").first().fill("Its tests contradict it.");
  await page.locator("form select").first().selectOption("term");
  await page.getByPlaceholder("teacher, tutor").fill("teacher");
  await page.getByLabel("A sentence that should be flagged").fill("Our mentors are great.");
  await page.getByLabel("A sentence that should pass").fill("Our teacher is great.");
  await page.getByRole("button", { name: "Save as advisory" }).click();
  await msg("QA-BAD saved as advisory");
  const card = ruleCard("QA-BAD");
  await card.getByRole("button", { name: "Enforce" }).click();
  await msg(/can't be enforced yet/, 30000);
  await card.getByRole("button", { name: "QA bad" }).click();
  await card.getByRole("button", { name: "Delete rule" }).click();
  await msg("QA-BAD deleted.");
});
await step(page, "kit: guide compiler proposes rules (AI)", async () => {
  const st = await (await page.request.get(L + "/api/state", { headers: { "x-workspace": "probe-compiler" } })).json();
  if (!st.ai?.available) return "skipped: AI off";
  await page.goto(L + "/kit"); await role("manager");
  await page.getByPlaceholder(/Example: "Always call our teachers/).fill("Always call our teachers mentors, never tutors. Never promise a rank or a guaranteed seat. Keep the tone calm and confident; do not use exclamation marks in headlines.");
  await page.getByRole("button", { name: "Propose rules" }).click();
  await page.getByText(/proposed|Proposed|Add as advisory|Save/).first().waitFor({ timeout: 60000 });
});
await step(page, "kit: export downloads a valid file", async () => {
  await page.goto(L + "/kit");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export Brand Kit" }).click()]);
  const j = JSON.parse(readFileSync(await dl.path(), "utf8"));
  must(j.format === "guidewise-brand-kit" && j.rules.length >= 20 && j.kit.logo, "export is incomplete");
  return `${j.rules.length} rules, logo included`;
});

// ---------- 5. New review: own image, ad type, locked phrase, confidential ----------
let rid2 = "";
await step(page, "new review: ad with an uploaded image and a locked phrase", async () => {
  await go("/review/new", "Brief card"); await role("creator");
  await page.getByPlaceholder("December batch caption").fill("QA ad");
  await page.locator("select").nth(1).selectOption("ad");
  await page.locator("textarea").first().fill("Mission IIT 2027 December batch at Preppath: two-year classroom programme with weekly tests, doubt sessions every evening and personal mentors for every student. HURRY, apply now!!");
  await page.getByPlaceholder("Mission IIT 2027, December batch").fill("Mission IIT 2027");
  await page.locator("input[type=file][accept*='image']").setInputFiles("public/sample-creative-fixed.png");
  await page.getByText(/Logo found \(match/).first().waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: "Run review" }).click();
  await page.waitForURL(/review\/[0-9a-f-]{36}/, { timeout: 120000 });
  await msg(/open finding/, 60000);
  rid2 = page.url().split("/review/")[1];
  const titles = await page.locator("button[aria-expanded]").evaluateAll((els) => els.map((e) => e.innerText.split("\n")[0]));
  for (const t of ['Write "PrepPath" exactly', "No capitals for emphasis", 'Ad text fits before "See more"']) must(titles.includes(t), `missing finding: ${t}`);
  must(!titles.includes("The PrepPath mark on every creative"), "logo flagged although the creative carries it");
  return `${titles.length} findings`;
});
await step(page, "review: fix the brand name, dismiss and reopen, comment, edit text", async () => {
  await page.locator("button[aria-expanded]", { hasText: 'Write "PrepPath" exactly' }).first().click();
  await page.getByRole("button", { name: "Accept fix" }).first().click();
  await page.waitForTimeout(2500);
  must((await page.locator("body").innerText()).includes("at PrepPath:"), "brand-name fix not applied");
  await page.locator("button[aria-expanded]", { hasText: "Short sentences" }).first().click().catch(() => {});
  await page.locator("button[aria-expanded]", { hasText: 'Ad text fits before "See more"' }).first().click();
  await page.getByRole("button", { name: "Dismiss" }).first().click();
  await page.locator("select[id^='r-']").first().selectOption({ index: 1 });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /Show \d+ resolved/ }).click();
  await page.getByRole("button", { name: "Reopen" }).first().click();
  await page.waitForTimeout(2500);
  const box = page.getByPlaceholder(/Comment as/);
  await box.fill("QA comment: checking the comment thread.");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await msg("QA comment: checking the comment thread.");
  await page.getByRole("button", { name: "Edit text" }).click();
  await page.locator("#edit").fill("Mission IIT 2027 December batch at PrepPath. Classes start 1 December. Write to admissions@preppath.in.");
  await page.getByRole("button", { name: "Save and re-check" }).click();
  await page.getByRole("button", { name: "Edit text" }).waitFor({ timeout: 60000 });
  return `${await page.getByRole("heading", { name: /open finding|No findings/ }).first().innerText()}`;
});
await step(page, "review: request changes sends it back, then approve and download", async () => {
  await page.reload(); await role("creator");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await msg(/Waiting for/);
  await role("brand");
  await page.getByPlaceholder("Comment (required when requesting changes)").fill("Please add the fee disclaimer.");
  await page.getByRole("button", { name: "Request changes" }).click();
  await page.waitForTimeout(2500);
  await role("creator");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await msg(/Waiting for/);
  await role("brand");
  const approve = page.getByRole("button", { name: "Approve" });
  if (await approve.isDisabled()) {
    // Open findings block approval: dismiss each with a reason as the reviewer.
    for (let k = 0; k < 10 && (await page.getByRole("button", { name: "Dismiss" }).count()); k++) {
      await page.locator("button[aria-expanded='false']").first().click().catch(() => {});
      await page.getByRole("button", { name: "Dismiss" }).first().click();
      await page.locator("select[id^='r-']").first().selectOption({ index: 1 });
      await page.waitForTimeout(2000);
    }
  }
  await approve.click();
  await msg(/Approved|approved/, 30000);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download JSON" }).click()]);
  const j = JSON.parse(readFileSync(await dl.path(), "utf8"));
  must(j.sha256 || j.fingerprint || j.hash, "receipt has no fingerprint");
  await page.goto(L + `/review/${rid2}/record`);
  await msg(/Approval record|approval record/);
});
await step(page, "approved draft is locked", async () => {
  const r = await page.request.post(L + `/api/drafts/${rid2}`, { data: { action: "edit", text: "Changed after approval." }, headers: { "x-workspace": await page.evaluate(() => localStorage.getItem("gw-ws") ?? "") } });
  must(r.status() === 409 || r.status() === 404, `expected 409, got ${r.status()}`);
});

// ---------- 6. Results, insights, tour, reset ----------
await step(page, "results: switch set and re-run; open a draft", async () => {
  await page.goto(L + "/results");
  await page.locator("select").nth(1).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Run again" }).click();
  await page.waitForTimeout(4000);
  await page.locator("button", { hasText: /^D\d+/ }).first().click();
  await page.waitForTimeout(300);
});
await step(page, "insights show the dismissal and facts watch", async () => {
  await go("/insights", "Fact expiry watch");
  const t = await page.locator("main").innerText();
  must(/dismiss/i.test(t) && /fact/i.test(t), "insights missing sections");
});
await step(page, "guided tour can be hidden and shown", async () => {
  await page.goto(L + `/review/${rid}`);
  const tour = page.getByRole("button", { name: /Guided tour/ });
  if (!(await tour.count())) return "not shown on this draft";
  await tour.click(); await page.waitForTimeout(300); await tour.click();
});
await step(page, "reset demo restores the sample kit", async () => {
  await page.goto(L);
  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.waitForTimeout(4000);
  await go("/kit", "Enforced rules");
  must((await page.getByRole("button", { name: "Run tests" }).count()) >= 22, "rules not restored");
  await go("/facts", "Facts Register");
  must(await page.getByText("Fees are subject to the published fee policy").count(), "disclaimers not restored");
});

await browser.close();
writeFileSync(join(tmp, "problems.txt"), problems.join("\n"));
const uniq = [...new Set(problems)];
if (uniq.length) { console.log(`\n${uniq.length} problem(s) seen while clicking:`); uniq.slice(0, 40).forEach((p) => console.log("  " + p)); }
console.log(failed || uniq.length ? `\n${failed} step(s) failed. Screenshots: ${tmp}` : "\nAll steps passed. No errors.");
process.exit(failed || uniq.length ? 1 : 0);
