/**
 * Generates the Round Numbers #1 banner (hero + OG) for the letdowns article.
 *
 * Concept: two "tile walls" — before and after. One tile per individual
 * pre-fight hype vote (left) and per post-fight fan rating (right) on
 * McGregor vs Holloway 2, coloured with the app's own heatmap scale
 * (1 = grey, 7 = yellow, 8 = orange, 9-10 = red). The hype wall renders as
 * fire with one grey outlier; the rating wall as dead grey with one warm
 * outlier. Reusable as the series device.
 *
 * Data is REAL and verified against prod on 2026-07-20:
 *   Hype: 33 pre-fight votes (post-start votes and internal accounts
 *   excluded, same filters as hype-vs-reality.ts): twenty-three 10s,
 *   six 9s, three 8s, one 4. Mean 9.45.
 *   Ratings: 54, 47 of them a 1, remainder 2,2,2,3,4,4,8. Mean 1.33.
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

// Fighter head cutouts, both US-government photos usable without credit —
// provenance, licensing notes and the rembg pipeline live in
// scripts/cropLetdownsFaces.py.
const faceUri = (name) =>
  `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'banner-assets', `${name}-head.png`)).toString('base64')}`;
const CONOR_URI = faceUri('conor');
const MAX_URI = faceUri('max');

// When the votes and ratings on this graphic were pulled from the live database.
const DATA_DATE = 'Fan hype and ratings as of July 20, 2026';

// ---- the actual distributions (verified against prod) ----
// Hype descending so the red mass leads and the lone 4 lands bottom-right,
// mirroring the rating wall's lone 8.
const HYPES = [
  ...Array(23).fill(10),
  9, 9, 9, 9, 9, 9,
  8, 8, 8,
  4,
];
const SCORES = [
  ...Array(47).fill(1),
  2, 2, 2,
  3,
  4, 4,
  8,
];
const HYPE_AVG = 9.5; // 9.45 rounded, matches the article
const RATING_AVG = 1.3;

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
  hero: { w: 1600, h: 900, ratingCols: 9, hypeCols: 6, tile: 84, ratio: 0.58, gap: 9, head: 72, sub: 31, eyebrow: 22, wallWord: 42, wallLabel: 21, pad: 60, logo: 60, quote: 26, cite: 18, face: 150, faceTop: 158, faceRight: 132 },
  og: { w: 1200, h: 630, ratingCols: 9, hypeCols: 6, tile: 57, ratio: 0.58, gap: 6, head: 47, sub: 21, eyebrow: 16, wallWord: 27, wallLabel: 15, pad: 40, logo: 42, quote: 18, cite: 13, face: 92, faceTop: 108, faceRight: 88 },
};

// The app's own iconography: flame = hype, star = rating (lucide-react
// v1.7.0 paths, exactly what packages/web renders). Stroke-gold, app style.
const ICON_PATHS = {
  flame: 'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4',
  star: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
};

function icon(name, sizePx) {
  return `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 24 24" fill="none"
    stroke="#F5C518" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    style="flex:none;"><path d="${ICON_PATHS[name]}"/></svg>`;
}

/** One tile wall: big gold word + icon, a plain-language subline, the grid. */
function wall(scores, cols, iconName, word, subline, L) {
  const tiles = scores.map((s) => {
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

  const gridW = cols * L.tile + (cols - 1) * L.gap;

  return `<div style="width:${gridW}px;flex:none;">
    <div style="display:flex;align-items:center;gap:${Math.round(L.wallWord * 0.28)}px;
      margin-top:${Math.round(L.wallWord * 0.35)}px;">
      ${icon(iconName, Math.round(L.wallWord * 0.92))}
      <span style="font-size:${L.wallWord}px;font-weight:800;letter-spacing:.05em;
        text-transform:uppercase;color:#F5C518;line-height:1;">${word}</span>
    </div>
    <div style="font-size:${L.wallLabel}px;color:#8b9096;
      margin-top:${Math.round(L.wallLabel * 0.5)}px;">${subline}</div>
    <div style="display:grid;margin-top:${Math.round(L.wallLabel * 0.7)}px;
      grid-template-columns:repeat(${cols},${L.tile}px);
      gap:${L.gap}px;">${tiles}</div>
  </div>`;
}

function buildHtml(L) {
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

    <!-- fighter head cutouts in the open space top-right, under the series mark -->
    <div style="position:absolute;top:${L.faceTop}px;right:${L.faceRight}px;
      display:flex;align-items:flex-end;z-index:2;">
      <img src="${CONOR_URI}" style="height:${L.face}px;position:relative;z-index:2;
        top:${Math.round(L.face * 0.07)}px;
        filter:drop-shadow(0 ${Math.round(L.face * 0.03)}px ${Math.round(L.face * 0.08)}px rgba(0,0,0,.6));" />
      <img src="${MAX_URI}" style="height:${L.face}px;position:relative;z-index:1;
        margin-left:-${Math.round(L.face * 0.1)}px;
        filter:drop-shadow(0 ${Math.round(L.face * 0.03)}px ${Math.round(L.face * 0.08)}px rgba(0,0,0,.6));" />
    </div>

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

      <div style="margin-top:${Math.round(L.pad * 0.3)}px;">
        <div style="font-size:${L.sub}px;font-weight:600;letter-spacing:.06em;
          text-transform:uppercase;color:#8b9096;">
          The Disappointment of McGregor vs Holloway 2 &middot; UFC 329
        </div>
        <div style="font-size:${L.head}px;font-weight:800;color:#fff;line-height:1.04;
          letter-spacing:-.02em;margin-top:${Math.round(L.sub * 0.4)}px;">
          47 of 54 fans rated it a <span style="color:#9a9a9a;">1</span>
        </div>
        <div style="font-size:${L.sub}px;color:#8b9096;
          margin-top:${Math.round(L.sub * 0.45)}px;">
          The biggest letdown of 2026
        </div>
      </div>

      <div style="flex:1;display:flex;align-items:center;justify-content:space-between;
        gap:${Math.round(L.pad * 0.5)}px;">
        ${wall(HYPES, L.hypeCols, 'flame', 'Hype', 'Most fans were 10/10 hyped for this fight.', L)}
        <div style="font-size:${Math.round(L.head * 0.75)}px;color:#8b9096;flex:none;
          padding-top:${Math.round(L.wallLabel * 3)}px;">&#8594;</div>
        ${wall(SCORES, L.ratingCols, 'star', 'Rating', 'But ended up disappointed and rated it a 1.', L)}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:flex-end;
        margin-top:${Math.round(L.pad * 0.3)}px;gap:${Math.round(L.pad * 0.5)}px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:${Math.round(L.eyebrow * 0.8)}px;color:#8b9096;
            margin-bottom:9px;letter-spacing:.05em;text-align:center;
            width:100%;">EVERY TILE IS ONE FAN'S SCORE</div>
          <div style="width:100%;height:${Math.round(L.eyebrow * 1.15)}px;
            border-radius:4px;background:${legendGradient};"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;
            width:100%;font-size:${Math.round(L.eyebrow * 0.95)}px;
            font-weight:700;color:#8b9096;margin-top:7px;">
            <span>1</span>
            <span style="font-size:${Math.round(L.eyebrow * 0.8)}px;font-weight:600;
              color:#6d7176;letter-spacing:.05em;">A HEATMAP OF FIGHT FAN SENTIMENT.</span>
            <span>10</span>
          </div>
        </div>
        <div style="text-align:right;flex:none;">
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
  console.log(
    `\nhype tiles: ${HYPES.length} (tens: ${HYPES.filter((s) => s === 10).length}) | ` +
    `rating tiles: ${SCORES.length} (ones: ${SCORES.filter((s) => s === 1).length})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
