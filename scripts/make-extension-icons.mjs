// Draws the browser extension's icons: a plain "g" on the Guidewise green, as paths (no fonts needed).
//   node scripts/make-extension-icons.mjs
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#1f4d3f"/>
  <g fill="none" stroke="#fffdf9" stroke-width="${size <= 16 ? 16 : 13}" stroke-linecap="round">
    <circle cx="60" cy="55" r="21"/>
    <path d="M 81 34 V 82 A 23 23 0 0 1 58 105 Q 47 105 40 99"/>
  </g>
</svg>`;

const dir = new URL("../extension/icons/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp(Buffer.from(svg(size))).png().toFile(new URL(`icon-${size}.png`, dir).pathname);
  console.log(`extension/icons/icon-${size}.png`);
}
