// Renders the sample campaign creative (an illustrated student with a trophy) for the campaign demo.
//   node scripts/make-campaign-creative.mjs
// PrepPath Academy and the student are fictional; the illustration is drawn here in SVG.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const MARK = `<svg width="110" height="110" viewBox="0 0 200 200"><rect width="200" height="200" rx="44" fill="#F2A541"/><polyline points="38,156 78,116 104,138 160,62" fill="none" stroke="#16211F" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/><circle cx="160" cy="62" r="20" fill="#16211F"/></svg>`;
const STUDENT = `<svg width="380" height="520" viewBox="0 0 380 520">
  <ellipse cx="190" cy="500" rx="150" ry="16" fill="#0b544a"/>
  <path d="M95 500 Q100 330 190 310 Q280 330 285 500 Z" fill="#EEF3F1"/>
  <path d="M150 318 L190 380 L230 318" fill="none" stroke="#16211F" stroke-width="6"/>
  <rect x="172" y="250" width="36" height="70" rx="14" fill="#c98b62"/>
  <circle cx="190" cy="205" r="72" fill="#d99a6c"/>
  <path d="M118 200 Q120 120 190 118 Q262 120 262 196 Q240 150 190 150 Q140 150 118 200 Z" fill="#16211F"/>
  <circle cx="165" cy="210" r="7" fill="#16211F"/><circle cx="215" cy="210" r="7" fill="#16211F"/>
  <path d="M168 245 Q190 262 212 245" fill="none" stroke="#16211F" stroke-width="5" stroke-linecap="round"/>
  <path d="M285 420 L300 330" stroke="#d99a6c" stroke-width="26" stroke-linecap="round"/>
  <path d="M270 250 h70 v18 q0 52 -35 60 q-35 -8 -35 -60 z" fill="#F2A541"/><rect x="295" y="326" width="20" height="26" fill="#F2A541"/><rect x="280" y="350" width="50" height="12" rx="4" fill="#F2A541"/>
</svg>`;
const html = `<!doctype html><html><body style="margin:0"><div id="c" style="width:1080px;height:1080px;background:#0F6B5F;position:relative;font-family:Arial,Helvetica,sans-serif;color:#fff;overflow:hidden">
  <div style="position:absolute;left:70px;top:70px;display:flex;align-items:center;gap:30px;font-weight:700;font-size:40px">${MARK}<span>PrepPath Academy</span></div>
  <div style="position:absolute;left:70px;top:300px;font-weight:700;font-size:84px;line-height:1.05">JEE Crash<br>Course</div>
  <div style="position:absolute;left:70px;top:520px;font-weight:700;font-size:58px">Fee ₹12,999</div>
  <div style="position:absolute;left:70px;top:610px;font-size:44px">Starts 5 January</div>
  <div style="position:absolute;left:70px;top:690px;font-size:40px">Code EARLY20</div>
  <div style="position:absolute;left:70px;top:960px;font-weight:700;font-size:40px">admissions@preppath.in</div>
  <div style="position:absolute;right:40px;top:420px">${STUDENT}</div>
</div></body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1080 } });
await p.setContent(html);
await p.locator("#c").screenshot({ path: "public/sample-campaign-creative.png" });
await b.close();
console.log("written");
