/**
 * BKFC Results Backfill Wrapper
 *
 * Reuses the production live scraper + live parser to retroactively fill in
 * missing winners/methods on completed BKFC events.
 *
 * Mirrors `backfillUFCResults.ts`. See its header for the safety contract;
 * the BKFC parser already gates result writes on `dbFight.winner == null`,
 * so the `nullOnlyResults` flag is a no-op here but is passed for consistency
 * (and so log lines tag this run as backfill).
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PrismaClient } from '@prisma/client';
import { parseBKFCLiveData } from './bkfcLiveParser';
import type { BKFCEventData } from './bkfcLiveScraper';

const execAsync = promisify(exec);

const SCRAPER_TIMEOUT_MS = 120_000;
const SCRAPER_MAX_BUFFER = 10 * 1024 * 1024;

export interface BackfillBKFCEvent {
  id: string;
  name: string;
  ufcUrl: string | null;  // BKFC event URL is stored in the same column as UFC's
}

export interface BackfillResult {
  filledWinners: number;
  fightsUpdated: number;
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

export async function backfillBKFCResults(
  prisma: PrismaClient,
  event: BackfillBKFCEvent
): Promise<BackfillResult> {
  if (!event.ufcUrl) {
    console.log(`  [backfill-bkfc] No event URL on ${event.name}, skipping`);
    return { filledWinners: 0, fightsUpdated: 0 };
  }

  const scraperPath = path.join(__dirname, 'scrapeBKFCLiveEvent.js');
  const outputDir = path.join(__dirname, '../../live-event-data/bkfc');
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`  [backfill-bkfc] Scraping ${event.ufcUrl}`);
  try {
    const { stdout, stderr } = await execAsync(
      `node "${scraperPath}" "${event.ufcUrl}" "${outputDir}"`,
      { timeout: SCRAPER_TIMEOUT_MS, maxBuffer: SCRAPER_MAX_BUFFER }
    );
    if (stdout) console.log(stdout.split('\n').slice(-5).join('\n'));
    if (stderr) console.warn(`  [backfill-bkfc] scraper stderr: ${stderr.split('\n').slice(-3).join(' | ')}`);
  } catch (err: any) {
    throw new Error(`scrapeBKFCLiveEvent.js failed: ${err.message}`);
  }

  const files = await fs.readdir(outputDir);
  const jsonFiles = files
    .filter(f => f.startsWith('bkfc-live-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (jsonFiles.length === 0) {
    throw new Error('Scraper produced no output JSON');
  }

  const latestPath = path.join(outputDir, jsonFiles[0]);
  const raw = JSON.parse(await fs.readFile(latestPath, 'utf-8'));
  const scrapedData: BKFCEventData = raw.events?.[0];
  if (!scrapedData) {
    throw new Error('Scraper output had no events[]');
  }

  console.log(`  [backfill-bkfc] Parsed ${scrapedData.fights.length} scraped fights`);

  const nullWinnersBefore = await countNullWinners(prisma, event.id);

  const result = await parseBKFCLiveData(scrapedData, event.id, {
    nullOnlyResults: true,
    skipCancellationCheck: true,
    skipNotifications: true,
    skipStaleLiveReset: true,
    completionMethodOverride: 'backfill-bkfc',
  });

  const nullWinnersAfter = await countNullWinners(prisma, event.id);
  const filledWinners = Math.max(0, nullWinnersBefore - nullWinnersAfter);

  console.log(`  [backfill-bkfc] parser: ${result.fightsUpdated} fights touched`);

  // Cleanup: keep only last 5 scrape outputs.
  for (const f of jsonFiles.slice(5)) {
    try { await fs.unlink(path.join(outputDir, f)); } catch { /* ignore */ }
  }

  return { filledWinners, fightsUpdated: result.fightsUpdated };
}
