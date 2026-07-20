/**
 * Generates the Round Numbers #1 banner (hero + OG) for the letdowns article.
 *
 * Concept: the "tile wall" — one tile per individual fan rating of
 * McGregor vs Holloway 2, coloured with the app's own heatmap scale
 * (1 = grey, 7 = yellow, 8 = orange, 9-10 = red). A letdown renders as a
 * wall of dead grey with a single warm outlier. Reusable as the series
 * device: a great fight renders as a wall of fire.
 *
 * Data is REAL and verified against prod on 2026-07-20:
 *   54 ratings, 47 of them a 1, remainder 2,2,2,3,4,4,8. Mean 1.33.
 *
 * Usage: node scripts/generateLetdownsBanner.js
 * Writes: packages/web/public/blog/letdowns-2026-hero.png
 *         packages/web/public/blog/letdowns-2026-og.png
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Brand mark (hand + stylised wordmark), inlined so puppeteer needs no file access.
const LOGO_PATH = path.join(__dirname, '../../web/public/brand/good-fights-stacked-horizontal.png');
const LOGO_DATA_URI = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`;

// Verbatim fan review on this fight, verified against prod 2026-07-20.
// Real user account, not internal. Note: no trailing period in the original.
const QUOTE = 'At an absolute loss for words.';
const QUOTE_AUTHOR = 'Jake7911';

// When the ratings on this graphic were pulled from the live database.
const DATA_DATE = 'Fan ratings as of July 20, 2026';

// ---- the actual rating distribution (verified against prod) ----
const SCORES = [
  ...Array(47).fill(1),
  2, 2, 2,
  3,
  4, 4,
  8,
];

// ---- heatmap, mirrored from packages/web/src/utils/heatmap.ts ----
const colorStops = [
  { score: 1.0, r: 128, g: 128, b: 128 },
  { score: 5.0, r: 200, g: 185, b: 130 },
  { score: 7.0, r: 255, g: 207, b: 59 },
  { score: 7.5, r: 253, g: 183, b: 12 },
  { score: 8.0, r: 243, g: 134, b: 53 },
  { score: 8.5, r: 237, g: 94, b: 50 },
  { score: 9.0, r: 233, g: 52, b: 48 },
  { score: 10.0, r: 255, g: 0, b: 0 },
];

function heat(score) {
  if (score <= 1) return 'rgb(128, 128, 128)';
  if (score >= 10) return 'rgb(255, 0, 0)';
  let lo = colorStops[0];
  let hi = colorStops[colorStops.length - 1];
  for (let i = 0; i < colorStops.length - 1; i++) {
    if (score >= colorStops[i].score && score <= colorStops[i + 1].score) {
      lo = colorStops[i];
      hi = colorStops[i + 1];
      break;
    }
  }
  const t = (score - lo.score) / (hi.score - lo.score);
  const r = Math.round(lo.r + (hi.r - lo.r) * t);
  const g = Math.round(lo.g + (hi.g - lo.g) * t);
  const b = Math.round(lo.b + (hi.b - lo.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * The app always renders scores as white text with a dark shadow on top of the
 * heatmap colour, at every score. Mirrors RateFightModal.tsx:215
 * (`text-white [text-shadow:_0_2px_4px_rgb(0_0_0_/_70%)]`); the offset and blur
 * scale with type size so it reads the same at hero and OG dimensions.
 */
function textShadow(fontPx) {
  const dy = Math.max(1, Math.round(fontPx * 0.06));
  const blur = Math.max(2, Math.round(fontPx * 0.12));
  return `0 ${dy}px ${blur}px rgba(0, 0, 0, 0.7)`;
}

const LAYOUTS = {
  hero: { w: 1600, h: 900, cols: 9, tile: 100, ratio: 0.58, gap: 11, head: 76, sub: 33, eyebrow: 22, pad: 64, logo: 62, quote: 40, cite: 21 },
  og: { w: 1200, h: 630, cols: 9, tile: 74, ratio: 0.58, gap: 8, head: 52, sub: 24, eyebrow: 17, pad: 44, logo: 46, quote: 28, cite: 16 },
};

/** A score rendered as a heatmap chip, matching the tiles in the wall. */
function chip(score, L) {
  return `<span style="
    display:inline-flex;align-items:center;justify-content:center;
    background:${heat(score)};color:#fff;
    text-shadow:${textShadow(Math.round(L.sub * 0.95))};
    font-weight:800;font-size:${Math.round(L.sub * 0.95)}px;
    padding:${Math.round(L.sub * 0.1)}px ${Math.round(L.sub * 0.42)}px;
    border-radius:${Math.round(L.sub * 0.24)}px;
  ">${score.toFixed(1)}</span>`;
}

function buildHtml(L) {
  const tiles = SCORES.map((s) => {
    const size = L.tile;
    return `<div style="
      width:${size}px;height:${Math.round(size * L.ratio)}px;
      background:${heat(s)};
      border-radius:${Math.round(size * 0.09)}px;
      display:flex;align-items:center;justify-content:center;
      font-size:${Math.round(size * 0.34)}px;font-weight:800;
      color:#fff;
      text-shadow:${textShadow(Math.round(size * 0.34))};
      font-family:'Segoe UI',Arial,sans-serif;
    ">${s}</div>`;
  }).join('');

  const gridW = L.cols * L.tile + (L.cols - 1) * L.gap;

  // legend: continuous heatmap strip so the colour language is self-explanatory
  const legendStops = [];
  for (let i = 1; i <= 10; i += 0.25) legendStops.push(heat(i));
  const legendGradient = `linear-gradient(90deg, ${legendStops.join(', ')})`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:${L.w}px;height:${L.h}px;background:#0f0f0f;
      font-family:'Segoe UI',Arial,sans-serif;overflow:hidden;position:relative}
    .goldbar{position:absolute;top:0;left:0;right:0;height:6px;background:#F5C518}
    .wrap{padding:${L.pad}px;height:100%;display:flex;flex-direction:column}
  </style></head><body>
    <div class="goldbar"></div>
    <div class="wrap">

      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <img src="${LOGO_DATA_URI}" style="height:${L.logo}px;display:block;" />
        <div style="text-align:right;">
          <div style="font-size:${L.eyebrow}px;font-weight:800;letter-spacing:.09em;
            text-transform:uppercase;color:#F5C518;line-height:1.15;">Round Numbers</div>
          <div style="font-size:${L.eyebrow}px;font-weight:600;letter-spacing:.09em;
            text-transform:uppercase;color:#8b9096;line-height:1.15;
            margin-top:${Math.round(L.eyebrow * 0.28)}px;">Combat Sports Data Stories</div>
        </div>
      </div>

      <div style="margin-top:${Math.round(L.pad * 0.34)}px;">
        <div style="font-size:${L.head}px;font-weight:800;color:#fff;line-height:1.04;
          letter-spacing:-.02em;">
          47 of 54 fans scored it <span style="color:#9a9a9a;">1.</span>
        </div>
        <div style="font-size:${L.sub}px;color:#8b9096;margin-top:${Math.round(L.sub * 0.6)}px;
          display:flex;align-items:center;flex-wrap:wrap;gap:${Math.round(L.sub * 0.34)}px;">
          <span>McGregor vs Holloway 2 &middot; UFC 329</span>
          <span>hyped</span>${chip(9.5, L)}
          <span>rated</span>${chip(1.3, L)}
        </div>
      </div>

      <div style="flex:1;display:flex;align-items:center;justify-content:space-between;
        gap:${Math.round(L.pad * 0.7)}px;">
        <div style="display:grid;flex:none;
          grid-template-columns:repeat(${L.cols},${L.tile}px);
          gap:${L.gap}px;width:${gridW}px;">${tiles}</div>
        <div style="flex:1;border-left:3px solid #F5C518;padding-left:${Math.round(L.pad * 0.4)}px;">
          <div style="font-size:${L.quote}px;line-height:1.22;color:#fff;font-weight:600;
            letter-spacing:-.01em;">&ldquo;${QUOTE}&rdquo;</div>
          <div style="font-size:${L.cite}px;color:#8b9096;margin-top:${Math.round(L.cite * 0.8)}px;">
            ${QUOTE_AUTHOR} review on goodfights.app
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:flex-end;
        margin-top:${Math.round(L.pad * 0.3)}px;">
        <div>
          <div style="font-size:${Math.round(L.eyebrow * 0.9)}px;color:#8b9096;
            margin-bottom:9px;letter-spacing:.05em;">EVERY INDIVIDUAL FAN RATING</div>
          <div style="width:${Math.round(L.w * 0.36)}px;height:${Math.round(L.eyebrow * 1.15)}px;
            border-radius:4px;background:${legendGradient};"></div>
          <div style="display:flex;justify-content:space-between;
            width:${Math.round(L.w * 0.36)}px;font-size:${Math.round(L.eyebrow * 0.95)}px;
            font-weight:700;color:#8b9096;margin-top:7px;">
            <span>1</span><span>10</span>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:${Math.round(L.cite * 0.95)}px;color:#6d7176;
            margin-bottom:${Math.round(L.cite * 0.45)}px;">${DATA_DATE}</div>
          <div style="font-size:${Math.round(L.sub * 1.05)}px;font-weight:800;color:#F5C518;">
            goodfights.app
          </div>
        </div>
      </div>

    </div>
  </body></html>`;
}

async function main() {
  const outDir = path.join(__dirname, '../../web/public/blog');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  for (const [name, L] of Object.entries(LAYOUTS)) {
    const page = await browser.newPage();
    await page.setViewport({ width: L.w, height: L.h, deviceScaleFactor: 1 });
    await page.setContent(buildHtml(L), { waitUntil: 'networkidle0' });
    const out = path.join(outDir, `letdowns-2026-${name}.png`);
    await page.screenshot({ path: out, type: 'png' });
    console.log(`wrote ${out} (${L.w}x${L.h})`);
    await page.close();
  }

  await browser.close();
  console.log(`\ntiles: ${SCORES.length} | ones: ${SCORES.filter((s) => s === 1).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
