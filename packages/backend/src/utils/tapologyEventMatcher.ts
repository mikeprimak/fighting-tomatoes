/**
 * Tapology hub-page event matcher.
 *
 * Shared by the three Tapology URL-discovery paths (scraperService,
 * runTapologyLiveTracker, backfillTapologyResults). Picks which event link on
 * a promotion hub page corresponds to a DB event.
 *
 * The numeric guard exists because keyword matching alone cross-linked
 * numbered series events: "Rizin FF - Landmark Vol. 15" matched the slug
 * "rizin-landmark-13-in-fukuoka" ("15" was dropped by the length>2 word
 * filter, and "rizin"+"landmark" already scored 2). The wrong URL was then
 * persisted to event.ufcUrl and the results backfill imported Landmark 13's
 * entire card into Landmark 15 (user-reported, 2026-07-24).
 *
 * Guard rules, tuned against real prod URLs:
 * - CONFLICT-only: a link is rejected when it carries numbers that don't
 *   cover the event name's numbers. Links with no numbers at all stay
 *   eligible — Tapology often omits series numbers ("144122-zuffa-boxing"
 *   for Zuffa Boxing 10) or uses roman numerals ("mvp-showcase-ii").
 * - Roman numerals ii–xix in link tokens count as their numeric value.
 * - Keyword scoring counts event-name words in the slug AND the link's
 *   display name (so "McKenny vs. Oliha" disambiguates between several
 *   generic "zuffa-boxing" slugs), and requires a UNIQUE best candidate.
 */

export interface TapologyEventLink {
  name: string;
  url: string;
}

/** Whole-number tokens from arbitrary text ("Landmark Vol. 15" → ["15"]). */
function numericTokens(text: string): string[] {
  return (text.match(/\d+/g) || []).map(n => String(parseInt(n, 10)));
}

const ROMAN: Record<string, string> = {
  ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9',
  xi: '11', xii: '12', xiii: '13', xiv: '14', xv: '15', xvi: '16',
  xvii: '17', xviii: '18', xix: '19',
  // single-letter i/v/x are too ambiguous to treat as numerals
};

/**
 * Tokens from the Tapology slug, excluding the leading numeric page ID
 * ("/events/137827-rizin-landmark-13-in-fukuoka" → rizin, landmark, 13, in, fukuoka).
 * Roman-numeral tokens are normalized to digits.
 */
function slugTokens(url: string): string[] {
  const slug = url.toLowerCase().split('/').filter(Boolean).pop() || '';
  const parts = slug.split('-');
  if (parts.length > 1 && /^\d+$/.test(parts[0])) parts.shift(); // page ID
  return parts.map(p => {
    if (/^\d+$/.test(p)) return String(parseInt(p, 10));
    return ROMAN[p] ?? p;
  });
}

/**
 * Numeric guard: reject a link only when it carries numbers of its own that
 * fail to cover the event name's numbers ("Landmark 15" can never match a
 * "landmark-13" slug). Links with no numbers anywhere remain eligible.
 */
function numbersConflict(eventName: string, link: TapologyEventLink): boolean {
  const eventNums = numericTokens(eventName);
  if (eventNums.length === 0) return false;
  const linkNums = new Set([
    ...numericTokens(link.name),
    ...slugTokens(link.url).filter(t => /^\d+$/.test(t)),
  ]);
  if (linkNums.size === 0) return false;
  return !eventNums.every(n => linkNums.has(n));
}

/**
 * Pick the hub-page link matching a DB event name, or null when no candidate
 * is safe. Never returns a link whose numbers contradict the event name, and
 * never guesses between equally-scored candidates.
 */
export function matchTapologyEventLink(
  eventName: string,
  links: TapologyEventLink[],
): TapologyEventLink | null {
  const candidates = links.filter(l => !numbersConflict(eventName, l));
  if (candidates.length === 0) return null;

  // 1. Name inclusion either way
  const eventNameLower = eventName.toLowerCase();
  for (const link of candidates) {
    const linkNameLower = link.name.toLowerCase();
    if (eventNameLower.includes(linkNameLower) || linkNameLower.includes(eventNameLower)) {
      return link;
    }
  }

  // 2. Keyword scoring: event-name words (incl. numbers) found in the slug or
  //    the link's display name. Unique best candidate wins; ties are refused.
  const eventWords = eventNameLower
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 || /^\d+$/.test(w));
  let best: TapologyEventLink | null = null;
  let bestScore = 1; // require >= 2
  let tied = false;
  for (const link of candidates) {
    const haystack = `${link.url.toLowerCase()} ${link.name.toLowerCase()}`;
    const score = eventWords.filter(w => haystack.includes(w)).length;
    if (score > bestScore) {
      best = link;
      bestScore = score;
      tied = false;
    } else if (score === bestScore && best) {
      tied = true;
    }
  }
  if (best && !tied) return best;

  // 3. Single-link fallback (only when the hub listed exactly one event overall)
  if (links.length === 1 && candidates.length === 1) return candidates[0];

  return null;
}
