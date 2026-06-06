/**
 * ONE FC Live Tracker - Standalone Script for GitHub Actions
 *
 * Runs ONE iteration of live tracking for ONE FC events.
 * Uses the Puppeteer scraper directly (same process), then
 * passes the result to the parser to update the database.
 *
 * Usage:
 *   node dist/scripts/runOneFCLiveTracker.js [eventId]
 *
 * Environment:
 *   DATABASE_URL - Required
 *   EVENT_ID - Optional override (also accepts CLI arg)
 *   ONEFC_EVENT_URL - Optional override for ONE FC event page URL
 *
 * Exit codes:
 *   0 = Success (or no active event to track)
 *   1 = Error
 */

import { prisma } from '../lib/prisma';
import OneFCLiveScraper from '../services/oneFCLiveScraper';
import { parseOneFCLiveData, autoCompleteOneFCEvent } from '../services/oneFCLiveParser';


const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Find an active ONE FC event to track.
 */
async function findActiveOneFCEvent(overrideEventId?: string) {
  if (overrideEventId) {
    const event = await prisma.event.findUnique({ where: { id: overrideEventId } });
    if (!event) {
      console.log(`[ONE FC LIVE] Override event not found: ${overrideEventId}`);
      return null;
    }
    console.log(`[ONE FC LIVE] Using override event: ${event.name}`);
    return event;
  }

  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - TWELVE_HOURS_MS);
  const sixHoursFromNow = new Date(now.getTime() + SIX_HOURS_MS);

  const event = await prisma.event.findFirst({
    where: {
      scraperType: 'onefc',
      eventStatus: { not: 'COMPLETED' },
      OR: [
        { date: { gte: twelveHoursAgo, lte: sixHoursFromNow } },
        { mainStartTime: { gte: twelveHoursAgo, lte: sixHoursFromNow } },
      ],
    },
    orderBy: { date: 'asc' },
  });

  return event;
}

async function runOneFCLiveTracker(): Promise<void> {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('[ONE FC LIVE] GitHub Actions Live Tracker');
  console.log(`[ONE FC LIVE] Started at: ${new Date().toISOString()}`);
  console.log('========================================\n');

  let scraper: OneFCLiveScraper | null = null;

  try {
    const overrideEventId = process.env.EVENT_ID || process.argv[2];
    const event = await findActiveOneFCEvent(overrideEventId);

    if (!event) {
      console.log('[ONE FC LIVE] No active ONE FC event found. Nothing to track.');
      return;
    }

    console.log(`[ONE FC LIVE] Event: ${event.name}`);
    console.log(`[ONE FC LIVE] ID: ${event.id}`);
    console.log(`[ONE FC LIVE] Status: ${event.eventStatus}`);
    console.log(`[ONE FC LIVE] Date: ${event.date}\n`);

    // Get ONE FC event page URL
    const eventUrl = process.env.ONEFC_EVENT_URL || event.ufcUrl;
    if (!eventUrl) {
      throw new Error('No ONE FC event URL. Set ONEFC_EVENT_URL or ensure event has ufcUrl.');
    }

    console.log(`[ONE FC LIVE] URL: ${eventUrl}\n`);

    // Run Puppeteer scraper directly (same process)
    scraper = new OneFCLiveScraper(eventUrl);
    const scrapedData = await scraper.scrape();

    console.log(`\n[ONE FC LIVE] Scraped ${scrapedData.fights.length} fights`);
    console.log(`[ONE FC LIVE] Event status: ${scrapedData.status}\n`);

    // Parse and update database
    const result = await parseOneFCLiveData(scrapedData, event.id);

    console.log(`[ONE FC LIVE] Results:`);
    console.log(`  Fights updated: ${result.fightsUpdated}`);
    console.log(`  Event updated: ${result.eventUpdated}`);
    console.log(`  Cancelled: ${result.cancelledCount}`);
    console.log(`  Un-cancelled: ${result.unCancelledCount}`);

    // Auto-complete check
    const completed = await autoCompleteOneFCEvent(event.id);
    if (completed) {
      console.log('[ONE FC LIVE] Event auto-completed (all fights done)');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[ONE FC LIVE] Done in ${elapsed}s\n`);

  } catch (error: any) {
    console.error('\n[ONE FC LIVE] ERROR:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    // Close Puppeteer browser
    if (scraper) {
      await scraper.stop();
    }
    await prisma.$disconnect();
  }
}

runOneFCLiveTracker()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[ONE FC LIVE] Fatal:', error.message);
    process.exit(1);
  });
