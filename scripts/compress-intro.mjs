/**
 * Converts the intro stills from PNG to WebP.
 *
 * The intro art was 20.8 MB of lossless PNG, which is most of what a first-time
 * visitor downloads before the attract screen appears. WebP carries the same
 * pictures at a fraction of that.
 *
 * Two of the ten need lossless treatment. `03_alley_neon` and
 * `04_heroes_overlay` are overlays with soft alpha edges, and lossy WebP shifts
 * colour in the semi-transparent parts: measured on the neon burst, 11% of its
 * visible pixels moved by 30 or more out of 255, and raising quality barely
 * helped because the loss is in chroma subsampling rather than in the quality
 * setting. Lossless still beats PNG on both, just by less.
 *
 * The remaining eight are opaque and compress cleanly — mean error between 1.3
 * and 3.9 out of 255, which is below what the eye picks up on a moving intro.
 *
 * Usage:
 *   npm install --save-dev sharp
 *   node scripts/compress-intro.mjs
 *
 * Safe to re-run: it skips anything already converted.
 */
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const DIR = 'public/assets/intro';

/** Overlays whose soft alpha edges do not survive lossy compression. */
const LOSSLESS = new Set(['03_alley_neon.png', '04_heroes_overlay.png']);

const QUALITY = 88;

const mb = (bytes) => (bytes / 1048576).toFixed(2).padStart(6);

const files = (await readdir(DIR)).filter((f) => f.endsWith('.png')).sort();

if (files.length === 0) {
  console.log('Nothing to convert — no PNGs left in', DIR);
  process.exit(0);
}

let before = 0;
let after = 0;

console.log('  file                         before    after   mode');

for (const file of files) {
  const source = join(DIR, file);
  const target = source.replace(/\.png$/, '.webp');
  const lossless = LOSSLESS.has(file);

  const originalSize = (await stat(source)).size;

  await sharp(source)
    .webp(lossless ? { lossless: true, effort: 6 } : { quality: QUALITY, effort: 6 })
    .toFile(target);

  const newSize = (await stat(target)).size;
  await unlink(source);

  before += originalSize;
  after += newSize;

  console.log(
    `  ${file.padEnd(26)} ${mb(originalSize)}MB ${mb(newSize)}MB   ${
      lossless ? 'lossless (soft alpha)' : `q${QUALITY}`
    }`
  );
}

const saved = Math.round(100 - (100 * after) / before);
console.log(`\n  total: ${mb(before)}MB -> ${mb(after)}MB  (${saved}% smaller)`);
console.log('  Source PNGs removed. The paths in IntroSequence.tsx already point at .webp.');
