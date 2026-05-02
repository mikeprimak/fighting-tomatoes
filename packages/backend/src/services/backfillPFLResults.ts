/**
 * PFL Results Backfill Wrapper
 *
 * Reuses the production live scraper + live parser to retroactively fill in
 * missing winners/methods on completed PFL events. Mirrors backfillOneFCResults.
 */

import { PrismaClient } from '@prisma/client';
import { PFLLiveScraper } from './pflLiveScraper';
import { parsePFLLiveData } from './pflLiveParser';

export interface BackfillPFLEvent {
  id: string;
  name: string;
  ufcUrl: string | null; // PFL event URL is stored in the same column the daily scraper uses
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

export async function backfillPFLResults(
  prisma: PrismaClient,
  event: BackfillPFLEvent
): Promise<BackfillResult> {
  if (!event.ufcUrl) {
    console.log(`  [backfill-pfl] No event URL on ${event.name}, skipping`);
    return { filledWinners: 0, fightsUpdated: 0 };
  }

  console.log(`  [backfill-pfl] Scraping ${event.ufcUrl}`);

  const scraper = new PFLLiveScraper(event.ufcUrl);
  let scrapedData;
  try {
    scrapedData = await scraper.scrape();
  } finally {
    await scraper.stop();
  }

  console.log(`  [backfill-pfl] Parsed ${scrapedData.fights.length} scraped fights`);

  const nullWinnersBefore = await countNullWinners(prisma, event.id);

  const result = await parsePFLLiveData(scrapedData, event.id, {
    nullOnlyResults: true,
    skipCancellationCheck: true,
    skipNotifications: true,
    completionMethodOverride: 'backfill-pfl',
  });

  const nullWinnersAfter = await countNullWinners(prisma, event.id);
  const filledWinners = Math.max(0, nullWinnersBefore - nullWinnersAfter);

  console.log(`  [backfill-pfl] parser: ${result.fightsUpdated} fights touched`);

  return { filledWinners, fightsUpdated: result.fightsUpdated };
}
