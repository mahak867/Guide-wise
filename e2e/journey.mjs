// End-to-end browser test of the whole product, against a running copy of the app.
//   npm run e2e                                   tests http://localhost:3000
//   BASE_URL=https://guidewise-kohl.vercel.app npm run e2e
// Needs Playwright: `npm i --no-save playwright && npx playwright install chromium`.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

// require() also finds a globally installed Playwright (NODE_PATH); a plain import would not.
const { chromium } = createRequire(import.meta.url)("playwright");

const L = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const tmp = mkdtempSync(join(tmpdir(), "guidewise-e2e-"));
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY && L.startsWith("https") ? { server: process.env.HTTPS_PROXY } : undefined });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, ignoreHTTPSErrors: true, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push("page error: " + e.message));
page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url().replace(L, "")}`); });

let failed = 0;
async function step(name, fn) {
  const t = Date.now();
  try {
    const note = await fn();
    console.log(`PASS  ${name} (${Date.now() - t} ms)${note ? "  " + note : ""}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${String(e.message).split("\n")[0]}`);
    await page.screenshot({ path: join(tmp, `fail-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {});
  }
}
const open = async () => parseInt(await page.getByRole("heading", { name: /open finding/ }).innerText());
const waitChange = async (n) => { for (let i = 0; i < 80 && (await open()) === n; i++) await page.waitForTimeout(250); };
const role = (r) => page.getByRole("combobox").first().selectOption(r).then(() => page.waitForTimeout(600));
const rows = () => page.locator("button[aria-expanded]").evaluateAll((els) => els.map((e) => e.innerText.split("\n")[0]));
let aiOn = false;

await step("home loads", async () => {
  await page.goto(L);
  await page.getByText(/AI checks on|Rules-only mode/).first().waitFor({ timeout: 30000 });
  aiOn = (await page.getByText("AI checks on").count()) > 0;
  return aiOn ? "AI checks on" : "rules-only mode";
});
await step("sample post is reviewed", async () => {
  await page.getByText("Review the sample post").click();
  await page.waitForURL(/review\/[0-9a-f-]{36}/, { timeout: 120000 });
  await page.getByText(/open finding/).first().waitFor({ timeout: 60000 });
  const n = await open();
  if (n < 12) throw new Error(`expected at least 12 findings, got ${n}`);
  return `${n} findings`;
});
await step("a fix can be edited before accepting", async () => {
  await page.locator("button[aria-expanded]", { hasText: "No false urgency" }).first().click();
  await page.getByRole("button", { name: "Edit fix" }).click();
  await page.locator('textarea[id^="fx-"]').fill("The December batch starts on 1 December.");
  await page.getByRole("button", { name: "Apply edited fix" }).click();
  await page.getByText("Edited fix applied").waitFor({ timeout: 60000 });
});
await step("accept all fixes", async () => {
  const before = await open();
  await page.getByRole("button", { name: /Accept all/ }).click();
  await page.getByRole("button", { name: /Accept all|Applying/ }).waitFor({ state: "detached", timeout: 90000 });
  const after = await open();
  if (after >= before) throw new Error("no findings were resolved");
  return `${before} → ${after} open`;
});
await step("replace the image with the corrected design", async () => {
  await page.getByRole("button", { name: "Replace or edit images" }).click();
  await page.getByRole("button", { name: "Remove" }).first().click();
  await page.getByRole("button", { name: "Use the corrected sample" }).click();
  await page.locator("fieldset img").first().waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "Save and re-check" }).click();
  await page.getByText("Images updated and checked again.").waitFor({ timeout: 90000 });
  return `${await open()} open`;
});
await step("submit routes outcome claims to compliance", async () => {
  await page.getByRole("button", { name: "Submit for review" }).click();
  await page.getByText(/Waiting for Kavya/).waitFor({ timeout: 30000 });
});
await step("the brand reviewer cannot approve a high-risk draft", async () => {
  await role("brand");
  const b = page.getByRole("button", { name: "Approve", exact: true });
  if ((await b.count()) && (await b.isEnabled())) throw new Error("brand reviewer could approve");
});
await step("compliance dismisses with reasons and approves", async () => {
  await role("compliance");
  for (let k = 0; k < 15 && (await open()) > 0; k++) {
    const n = await open();
    await page.getByRole("button", { name: "Dismiss", exact: true }).first().click();
    await page.locator('select[id^="r-"]').selectOption("Approved exception");
    await waitChange(n);
  }
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByText("Approval receipt").waitFor({ timeout: 30000 });
});
await step("approval record opens", async () => {
  await page.getByRole("link", { name: "Approval record (PDF)" }).click();
  await page.getByText("Guidewise approval record").waitFor({ timeout: 30000 });
});
await step("PDF upload extracts text", async () => {
  const pdfPage = await browser.newPage();
  await pdfPage.setContent("<h1>PrepPath brochure</h1><p>India's No. 1 JEE institute. 100% selection guaranteed.</p>");
  const file = join(tmp, "brochure.pdf");
  await pdfPage.pdf({ path: file });
  await pdfPage.close();
  await role("creator");
  await page.goto(L + "/review/new");
  await page.locator('input[type=file][accept=".docx,.pdf"]').setInputFiles(file);
  await page.waitForFunction(() => (document.querySelector("textarea")?.value.length ?? 0) > 10, null, { timeout: 30000 });
});
await step("a social-only rule applies to social posts and not to emails", async () => {
  const run = async (type) => {
    await page.goto(L + "/review/new");
    await page.locator("select").nth(1).selectOption(type);
    await page.locator("textarea").first().fill("Apply for the December batch now: bit.ly/pp-dec");
    await page.getByRole("button", { name: "Run review" }).click();
    await page.waitForURL(/review\/[0-9a-f-]{36}/, { timeout: 120000 });
    await page.getByText(/open finding|No findings/).first().waitFor({ timeout: 60000 });
    return (await rows()).some((r) => /shortened links/i.test(r));
  };
  if (!(await run("social"))) throw new Error("not flagged on a social post");
  if (await run("email")) throw new Error("flagged on an email");
});
await step("a confidential draft is never sent to AI", async () => {
  await page.goto(L + "/review/new");
  await page.locator("textarea").first().fill("Join PrepPath and you will definitely clear JEE. 100% selection guaranteed.");
  await page.getByLabel(/Confidential draft/).check();
  await page.getByRole("button", { name: "Run review" }).click();
  await page.waitForURL(/review\/[0-9a-f-]{36}/, { timeout: 120000 });
  await page.getByText("Confidential · never sent to AI").waitFor({ timeout: 60000 });
  await page.getByText("Code checks only").first().waitFor();
});
if (aiOn) {
  await step("AI catches phrasings the code checks miss", async () => {
    await page.goto(L + "/review/new");
    await page.locator("textarea").first().fill("Join PrepPath and you will definitely clear JEE. Our faculty is unmatched anywhere in the country.");
    await page.getByRole("button", { name: "Run review" }).click();
    await page.waitForURL(/review\/[0-9a-f-]{36}/, { timeout: 120000 });
    await page.getByText(/open finding/).first().waitFor({ timeout: 60000 });
    const r = await rows();
    if (!r.some((x) => /guaranteed/i.test(x))) throw new Error("the guarantee was missed: " + r.join(" / "));
    return r.slice(1).join(" / ");
  });
}
await step("Brand Kit: tests run, export and import", async () => {
  await page.goto(L + "/kit");
  await role("manager");
  await page.getByRole("button", { name: "Run tests" }).first().click();
  await page.getByText(/Tests pass|Tests fail/).first().waitFor({ timeout: 30000 });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export Brand Kit" }).click()]);
  const file = join(tmp, "kit.json");
  await download.saveAs(file);
  const kit = JSON.parse((await import("node:fs")).readFileSync(file, "utf8"));
  kit.rules.push({ id: "E2E-1", kind: "code", category: "term", title: "Say mentor, not tutor", description: "Use mentor.", severity: "minor", status: "enforced", source: "e2e", risk: "low", config: { avoid: ["tutor"], prefer: "mentor" }, tests: [{ text: "Ask your tutor.", expect: "flag" }, { text: "Ask your mentor.", expect: "pass" }], precedent: null });
  writeFileSync(file, JSON.stringify(kit));
  await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles(file);
  await page.getByText(/Imported: 1 new or changed rule/).waitFor({ timeout: 30000 });
  // An imported rule arrives as advisory even though the file said "enforced".
  const card = page.locator("section", { hasText: "Say mentor, not tutor" }).first();
  await card.getByText("Advisory").waitFor({ timeout: 15000 });
  return `${kit.rules.length} rules, ${kit.facts.length} facts round-tripped`;
});
for (const [path, text] of [["/facts", "Facts Register"], ["/insights", "Rules by how often they fire"], ["/results", "Measured results"], ["/about", "How Guidewise works"], ["/nope", "That page does not exist"]]) {
  await step(`page ${path}`, async () => { await page.goto(L + path); await page.getByText(text).first().waitFor({ timeout: 30000 }); });
}
await step("reset demo", async () => {
  await page.goto(L);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.waitForTimeout(4000);
});

await browser.close();
console.log(errors.length ? "SERVER OR PAGE ERRORS:\n  " + errors.join("\n  ") : "No server or page errors.");
console.log(failed ? `${failed} step(s) failed. Screenshots in ${tmp}` : "All steps passed.");
process.exit(failed || errors.length ? 1 : 0);
