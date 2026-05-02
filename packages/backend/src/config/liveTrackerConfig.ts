/**
 * Live Tracker Configuration
 *
 * Simplified config: an event either has a scraper (scraperType) or it doesn't (null).
 * The lifecycle service handles all time-based status transitions.
 */

export type ScraperType = 'ufc' | 'matchroom' | 'oktagon' | 'onefc' | 'tapology' | 'bkfc' | 'raf';

/**
 * Opt-in flags passed by the retroactive backfill (`backfillResults.ts`) to
 * each per-org live parser. Defaults preserve the live tracker's existing
 * behavior; only the backfill orchestrator enables them.
 *
 * Per-parser support is incremental — the UFC and BKFC parsers honor these
 * today. Other parsers ignore unknown flags safely until they're plumbed
 * through.
 */
export interface BackfillOptions {
  /** Only write winner/method/round/time when the DB value is currently NULL.
   *  Backfill must never overwrite manual fixes or live-tracker results. */
  nullOnlyResults?: boolean;
  /** Skip the CANCELLED↔UPCOMING reconciliation pass. Backfill runs days
   *  after the event; the live source may have shifted the card and we don't
   *  want to retroactively cancel real fights. */
  skipCancellationCheck?: boolean;
  /** Suppress next-fight push notifications when a fight flips to COMPLETED.
   *  Backfill is processing past events; users shouldn't be paged. */
  skipNotifications?: boolean;
  /** Skip the live-tracker self-healing status downgrade passes (BKFC's
   *  "reset stale LIVE -> UPCOMING", Oktagon's "lifecycle-completed-with-no-
   *  winner -> UPCOMING", etc.). Backfill must not retroactively downgrade a
   *  fight's status based on a stale source page; if any fight needs that, a
   *  human should investigate. */
  skipStaleLiveReset?: boolean;
  /** When set (e.g. "backfill-ufc"), stamp this onto Fight.completionMethod
   *  and set Fight.completedAt = now() for any fight whose status flips to
   *  COMPLETED on this run. Audit trail. */
  completionMethodOverride?: string;
}

/**
 * All scraper types that can be toggled "production" via the admin panel.
 * The actual production-ready set is read from SystemConfig at runtime
 * (key: 'production_scrapers').
 */
export const ALL_SCRAPER_TYPES: ScraperType[] = ['ufc', 'matchroom', 'oktagon', 'onefc', 'tapology', 'bkfc', 'raf'];

/**
 * Default production scrapers — used when SystemConfig has no entry yet
 * (first boot before admin has saved any toggles). Matches the historical
 * hardcoded list minus tapology and raf, which the admin opted out of.
 */
const DEFAULT_PRODUCTION_SCRAPERS: ScraperType[] = ['ufc', 'oktagon', 'bkfc', 'onefc'];

/**
 * In-memory cache. Read synchronously by isProductionScraper() across the
 * codebase. Populated from SystemConfig on boot and refreshed every 60s
 * (or immediately when the admin toggles a scraper).
 */
let _productionScrapersCache: ScraperType[] = [...DEFAULT_PRODUCTION_SCRAPERS];

/**
 * Refresh the production-scrapers cache from SystemConfig. Call on boot,
 * periodically, and right after the admin endpoint writes a new value.
 * Falls back to the existing cache on error so we never go to "no scrapers."
 */
export async function refreshProductionScrapersCache(prisma: any): Promise<ScraperType[]> {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: 'production_scrapers' } });
    if (config?.value && Array.isArray(config.value)) {
      _productionScrapersCache = (config.value as string[]).filter(
        (s): s is ScraperType => (ALL_SCRAPER_TYPES as string[]).includes(s),
      );
    }
    return _productionScrapersCache;
  } catch (err) {
    console.error('[liveTrackerConfig] Failed to refresh production scrapers cache:', err);
    return _productionScrapersCache;
  }
}

/**
 * Synchronous accessor for callers that need the current list (e.g. admin GET).
 */
export function getProductionScrapers(): ScraperType[] {
  return [..._productionScrapersCache];
}

/**
 * Check if a scraper type is production-ready (trusted to auto-publish).
 */
export function isProductionScraper(scraperType: string | null | undefined): boolean {
  if (!scraperType) return false;
  return (_productionScrapersCache as string[]).includes(scraperType);
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
 * Cache for notify-allowed promotions (loaded from DB).
 * Refreshed every 60 seconds to avoid hitting DB on every request.
 */
let _notifyPromotionsCache: string[] | null = null;
let _notifyPromotionsCacheTime = 0;
const CACHE_TTL_MS = 60_000;

export async function getNotifyPromotions(prisma: any): Promise<string[]> {
  const now = Date.now();
  if (_notifyPromotionsCache && (now - _notifyPromotionsCacheTime) < CACHE_TTL_MS) {
    return _notifyPromotionsCache;
  }
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: 'notify_promotions' } });
    _notifyPromotionsCache = (config?.value as string[]) || [];
    _notifyPromotionsCacheTime = now;
    return _notifyPromotionsCache;
  } catch {
    return _notifyPromotionsCache || [];
  }
}

export function invalidateNotifyPromotionsCache() {
  _notifyPromotionsCache = null;
  _notifyPromotionsCacheTime = 0;
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
