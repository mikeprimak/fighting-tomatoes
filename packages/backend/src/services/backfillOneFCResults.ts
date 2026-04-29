/**
 * ONE FC Results Backfill Wrapper
 *
 * Reuses the production live scraper + live parser to retroactively fill in
 * missing winners/methods on completed ONE FC events.
 *
 * Unlike UFC/BKFC, ONE FC's scraper is a TS class instantiated in-process
 * (no child node call to a JS file), so the wrapper is straightforward.
 */

import { PrismaClient } from '@prisma/client';
import OneFCLiveScraper from './oneFCLiveScraper';
import { parseOneFCLiveData } from './oneFCLiveParser';

export interface BackfillOneFCEvent {
  id: string;
  name: string;
  ufcUrl: string | null;  // ONE FC event URL is stored in the same column
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

export async function backfillOneFCResults(
  prisma: PrismaClient,
  event: BackfillOneFCEvent
): Promise<BackfillResult> {
  if (!event.ufcUrl) {
    console.log(`  [backfill-onefc] No event URL on ${event.name}, skipping`);
    return { filledWinners: 0, fightsUpdated: 0 };
  }

  console.log(`  [backfill-onefc] Scraping ${event.ufcUrl}`);

  const scraper = new OneFCLiveScraper(event.ufcUrl);
  let scrapedData;
  try {
    scrapedData = await scraper.scrape();
  } finally {
    // Always close Puppeteer even if scrape throws
    await scraper.stop();
  }

  console.log(`  [backfill-onefc] Parsed ${scrapedData.fights.length} scraped fights`);

  const nullWinnersBefore = await countNullWinners(prisma, event.id);

  const result = await parseOneFCLiveData(scrapedData, event.id, {
    nullOnlyResults: true,
    skipCancellationCheck: true,
    skipNotifications: true,
    completionMethodOverride: 'backfill-onefc',
  });

  const nullWinnersAfter = await countNullWinners(prisma, event.id);
  const filledWinners = Math.max(0, nullWinnersBefore - nullWinnersAfter);

  console.log(`  [backfill-onefc] parser: ${result.fightsUpdated} fights touched`);

  return { filledWinners, fightsUpdated: result.fightsUpdated };
}
