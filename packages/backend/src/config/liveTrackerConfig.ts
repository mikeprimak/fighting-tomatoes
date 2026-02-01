/**
 * Live Tracker Configuration
 *
 * Defines which promotions have real-time live event trackers vs
 * which should use time-based fallback for fight status updates.
 *
 * - Real-time trackers: Scrape live data, update fights individually (upcoming → live → complete)
 * - Time-based fallback: Mark all fights in a section as complete at section start time
 */

export type LiveTrackerType = 'ufc' | 'matchroom' | 'oktagon' | 'time-based' | 'manual';

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
