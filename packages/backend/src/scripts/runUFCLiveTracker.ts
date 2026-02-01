/**
 * UFC Live Tracker - Standalone Script for GitHub Actions
 *
 * Runs ONE iteration of live tracking for UFC events.
 * Designed to be called every 5 minutes by GitHub Actions.
 *
 * Usage:
 *   node dist/scripts/runUFCLiveTracker.js [eventId]
 *
 * Exit codes:
 *   0 = Success (or no active event to track)
 *   1 = Error
 */

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { parseLiveEventData, getEventStatus, autoCompleteEvent } from '../services/ufcLiveParser';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

// ============== CONFIGURATION ==============

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// ============== HELPER FUNCTIONS ==============

/**
 * Convert scraped data format to live update format
 * (Copied from liveEventTracker.ts for standalone use)
 */
function convertScrapedToLiveUpdate(eventData: any): any {
  const hasStarted = eventData.status === 'Live' || eventData.hasStarted;
  const isComplete = eventData.status === 'Complete' || eventData.isComplete;

  const fights = (eventData.fights || []).map((fight: any) => {
    let fightStatus: 'upcoming' | 'live' | 'complete' = 'upcoming';
    let currentRound: number | null = null;
    let completedRounds: number | null = null;

    if (fight.status === 'complete' || fight.isComplete || fight.winner || fight.result?.winner) {
      fightStatus = 'complete';
      completedRounds = fight.completedRounds || fight.result?.round || fight.round || null;
    } else if (fight.status === 'live' || fight.isLive || fight.hasStarted) {
      fightStatus = 'live';
      currentRound = fight.currentRound || null;
      completedRounds = fight.completedRounds || (currentRound ? currentRound - 1 : null);
    }

    return {
      fighterAName: fight.fighterA?.name || fight.fighter1Name || '',
      fighterBName: fight.fighterB?.name || fight.fighter2Name || '',
      order: fight.order || null,
      cardType: fight.cardType || null,
      weightClass: fight.weightClass || null,
      isTitle: fight.isTitle || false,
      status: fightStatus,
      currentRound,
      completedRounds,
      currentTime: fight.currentTime || null,
      hasStarted: fightStatus !== 'upcoming',
      isComplete: fightStatus === 'complete',
      winner: fight.result?.winner || fight.winner || null,
      method: fight.result?.method || fight.method || null,
      winningRound: fight.result?.round || fight.round || null,
      winningTime: fight.result?.time || fight.time || null
    };
  });

  return {
    eventName: eventData.eventName || eventData.name,
    hasStarted,
    isComplete,
    fights
  };
}

/**
 * Find an active UFC event that should be tracked
 * Active = started within last 12 hours, not complete, has UFC URL
 */
async function findActiveUFCEvent(overrideEventId?: string) {
  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - TWELVE_HOURS_MS);
  const sixHoursFromNow = new Date(now.getTime() + SIX_HOURS_MS);

  // If override event ID provided, use that
  if (overrideEventId) {
    const event = await prisma.event.findUnique({
      where: { id: overrideEventId }
    });

    if (!event) {
      console.log(`[UFC LIVE] Override event not found: ${overrideEventId}`);
      return null;
    }

    if (!event.ufcUrl) {
      console.log(`[UFC LIVE] Override event has no UFC URL: ${event.name}`);
      return null;
    }

    console.log(`[UFC LIVE] Using override event: ${event.name}`);
    return event;
  }

  // Find active UFC event based on time window
  // An event is "active" if:
  // - It's a UFC event (has ufcUrl)
  // - It's not complete
  // - One of its start times is within the tracking window (12h ago to 6h from now)
  const event = await prisma.event.findFirst({
    where: {
      promotion: 'UFC',
      isComplete: false,
      ufcUrl: { not: null },
      OR: [
        { mainStartTime: { gte: twelveHoursAgo, lte: sixHoursFromNow } },
        { prelimStartTime: { gte: twelveHoursAgo, lte: sixHoursFromNow } },
        { earlyPrelimStartTime: { gte: twelveHoursAgo, lte: sixHoursFromNow } },
      ]
    },
    orderBy: {
      date: 'asc'  // Get the earliest active event
    }
  });

  return event;
}

// ============== MAIN FUNCTION ==============

async function runUFCLiveTracker(): Promise<void> {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('[UFC LIVE] GitHub Actions Live Tracker');
  console.log(`[UFC LIVE] Started at: ${new Date().toISOString()}`);
  console.log('========================================\n');

  try {
    // Check for override event ID from environment
    const overrideEventId = process.env.EVENT_ID || process.argv[2];

    // Find active UFC event
    const event = await findActiveUFCEvent(overrideEventId);

    if (!event) {
      console.log('[UFC LIVE] No active UFC event found. Nothing to track.');
      console.log('[UFC LIVE] Exiting successfully (no work to do).\n');
      return;
    }

    console.log(`[UFC LIVE] Found active event: ${event.name}`);
    console.log(`[UFC LIVE] Event ID: ${event.id}`);
    console.log(`[UFC LIVE] UFC URL: ${event.ufcUrl}`);
    console.log(`[UFC LIVE] isComplete: ${event.isComplete}`);
    console.log(`[UFC LIVE] hasStarted: ${event.hasStarted}\n`);

    // Run the live event scraper
    // Script is in src/services/scrapeLiveEvent.js (JavaScript file)
    const scraperPath = path.join(__dirname, '../services/scrapeLiveEvent.js');
    const outputDir = path.join(__dirname, '../../live-event-data');

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    console.log(`[UFC LIVE] Running scraper...`);
    console.log(`[UFC LIVE] Scraper path: ${scraperPath}`);
    console.log(`[UFC LIVE] Output dir: ${outputDir}\n`);

    const command = `node "${scraperPath}" "${event.ufcUrl}" "${outputDir}"`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 120000, // 2 minute timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      if (stdout) {
        console.log('[UFC LIVE] Scraper output:');
        console.log(stdout);
      }
      if (stderr) {
        console.warn('[UFC LIVE] Scraper warnings:', stderr);
      }
    } catch (scraperError: any) {
      console.error('[UFC LIVE] Scraper failed:', scraperError.message);
      throw new Error(`Scraper failed: ${scraperError.message}`);
    }

    // Find the most recent scraped data file
    const files = await fs.readdir(outputDir);
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

    if (jsonFiles.length === 0) {
      throw new Error('No scrape data found after running scraper');
    }

    const latestFile = path.join(outputDir, jsonFiles[0]);
    console.log(`[UFC LIVE] Reading scraped data: ${jsonFiles[0]}`);

    const scrapedDataRaw = await fs.readFile(latestFile, 'utf-8');
    const scrapedData = JSON.parse(scrapedDataRaw);

    console.log(`[UFC LIVE] Scraped ${scrapedData.events?.length || 0} events\n`);

    // Parse the scraped data
    if (scrapedData.events && scrapedData.events.length > 0) {
      const eventData = scrapedData.events[0];

      // Convert scraped format to parser format
      const liveUpdate = convertScrapedToLiveUpdate(eventData);

      console.log(`[UFC LIVE] Processing ${liveUpdate.fights.length} fights...`);
      console.log(`[UFC LIVE] Event hasStarted: ${liveUpdate.hasStarted}`);
      console.log(`[UFC LIVE] Event isComplete: ${liveUpdate.isComplete}\n`);

      // Parse and update database
      await parseLiveEventData(liveUpdate, event.id);

      // Check if event should be marked complete
      const eventStatus = await getEventStatus(event.id);
      if (eventStatus && !eventStatus.isComplete) {
        const completed = await autoCompleteEvent(event.id);
        if (completed) {
          console.log('[UFC LIVE] Event auto-completed (all fights done)');
        }
      }

      // Log final status
      if (eventStatus) {
        console.log('\n[UFC LIVE] Event Status:');
        console.log(`  Total fights: ${eventStatus.totalFights}`);
        console.log(`  Complete: ${eventStatus.completeFights}`);
        console.log(`  Live: ${eventStatus.liveFights}`);
        console.log(`  Upcoming: ${eventStatus.upcomingFights}`);

        if (eventStatus.currentFights.length > 0) {
          console.log('  Current fights:');
          eventStatus.currentFights.forEach(f => {
            console.log(`    - ${f.fighters} (Round ${f.currentRound || '?'})`);
          });
        }
      }
    } else {
      console.log('[UFC LIVE] No event data in scraped results');
    }

    // Clean up old scraped files (keep last 5)
    const oldFiles = jsonFiles.slice(5);
    for (const oldFile of oldFiles) {
      try {
        await fs.unlink(path.join(outputDir, oldFile));
      } catch {
        // Ignore cleanup errors
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[UFC LIVE] Completed successfully in ${elapsed}s\n`);

  } catch (error: any) {
    console.error('\n[UFC LIVE] ERROR:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// ============== CLI ENTRY POINT ==============

runUFCLiveTracker()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[UFC LIVE] Fatal error:', error.message);
    process.exit(1);
  });
