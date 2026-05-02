/**
 * PFL Live Tracker - Standalone Script for GitHub Actions
 *
 * Runs ONE iteration of live tracking for a PFL event using pflmma.com.
 * Designed to be invoked every 5 minutes from .github/workflows/pfl-live-tracker.yml
 * (dispatched by eventLifecycle.ts when a PFL event flips to LIVE).
 *
 * Usage:
 *   node dist/scripts/runPFLLiveTracker.js [eventId]
 *
 * Environment:
 *   DATABASE_URL    - Required
 *   EVENT_ID        - Optional override (also accepts CLI arg)
 *   PFL_EVENT_URL   - Optional override for the pflmma.com event URL
 *
 * Exit codes:
 *   0 = Success (or no active event to track)
 *   1 = Error
 */

import { PrismaClient } from '@prisma/client';
import { PFLLiveScraper } from '../services/pflLiveScraper';
import { parsePFLLiveData, autoCompletePFLEvent } from '../services/pflLiveParser';

const prisma = new PrismaClient();

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Find an active PFL event to track. Active = started within last 12 hours
 * OR starting within next 6 hours, and not already COMPLETED.
 */
async function findActivePFLEvent(overrideEventId?: string) {
  if (overrideEventId) {
    const event = await prisma.event.findUnique({ where: { id: overrideEventId } });
    if (!event) {
      console.log(`[PFL LIVE] Override event not found: ${overrideEventId}`);
      return null;
    }
    console.log(`[PFL LIVE] Using override event: ${event.name}`);
    return event;
  }

  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - TWELVE_HOURS_MS);
  const sixHoursFromNow = new Date(now.getTime() + SIX_HOURS_MS);

  const event = await prisma.event.findFirst({
    where: {
      scraperType: 'pfl',
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

async function runPFLLiveTracker(): Promise<void> {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('[PFL LIVE] GitHub Actions Live Tracker');
  console.log(`[PFL LIVE] Started at: ${new Date().toISOString()}`);
  console.log('========================================\n');

  let scraper: PFLLiveScraper | null = null;

  try {
    const overrideEventId = process.env.EVENT_ID || process.argv[2];
    const event = await findActivePFLEvent(overrideEventId);

    if (!event) {
      console.log('[PFL LIVE] No active PFL event found. Nothing to track.');
      return;
    }

    console.log(`[PFL LIVE] Event: ${event.name}`);
    console.log(`[PFL LIVE] ID: ${event.id}`);
    console.log(`[PFL LIVE] Status: ${event.eventStatus}`);
    console.log(`[PFL LIVE] Date: ${event.date}\n`);

    const eventUrl = process.env.PFL_EVENT_URL || event.ufcUrl;
    if (!eventUrl) {
      throw new Error('No PFL event URL. Set PFL_EVENT_URL or ensure event has ufcUrl populated by the daily scraper.');
    }

    console.log(`[PFL LIVE] URL: ${eventUrl}\n`);

    scraper = new PFLLiveScraper(eventUrl);
    const scrapedData = await scraper.scrape();

    console.log(`\n[PFL LIVE] Scraped ${scrapedData.fights.length} fights`);
    console.log(`[PFL LIVE] Event status: ${scrapedData.status}\n`);

    const result = await parsePFLLiveData(scrapedData, event.id);

    console.log(`[PFL LIVE] Results:`);
    console.log(`  Fights updated: ${result.fightsUpdated}`);
    console.log(`  Event updated:  ${result.eventUpdated}`);
    console.log(`  Cancelled:      ${result.cancelledCount}`);
    console.log(`  Un-cancelled:   ${result.unCancelledCount}`);

    const completed = await autoCompletePFLEvent(event.id);
    if (completed) {
      console.log('[PFL LIVE] Event auto-completed (all fights done)');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[PFL LIVE] Done in ${elapsed}s\n`);
  } catch (error: any) {
    console.error('\n[PFL LIVE] ERROR:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    if (scraper) {
      await scraper.stop();
    }
    await prisma.$disconnect();
  }
}

runPFLLiveTracker()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[PFL LIVE] Fatal:', error.message);
    process.exit(1);
  });
