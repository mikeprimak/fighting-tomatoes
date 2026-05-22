/**
 * Backfill RIZIN event banner images from Tapology poster_images.
 *
 * Past RIZIN events currently use the Sherdog-scraped image (often low
 * quality, sometimes wrong) or fall back to the RIZIN logo placeholder.
 * Tapology hosts proper event posters at images.tapology.com/poster_images/<id>/.
 *
 * Strategy:
 *   1. Pull all COMPLETED RIZIN events from the DB.
 *   2. Scrape the Tapology RIZIN hub for past event URLs.
 *   3. For each Tapology event, fetch og:image (the poster).
 *   4. Match Tapology events to DB events by date (and fuzzy name as tiebreak).
 *   5. Upload poster to R2 via uploadEventImage(), update Event.bannerImage.
 *
 * Upcoming events keep the RIZIN logo placeholder (Tapology rarely posts
 * posters ahead of time anyway).
 *
 * Usage:
 *   node dist/scripts/backfillRizinEventBanners.js           # dry-run
 *   node dist/scripts/backfillRizinEventBanners.js --apply   # write changes
 *   node dist/scripts/backfillRizinEventBanners.js --apply --limit 5
 */

import { PrismaClient } from '@prisma/client';
import puppeteer, { Browser } from 'puppeteer';
import { uploadEventImage } from '../services/imageStorage';

const prisma = new PrismaClient();

const TAPOLOGY_RIZIN_HUB =
  'https://www.tapology.com/fightcenter/promotions/1561-rizin-fighting-federation-rff';
const TAPOLOGY_BASE_URL = 'https://www.tapology.com';

const MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

interface TapologyEvent {
  eventName: string;
  eventUrl: string;
  eventDate: Date | null;
}

function parseTapologyDate(s: string): Date | null {
  if (!s) return null;
  const clean = s.replace(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*/i, '');
  const m = clean.match(/(\w+)\s+(\d{1,2})(?:,?\s+(\d{4}))?/i);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;
  const day = parseInt(m[2], 10);
  const year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
  return new Date(Date.UTC(year, month, day));
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function scrapeRizinHub(browser: Browser): Promise<TapologyEvent[]> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(TAPOLOGY_RIZIN_HUB, { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForSelector('a[href*="/fightcenter/events/"]', { timeout: 15000 });

    const events = await page.evaluate(() => {
      const out: { eventUrl: string; eventName: string; dateText: string }[] = [];
      const seen = new Set<string>();
      const links = document.querySelectorAll('a[href*="/fightcenter/events/"]');
      links.forEach((link) => {
        const a = link as HTMLAnchorElement;
        const eventUrl = a.href;
        const eventName = a.textContent?.trim() || '';
        if (!eventUrl || eventName.length < 3) return;
        // Only keep RIZIN events; the sidebar lists other promotions too.
        const lower = eventUrl.toLowerCase();
        const nameLower = eventName.toLowerCase();
        if (!lower.includes('rizin') && !nameLower.includes('rizin')) return;
        if (seen.has(eventUrl)) return;
        seen.add(eventUrl);
        const container = a.closest('div, li, section, tr') || a.parentElement;
        const text = container?.textContent || '';
        const dm = text.match(/((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?/i);
        const dateText = dm ? dm[0].trim() : '';
        out.push({ eventUrl, eventName, dateText });
      });
      return out;
    });

    return events.map((e) => ({
      eventUrl: e.eventUrl.startsWith('http') ? e.eventUrl : `${TAPOLOGY_BASE_URL}${e.eventUrl}`,
      eventName: e.eventName,
      eventDate: parseTapologyDate(e.dateText),
    }));
  } finally {
    await page.close();
  }
}

async function scrapeEventPoster(browser: Browser, eventUrl: string): Promise<string | null> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const data = await page.evaluate(() => {
      const out: { posterUrl: string | null; dateText: string } = { posterUrl: null, dateText: '' };
      const og = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
      if (og?.content && og.content.includes('poster_images')) out.posterUrl = og.content;
      if (!out.posterUrl) {
        const idMatch = location.pathname.match(/\/events\/(\d+)-/);
        const eventId = idMatch ? idMatch[1] : null;
        if (eventId) {
          const img = document.querySelector(`img[src*="poster_images/${eventId}/"]`) as HTMLImageElement | null;
          if (img?.src) out.posterUrl = img.src;
        }
      }
      const body = document.body?.innerText || '';
      const dm = body.match(/((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);
      out.dateText = dm ? dm[0].trim() : '';
      return out;
    });
    return data.posterUrl;
  } catch (err) {
    console.warn(`  ⚠ Poster scrape failed for ${eventUrl}: ${(err as Error).message}`);
    return null;
  } finally {
    await page.close();
  }
}

function nameTokensOverlap(a: string, b: string): number {
  const aTokens = new Set(normalize(a).split(' ').filter((t) => t.length >= 3));
  const bTokens = new Set(normalize(b).split(' ').filter((t) => t.length >= 3));
  let n = 0;
  for (const t of aTokens) if (bTokens.has(t)) n++;
  return n;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1] || '0', 10) : 0;

  console.log(`RIZIN event banner backfill ${apply ? '(APPLY)' : '(dry-run)'}\n`);

  const dbEvents = await prisma.event.findMany({
    where: { promotion: 'RIZIN', eventStatus: 'COMPLETED' },
    select: { id: true, name: true, date: true, bannerImage: true },
    orderBy: { date: 'desc' },
    ...(limit > 0 ? { take: limit } : {}),
  });
  console.log(`Found ${dbEvents.length} completed RIZIN events in DB.`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    console.log(`\nScraping Tapology RIZIN hub...`);
    const hubEvents = await scrapeRizinHub(browser);
    console.log(`Found ${hubEvents.length} Tapology RIZIN events.`);

    // For each DB event, find the best Tapology match by same-day date + name overlap.
    let updated = 0;
    let skippedAlreadyTapology = 0;
    let skippedNoMatch = 0;
    let skippedNoPoster = 0;

    for (const dbEvent of dbEvents) {
      if (!dbEvent.date) {
        skippedNoMatch++;
        continue;
      }
      // Skip if banner already points to a Tapology poster.
      if (dbEvent.bannerImage?.includes('poster_images')) {
        skippedAlreadyTapology++;
        continue;
      }

      // Candidate matches: Tapology events with same calendar day.
      const candidates = hubEvents.filter(
        (h) => h.eventDate && sameDay(h.eventDate, dbEvent.date as Date),
      );
      if (candidates.length === 0) {
        skippedNoMatch++;
        console.log(`  ✗ No Tapology match: ${dbEvent.name} (${dbEvent.date.toISOString().slice(0, 10)})`);
        continue;
      }
      // Pick the candidate with the highest name overlap (defaults to first).
      const best = candidates
        .map((c) => ({ c, score: nameTokensOverlap(dbEvent.name, c.eventName) }))
        .sort((a, b) => b.score - a.score)[0].c;

      const posterUrl = await scrapeEventPoster(browser, best.eventUrl);
      if (!posterUrl) {
        skippedNoPoster++;
        console.log(`  ✗ No poster on Tapology page: ${dbEvent.name}`);
        continue;
      }

      console.log(`  → ${dbEvent.name} (${dbEvent.date.toISOString().slice(0, 10)}) — ${posterUrl}`);
      if (!apply) {
        updated++;
        continue;
      }

      try {
        const r2Url = await uploadEventImage(posterUrl, dbEvent.name);
        await prisma.event.update({
          where: { id: dbEvent.id },
          data: { bannerImage: r2Url || posterUrl },
        });
        updated++;
      } catch (err) {
        console.warn(`    ⚠ Upload failed: ${(err as Error).message}`);
      }
    }

    console.log(`\nDone.`);
    console.log(`  ${apply ? 'Updated' : 'Would update'}: ${updated}`);
    console.log(`  Already Tapology: ${skippedAlreadyTapology}`);
    console.log(`  No Tapology match: ${skippedNoMatch}`);
    console.log(`  Match had no poster: ${skippedNoPoster}`);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
