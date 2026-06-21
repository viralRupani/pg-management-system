// Generates raster assets that social platforms / legacy crawlers require but
// that browsers can't derive from SVG: the 1200x630 OG share image, the
// apple-touch-icon, and a favicon.ico. Run once via `pnpm gen:assets`; the
// outputs are committed to public/ so the Vite build itself stays pure-static.
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// ---- OG image (1200x630) ----
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4b40c8"/>
      <stop offset="0.55" stop-color="#3b30b0"/>
      <stop offset="1" stop-color="#2d2796"/>
    </linearGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#dcd9ff"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1050" cy="90" r="320" fill="#6a5ff0" opacity="0.25"/>
  <g transform="translate(90 110)">
    <rect width="96" height="96" rx="24" fill="url(#mark)"/>
    <g transform="translate(18 18)" fill="none" stroke="#3b30b0" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 26 L30 9 L56 26"/>
      <path d="M9 23 V52 H51 V23"/>
      <path d="M18 52 V40 a4 4 0 0 1 4 -4 h16 a4 4 0 0 1 4 4 v12"/>
    </g>
    <text x="120" y="68" font-family="Helvetica, Arial, sans-serif" font-size="62" font-weight="700" fill="#ffffff">Basera</text>
  </g>
  <text x="90" y="330" font-family="Helvetica, Arial, sans-serif" font-size="68" font-weight="700" fill="#ffffff">Run your entire PG</text>
  <text x="90" y="408" font-family="Helvetica, Arial, sans-serif" font-size="68" font-weight="700" fill="#cfcaff">from one app.</text>
  <text x="90" y="486" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="400" fill="#e7e5ff">Beds · Rent · KYC · Complaints · Mess — for PG owners.</text>
  <g transform="translate(90 530)">
    <rect width="290" height="62" rx="31" fill="#ffffff"/>
    <text x="145" y="42" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#3b30b0">₹10 / bed / month</text>
  </g>
</svg>`;

await sharp(Buffer.from(og)).png().toFile(join(pub, "og-image.png"));

// ---- icons from favicon.svg ----
const favSvg = await readFile(join(pub, "favicon.svg"));
await sharp(favSvg).resize(180, 180).png().toFile(join(pub, "apple-touch-icon.png"));
// browsers accept PNG bytes served at the .ico path; sharp can't emit true ICO
await sharp(favSvg).resize(32, 32).png().toFile(join(pub, "favicon.ico"));

console.log("Generated og-image.png, apple-touch-icon.png, favicon.ico");
