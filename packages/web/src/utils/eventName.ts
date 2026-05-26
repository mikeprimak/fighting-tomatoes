/**
 * Event-name display helpers — ported from the mobile app's
 * `components/fight-cards/shared/utils.ts` so web and mobile prefix the org
 * identically.
 *
 * Most promotions bake their org into the event name ("UFC 328",
 * "OKTAGON 93: Brno"). A few (e.g. Matchroom Boxing, MVP) name events after the
 * headliners, leaving the org invisible on the banner. `normalizeEventName`
 * prepends the formatted promotion to any name that doesn't already contain it.
 */

// Known acronyms that should stay uppercase when formatting a promotion name.
const ACRONYMS = ['UFC', 'PFL', 'ONE', 'BKFC', 'RIZIN', 'OKTAGON', 'MVP', 'PBC', 'DAZN', 'ESPN'];

/** "TOP_RANK" -> "Top Rank", "GOLDEN_BOY" -> "Golden Boy"; preserves acronyms. */
export function formatPromotionName(promotion: string): string {
  return promotion
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.includes(upper)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Ensure the event name leads with its promotion. Legacy / headliner-named
 * events ("321", "Eubank vs Benn") become "UFC 321", "Matchroom Boxing Eubank
 * vs Benn". Names that already reference the org are returned unchanged.
 */
export function normalizeEventName(eventName?: string | null, promotion?: string | null): string {
  if (!eventName || !promotion) return eventName ?? '';

  const nameLower = eventName.toLowerCase();
  const promoLower = promotion.toLowerCase();

  // Already contains the full promotion string.
  if (nameLower.includes(promoLower)) return eventName;

  // Multi-word promotions like "Matchroom Boxing" — also accept a first-word match.
  const promoFirstWord = promoLower.split(' ')[0];
  if (promoFirstWord.length > 2 && nameLower.startsWith(promoFirstWord)) return eventName;

  return `${formatPromotionName(promotion)} ${eventName}`;
}
