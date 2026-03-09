/**
 * Tapology Live Tracker - Standalone Script for GitHub Actions
 *
 * Runs ONE iteration of live tracking for events using the Tapology scraper.
 * Designed to be called every 5 minutes by GitHub Actions.
 *
 * Supports Zuffa Boxing and any other promotion tracked via Tapology.
 *
 * Event URL discovery:
 *   1. If event has ufcUrl set → use that as Tapology URL
 *   2. If TAPOLOGY_URL env var is set → use that
 *   3. Otherwise → discover from Zuffa Boxing promotions hub page
 *
 * Usage:
 *   node dist/scripts/runTapologyLiveTracker.js [eventId]
 *
 * Environment:
 *   DATABASE_URL    - Required
 *   EVENT_ID        - Optional: specific event to track
 *   TAPOLOGY_URL    - Optional: direct Tapology event URL
 *
 * Exit codes:
 *   0 = Success (or no active event to track)
 *   1 = Error
 */

import { PrismaClient } from '@prisma/client';
import { TapologyLiveScraper } from '../services/tapologyLiveScraper';
import { parseTapologyData } from '../services/tapologyLiveParser';

const prisma = new PrismaClient();

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

const TAPOLOGY_PROMOTION_URL = 'https://www.tapology.com/fightcenter/promotions/6299-zuffa-boxing-zb';
const TAPOLOGY_BASE_URL = 'https://www.tapology.com';

/**
 * Find an active Tapology event that should be tracked.
 * Active = started within last 12 hours OR starting within 6 hours, not complete.
 */
async function findActiveTapologyEvent(overrideEventId?: string) {
  if (overrideEventId) {
    const event = await prisma.event.findUnique({
      where: { id: overrideEventId },
    });

    if (!event) {
      console.log(`[TAPOLOGY LIVE] Override event not found: ${overrideEventId}`);
      return null;
    }

    console.log(`[TAPOLOGY LIVE] Using override event: ${event.name}`);
    return event;
  }

  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - TWELVE_HOURS_MS);
  const sixHoursFromNow = new Date(now.getTime() + SIX_HOURS_MS);

  // Find tapology events that are LIVE or recently started
  const event = await prisma.event.findFirst({
    where: {
      scraperType: 'tapology',
      eventStatus: { in: ['LIVE', 'UPCOMING'] },
      date: { gte: twelveHoursAgo, lte: sixHoursFromNow },
    },
    orderBy: { date: 'asc' },
  });

  return event;
}

/**
 * Get the Tapology event URL for an event.
 *
 * Priority:
 *   1. TAPOLOGY_URL env var
 *   2. Event's ufcUrl field (repurposed for external URLs)
 *   3. Auto-discover from Zuffa Boxing promotions hub page
 */
async function getTapologyUrl(event: any): Promise<string | null> {
  // 1. Environment override
  const envUrl = process.env.TAPOLOGY_URL;
  if (envUrl) {
    console.log(`[TAPOLOGY LIVE] Using TAPOLOGY_URL env var: ${envUrl}`);
    return envUrl;
  }

  // 2. Stored on the event
  if (event.ufcUrl && event.ufcUrl.includes('tapology.com')) {
    console.log(`[TAPOLOGY LIVE] Using stored URL: ${event.ufcUrl}`);
    return event.ufcUrl;
  }

  // 3. Auto-discover from promotions hub
  console.log(`[TAPOLOGY LIVE] No URL stored, discovering from promotions hub...`);
  return discoverTapologyUrl(event);
}

/**
 * Discover the Tapology event URL by scraping the Zuffa Boxing promotions page
 * and matching against the event name/date.
 */
async function discoverTapologyUrl(event: any): Promise<string | null> {
  try {
    const response = await fetch(TAPOLOGY_PROMOTION_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      console.error(`[TAPOLOGY LIVE] Hub page fetch failed: HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Use cheerio to parse the promotions page
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    // Find all event links
    const eventLinks: { name: string; url: string }[] = [];
    $('a[href*="/fightcenter/events/"]').each((_, el) => {
      const href = $(el).attr('href');
      const name = $(el).text().trim();
      if (!href || !name || name.length < 3) return;
      // Only Zuffa Boxing events
      if (!href.toLowerCase().includes('zuffa')) return;

      const fullUrl = href.startsWith('http') ? href : `${TAPOLOGY_BASE_URL}${href}`;
      eventLinks.push({ name, url: fullUrl });
    });

    console.log(`[TAPOLOGY LIVE] Found ${eventLinks.length} Zuffa Boxing events on hub page`);

    if (eventLinks.length === 0) return null;

    // Try to match by event name
    const eventNameLower = event.name.toLowerCase();
    for (const link of eventLinks) {
      const linkNameLower = link.name.toLowerCase();
      // Check if names overlap significantly
      if (eventNameLower.includes(linkNameLower) || linkNameLower.includes(eventNameLower)) {
        console.log(`[TAPOLOGY LIVE] Matched by name: "${link.name}" → ${link.url}`);
        // Store the URL on the event for future lookups
        await prisma.event.update({
          where: { id: event.id },
          data: { ufcUrl: link.url },
        });
        return link.url;
      }
    }

    // Try matching by URL slug keywords from event name
    const eventWords = event.name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w: string) => w.length > 2);

    for (const link of eventLinks) {
      const urlLower = link.url.toLowerCase();
      const matchCount = eventWords.filter((w: string) => urlLower.includes(w)).length;
      if (matchCount >= 2) {
        console.log(`[TAPOLOGY LIVE] Matched by keywords (${matchCount}): "${link.name}" → ${link.url}`);
        await prisma.event.update({
          where: { id: event.id },
          data: { ufcUrl: link.url },
        });
        return link.url;
      }
    }

    // Last resort: if only one event found on the hub, use that
    if (eventLinks.length === 1) {
      console.log(`[TAPOLOGY LIVE] Only one event on hub, using: ${eventLinks[0].url}`);
      await prisma.event.update({
        where: { id: event.id },
        data: { ufcUrl: eventLinks[0].url },
      });
      return eventLinks[0].url;
    }

    console.log(`[TAPOLOGY LIVE] Could not auto-match event. Available events:`);
    eventLinks.forEach(l => console.log(`  - ${l.name}: ${l.url}`));
    return null;

  } catch (error: any) {
    console.error(`[TAPOLOGY LIVE] Discovery error: ${error.message}`);
    return null;
  }
}

/**
 * Check if all fights for an event are complete and auto-complete the event.
 */
async function autoCompleteTapologyEvent(eventId: string): Promise<boolean> {
  const fights = await prisma.fight.findMany({
    where: { eventId },
    select: { fightStatus: true, trackerFightStatus: true },
  });

  if (fights.length === 0) return false;

  // Check if all fights are complete (either published or in shadow fields)
  const allComplete = fights.every(
    f => f.fightStatus === 'COMPLETED' || f.fightStatus === 'CANCELLED' ||
         f.trackerFightStatus === 'COMPLETED' || f.trackerFightStatus === 'CANCELLED'
  );

  if (allComplete) {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        eventStatus: 'COMPLETED',
        completionMethod: 'tapology-tracker-auto',
      },
    });
    return true;
  }

  return false;
}

async function runTapologyLiveTracker(): Promise<void> {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('[TAPOLOGY LIVE] GitHub Actions Live Tracker');
  console.log(`[TAPOLOGY LIVE] Started at: ${new Date().toISOString()}`);
  console.log('========================================\n');

  try {
    const overrideEventId = process.env.EVENT_ID || process.argv[2];

    const event = await findActiveTapologyEvent(overrideEventId);

    if (!event) {
      console.log('[TAPOLOGY LIVE] No active Tapology event found. Nothing to track.');
      console.log('[TAPOLOGY LIVE] Exiting successfully (no work to do).\n');
      return;
    }

    console.log(`[TAPOLOGY LIVE] Found active event: ${event.name}`);
    console.log(`[TAPOLOGY LIVE] Event ID: ${event.id}`);
    console.log(`[TAPOLOGY LIVE] Event status: ${event.eventStatus}`);
    console.log(`[TAPOLOGY LIVE] Event date: ${event.date}\n`);

    // Discover the Tapology URL
    const tapologyUrl = await getTapologyUrl(event);

    if (!tapologyUrl) {
      console.error('[TAPOLOGY LIVE] Could not determine Tapology URL for event.');
      console.error('[TAPOLOGY LIVE] Set TAPOLOGY_URL env var or store URL in event.ufcUrl.');
      throw new Error('No Tapology URL available');
    }

    console.log(`[TAPOLOGY LIVE] Scraping: ${tapologyUrl}\n`);

    // Scrape the event page
    const scraper = new TapologyLiveScraper(tapologyUrl);
    const scrapedData = await scraper.scrape();

    console.log(`\n[TAPOLOGY LIVE] Scraped ${scrapedData.fights.length} fights`);
    console.log(`[TAPOLOGY LIVE] Event status from page: ${scrapedData.status}\n`);

    // Parse and update database
    const result = await parseTapologyData(event.id, scrapedData);

    console.log(`[TAPOLOGY LIVE] Parse results:`);
    console.log(`  Fights matched: ${result.fightsMatched}`);
    console.log(`  Fights updated: ${result.fightsUpdated}`);
    if (result.fightsNotFound.length > 0) {
      console.log(`  Not found: ${result.fightsNotFound.join(', ')}`);
    }

    // Check if event should be auto-completed
    const completed = await autoCompleteTapologyEvent(event.id);
    if (completed) {
      console.log('[TAPOLOGY LIVE] Event auto-completed (all fights done)');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[TAPOLOGY LIVE] Completed successfully in ${elapsed}s\n`);

  } catch (error: any) {
    console.error('\n[TAPOLOGY LIVE] ERROR:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runTapologyLiveTracker()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[TAPOLOGY LIVE] Fatal error:', error.message);
    process.exit(1);
  });
