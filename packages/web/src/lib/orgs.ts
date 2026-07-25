/**
 * Web-side promotion registry for the /orgs/[org] hub pages (Own The SERPs
 * front-load #3, 2026-07-17). Mirrors the ACTIVE, user-visible subset of
 * packages/backend/src/config/promotionRegistry.ts — `promotion` must equal
 * that file's `canonicalPromotion` exactly (it feeds the events API
 * `promotions=` filter). The 5 boxing orgs were un-shelved 2026-07-21 (Tapology
 * live tracking verified on the VPS), so they now appear below. Note Top Rank's
 * canonical string is the un-normalized underscore form `TOP_RANK` — that's the
 * value the events carry, so the filter uses it verbatim while `name` shows the
 * display label.
 */

/** Sport bucket for sport-facet schedule hubs (/schedule/boxing). 'other'
 *  covers hybrids and one-offs (karate, wrestling, Dirty Boxing rules). */
export type OrgSport = 'mma' | 'boxing' | 'bareknuckle' | 'other';

export interface OrgInfo {
  /** URL slug: /orgs/<slug> */
  slug: string;
  /** Exact Event.promotion string (canonicalPromotion in the backend registry). */
  promotion: string;
  /** Display name. */
  name: string;
  sport: OrgSport;
}

export const ORGS: OrgInfo[] = [
  { slug: 'ufc', promotion: 'UFC', name: 'UFC', sport: 'mma' },
  { slug: 'bkfc', promotion: 'BKFC', name: 'BKFC', sport: 'bareknuckle' },
  { slug: 'one', promotion: 'ONE', name: 'ONE Championship', sport: 'mma' },
  { slug: 'pfl', promotion: 'PFL', name: 'PFL', sport: 'mma' },
  { slug: 'oktagon', promotion: 'OKTAGON', name: 'Oktagon MMA', sport: 'mma' },
  { slug: 'rizin', promotion: 'RIZIN', name: 'RIZIN', sport: 'mma' },
  { slug: 'karate-combat', promotion: 'Karate Combat', name: 'Karate Combat', sport: 'other' },
  { slug: 'dirty-boxing', promotion: 'Dirty Boxing', name: 'Dirty Boxing', sport: 'other' },
  { slug: 'mvp', promotion: 'MVP', name: 'MVP (Most Valuable Promotions)', sport: 'boxing' },
  { slug: 'raf', promotion: 'RAF', name: 'RAF Wrestling', sport: 'other' },
  { slug: 'gamebred', promotion: 'Gamebred', name: 'Gamebred Fighting Championship', sport: 'mma' },
  // Boxing (un-shelved 2026-07-21).
  { slug: 'zuffa-boxing', promotion: 'Zuffa Boxing', name: 'Zuffa Boxing', sport: 'boxing' },
  { slug: 'top-rank', promotion: 'TOP_RANK', name: 'Top Rank', sport: 'boxing' },
  { slug: 'golden-boy', promotion: 'Golden Boy', name: 'Golden Boy', sport: 'boxing' },
  { slug: 'gold-star', promotion: 'Gold Star', name: 'Gold Star', sport: 'boxing' },
  { slug: 'matchroom', promotion: 'Matchroom Boxing', name: 'Matchroom Boxing', sport: 'boxing' },
];

export function orgBySlug(slug: string): OrgInfo | undefined {
  return ORGS.find((o) => o.slug === slug.toLowerCase());
}

export function orgByPromotion(promotion: string | undefined | null): OrgInfo | undefined {
  if (!promotion) return undefined;
  const p = promotion.toLowerCase();
  return ORGS.find((o) => o.promotion.toLowerCase() === p);
}
