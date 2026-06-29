/**
 * Backfill banner images for legacy (null-scraper) numbered UFC events.
 *
 * BACKLOG §8 — "Missing UFC banner images on historic events". Of 835 legacy
 * events with no `bannerImage`, 237 are numbered UFC cards ("UFC 100", "UFC 217")
 * whose ufc.com event page is a deterministic slug (`ufc-<n>`) and still serves a
 * hero banner. This fetches that page (via curl to dodge ufc.com's JA3/TLS bot
 * block — Node TLS is fingerprinted, see lesson_ufc_com_ja3_blocking), extracts
 * the hero image the same way the daily scraper does (`.layout__region--content
 * picture` srcset, smallest option >= 900w), uploads it to R2, and sets
 * `Event.bannerImage`.
 *
 * Non-numbered UFC ("Fight Night ...", 86) + non-UFC legacy (Bellator/PRIDE/etc,
 * ~512) are NOT handled here — their slugs aren't deterministic and need a
 * different source. See the daily log for the breakdown.
 *
 * Usage (from packages/backend):
 *   npx tsx scripts/backfillLegacyUFCBanners.ts --dry-run            # no writes
 *   npx tsx scripts/backfillLegacyUFCBanners.ts --limit=10           # first 10
 *   npx tsx scripts/backfillLegacyUFCBanners.ts                      # full run
 *
 * Resumable: only touches events that still have bannerImage = null, so a
 * re-run after a partial/rate-limited pass just picks up where it left off.
 * ufc.com CDN rate-limits home IPs after a few hundred requests
 * (lesson_ufc_cdn_rate_limits_home_ip) — if 403s appear, stop and re-run later
 * or run from GH Actions.
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import * as cheerio from 'cheerio';
import { prisma } from '../src/lib/prisma';
import { uploadEventImage, getR2Status } from '../src/services/imageStorage';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const a = process.argv.find(x => x.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();
const DELAY_MS = (() => {
  const a = process.argv.find(x => x.startsWith('--delay='));
  return a ? parseInt(a.split('=')[1], 10) : 2500;
})();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** "UFC 217: Bisping vs St-Pierre" / "UFC 100" -> "ufc-217" / "ufc-100" */
function slugForNumberedUFC(name: string): string | null {
  const m = name.match(/^UFC\s+(\d+)\b/i);
  return m ? `ufc-${m[1]}` : null;
}

/** Fetch a ufc.com page via curl (Node TLS is JA3-blocked). Null on failure. */
function fetchPage(url: string): string | null {
  try {
    const html = execFileSync(
      'curl',
      ['-s', '-L', '--max-time', '30', '-A', UA, url],
      { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
    );
    return html && html.length > 500 ? html : null;
  } catch {
    return null;
  }
}

/**
 * Extract the event hero banner URL from the page HTML, mirroring the daily
 * scraper (scrapeAllUFCData.js): the first <picture> in `.layout__region--content`,
 * smallest srcset option that is >= 900w (falls back to <img src>).
 */
function extractBannerUrl(html: string): string | null {
  const $ = cheerio.load(html);
  const picture = $('.layout__region--content picture').first();
  if (!picture.length) return null;

  const options: { url: string; width: number }[] = [];
  picture.find('source').each((_, el) => {
    const srcset = $(el).attr('srcset');
    if (!srcset) return;
    const matches = srcset.match(/(\S+)\s+(\d+)w/g) || [];
    for (const match of matches) {
      const [url, widthStr] = match.split(/\s+/);
      const width = parseInt(widthStr.replace('w', ''), 10);
      if (width >= 900) options.push({ url, width });
    }
  });
  const imgSrc = picture.find('img').attr('src');
  if (imgSrc) options.push({ url: imgSrc, width: 9999 });

  if (!options.length) return null;
  options.sort((a, b) => a.width - b.width);
  let url = options[0].url;
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = 'https://www.ufc.com' + url;
  return url;
}

async function main() {
  if (!getR2Status().configured) {
    console.error('❌ R2 not configured — aborting to avoid writing fragile ufc.com hot-links.');
    console.error('   Set R2_ENDPOINT / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET and re-run.');
    process.exit(1);
  }

  const events = await prisma.event.findMany({
    where: { scraperType: null, bannerImage: null, name: { contains: 'UFC', mode: 'insensitive' } },
    select: { id: true, name: true, date: true },
    orderBy: { date: 'desc' },
  });
  const numbered = events.filter(e => slugForNumberedUFC(e.name || ''));
  const targets = numbered.slice(0, LIMIT === Infinity ? numbered.length : LIMIT);

  console.log(`Legacy UFC missing banner: ${events.length} | numbered: ${numbered.length} | processing: ${targets.length}${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  let ok = 0, noPage = 0, noImg = 0, failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const e = targets[i];
    const slug = slugForNumberedUFC(e.name || '')!;
    const url = `https://www.ufc.com/event/${slug}`;
    const tag = `[${i + 1}/${targets.length}] ${e.name} (${slug})`;

    const html = fetchPage(url);
    if (!html) { console.log(`  ⚠️  ${tag} — page fetch failed/404`); noPage++; await sleep(DELAY_MS); continue; }

    const bannerUrl = extractBannerUrl(html);
    if (!bannerUrl) { console.log(`  ⚠️  ${tag} — no banner on page`); noImg++; await sleep(DELAY_MS); continue; }

    if (DRY_RUN) { console.log(`  ✅ ${tag} → ${bannerUrl}`); ok++; await sleep(DELAY_MS); continue; }

    try {
      const r2Url = await uploadEventImage(bannerUrl, e.name || slug);
      if (!r2Url || !r2Url.includes('r2.dev')) throw new Error(`upload returned non-R2 url: ${r2Url}`);
      await prisma.event.update({ where: { id: e.id }, data: { bannerImage: r2Url } });
      console.log(`  ✅ ${tag} → ${r2Url}`);
      ok++;
    } catch (err: any) {
      console.log(`  ❌ ${tag} — ${err.message}`);
      failed++;
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nDone. ok=${ok} noPage=${noPage} noImg=${noImg} failed=${failed}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
