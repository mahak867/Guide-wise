// Copies the OCR engine and English language data into public/ocr so the browser
// loads them from our own site instead of a third-party CDN.
import { cpSync, mkdirSync, readdirSync } from "node:fs";

const out = "public/ocr";
mkdirSync(out, { recursive: true });
cpSync("node_modules/tesseract.js/dist/worker.min.js", `${out}/worker.min.js`);
for (const f of readdirSync("node_modules/tesseract.js-core")) {
  if (/-lstm\.wasm\.js$/.test(f)) cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/${f}`);
}
cpSync("node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", `${out}/eng.traineddata.gz`);
console.log("OCR assets copied to", out);
