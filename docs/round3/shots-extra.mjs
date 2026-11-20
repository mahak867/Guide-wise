// Screenshots of what was built beyond the three promised improvements, taken from the live site.
//   BASE_URL=https://guidewise-kohl.vercel.app node docs/round3/shots-extra.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const L = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT = "docs/round3/img";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
const role = (r) => p.getByRole("combobox").first().selectOption(r).then(() => p.waitForTimeout(600));

// Bulk check: the sample calendar, six verdicts.
await p.goto(L + "/bulk"); await p.getByRole("button", { name: /sample calendar/i }).click();
await p.getByRole("button", { name: /^Check / }).first().click();
await p.getByText(/ready for review/i).first().waitFor({ timeout: 60000 }); await p.waitForTimeout(800);
await p.getByRole("heading", { name: "Results" }).scrollIntoViewIfNeeded();
await p.screenshot({ path: `${OUT}/10-bulk.png` });

// Channel preview on New review with the sample caption.
await p.goto(L + "/review/new"); await p.getByRole("button", { name: "Use the sample caption" }).click(); await p.waitForTimeout(800);
const prev = p.getByText(/Preview on/).first(); await prev.scrollIntoViewIfNeeded();
const details = p.locator("details").filter({ has: p.getByText(/Preview on/) }).first();
if (await details.count() && !(await details.getAttribute("open"))) await details.locator("summary").click();
await p.waitForTimeout(600); await p.evaluate(() => window.scrollBy(0, -80));
await p.screenshot({ path: `${OUT}/11-preview.png` });

// Review page: accept a fix, the Undo notice, keyboard hint.
await p.goto(L); await p.getByText("Review the sample post").click();
await p.waitForURL(/review\/[0-9a-f-]{36}/, { timeout: 120000 }); await p.getByText(/open finding/).first().waitFor({ timeout: 60000 });
await p.getByRole("button", { name: /Hide/ }).first().click().catch(() => {});
await p.locator("button[aria-expanded]").first().click(); await p.waitForTimeout(500);
const accept = p.getByRole("button", { name: "Accept fix" }).first();
if (await accept.count()) { await accept.click(); await p.getByRole("button", { name: /Undo fix/ }).waitFor({ timeout: 30000 }); }
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/12-review-undo.png` });

// Approval record with a share link: approve the seeded post's record is already approved.
await p.goto(L); await p.getByText("WhatsApp broadcast: 2025 JEE results").first().click();
await p.waitForURL(/review\//); await p.getByRole("link", { name: /record/i }).first().click();
await p.getByRole("button", { name: /Share read-only link/ }).click();
await p.getByRole("button", { name: /Copy link/ }).waitFor({ timeout: 30000 }); await p.waitForTimeout(500);
const share = p.getByText(/Share outside the workspace/).first(); await share.scrollIntoViewIfNeeded();
await p.screenshot({ path: `${OUT}/13-share.png` });

await b.close();
console.log("extra screenshots written to", OUT);
