/**
 * Oktagon Live Tracker - Standalone Script for GitHub Actions
 *
 * Runs ONE iteration of live tracking for Oktagon events.
 * Designed to be called every 5 minutes by GitHub Actions.
 *
 * Usage:
 *   node dist/scripts/runOktagonLiveTracker.js [eventId]
 *
 * Environment:
 *   DATABASE_URL - Required
 *   EVENT_ID - Optional override (also accepts CLI arg)
 *
 * Exit codes:
 *   0 = Success (or no active event to track)
 *   1 = Error
 */

import { PrismaClient } from '@prisma/client';
import OktagonLiveScraper from '../services/oktagonLiveScraper';
import { parseOktagonLiveData, autoCompleteOktagonEvent } from '../services/oktagonLiveParser';

const prisma = new PrismaClient();

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Find an active Oktagon event that should be tracked.
 * Active = started within last 12 hours OR starting within 6 hours, not complete, has scraperType='oktagon'.
 */
async function findActiveOktagonEvent(overrideEventId?: string) {
  if (overrideEventId) {
    const event = await prisma.event.findUnique({
      where: { id: overrideEventId },
    });

    if (!event) {
      console.log(`[OKTAGON LIVE] Override event not found: ${overrideEventId}`);
      return null;
    }

    console.log(`[OKTAGON LIVE] Using override event: ${event.name}`);
    return event;
  }

  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - TWELVE_HOURS_MS);
  const sixHoursFromNow = new Date(now.getTime() + SIX_HOURS_MS);

  const event = await prisma.event.findFirst({
    where: {
      scraperType: 'oktagon',
      eventStatus: { not: 'COMPLETED' },
      date: { gte: twelveHoursAgo, lte: sixHoursFromNow },
    },
    orderBy: { date: 'asc' },
  });

  return event;
}

/**
 * Extract the Oktagon slug from event name or URL.
 * e.g. "OKTAGON 85: SEVERINO VS. KAKHOROV" -> "oktagon-85-hamburg"
 * Falls back to checking the event's oktagonUrl field or known patterns.
 */
function getOktagonSlug(event: any): string | null {
  // Check if event has an oktagonUrl stored
  if (event.oktagonUrl) {
    const match = event.oktagonUrl.match(/events\/([^/?]+)/);
    if (match) return match[1];
  }

  // Try to build slug from event name
  // "OKTAGON 85: SEVERINO VS. KAKHOROV" -> extract number
  const nameMatch = event.name?.match(/OKTAGON\s+(\d+)/i);
  if (nameMatch) {
    // We need the city suffix - check location field or fall back
    const num = nameMatch[1];
    if (event.location) {
      const city = event.location.toLowerCase().replace(/[^a-z0-9]/g, '');
      return `oktagon-${num}-${city}`;
    }
    // Without city, try just the number (won't work for API but worth trying)
    return `oktagon-${num}`;
  }

  return null;
}

async function runOktagonLiveTracker(): Promise<void> {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('[OKTAGON LIVE] GitHub Actions Live Tracker');
  console.log(`[OKTAGON LIVE] Started at: ${new Date().toISOString()}`);
  console.log('========================================\n');

  try {
    const overrideEventId = process.env.EVENT_ID || process.argv[2];
    const overrideSlug = process.env.OKTAGON_SLUG || process.argv[3];

    const event = await findActiveOktagonEvent(overrideEventId);

    if (!event) {
      console.log('[OKTAGON LIVE] No active Oktagon event found. Nothing to track.');
      console.log('[OKTAGON LIVE] Exiting successfully (no work to do).\n');
      return;
    }

    console.log(`[OKTAGON LIVE] Found active event: ${event.name}`);
    console.log(`[OKTAGON LIVE] Event ID: ${event.id}`);
    console.log(`[OKTAGON LIVE] Event status: ${event.eventStatus}`);
    console.log(`[OKTAGON LIVE] Event date: ${event.date}\n`);

    // Determine the slug to use for the API
    const slug = overrideSlug || getOktagonSlug(event);

    if (!slug) {
      console.error('[OKTAGON LIVE] Could not determine Oktagon slug for event.');
      console.error('[OKTAGON LIVE] Set OKTAGON_SLUG env var or pass as 2nd CLI arg.');
      throw new Error('No Oktagon slug available');
    }

    console.log(`[OKTAGON LIVE] Using slug: ${slug}`);
    console.log(`[OKTAGON LIVE] API URL: https://api.oktagonmma.com/v1/events/${slug}\n`);

    // Create scraper and run one iteration
    const scraper = new OktagonLiveScraper(slug);
    const scrapedData = await scraper.scrape();

    console.log(`\n[OKTAGON LIVE] Scraped ${scrapedData.fights.length} fights`);
    console.log(`[OKTAGON LIVE] Event status from API: ${scrapedData.status}\n`);

    // Parse and update database
    const result = await parseOktagonLiveData(scrapedData, event.id);

    console.log(`[OKTAGON LIVE] Parse results:`);
    console.log(`  Fights updated: ${result.fightsUpdated}`);
    console.log(`  Event updated: ${result.eventUpdated}`);
    console.log(`  Cancelled: ${result.cancelledCount}`);
    console.log(`  Un-cancelled: ${result.unCancelledCount}`);

    // Check if event should be auto-completed
    const completed = await autoCompleteOktagonEvent(event.id);
    if (completed) {
      console.log('[OKTAGON LIVE] Event auto-completed (all fights done)');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[OKTAGON LIVE] Completed successfully in ${elapsed}s\n`);

  } catch (error: any) {
    console.error('\n[OKTAGON LIVE] ERROR:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runOktagonLiveTracker()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[OKTAGON LIVE] Fatal error:', error.message);
    process.exit(1);
  });
