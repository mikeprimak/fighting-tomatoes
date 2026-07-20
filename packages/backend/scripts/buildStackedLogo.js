/**
 * Builds a horizontal Good Fights lockup from the vertical "thicker" logo:
 * hand on the LEFT, "GOOD" / "FIGHTS" stacked on the RIGHT.
 *
 * Source `THICKER-GOOD-FIGHTS-LOGO-HAND-AND-WORD-TALLER.png` is yellow artwork
 * on a solid near-black background with no usable alpha, stacked hand-over-words.
 * So this:
 *   1. keys out the dark background (luminance -> alpha, un-premultiplied so the
 *      yellow keeps its saturation and edges stay anti-aliased),
 *   2. splits hand from wordmark at the gap between them,
 *   3. trims each to its own content box,
 *   4. recomposes them side by side on a transparent canvas.
 *
 * Usage: node scripts/buildStackedLogo.js
 * Writes: packages/web/public/brand/good-fights-stacked-horizontal.png
 */
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '../../../THICKER-GOOD-FIGHTS-LOGO-HAND-AND-WORD-TALLER.png');
const OUT = path.join(__dirname, '../../web/public/brand/good-fights-stacked-horizontal.png');

// Gap between the hand and the wordmark in the source (2294x2674).
const SPLIT_Y = 1470;
// Pixels dimmer than this are treated as background.
const FLOOR = 48;

/** Turn "bright artwork on a dark background" into "artwork on transparency". */
async function keyOutDarkBackground(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const o = i * info.channels;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const v = Math.max(r, g, b);
    const q = i * 4;
    if (v <= FLOOR) {
      out[q] = 0; out[q + 1] = 0; out[q + 2] = 0; out[q + 3] = 0;
      continue;
    }
    // Un-premultiply: push the colour back to full intensity, carry brightness
    // into the alpha channel so anti-aliased edges stay smooth.
    out[q] = Math.min(255, Math.round((r * 255) / v));
    out[q + 1] = Math.min(255, Math.round((g * 255) / v));
    out[q + 2] = Math.min(255, Math.round((b * 255) / v));
    out[q + 3] = v;
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function main() {
  const keyed = await keyOutDarkBackground(SRC);
  const meta = await sharp(keyed).metadata();
  console.log(`source keyed: ${meta.width}x${meta.height}`);

  // sharp will not chain extract() and trim() in one pipeline, so round-trip
  // through a buffer between the two.
  const handRaw = await sharp(keyed)
    .extract({ left: 0, top: 0, width: meta.width, height: SPLIT_Y })
    .png()
    .toBuffer();
  const hand = await sharp(handRaw).trim().png().toBuffer();

  const wordsRaw = await sharp(keyed)
    .extract({ left: 0, top: SPLIT_Y, width: meta.width, height: meta.height - SPLIT_Y })
    .png()
    .toBuffer();
  const words = await sharp(wordsRaw).trim().png().toBuffer();

  const hm = await sharp(hand).metadata();
  const wm = await sharp(words).metadata();
  console.log(`hand:  ${hm.width}x${hm.height}`);
  console.log(`words: ${wm.width}x${wm.height}`);

  // Match the hand's height to the stacked wordmark so the lockup reads as one
  // unit. Slightly taller than the words looks better than dead equal.
  const targetH = Math.round(wm.height * 1.06);
  const handW = Math.round((hm.width / hm.height) * targetH);
  const handScaled = await sharp(hand).resize({ width: handW, height: targetH }).toBuffer();

  const GAP = Math.round(targetH * 0.14);
  const canvasW = handW + GAP + wm.width;
  const canvasH = Math.max(targetH, wm.height);

  await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: handScaled, left: 0, top: Math.round((canvasH - targetH) / 2) },
      { input: words, left: handW + GAP, top: Math.round((canvasH - wm.height) / 2) },
    ])
    .png()
    .toFile(OUT);

  console.log(`\nwrote ${OUT} (${canvasW}x${canvasH})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
