/**
 * RAF Results Backfill Wrapper
 *
 * Reuses the production live scraper (scrapeRAFLiveEvent.js, against
 * realamericanfreestyle.com) + live parser to retroactively fill in missing
 * winners/methods on completed RAF events.
 *
 * Mirrors `backfillBKFCResults.ts` — both shell out to a JS scraper that
 * writes JSON to disk, then read the latest output file and feed it to the
 * live parser with backfill-safe options.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PrismaClient } from '@prisma/client';
import { parseRAFLiveData, RAFLiveEventData } from './rafLiveParser';

const execAsync = promisify(exec);

const SCRAPER_TIMEOUT_MS = 120_000;
const SCRAPER_MAX_BUFFER = 10 * 1024 * 1024;

export interface BackfillRAFEvent {
  id: string;
  name: string;
  ufcUrl: string | null;  // RAF event URL is stored in the same column as UFC's
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

export async function backfillRAFResults(
  prisma: PrismaClient,
  event: BackfillRAFEvent
): Promise<BackfillResult> {
  if (!event.ufcUrl) {
    console.log(`  [backfill-raf] No event URL on ${event.name}, skipping`);
    return { filledWinners: 0, fightsUpdated: 0 };
  }

  const scraperPath = path.join(__dirname, 'scrapeRAFLiveEvent.js');
  const outputDir = path.join(__dirname, '../../live-event-data/raf');
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`  [backfill-raf] Scraping ${event.ufcUrl}`);
  try {
    const { stdout, stderr } = await execAsync(
      `node "${scraperPath}" "${event.ufcUrl}" "${outputDir}"`,
      { timeout: SCRAPER_TIMEOUT_MS, maxBuffer: SCRAPER_MAX_BUFFER }
    );
    if (stdout) console.log(stdout.split('\n').slice(-5).join('\n'));
    if (stderr) console.warn(`  [backfill-raf] scraper stderr: ${stderr.split('\n').slice(-3).join(' | ')}`);
  } catch (err: any) {
    throw new Error(`scrapeRAFLiveEvent.js failed: ${err.message}`);
  }

  const files = await fs.readdir(outputDir);
  const jsonFiles = files
    .filter(f => f.startsWith('raf-live-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (jsonFiles.length === 0) {
    throw new Error('Scraper produced no output JSON');
  }

  const latestPath = path.join(outputDir, jsonFiles[0]);
  const raw = JSON.parse(await fs.readFile(latestPath, 'utf-8'));
  const scrapedData: RAFLiveEventData = raw.events?.[0];
  if (!scrapedData) {
    throw new Error('Scraper output had no events[]');
  }

  console.log(`  [backfill-raf] Parsed ${scrapedData.fights.length} scraped fights`);

  const nullWinnersBefore = await countNullWinners(prisma, event.id);

  const result = await parseRAFLiveData(scrapedData, event.id, {
    nullOnlyResults: true,
    skipCancellationCheck: true,
    skipNotifications: true,
    skipStaleLiveReset: true,
    completionMethodOverride: 'backfill-raf',
  });

  const nullWinnersAfter = await countNullWinners(prisma, event.id);
  const filledWinners = Math.max(0, nullWinnersBefore - nullWinnersAfter);

  console.log(`  [backfill-raf] parser: ${result.fightsUpdated} fights touched`);

  // Cleanup: keep only last 5 scrape outputs.
  for (const f of jsonFiles.slice(5)) {
    try { await fs.unlink(path.join(outputDir, f)); } catch { /* ignore */ }
  }

  return { filledWinners, fightsUpdated: result.fightsUpdated };
}
