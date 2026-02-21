/**
 * Live Tracker Configuration
 *
 * Simplified config: an event either has a scraper (scraperType) or it doesn't (null).
 * The lifecycle service handles all time-based status transitions.
 */

export type ScraperType = 'ufc' | 'matchroom' | 'oktagon' | 'onefc' | 'tapology';

/**
 * Scrapers that are production-ready and trusted to auto-publish results.
 * When a scraper is in this list, the lifecycle service skips that event
 * (the scraper handles fight completion directly).
 *
 * Add a scraper here only after thorough testing.
 */
export const PRODUCTION_SCRAPERS: ScraperType[] = ['ufc'];

/**
 * Check if a scraper type is production-ready (trusted to auto-publish).
 */
export function isProductionScraper(scraperType: string | null | undefined): boolean {
  if (!scraperType) return false;
  return (PRODUCTION_SCRAPERS as string[]).includes(scraperType);
}

/**
 * Get tracker type for a specific event.
 * Reads the scraperType field (renamed from trackerMode).
 */
export function getEventTrackerType(event: {
  scraperType?: string | null;
}): ScraperType | null {
  if (!event.scraperType) return null;
  return event.scraperType as ScraperType;
}

/**
 * Determine whether a scraper should auto-publish to published fields.
 * Only production-ready scrapers auto-publish.
 */
export function shouldAutoPublish(scraperType: string | null | undefined): boolean {
  return isProductionScraper(scraperType);
}

/**
 * Build the Prisma update data for a fight, writing to shadow fields always
 * and optionally to published fields if the scraper auto-publishes.
 *
 * @param publishedData - The data that would go to published fields
 * @param scraperType - The scraper type for the event (or null)
 * @returns Prisma update data object
 */
export function buildTrackerUpdateData(
  publishedData: {
    fightStatus?: string;
    winner?: string | null;
    method?: string | null;
    round?: number | null;
    time?: string | null;
    currentRound?: number | null;
    completedRounds?: number | null;
    [key: string]: any;
  },
  scraperType: string | null | undefined,
): Record<string, any> {
  const updateData: Record<string, any> = {};

  // Always write to shadow fields
  if (publishedData.fightStatus !== undefined) updateData.trackerFightStatus = publishedData.fightStatus;
  if (publishedData.winner !== undefined) updateData.trackerWinner = publishedData.winner;
  if (publishedData.method !== undefined) updateData.trackerMethod = publishedData.method;
  if (publishedData.round !== undefined) updateData.trackerRound = publishedData.round;
  if (publishedData.time !== undefined) updateData.trackerTime = publishedData.time;
  if (publishedData.currentRound !== undefined) updateData.trackerCurrentRound = publishedData.currentRound;
  if (publishedData.completedRounds !== undefined) updateData.trackerCompletedRounds = publishedData.completedRounds;
  updateData.trackerUpdatedAt = new Date();

  // In auto-publish mode, also write to published fields
  if (shouldAutoPublish(scraperType)) {
    Object.assign(updateData, publishedData);
  }

  return updateData;
}
