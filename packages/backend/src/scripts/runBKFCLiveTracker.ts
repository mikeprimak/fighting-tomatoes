/**
 * BKFC Live Tracker - Standalone Script for GitHub Actions
 *
 * Runs ONE iteration of live tracking for BKFC events.
 * Spawns the Puppeteer scraper (scrapeBKFCLiveEvent.js) as a child process,
 * reads the JSON output, and updates the database via the parser.
 *
 * Usage:
 *   node dist/scripts/runBKFCLiveTracker.js [eventId]
 *
 * Environment:
 *   DATABASE_URL - Required
 *   EVENT_ID - Optional override (also accepts CLI arg)
 *   BKFC_EVENT_URL - Optional override for BKFC event page URL
 *
 * Exit codes:
 *   0 = Success (or no active event to track)
 *   1 = Error
 */

import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs/promises';
import { promisify } from 'util';
import { exec } from 'child_process';
import { parseBKFCLiveData, autoCompleteBKFCEvent } from '../services/bkfcLiveParser';
import type { BKFCEventData } from '../services/bkfcLiveScraper';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Find an active BKFC event to track.
 */
async function findActiveBKFCEvent(overrideEventId?: string) {
  if (overrideEventId) {
    const event = await prisma.event.findUnique({ where: { id: overrideEventId } });
    if (!event) {
      console.log(`[BKFC LIVE] Override event not found: ${overrideEventId}`);
      return null;
    }
    console.log(`[BKFC LIVE] Using override event: ${event.name}`);
    return event;
  }

  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - TWELVE_HOURS_MS);
  const sixHoursFromNow = new Date(now.getTime() + SIX_HOURS_MS);

  // Search by mainStartTime if available, fall back to date.
  // The date field is stored at midnight UTC which can fall outside the lookback window.
  const event = await prisma.event.findFirst({
    where: {
      scraperType: 'bkfc',
      eventStatus: { not: 'COMPLETED' },
      OR: [
        // Event date within window
        { date: { gte: twelveHoursAgo, lte: sixHoursFromNow } },
        // Main start time within window (more accurate)
        { mainStartTime: { gte: twelveHoursAgo, lte: sixHoursFromNow } },
      ],
    },
    orderBy: { date: 'asc' },
  });

  return event;
}

async function runBKFCLiveTracker(): Promise<void> {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('[BKFC LIVE] GitHub Actions Live Tracker');
  console.log(`[BKFC LIVE] Started at: ${new Date().toISOString()}`);
  console.log('========================================\n');

  try {
    const overrideEventId = process.env.EVENT_ID || process.argv[2];
    const event = await findActiveBKFCEvent(overrideEventId);

    if (!event) {
      console.log('[BKFC LIVE] No active BKFC event found. Nothing to track.');
      return;
    }

    console.log(`[BKFC LIVE] Event: ${event.name}`);
    console.log(`[BKFC LIVE] ID: ${event.id}`);
    console.log(`[BKFC LIVE] Status: ${event.eventStatus}`);
    console.log(`[BKFC LIVE] Date: ${event.date}\n`);

    // Get BKFC event page URL
    const eventUrl = process.env.BKFC_EVENT_URL || event.ufcUrl;
    if (!eventUrl) {
      throw new Error('No BKFC event URL. Set BKFC_EVENT_URL or ensure event has ufcUrl.');
    }

    console.log(`[BKFC LIVE] URL: ${eventUrl}\n`);

    // Run Puppeteer scraper as child process (same pattern as UFC tracker)
    // The JS file is in src/services/ — at runtime, __dirname is dist/scripts/
    const scraperPath = path.join(__dirname, '../services/scrapeBKFCLiveEvent.js');
    const outputDir = path.join(__dirname, '../../live-event-data/bkfc');

    await fs.mkdir(outputDir, { recursive: true });

    console.log(`[BKFC LIVE] Scraper path: ${scraperPath}`);
    console.log(`[BKFC LIVE] Output dir: ${outputDir}\n`);

    const command = `node "${scraperPath}" "${eventUrl}" "${outputDir}"`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (stdout) {
        console.log('[BKFC LIVE] Scraper output:');
        console.log(stdout);
      }
      if (stderr) {
        console.warn('[BKFC LIVE] Scraper warnings:', stderr);
      }
    } catch (scraperError: any) {
      console.error('[BKFC LIVE] Scraper failed:', scraperError.message);
      if (scraperError.stdout) console.log('stdout:', scraperError.stdout);
      if (scraperError.stderr) console.log('stderr:', scraperError.stderr);
      throw new Error(`Scraper failed: ${scraperError.message}`);
    }

    // Read the most recent scraped data file
    const files = await fs.readdir(outputDir);
    const jsonFiles = files.filter(f => f.startsWith('bkfc-live-') && f.endsWith('.json')).sort().reverse();

    if (jsonFiles.length === 0) {
      throw new Error('No scrape data found after running scraper');
    }

    const latestFile = path.join(outputDir, jsonFiles[0]);
    console.log(`[BKFC LIVE] Reading scraped data: ${jsonFiles[0]}`);

    const rawData = await fs.readFile(latestFile, 'utf-8');
    const scrapedJson = JSON.parse(rawData);

    const scrapedData: BKFCEventData = scrapedJson.events?.[0];
    if (!scrapedData) {
      throw new Error('No event data in scraped JSON');
    }

    console.log(`\n[BKFC LIVE] Scraped ${scrapedData.fights.length} fights`);
    console.log(`[BKFC LIVE] Event status: ${scrapedData.status}\n`);

    // Parse and update database
    const result = await parseBKFCLiveData(scrapedData, event.id);

    console.log(`[BKFC LIVE] Results:`);
    console.log(`  Fights updated: ${result.fightsUpdated}`);
    console.log(`  Event updated: ${result.eventUpdated}`);
    console.log(`  Cancelled: ${result.cancelledCount}`);
    console.log(`  Un-cancelled: ${result.unCancelledCount}`);

    // Auto-complete check
    const completed = await autoCompleteBKFCEvent(event.id);
    if (completed) {
      console.log('[BKFC LIVE] Event auto-completed (all fights done)');
    }

    // Clean up old JSON files (keep last 5)
    if (jsonFiles.length > 5) {
      for (const oldFile of jsonFiles.slice(5)) {
        try {
          await fs.unlink(path.join(outputDir, oldFile));
        } catch {}
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[BKFC LIVE] Done in ${elapsed}s\n`);

  } catch (error: any) {
    console.error('\n[BKFC LIVE] ERROR:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runBKFCLiveTracker()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[BKFC LIVE] Fatal:', error.message);
    process.exit(1);
  });
