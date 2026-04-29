/**
 * UFC Results Backfill Wrapper
 *
 * Reuses the production live scraper + live parser to retroactively fill in
 * missing winners/methods on completed UFC events. The orchestrator
 * (`src/scripts/backfillResults.ts`) dispatches per-event.
 *
 * Safety contract:
 *   - Only writes fight result fields that are currently NULL (manual fixes
 *     and live-tracker results are never overwritten).
 *   - Skips cancellation reconciliation (event is in the past — we don't want
 *     to retroactively cancel real fights based on a shifted source page).
 *   - Suppresses notifications (users shouldn't be paged for old events).
 *   - Stamps Fight.completionMethod = 'backfill-ufc' on any fight whose status
 *     flips to COMPLETED on this run.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PrismaClient } from '@prisma/client';
import { parseLiveEventData } from './ufcLiveParser';

const execAsync = promisify(exec);

const SCRAPER_TIMEOUT_MS = 120_000;
const SCRAPER_MAX_BUFFER = 10 * 1024 * 1024;

export interface BackfillUFCEvent {
  id: string;
  name: string;
  ufcUrl: string | null;
}

export interface BackfillResult {
  /** Fights that had NULL winner before this run, now non-NULL. */
  filledWinners: number;
  /** Total fights touched (any field updated). */
  fightsUpdated: number;
}

/**
 * Convert scrapeLiveEvent.js raw output to the LiveEventUpdate shape the parser
 * expects. Mirrors the bridge function in `runUFCLiveTracker.ts` — kept local
 * (rather than imported) so the live tracker script and backfill wrapper can
 * evolve their conversion logic independently if needed.
 */
function convertScrapedToLiveUpdate(eventData: any): any {
  const isLive = eventData.status === 'Live' || eventData.hasStarted;
  const isComplete = eventData.status === 'Complete' || eventData.isComplete;
  const eventStatus = isComplete ? 'COMPLETED' : (isLive ? 'LIVE' : 'UPCOMING');

  const fights = (eventData.fights || []).map((fight: any) => {
    let fightStatus: 'upcoming' | 'live' | 'complete' = 'upcoming';
    let currentRound: number | null = null;
    let completedRounds: number | null = null;

    if (fight.status === 'complete' || fight.isComplete || fight.winner || fight.result?.winner || fight.result?.method) {
      fightStatus = 'complete';
      completedRounds = fight.completedRounds || fight.result?.round || fight.round || null;
    } else if (fight.status === 'live' || fight.isLive || fight.hasStarted) {
      fightStatus = 'live';
      currentRound = fight.currentRound || null;
      completedRounds = fight.completedRounds || (currentRound ? currentRound - 1 : null);
    }

    return {
      ufcFightId: fight.fightId || null,
      fighterAName: fight.fighterA?.name || fight.fighter1Name || '',
      fighterBName: fight.fighterB?.name || fight.fighter2Name || '',
      order: fight.order || null,
      cardType: fight.cardType || null,
      weightClass: fight.weightClass || null,
      isTitle: fight.isTitle || false,
      status: fightStatus,
      fightStatus: fightStatus === 'complete' ? 'COMPLETED' : (fightStatus === 'live' ? 'LIVE' : 'UPCOMING'),
      currentRound,
      completedRounds,
      winner: fight.result?.winner || fight.winner || null,
      method: fight.result?.method || fight.method || null,
      winningRound: fight.result?.round || fight.round || null,
      winningTime: fight.result?.time || fight.time || null,
    };
  });

  return {
    eventName: eventData.eventName || eventData.name,
    eventStatus,
    fights,
  };
}

async function countNullWinners(prisma: PrismaClient, eventId: string): Promise<number> {
  return prisma.fight.count({
    where: {
      eventId,
      winner: null,
      fightStatus: { in: ['COMPLETED', 'UPCOMING', 'LIVE'] },
    },
  });
}

export async function backfillUFCResults(
  prisma: PrismaClient,
  event: BackfillUFCEvent
): Promise<BackfillResult> {
  if (!event.ufcUrl) {
    console.log(`  [backfill-ufc] No ufcUrl on event ${event.name}, skipping`);
    return { filledWinners: 0, fightsUpdated: 0 };
  }

  const scraperPath = path.join(__dirname, 'scrapeLiveEvent.js');
  const outputDir = path.join(__dirname, '../../live-event-data');
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`  [backfill-ufc] Scraping ${event.ufcUrl}`);
  try {
    const { stdout, stderr } = await execAsync(
      `node "${scraperPath}" "${event.ufcUrl}" "${outputDir}"`,
      { timeout: SCRAPER_TIMEOUT_MS, maxBuffer: SCRAPER_MAX_BUFFER }
    );
    if (stdout) console.log(stdout.split('\n').slice(-5).join('\n'));
    if (stderr) console.warn(`  [backfill-ufc] scraper stderr: ${stderr.split('\n').slice(-3).join(' | ')}`);
  } catch (err: any) {
    throw new Error(`scrapeLiveEvent.js failed: ${err.message}`);
  }

  const files = await fs.readdir(outputDir);
  const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();
  if (jsonFiles.length === 0) {
    throw new Error('Scraper produced no output JSON');
  }

  const latestPath = path.join(outputDir, jsonFiles[0]);
  const raw = JSON.parse(await fs.readFile(latestPath, 'utf-8'));
  const scrapedEvent = raw.events?.[0];
  if (!scrapedEvent) {
    throw new Error('Scraper output had no events[]');
  }

  const liveUpdate = convertScrapedToLiveUpdate(scrapedEvent);
  console.log(`  [backfill-ufc] Parsed ${liveUpdate.fights.length} scraped fights`);

  const nullWinnersBefore = await countNullWinners(prisma, event.id);

  await parseLiveEventData(liveUpdate, event.id, {
    nullOnlyResults: true,
    skipCancellationCheck: true,
    skipNotifications: true,
    completionMethodOverride: 'backfill-ufc',
  });

  const nullWinnersAfter = await countNullWinners(prisma, event.id);
  const filledWinners = Math.max(0, nullWinnersBefore - nullWinnersAfter);

  // Cleanup: keep only last 5 scrape outputs to avoid unbounded growth.
  for (const f of jsonFiles.slice(5)) {
    try { await fs.unlink(path.join(outputDir, f)); } catch { /* ignore */ }
  }

  return { filledWinners, fightsUpdated: filledWinners };
}
