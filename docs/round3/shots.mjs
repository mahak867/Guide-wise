// Screenshots for the Round 3 PDF, taken from the live site.
//   BASE_URL=https://guidewise-kohl.vercel.app node docs/round3/shots.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const L = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT = "docs/round3/img";
const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY && L.startsWith("https") ? { server: process.env.HTTPS_PROXY } : undefined });
const p = await b.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const role = (r) => p.getByRole("combobox").first().selectOption(r).then(() => p.waitForTimeout(600));
const open = async () => parseInt(await p.getByRole("heading", { name: /open finding/ }).innerText());

await p.goto(L); await p.getByText(/Kit v\d+/i).first().waitFor(); await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/01-home.png` });

// The sample post, approved, then a fact it relies on changes: change impact.
await p.getByText("Review the sample post").click();
await p.waitForURL(/review\/[0-9a-f-]{36}/, { timeout: 120000 });
await p.getByText(/open finding/).first().waitFor({ timeout: 60000 });
await p.getByRole("button", { name: /Hide/ }).first().click().catch(() => {});
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/02-review.png` });
const reviewUrl = p.url();
await p.getByRole("button", { name: /Accept all/ }).click();
await p.getByRole("button", { name: /Accept all|Applying/ }).waitFor({ state: "detached", timeout: 90000 });
await p.getByRole("button", { name: "Replace or edit images" }).click();
await p.getByRole("button", { name: "Remove" }).first().click();
await p.getByRole("button", { name: "Use the corrected sample" }).click();
await p.locator("fieldset img").first().waitFor({ timeout: 120000 });
await p.getByRole("button", { name: "Save and re-check" }).click();
await p.getByText("Images updated and checked again.").waitFor({ timeout: 90000 });
await p.getByRole("button", { name: "Submit for review" }).click();
await p.getByText(/Waiting for/).waitFor({ timeout: 30000 });
await role("compliance");
for (let k = 0; k < 20 && (await open()) > 0; k++) {
  const n = await open();
  const dis = p.getByRole("button", { name: "Dismiss", exact: true }).first();
  if (!(await dis.count())) { const row = p.locator("button[aria-expanded=false]").nth(1); if (await row.count()) await row.click(); }
  await dis.click();
  await p.locator('select[id^="r-"]').selectOption("Approved exception");
  for (let w = 0; w < 80 && (await open()) === n; w++) await p.waitForTimeout(250);
}
await p.getByRole("button", { name: "Approve", exact: true }).click();
await p.getByText("Approval receipt").waitFor({ timeout: 30000 });
await p.goto(L + "/facts"); await p.getByText("Facts Register").first().waitFor(); await role("manager");
await p.evaluate(async () => {
  const h = { "x-workspace": localStorage.getItem("gw-ws") ?? "", "x-role": "manager", "content-type": "application/json" };
  const st = await (await fetch("/api/state", { headers: h })).json();
  const f3 = st.facts.find((f) => f.id === "F-3");
  const r = await (await fetch("/api/facts", { method: "POST", headers: h, body: JSON.stringify({ ...f3, value: 4500, statement: "4,500+ JEE selections in 2025 from our two-year classroom programme" }) })).json();
  window.dispatchEvent(new CustomEvent("gw-impact", { detail: r.impact }));
});
await p.getByText("Impact of this change").waitFor({ timeout: 30000 }); await p.waitForTimeout(500);
await p.locator("section[aria-label='Impact of this change']").screenshot({ path: `${OUT}/03-impact.png` });
await p.goto(reviewUrl); await p.getByText(/Back for re-approval/).waitFor({ timeout: 30000 }); await p.waitForTimeout(500);
await p.evaluate(() => window.scrollTo(0, 0));
await p.screenshot({ path: `${OUT}/04-reapproval.png` });

// API and MCP: create a key, call check_draft through MCP.
await p.goto(L + "/developers"); await p.getByText("Playground").first().waitFor(); await role("manager");
await p.getByRole("button", { name: "Create key" }).click();
await p.getByText(/Copy this key now/).waitFor();
await p.getByLabel("Call through").selectOption({ label: "MCP server" });
await p.getByRole("button", { name: "Call check_draft" }).click();
await p.getByText(/the same as the app would show/).waitFor({ timeout: 60000 });
await p.getByLabel("Tool").selectOption("get_brief");
await p.getByRole("button", { name: "Call get_brief" }).click();
await p.getByText(/facts valid today/).first().waitFor({ timeout: 30000 });
await p.getByLabel("Tool").selectOption("check_draft");
await p.getByRole("button", { name: "Call check_draft" }).click();
await p.getByText(/the same as the app would show/).waitFor({ timeout: 60000 }); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/05-api.png`, fullPage: true });

// Campaign review with AI vision.
await p.goto(L + "/review/new"); await p.getByText("Brief card").first().waitFor(); await role("creator");
await p.getByRole("button", { name: "Use the sample campaign" }).click();
await p.getByText(/Logo found \(match/).first().waitFor({ timeout: 120000 });
await p.getByRole("button", { name: "Run review" }).click();
await p.waitForURL(/review\/[0-9a-f-]{36}/, { timeout: 120000 });
await p.getByText(/open finding/).first().waitFor({ timeout: 90000 });
await p.getByRole("button", { name: /Hide/ }).first().click().catch(() => {});
await p.locator("button[aria-expanded]", { hasText: "The campaign says the same thing everywhere" }).first().click();
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/06-campaign.png` });
await p.locator("#img-1").scrollIntoViewIfNeeded();
await p.locator("#img-1").screenshot({ path: `${OUT}/07-vision.png` });
await p.locator("#doc-1").scrollIntoViewIfNeeded();
await p.getByText("Campaign documents").first().locator("xpath=ancestor::section[1]").screenshot({ path: `${OUT}/08-documents.png` });

await p.goto(L + "/insights"); await p.getByText("Rules by how often they fire").waitFor({ timeout: 30000 }); await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/09-insights.png` });
await b.close();
console.log("screenshots written to", OUT);
