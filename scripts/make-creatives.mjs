// Renders the demo assets: the PrepPath mark (Brand Kit logo) and the two sample creatives.
//   node scripts/make-creatives.mjs
// PrepPath Academy is fictional; these are demo assets drawn by the team.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const MARK = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">
  <rect x="0" y="0" width="200" height="200" rx="44" fill="#F2A541"/>
  <polyline points="38,156 78,116 104,138 160,62" fill="none" stroke="#16211F" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="160" cy="62" r="20" fill="#16211F"/>
</svg>`;

const page = (bg, body) => `<!doctype html><html><head><style>
  html,body{margin:0}
  .c{width:1080px;height:1080px;background:${bg};position:relative;font-family:Arial,Helvetica,sans-serif;color:#fff;overflow:hidden}
  .brand{position:absolute;left:80px;top:80px;display:flex;align-items:center;gap:36px;font-weight:700;font-size:44px;letter-spacing:.5px}
</style></head><body><div class="c">${body}</div></body></html>`;

const BAD = page("#E53935", `
  <div style="position:absolute;left:80px;top:80px;font-weight:700;font-size:44px;letter-spacing:1px">PrepPath Academy</div>
  <div style="position:absolute;left:80px;top:290px;font-weight:700;font-size:118px;line-height:1">100%<br>SELECTION<br>GUARANTEED</div>
  <div style="position:absolute;left:80px;top:674px;background:#fff;color:#16211F;border-radius:14px;padding:22px 34px;font-weight:700;font-size:56px">Rohan, AIR 23</div>
  <div style="position:absolute;left:80px;top:940px;font-weight:700;font-size:56px">Call 98765 43210</div>`);

const GOOD = page("#0F6B5F", `
  <div class="brand">${MARK(132)}<span>PrepPath Academy</span></div>
  <div style="position:absolute;left:80px;top:378px;font-weight:700;font-size:84px;line-height:1.08">4,200+ JEE selections<br>in 2025</div>
  <div style="position:absolute;left:80px;top:582px;font-weight:700;font-size:44px">from our two-year classroom programme</div>
  <div style="position:absolute;left:80px;top:668px;font-size:34px">Past results do not guarantee future selection.</div>
  <div style="position:absolute;left:80px;top:948px;font-weight:700;font-size:48px">admissions@preppath.in</div>`);

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
await p.setContent(BAD); await p.locator(".c").screenshot({ path: "public/sample-creative.png" });
await p.setContent(GOOD); await p.locator(".c").screenshot({ path: "public/sample-creative-fixed.png" });
await p.setViewportSize({ width: 240, height: 240 });
await p.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${MARK(240)}</body></html>`);
await p.locator("svg").screenshot({ path: "public/brand/preppath-mark.png", omitBackground: true });
await browser.close();
console.log("written");
