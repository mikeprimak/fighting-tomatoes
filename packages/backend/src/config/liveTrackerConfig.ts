/**
 * Live Tracker Configuration
 *
 * Defines which promotions have real-time live event trackers vs
 * which should use time-based fallback for fight status updates.
 *
 * - Real-time trackers: Scrape live data, update fights individually (upcoming → live → complete)
 * - Time-based fallback: Mark all fights in a section as complete at section start time
 */

export type LiveTrackerType = 'ufc' | 'matchroom' | 'oktagon' | 'time-based' | 'manual' | 'live';

/**
 * Map of promotions to their tracker type.
 * - Real-time trackers (ufc, matchroom, oktagon): Scrape live data during events
 * - time-based: Auto-mark fights complete at section start times
 * - manual: No automatic updates - admin manually enters results
 */
export const PROMOTION_TRACKER_CONFIG: Record<string, LiveTrackerType> = {
  // UFC: Live tracking moved to GitHub Actions (Render IPs are blocked by UFC.com)
  // The ufc-live-tracker.yml workflow runs every 5 minutes during events
  // Time-based fallback remains active as backup on Render
  'UFC': 'time-based',
  'Matchroom': 'matchroom',
  'Matchroom Boxing': 'matchroom',
  'OKTAGON': 'oktagon',
  'OKTAGON MMA': 'oktagon',

  // Manual mode - no automatic updates, admin enters results
  'Zuffa Boxing': 'manual',

  // All others (BKFC, PFL, ONE, Golden Boy, Top Rank, etc.) will fall through
  // to 'time-based' by default
};

/**
 * Get the tracker type for a given promotion.
 * Returns 'time-based' for unknown or null promotions.
 */
export function getTrackerType(promotion: string | null): LiveTrackerType {
  if (!promotion) return 'time-based';

  // Check exact match first
  if (PROMOTION_TRACKER_CONFIG[promotion]) {
    return PROMOTION_TRACKER_CONFIG[promotion];
  }

  // Check partial matches (case-insensitive)
  const p = promotion.toLowerCase();
  if (p.includes('matchroom')) return 'matchroom';
  if (p.includes('oktagon')) return 'oktagon';

  // Default to time-based fallback
  return 'time-based';
}

/**
 * Get tracker type for a specific event.
 * Checks event-level override first, then falls back to promotion config.
 *
 * Use this when you have the full event object.
 */
export function getEventTrackerType(event: {
  trackerMode?: string | null;
  promotion: string | null;
}): LiveTrackerType {
  // Event-level override takes priority
  if (event.trackerMode) {
    // Validate and return event-level mode
    if (event.trackerMode === 'manual') return 'manual';
    if (event.trackerMode === 'time-based') return 'time-based';
    if (event.trackerMode === 'ufc') return 'ufc';
    if (event.trackerMode === 'matchroom') return 'matchroom';
    if (event.trackerMode === 'oktagon') return 'oktagon';
    // If trackerMode is set to something like 'live', use promotion's default tracker
    if (event.trackerMode === 'live') {
      return getTrackerType(event.promotion);
    }
  }

  // Fall back to promotion-level config
  return getTrackerType(event.promotion);
}

/**
 * Check if a promotion has a real-time live tracker.
 */
export function hasRealTimeTracker(promotion: string | null): boolean {
  return getTrackerType(promotion) !== 'time-based';
}

/**
 * Determine whether a tracker mode should auto-publish to published fields.
 * In 'live' mode (or its promotion-specific equivalents), trackers write to both
 * shadow fields AND published fields. In manual/time-based mode, trackers only
 * write to shadow fields, and admin must publish manually.
 */
export function shouldAutoPublish(trackerMode: LiveTrackerType): boolean {
  // These modes auto-publish: the tracker is trusted to write directly
  return ['ufc', 'matchroom', 'oktagon', 'live'].includes(trackerMode);
}

/**
 * Build the Prisma update data for a fight, writing to shadow fields always
 * and optionally to published fields if the tracker mode auto-publishes.
 *
 * @param publishedData - The data that would go to published fields (hasStarted, isComplete, winner, method, round, time, currentRound, completedRounds)
 * @param trackerMode - The effective tracker mode for the event
 * @returns Prisma update data object
 */
export function buildTrackerUpdateData(
  publishedData: {
    hasStarted?: boolean;
    isComplete?: boolean;
    winner?: string | null;
    method?: string | null;
    round?: number | null;
    time?: string | null;
    currentRound?: number | null;
    completedRounds?: number | null;
    [key: string]: any; // allow extra fields like orderOnCard, completionMethod
  },
  trackerMode: LiveTrackerType
): Record<string, any> {
  const updateData: Record<string, any> = {};

  // Always write to shadow fields
  if (publishedData.hasStarted !== undefined) updateData.trackerHasStarted = publishedData.hasStarted;
  if (publishedData.isComplete !== undefined) updateData.trackerIsComplete = publishedData.isComplete;
  if (publishedData.winner !== undefined) updateData.trackerWinner = publishedData.winner;
  if (publishedData.method !== undefined) updateData.trackerMethod = publishedData.method;
  if (publishedData.round !== undefined) updateData.trackerRound = publishedData.round;
  if (publishedData.time !== undefined) updateData.trackerTime = publishedData.time;
  if (publishedData.currentRound !== undefined) updateData.trackerCurrentRound = publishedData.currentRound;
  if (publishedData.completedRounds !== undefined) updateData.trackerCompletedRounds = publishedData.completedRounds;
  updateData.trackerUpdatedAt = new Date();

  // In auto-publish modes, also write to published fields
  if (shouldAutoPublish(trackerMode)) {
    // Copy all the original data (includes hasStarted, isComplete, winner, etc.)
    Object.assign(updateData, publishedData);
  }

  return updateData;
}

/**
 * Get list of all promotions that use time-based fallback.
 * Useful for logging and debugging.
 */
export const TIME_BASED_PROMOTIONS = [
  'BKFC',
  'PFL',
  'ONE',
  'ONE Championship',
  'Golden Boy',
  'Golden Boy Promotions',
  'Top Rank',
  'Top Rank Boxing',
  'Bellator',
  // Add more as needed
];
