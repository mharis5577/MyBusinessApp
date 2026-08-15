/**
 * Generate Elite Chocolate Android launcher icons from brand artwork.
 * Does not touch the in-app web favicon / BrandMark.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resDir = path.join(__dirname, '../android/app/src/main/res');

/** Full square seal (legacy launcher / round) — burgundy fills the canvas */
const fullSealSvg = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#5C1A2E"/>
  <circle cx="32" cy="32" r="29" fill="none" stroke="#C9A96E" stroke-width="1.2"/>
  <circle cx="32" cy="32" r="26.6" fill="none" stroke="#C9A96E" stroke-width="0.5"/>
  <text x="32" y="30.5" text-anchor="middle" fill="#FFFFFF"
    font-family="Georgia, 'Times New Roman', Times, serif" font-style="italic"
    font-size="15.5" font-weight="500">elite</text>
  <line x1="22" y1="35" x2="42" y2="35" stroke="#C9A96E" stroke-width="0.7"
    stroke-linecap="round" opacity="0.85"/>
  <text x="32" y="43.5" text-anchor="middle" fill="#C9A96E"
    font-family="Georgia, 'Times New Roman', Times, serif"
    font-size="5" font-weight="600" letter-spacing="0.55">CHOCOLATE</text>
</svg>`;

/**
 * Adaptive foreground: full burgundy tile + wordmark in safe zone.
 * Background color is also #5C1A2E so mask shapes stay brand-colored.
 */
const adaptiveFgSvg = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 108 108">
  <rect width="108" height="108" fill="#5C1A2E"/>
  <g transform="translate(54 54)">
    <circle cx="0" cy="0" r="30" fill="none" stroke="#C9A96E" stroke-width="1.25"/>
    <circle cx="0" cy="0" r="27.5" fill="none" stroke="#C9A96E" stroke-width="0.55"/>
    <text x="0" y="-1.5" text-anchor="middle" fill="#FFFFFF"
      font-family="Georgia, 'Times New Roman', Times, serif" font-style="italic"
      font-size="16" font-weight="500">elite</text>
    <line x1="-10" y1="3" x2="10" y2="3" stroke="#C9A96E" stroke-width="0.75"
      stroke-linecap="round" opacity="0.85"/>
    <text x="0" y="12" text-anchor="middle" fill="#C9A96E"
      font-family="Georgia, 'Times New Roman', Times, serif"
      font-size="5.2" font-weight="600" letter-spacing="0.55">CHOCOLATE</text>
  </g>
</svg>`;

const densities = [
  { folder: 'mipmap-mdpi', launcher: 48, foreground: 108 },
  { folder: 'mipmap-hdpi', launcher: 72, foreground: 162 },
  { folder: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
  { folder: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
  { folder: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
];

async function writePng(filePath, svg) {
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(filePath, buf);
  console.log('wrote', path.relative(resDir, filePath));
}

async function main() {
  for (const d of densities) {
    const dir = path.join(resDir, d.folder);
    fs.mkdirSync(dir, { recursive: true });
    await writePng(path.join(dir, 'ic_launcher.png'), fullSealSvg(d.launcher));
    await writePng(path.join(dir, 'ic_launcher_round.png'), fullSealSvg(d.launcher));
    await writePng(path.join(dir, 'ic_launcher_foreground.png'), adaptiveFgSvg(d.foreground));
  }

  // Keep adaptive XML on color bg + mipmap foreground (already correct).
  // Refresh drawable vector fallback to solid seal (no Capacitor art).
  const drawableFg = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#5C1A2E"
        android:pathData="M54,21 A33,33 0 1,1 53.99,21 Z" />
    <path
        android:pathData="M54,24 A30,30 0 1,1 53.99,24 Z"
        android:strokeWidth="1.25"
        android:strokeColor="#C9A96E"
        android:fillColor="#00000000" />
    <path
        android:pathData="M54,26.5 A27.5,27.5 0 1,1 53.99,26.5 Z"
        android:strokeWidth="0.55"
        android:strokeColor="#C9A96E"
        android:fillColor="#00000000" />
    <!-- Italic-style monogram "e" (readable at small sizes; PNG overlays use full wordmark) -->
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M45.8,50.2c0.45,-7.4 4.6,-12.2 11.5,-12.2c2.6,0 4.8,0.75 6.3,2.05l-1.85,2.85c-1.1,-0.85 -2.6,-1.4 -4.35,-1.4c-4.55,0 -7.15,3.15 -7.5,7.85h12.8c0.1,0.65 0.15,1.3 0.15,1.95c0,7.7 -4.25,12.5 -11.4,12.5c-7.05,0 -11.5,-5.2 -11.5,-13.55c0,-0.35 0,-0.7 0.05,-1.05h4.8zM57.3,52.7H49.4c0.45,4.15 2.65,6.65 6,6.65c3.55,0 5.65,-2.4 5.65,-6.05c0,-0.2 0,-0.35 0,-0.6z" />
    <path
        android:pathData="M44,56.5 L64,56.5"
        android:strokeWidth="0.75"
        android:strokeColor="#C9A96E"
        android:strokeLineCap="round"
        android:fillColor="#00000000" />
</vector>
`;
  fs.writeFileSync(
    path.join(resDir, 'drawable-v24', 'ic_launcher_foreground.xml'),
    drawableFg
  );

  // Solid burgundy bg drawable (drop Capacitor grid)
  fs.writeFileSync(
    path.join(resDir, 'drawable', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#5C1A2E" />
</shape>
`
  );

  console.log('Done — Android launcher icons updated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
