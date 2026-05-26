/**
 * Tapology fight-card extraction — shared selectors (single source of truth).
 *
 * WHY THIS EXISTS
 * Tapology event pages render bouts that are NOT part of the event:
 * related-fight widgets, fighters' other-bout panels, co-promotion cross-links.
 * Those bleed bouts use the SAME `<li class="border-b">` markup as real card
 * rows, so the old page-wide `document.querySelectorAll('li.border-b')`
 * extraction hoovered them up and attached them to the wrong event — months of
 * duplicate / phantom fight rows. The `nav/header/footer/aside` exclusion was
 * insufficient because Tapology renders related bouts INSIDE `#main`.
 *
 * THE FIX
 * Scope extraction to the event's own bout-list container. Tapology wraps the
 * real card in a Stimulus-targeted list:
 *     <ul data-event-view-toggle-target="list"> … one <li> per bout … </ul>
 * The `data-event-view-toggle-target` attribute is a semantic Stimulus target
 * (the view-toggle controller switches list / very-compact views), so it is
 * far more stable than Tailwind utility classes. There is exactly ONE such
 * <ul> per event page, and it contains ONLY that event's bouts. Related/sidebar
 * bouts live outside it and are excluded.
 *
 * FAIL CLOSED, NOT OPEN
 * If the container can't be found (Tapology changes layout), callers must
 * extract ZERO fights and log loudly — never fall back to page-wide. A missed
 * scrape is recoverable (re-run); a polluted one is corrective database work.
 *
 * These constants are imported by all `scrape*Tapology.js` daily scrapers and
 * passed into `page.evaluate(...)` as arguments (closures don't survive
 * serialization into the browser context, so they can't be referenced directly
 * inside the evaluate callback). The fixture test
 * (`tapologyFightExtraction.test.ts`) imports the same constants so the selector
 * can never drift between the scrapers and the test.
 *
 * See docs/plans/tapology-fight-bleed-hardening-2026-05-26.md and
 * docs/areas/scrapers.md.
 */

// The <ul> that holds ONLY this event's bout rows.
const FIGHT_CARD_CONTAINER_SELECTOR = 'ul[data-event-view-toggle-target="list"]';

// One <li> per bout WITHIN the container above.
const FIGHT_ROW_SELECTOR = 'li.border-b, li[class*="border-b"]';

module.exports = {
  FIGHT_CARD_CONTAINER_SELECTOR,
  FIGHT_ROW_SELECTOR,
};
