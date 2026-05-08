// Shared cancellation guards for daily promotion-data parsers.
//
// Background: parsers run on a daily cadence and compare DB state to the
// scraped snapshot. When something is "missing" from the scrape, the naive
// reaction is to mark it CANCELLED — but transient site issues (Cloudflare
// blip, partial render, JA3 throttle) can drop a high-profile fight or even
// a whole event from a single scrape. UFC 328 (Chimaev vs Strickland) was
// wrongly cancelled by exactly this failure mode in May 2026.
//
// Two guards live here:
//
//   1. MIN_SCRAPED_EVENTS_FOR_CANCEL — global sanity floor. If the scrape
//      returned fewer events than this for the promotion's upcoming page,
//      the page was probably broken; skip ALL cancellation passes.
//
//   2. CANCELLATION_STRIKE_THRESHOLD — two-strike rule. Each parser tracks
//      consecutive missing scrapes per Event/Fight in the `missingScrapeCount`
//      column. Cancel only after this many consecutive misses; otherwise just
//      bump the strike counter. Resets to 0 when the row reappears.

export const CANCELLATION_STRIKE_THRESHOLD = 2;
export const MIN_SCRAPED_EVENTS_FOR_CANCEL = 3;

export interface StrikeDecision {
  newCount: number;
  shouldCancel: boolean;
}

/**
 * Given the current strike count for a missing fight/event, return what
 * the new count should be and whether this scrape should escalate to
 * CANCELLED.
 */
export function decideStrike(currentCount: number | null | undefined): StrikeDecision {
  const newCount = (currentCount ?? 0) + 1;
  return {
    newCount,
    shouldCancel: newCount >= CANCELLATION_STRIKE_THRESHOLD,
  };
}
