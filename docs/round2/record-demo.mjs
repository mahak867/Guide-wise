// Records a captioned walkthrough of the whole journey on the live site, as a video judges can watch.
//   BASE_URL=https://guidewise-kohl.vercel.app node docs/round2/record-demo.mjs   → public/demo.webm
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");

const L = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const dir = mkdtempSync(join(tmpdir(), "guidewise-video-"));
const size = { width: 1280, height: 800 };
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY && L.startsWith("https") ? { server: process.env.HTTPS_PROXY } : undefined });
const ctx = await browser.newContext({ viewport: size, recordVideo: { dir, size }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());

/** Caption bar at the bottom of the screen, kept across page navigations. */
async function say(text, ms = 3200) {
  await page.evaluate((t) => {
    let el = document.getElementById("gw-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "gw-caption";
      el.style.cssText = "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;max-width:900px;padding:12px 18px;border-radius:8px;background:rgba(22,33,31,.92);color:#fff;font:500 17px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);text-align:center";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
  await page.waitForTimeout(ms);
}
const role = (r) => page.getByRole("combobox").first().selectOption(r).then(() => page.waitForTimeout(700));
const open = async () => parseInt(await page.getByRole("heading", { name: /open finding/ }).innerText());

await page.goto(L);
await page.getByText(/Kit v\d+/i).first().waitFor();
await say("Guidewise checks marketing copy and creatives against a brand's approved rules and dated facts, before publication.", 4000);
await say("The demo brand is PrepPath Academy, a fictional JEE coaching centre. No sign-in: each visitor gets a private workspace.", 3800);
await page.getByText("Review the sample post").click();
await say("Reviewing a sample Instagram post: the caption and its creative are checked together.", 2500);
await page.waitForURL(/review\/[0-9a-f-]{36}/, { timeout: 120000 });
await page.getByText(/open finding/).first().waitFor({ timeout: 60000 });
await say(`${await open()} findings. Each one quotes the exact words, cites its rule and source, and offers a fix that was re-tested before it is shown.`, 4200);
await page.locator("button[aria-expanded]", { hasText: "No guaranteed outcomes" }).first().click();
await say("A regulation finding: a guaranteed-selection claim, with the CCPA (India) penalty order as precedent.", 4200);
await page.locator("button[aria-expanded]", { hasText: "Numbers must match the Facts Register" }).first().click();
await say("Every figure is compared with the Facts Register by subject and date: this number is used for the wrong subject.", 4200);
await page.locator("button[aria-expanded]", { hasText: "The PrepPath mark on every creative" }).first().click();
await page.getByText(/Not found\. Best match/).first().scrollIntoViewIfNeeded().catch(() => {});
await say("Image checks run in the browser with no AI: text read by OCR, palette colours, contrast, alt text, and the brand logo, which is missing here.", 4600);
await page.getByRole("heading", { name: /open finding/ }).scrollIntoViewIfNeeded();
await say("Accept all: each fix is applied and the checks run again on the new text.", 2500);
await page.getByRole("button", { name: /Accept all/ }).click();
await page.getByRole("button", { name: /Accept all|Applying/ }).waitFor({ state: "detached", timeout: 90000 });
await say(`${await open()} open now. The student-result finding has no automatic fix: that student has no consent on record.`, 4200);
await page.getByRole("button", { name: "Replace or edit images" }).click();
await page.getByRole("button", { name: "Remove" }).first().click();
await page.getByRole("button", { name: "Use the corrected sample" }).click();
await say("Replacing the creative with the corrected design: the text is read and the logo is found.", 2000);
await page.getByText(/Logo found \(match/).first().waitFor({ timeout: 120000 });
await page.getByText(/Logo found \(match/).first().scrollIntoViewIfNeeded();
await say(await page.getByText(/Logo found \(match/).first().innerText(), 2800);
await page.getByRole("button", { name: "Save and re-check" }).click();
await page.getByText("Images updated and checked again.").waitFor({ timeout: 90000 });
await page.getByRole("button", { name: "Submit for review" }).scrollIntoViewIfNeeded();
await say("Submit. A fixed rule table routes outcome claims to the compliance reviewer, not the brand reviewer.", 3200);
await page.getByRole("button", { name: "Submit for review" }).click();
await page.getByText(/Waiting for Kavya/).waitFor({ timeout: 30000 });
await say("Waiting for Kavya, compliance. Switching role: in production each person signs in.", 3000);
await role("compliance");
for (let k = 0; k < 15 && (await open()) > 0; k++) {
  const n = await open();
  await page.getByRole("button", { name: "Dismiss", exact: true }).first().click();
  await page.locator('select[id^="r-"]').selectOption("Approved exception");
  for (let i = 0; i < 80 && (await open()) === n; i++) await page.waitForTimeout(250);
  if (k === 0) await say("Compliance dismisses what remains with a recorded reason. Only compliance may dismiss a critical finding.", 3200);
}
await page.getByRole("button", { name: "Approve", exact: true }).click();
await page.getByText("Approval receipt").waitFor({ timeout: 30000 });
await page.getByText("Approval receipt").scrollIntoViewIfNeeded();
await say("Approved. The receipt holds a SHA-256 fingerprint of the exact text, the Brand Kit version, every finding and the approver.", 4600);
await page.goto(L + "/results");
await page.getByText(/Kit v\d+/i).first().waitFor();
await say("The Results page re-runs the evaluation live: 60 planted-error drafts, 40 held out, with 95% intervals.", 4600);
await page.goto(L + "/kit");
await page.getByText("Enforced rules").first().waitFor();
await say("The Brand Kit: every rule carries test sentences and can only be enforced when its own check passes them.", 4200);
await say("Guidewise · team Guide Wise · CodeNova India 2026 · guidewise-kohl.vercel.app", 3500);

await ctx.close();
await browser.close();
const file = readdirSync(dir).find((f) => f.endsWith(".webm"));
copyFileSync(join(dir, file), "public/demo.webm");
console.log("wrote public/demo.webm");
