// Records a captioned 2-minute walkthrough of the current version on the live site.
//   BASE_URL=https://guidewise-kohl.vercel.app node docs/round3/record-demo.mjs   → public/demo.webm
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");

const L = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const dir = mkdtempSync(join(tmpdir(), "guidewise-video-"));
const size = { width: 1280, height: 720 };
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY && L.startsWith("https") ? { server: process.env.HTTPS_PROXY } : undefined });
const ctx = await browser.newContext({ viewport: size, recordVideo: { dir, size }, ignoreHTTPSErrors: true, colorScheme: "light" });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());

/** Caption bar at the bottom of the screen; re-added after each navigation. */
async function say(text, ms = 1500) {
  await page.evaluate((t) => {
    // A closed shadow root keeps the caption out of the selectors that drive the page.
    if (!window.__gwCap) {
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:99999;pointer-events:none";
      const el = document.createElement("div");
      el.style.cssText = "max-width:960px;padding:10px 18px;border-radius:8px;background:rgba(22,33,31,.92);color:#fff;font:500 18px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);text-align:center";
      host.attachShadow({ mode: "closed" }).appendChild(el);
      document.body.appendChild(host);
      window.__gwCap = el;
    }
    window.__gwCap.textContent = t;
  }, text);
  await page.waitForTimeout(ms);
}
const role = (r) => page.getByRole("combobox").first().selectOption(r).then(() => page.waitForTimeout(600));
const open = async () => parseInt(await page.getByRole("heading", { name: /open finding/ }).innerText());
const row = (t) => page.locator("button[aria-expanded]", { hasText: t }).first();
const waitChange = async (n) => { for (let i = 0; i < 120 && (await open()) === n; i++) await page.waitForTimeout(250); };

// Home
await page.goto(L);
await page.getByText(/Kit v\d+/i).first().waitFor({ timeout: 60000 });
await say("Guidewise checks marketing drafts against a brand's approved rules and dated facts. Demo brand: PrepPath, a fictional coaching centre.", 3500);
await say("1. Review the sample post", 1500);
await page.getByText("Review the sample post").click();
await page.waitForURL(/review\/[0-9a-f-]{36}/, { timeout: 120000 });
await page.getByText(/open finding/).first().waitFor({ timeout: 90000 });

// 2. Findings, accept a fix, undo
await say(`2. Every finding quotes the words and the rule it breaks (${await open()} here)`, 2500);
await row("No guaranteed outcomes").click();
await say("A guaranteed-selection claim, with the rule and its source", 2500);
await row("No guaranteed outcomes").click();
await row("No false urgency").click();
await say("Each fix is re-tested by code before it is offered", 2000);
await page.getByRole("button", { name: "Accept fix" }).first().click();
await page.getByRole("button", { name: "Undo fix" }).waitFor({ timeout: 30000 });
await say("Fix accepted. It can be undone for 10 seconds", 1800);
await page.getByRole("button", { name: "Undo fix" }).click();
await page.getByText("Fix undone").first().waitFor({ timeout: 30000 }).catch(() => {});
await say("Undone: the original text and the finding are back", 1800);

// 3. Submit, dual sign-off, receipt
await page.getByRole("button", { name: /Accept all/ }).click();
await page.getByRole("button", { name: /Accept all|Applying/ }).waitFor({ state: "detached", timeout: 90000 });
await say(`3. Accept all fixes, then submit. ${await open()} findings still need a person`, 2000);
await page.getByRole("button", { name: "Submit for review" }).click();
await page.getByText(/Waiting for Kavya/).waitFor({ timeout: 30000 });
await say("Outcome claims are routed to Kavya, the compliance reviewer", 2000);
await role("compliance");
const first = await open();
await page.getByRole("button", { name: "Dismiss", exact: true }).first().click();
await page.locator('select[id^="r-"]').selectOption("Approved exception");
await say("Only a reviewer can grant an exception, with a reason", 1800);
await page.getByRole("button", { name: "Grant exception" }).click();
await waitChange(first);
for (let k = 0; k < 15 && (await open()) > 0; k++) {
  const n = await open();
  await page.getByRole("button", { name: "Dismiss", exact: true }).first().click();
  await page.locator('select[id^="r-"]').selectOption("Approved exception");
  await page.getByRole("button", { name: "Grant exception" }).click();
  await waitChange(n);
}
await page.getByRole("button", { name: "Approve", exact: true }).click();
await page.getByText(/waiting for brand sign-off/i).first().waitFor({ timeout: 30000 });
await say("High-risk content needs two sign-offs: compliance first, then brand", 2200);
await role("brand");
await page.getByRole("button", { name: "Approve", exact: true }).click();
await page.getByRole("heading", { name: "Approval receipt" }).waitFor({ timeout: 30000 });
await page.getByRole("heading", { name: "Approval receipt" }).scrollIntoViewIfNeeded();
await say("Arjun (brand) approves. The receipt has a SHA-256 fingerprint and the Brand Kit version", 2800);

// 4. Sample campaign
await page.goto(L + "/review/new");
await page.getByText("Brief card").first().waitFor();
await role("creator");
await say("4. A campaign: caption, creative, brochure and landing page reviewed together", 1500);
await page.getByRole("button", { name: "Use the sample campaign" }).click();
await page.getByText(/Logo found \(match/).first().waitFor({ timeout: 120000 });
await page.getByRole("button", { name: "Run review" }).click();
await page.waitForURL(/review\/[0-9a-f-]{36}/, { timeout: 120000 });
await page.getByText(/open finding/).first().waitFor({ timeout: 90000 });
await row("The campaign says the same thing everywhere").click();
await row("The campaign says the same thing everywhere").scrollIntoViewIfNeeded();
await say("The fee and promo code differ between documents. Each source is cited", 3000);
await row("The campaign says the same thing everywhere").click();
if (await row("People in a creative need consent on record").count()) {
  await row("People in a creative need consent on record").scrollIntoViewIfNeeded();
  await row("People in a creative need consent on record").click();
  await say("AI vision sees a person in the creative: a consent check, routed to compliance", 2800);
  await row("People in a creative need consent on record").click();
}
const where = page.locator("summary", { hasText: /^Where on Image 1/ }).first();
if (await where.count()) {
  await where.scrollIntoViewIfNeeded();
  await where.click();
  await page.locator("figure").filter({ has: page.locator("figcaption") }).first().scrollIntoViewIfNeeded().catch(() => {});
  await say("The image inspector outlines each image finding on the creative", 2800);
}

// 5. Facts: change F-3
await page.goto(L + "/facts");
await page.getByText("Facts Register").first().waitFor();
await role("manager");
await say("5. Change an approved fact: F-3, the JEE selections figure", 1500);
await page.locator("tr", { hasText: "F-3" }).first().getByRole("button", { name: "Edit" }).click();
await page.getByRole("heading", { name: "Edit fact F-3" }).waitFor({ timeout: 10000 });
const f = page.locator("form").filter({ has: page.getByPlaceholder("F-12") });
await f.getByPlaceholder("1150").fill("4500");
await f.getByRole("button", { name: "Save F-3" }).click();
await page.getByText("Impact of this change").first().waitFor({ timeout: 30000 });
await page.locator("section[aria-label='Impact of this change']").scrollIntoViewIfNeeded().catch(() => {});
await say("Every draft that used F-3 is re-checked. The approved post goes back for re-approval", 3500);

// 6. API playground
await page.goto(L + "/developers");
await page.getByText("Playground").first().waitFor();
await role("manager");
await say("6. The same checks through the REST API and an MCP server", 1500);
await page.getByRole("button", { name: "Create key" }).click();
await page.getByText(/Copy this key now/).waitFor();
await page.getByLabel("Call through").selectOption({ label: "MCP server" });
await page.getByRole("button", { name: "Call check_draft" }).click();
await page.getByText(/the same as the app would show/).first().waitFor({ timeout: 60000 });
await page.getByText(/the same as the app would show/).first().scrollIntoViewIfNeeded();
await say("check_draft returns the same findings as the app, and the call is logged", 3000);

// 7. Results
await page.goto(L + "/results");
await page.getByText(/Kit v\d+/i).first().waitFor();
await page.waitForTimeout(2500);
await say("7. The Results page re-runs the accuracy evaluation live", 2500);
await page.getByRole("combobox", { name: "Which brand" }).selectOption("2");
await page.waitForTimeout(2500);
await say("A second brand, a fictional health insurer, with 40 drafts of its own", 3000);
await say("Guidewise · team Guide Wise · guidewise-kohl.vercel.app", 2500);

await ctx.close();
await browser.close();
const file = readdirSync(dir).find((x) => x.endsWith(".webm"));
copyFileSync(join(dir, file), "public/demo.webm");
console.log("wrote public/demo.webm");
