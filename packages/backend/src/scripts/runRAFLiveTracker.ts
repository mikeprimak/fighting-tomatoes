/**
 * RAF Live Tracker - Standalone Script for GitHub Actions
 *
 * Runs ONE iteration of live tracking for RAF events.
 * Fetches the RAF event page (cheerio-based, no Puppeteer), parses results,
 * and updates the database.
 *
 * Usage:
 *   node dist/scripts/runRAFLiveTracker.js [eventId]
 *
 * Environment:
 *   DATABASE_URL - Required
 *   EVENT_ID - Optional override (also accepts CLI arg)
 *   RAF_EVENT_URL - Optional override for RAF event page URL
 */

import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs/promises';
import { promisify } from 'util';
import { exec } from 'child_process';
import { parseRAFLiveData, autoCompleteRAFEvent } from '../services/rafLiveParser';
import type { RAFLiveEventData } from '../services/rafLiveParser';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

async function findActiveRAFEvent(overrideEventId?: string) {
  if (overrideEventId) {
    const event = await prisma.event.findUnique({ where: { id: overrideEventId } });
    if (!event) {
      console.log(`[RAF LIVE] Override event not found: ${overrideEventId}`);
      return null;
    }
    console.log(`[RAF LIVE] Using override event: ${event.name}`);
    return event;
  }

  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - TWELVE_HOURS_MS);
  const sixHoursFromNow = new Date(now.getTime() + SIX_HOURS_MS);

  const event = await prisma.event.findFirst({
    where: {
      scraperType: 'raf',
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

async function runRAFLiveTracker(): Promise<void> {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('[RAF LIVE] GitHub Actions Live Tracker');
  console.log(`[RAF LIVE] Started at: ${new Date().toISOString()}`);
  console.log('========================================\n');

  try {
    const overrideEventId = process.env.EVENT_ID || process.argv[2];
    const event = await findActiveRAFEvent(overrideEventId);

    if (!event) {
      console.log('[RAF LIVE] No active RAF event found. Nothing to track.');
      return;
    }

    console.log(`[RAF LIVE] Event: ${event.name}`);
    console.log(`[RAF LIVE] ID: ${event.id}`);
    console.log(`[RAF LIVE] Status: ${event.eventStatus}`);
    console.log(`[RAF LIVE] Date: ${event.date}\n`);

    const eventUrl = process.env.RAF_EVENT_URL || event.ufcUrl;
    if (!eventUrl) {
      throw new Error('No RAF event URL. Set RAF_EVENT_URL or ensure event has ufcUrl.');
    }

    console.log(`[RAF LIVE] URL: ${eventUrl}\n`);

    // Run the cheerio-based scraper as child process
    const scraperPath = path.join(__dirname, '../services/scrapeRAFLiveEvent.js');
    const outputDir = path.join(__dirname, '../../live-event-data/raf');

    await fs.mkdir(outputDir, { recursive: true });

    const command = `node "${scraperPath}" "${eventUrl}" "${outputDir}"`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000, // 60s timeout (cheerio is fast, no browser)
        maxBuffer: 10 * 1024 * 1024,
      });

      if (stdout) {
        console.log('[RAF LIVE] Scraper output:');
        console.log(stdout);
      }
      if (stderr) {
        console.warn('[RAF LIVE] Scraper warnings:', stderr);
      }
    } catch (scraperError: any) {
      console.error('[RAF LIVE] Scraper failed:', scraperError.message);
      if (scraperError.stdout) console.log('stdout:', scraperError.stdout);
      if (scraperError.stderr) console.log('stderr:', scraperError.stderr);
      throw new Error(`Scraper failed: ${scraperError.message}`);
    }

    // Read the most recent scraped data file
    const files = await fs.readdir(outputDir);
    const jsonFiles = files.filter(f => f.startsWith('raf-live-') && f.endsWith('.json')).sort().reverse();

    if (jsonFiles.length === 0) {
      throw new Error('No scrape data found after running scraper');
    }

    const latestFile = path.join(outputDir, jsonFiles[0]);
    console.log(`[RAF LIVE] Reading scraped data: ${jsonFiles[0]}`);

    const rawData = await fs.readFile(latestFile, 'utf-8');
    const scrapedJson = JSON.parse(rawData);

    const scrapedData: RAFLiveEventData = scrapedJson.events?.[0];
    if (!scrapedData) {
      throw new Error('No event data in scraped JSON');
    }

    console.log(`\n[RAF LIVE] Scraped ${scrapedData.fights.length} fights`);
    console.log(`[RAF LIVE] Event status: ${scrapedData.status}\n`);

    // Parse and update database
    const result = await parseRAFLiveData(scrapedData, event.id);

    console.log(`[RAF LIVE] Results:`);
    console.log(`  Fights updated: ${result.fightsUpdated}`);
    console.log(`  Event updated: ${result.eventUpdated}`);
    console.log(`  Cancelled: ${result.cancelledCount}`);
    console.log(`  Un-cancelled: ${result.unCancelledCount}`);

    // Auto-complete check
    const completed = await autoCompleteRAFEvent(event.id);
    if (completed) {
      console.log('[RAF LIVE] Event auto-completed (all fights done)');
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
    console.log(`\n[RAF LIVE] Done in ${elapsed}s\n`);

  } catch (error: any) {
    console.error('\n[RAF LIVE] ERROR:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runRAFLiveTracker()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[RAF LIVE] Fatal:', error.message);
    process.exit(1);
  });
