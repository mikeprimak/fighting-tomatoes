// Shared cancellation guards for daily promotion-data parsers.
//
// Background: parsers run on a daily cadence and compare DB state to the
// scraped snapshot. When something is "missing" from the scrape, the naive
// reaction is to mark it CANCELLED — but transient site issues (Cloudflare
// blip, partial render, JA3 throttle) can drop a high-profile fight or even
// a whole event from a single scrape. UFC 328 (Chimaev vs Strickland) was
// wrongly cancelled by exactly this failure mode in May 2026.
//
// Three guards live here:
//
//   1. MIN_SCRAPED_EVENTS_FOR_CANCEL — global sanity floor. If the scrape
//      returned fewer events than this for the promotion's upcoming page,
//      the page was probably broken; skip ALL cancellation passes.
//
//   2. CANCELLATION_STRIKE_THRESHOLD — two-strike rule. Each parser tracks
//      consecutive missing scrapes per Event/Fight in the `missingScrapeCount`
//      column. Cancel only after this many consecutive misses; otherwise just
//      bump the strike counter. Resets to 0 when the row reappears.
//
//   3. Per-event cancellation gate (`computeCancellationSafetyFloor` +
//      `isScrapeHealthyForCancellation`). Per-event partial-render protection:
//      authorize the cancellation pass only when the scrape returns either
//      ≥75% of the DB's non-cancelled fight count OR ≥MIN_HEALTHY_SCRAPE_FIGHTS
//      absolute. The absolute floor breaks a chicken-and-egg loop: if a DB
//      accumulates orphan fights (e.g. from a pre-2026-05-03 cross-event merge),
//      the percentage floor becomes unreachable forever and orphans never get
//      cleaned. The Gold Star Glory in Giza event hit this on 2026-05-22 — 11
//      phantom fights kept the percentage floor at ~16 against a real card of
//      10, so cancellation never fired.

export const CANCELLATION_STRIKE_THRESHOLD = 2;
export const MIN_SCRAPED_EVENTS_FOR_CANCEL = 3;

// Absolute floor for the per-event cancellation gate. A scrape returning at
// least this many fights is treated as healthy regardless of DB inflation.
// Lower than typical fight-card sizes (8–15) so small genuine cards still pass,
// but high enough that a partial render dropping half the card won't pass.
// Two-strike rule still mitigates single-render misses past this floor.
export const MIN_HEALTHY_SCRAPE_FIGHTS = 5;

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

/**
 * Percentage-based floor for the per-event cancellation gate. The scrape
 * must return at least this many fights to be considered "complete enough"
 * to authorize cancelling missing fights on this event.
 *
 * Use together with `isScrapeHealthyForCancellation` — the absolute floor
 * (`MIN_HEALTHY_SCRAPE_FIGHTS`) breaks the chicken-and-egg loop when the
 * percentage floor is unreachable due to orphan-inflated DB counts.
 */
export function computeCancellationSafetyFloor(dbNonCancelledCount: number): number {
  return Math.max(2, Math.floor(dbNonCancelledCount * 0.75));
}

/**
 * Per-event cancellation gate. Returns true when the scrape size is large
 * enough to trust the cancellation pass — either ≥75% of DB count, or ≥
 * MIN_HEALTHY_SCRAPE_FIGHTS in absolute terms.
 *
 * The absolute fallback exists to recover from orphan-pollution: when a DB
 * accumulates phantom fights (cross-event merges, stale imports), the 75%
 * floor becomes unreachable and cancellation never runs. The absolute floor
 * caps that runaway: any scrape of MIN_HEALTHY_SCRAPE_FIGHTS+ fights is a
 * healthy signal that the source is working, regardless of DB state.
 */
export function isScrapeHealthyForCancellation(
  scrapeSize: number,
  dbNonCancelledCount: number,
): boolean {
  if (dbNonCancelledCount === 0) return true; // nothing to cancel anyway
  const percentageFloor = computeCancellationSafetyFloor(dbNonCancelledCount);
  return scrapeSize >= percentageFloor || scrapeSize >= MIN_HEALTHY_SCRAPE_FIGHTS;
}
