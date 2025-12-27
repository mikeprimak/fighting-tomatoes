/**
 * Live Tracker Configuration
 *
 * Defines which promotions have real-time live event trackers vs
 * which should use time-based fallback for fight status updates.
 *
 * - Real-time trackers: Scrape live data, update fights individually (upcoming → live → complete)
 * - Time-based fallback: Mark all fights in a section as complete at section start time
 */

export type LiveTrackerType = 'ufc' | 'matchroom' | 'oktagon' | 'time-based';

/**
 * Map of promotions to their tracker type.
 * Only promotions with confirmed working live trackers are listed here.
 * All unlisted promotions default to 'time-based' fallback.
 */
export const PROMOTION_TRACKER_CONFIG: Record<string, LiveTrackerType> = {
  // Real-time live trackers
  'UFC': 'ufc',
  'Matchroom': 'matchroom',
  'Matchroom Boxing': 'matchroom',
  'OKTAGON': 'oktagon',
  'OKTAGON MMA': 'oktagon',

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
 * Check if a promotion has a real-time live tracker.
 */
export function hasRealTimeTracker(promotion: string | null): boolean {
  return getTrackerType(promotion) !== 'time-based';
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
