/**
 * Oktagon Results Backfill Wrapper
 *
 * Reuses the production live scraper + live parser to retroactively fill in
 * missing winners/methods on completed Oktagon events.
 *
 * Oktagon's scraper takes a slug (e.g. "oktagon-85-hamburg"), not a URL.
 * We extract the slug from the event's stored URL the same way the live
 * tracker does (see runOktagonLiveTracker.getOktagonSlug).
 */

import { PrismaClient } from '@prisma/client';
import OktagonLiveScraper from './oktagonLiveScraper';
import { parseOktagonLiveData } from './oktagonLiveParser';

export interface BackfillOktagonEvent {
  id: string;
  name: string;
  ufcUrl: string | null;
}

export interface BackfillResult {
  filledWinners: number;
  fightsUpdated: number;
}

function extractOktagonSlug(eventUrl: string | null): string | null {
  if (!eventUrl) return null;
  // e.g. "https://oktagonmma.com/en/events/oktagon-85-hamburg/?eventDetail=true" -> "oktagon-85-hamburg"
  const match = eventUrl.match(/events\/([^/?]+)/);
  return match ? match[1] : null;
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

export async function backfillOktagonResults(
  prisma: PrismaClient,
  event: BackfillOktagonEvent
): Promise<BackfillResult> {
  const slug = extractOktagonSlug(event.ufcUrl);
  if (!slug) {
    console.log(`  [backfill-oktagon] No slug extractable from ${event.ufcUrl ?? '(null)'}, skipping`);
    return { filledWinners: 0, fightsUpdated: 0 };
  }

  console.log(`  [backfill-oktagon] Slug: ${slug}`);
  const scraper = new OktagonLiveScraper(slug);
  const scrapedData = await scraper.scrape();

  console.log(`  [backfill-oktagon] Parsed ${scrapedData.fights.length} scraped fights`);

  const nullWinnersBefore = await countNullWinners(prisma, event.id);

  const result = await parseOktagonLiveData(scrapedData, event.id, {
    nullOnlyResults: true,
    skipCancellationCheck: true,
    skipNotifications: true,
    skipStaleLiveReset: true,
    completionMethodOverride: 'backfill-oktagon',
  });

  const nullWinnersAfter = await countNullWinners(prisma, event.id);
  const filledWinners = Math.max(0, nullWinnersBefore - nullWinnersAfter);

  console.log(`  [backfill-oktagon] parser: ${result.fightsUpdated} fights touched`);

  return { filledWinners, fightsUpdated: result.fightsUpdated };
}
