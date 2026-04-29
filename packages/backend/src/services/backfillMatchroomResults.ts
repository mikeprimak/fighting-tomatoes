/**
 * Matchroom Results Backfill Wrapper
 *
 * Reuses the production live scraper + live parser to retroactively fill in
 * missing winners/methods on completed Matchroom-native events.
 *
 * Note: this covers Matchroom events whose `scraperType` is 'matchroom'.
 * Matchroom cards that flow through Tapology are handled by the older
 * tapology-backfill.yml workflow, not here.
 */

import { PrismaClient } from '@prisma/client';
import MatchroomLiveScraper from './matchroomLiveScraper';
import { parseMatchroomLiveData } from './matchroomLiveParser';

export interface BackfillMatchroomEvent {
  id: string;
  name: string;
  ufcUrl: string | null;  // Matchroom event URL is stored in the same column
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

export async function backfillMatchroomResults(
  prisma: PrismaClient,
  event: BackfillMatchroomEvent
): Promise<BackfillResult> {
  if (!event.ufcUrl) {
    console.log(`  [backfill-matchroom] No event URL on ${event.name}, skipping`);
    return { filledWinners: 0, fightsUpdated: 0 };
  }

  console.log(`  [backfill-matchroom] Scraping ${event.ufcUrl}`);
  const scraper = new MatchroomLiveScraper(event.ufcUrl);
  const scrapedData = await scraper.scrape();

  console.log(`  [backfill-matchroom] Parsed ${scrapedData.fights.length} scraped fights`);

  const nullWinnersBefore = await countNullWinners(prisma, event.id);

  const result = await parseMatchroomLiveData(scrapedData, event.id, {
    nullOnlyResults: true,
    skipNotifications: true,
    completionMethodOverride: 'backfill-matchroom',
  });

  const nullWinnersAfter = await countNullWinners(prisma, event.id);
  const filledWinners = Math.max(0, nullWinnersBefore - nullWinnersAfter);

  console.log(`  [backfill-matchroom] parser: ${result.fightsUpdated} fights touched`);

  return { filledWinners, fightsUpdated: result.fightsUpdated };
}
