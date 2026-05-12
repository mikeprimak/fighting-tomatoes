/**
 * Promotion Registry — single source of truth for the 14 canonical orgs (+ Matchroom hidden).
 *
 * Adding a new org should be one edit here plus the things that genuinely
 * cannot be derived (scraper code, parser code, logo asset, GitHub workflow).
 * See `docs/playbooks/onboard-new-promotion.md`.
 *
 * Touch points absorbed by this registry:
 *   - liveTrackerConfig.ts: TAPOLOGY_RELIABLE_PROMOTIONS_UPPER (set)
 *   - runTapologyLiveTracker.ts: TAPOLOGY_PROMOTION_HUBS
 *   - backfillTapologyResults.ts: TAPOLOGY_PROMOTION_HUBS (duplicate)
 *   - admin.html: ALL_PROMOTIONS_FOR_NOTIFY (via /admin/config/promotions endpoint, future)
 *   - mobile OrgFilterContext, web orgFilter (via /api/promotions endpoint, future)
 */

import type { ScraperType } from './liveTrackerConfig';

export type PromotionCode =
  | 'UFC'
  | 'PFL'
  | 'ONE'
  | 'BKFC'
  | 'OKTAGON'
  | 'RIZIN'
  | 'KARATE_COMBAT'
  | 'DIRTY_BOXING'
  | 'ZUFFA_BOXING'
  | 'TOP_RANK'
  | 'GOLDEN_BOY'
  | 'GOLD_STAR'
  | 'MVP'
  | 'RAF'
  | 'GAMEBRED'
  | 'MATCHROOM';

export interface TapologyHub {
  url: string;
  slugFilter: string[];
  scopeSelector?: string;
}

export interface PromotionRegistryEntry {
  /** Stable UPPER_SNAKE key. Never changes. */
  code: PromotionCode;

  /** The string parsers write to Event.promotion. Single source of truth. */
  canonicalPromotion: string;

  /** Short label for filter pills (mobile/web). Matches the all-caps style of the existing ORGANIZATIONS arrays. */
  shortLabel: string;

  /** Full official name shown in admin event-edit form + notification grid. */
  fullLabel: string;

  /** Primary scraper type for this promotion. */
  scraperType: ScraperType;

  /**
   * True when the live tracker delivers reliable per-fight updates.
   * - Non-tapology scraperTypes (ufc, bkfc, onefc, oktagon, matchroom, pfl, raf): true.
   * - Tapology-tracked: only true for the subset whose hub layout is consistent
   *   enough for our parser. Top Rank / Golden Boy / Gold Star / MVP fall back
   *   to the section-start ping.
   */
  hasReliableLiveTracker: boolean;

  /** Logo identifier — both mobile and web map this to their bundled assets. */
  logoKey: string;

  /** Whether the promotion appears in user-facing event filters. false = HIDDEN_ORGS. */
  userVisible: boolean;

  /** Whether the bell toggle should be offered for this promotion. */
  notificationEligible: boolean;

  /** Tapology hub config — required for any promotion whose live tracking goes through Tapology. */
  tapologyHub?: TapologyHub;

  /** Legacy promotion strings the parsers may have written historically.
   *  Used by canonicalizePromotion() and the one-shot DB normalization. */
  aliases: string[];
}

export const PROMOTION_REGISTRY: PromotionRegistryEntry[] = [
  {
    code: 'UFC',
    canonicalPromotion: 'UFC',
    shortLabel: 'UFC',
    fullLabel: 'UFC',
    scraperType: 'ufc',
    hasReliableLiveTracker: true,
    logoKey: 'ufc',
    userVisible: true,
    notificationEligible: true,
    aliases: [],
  },
  {
    code: 'PFL',
    canonicalPromotion: 'PFL',
    shortLabel: 'PFL',
    fullLabel: 'PFL',
    scraperType: 'pfl',
    hasReliableLiveTracker: true,
    logoKey: 'pfl',
    userVisible: true,
    notificationEligible: true,
    aliases: [],
  },
  {
    code: 'ONE',
    canonicalPromotion: 'ONE',
    shortLabel: 'ONE',
    fullLabel: 'ONE Championship',
    scraperType: 'onefc',
    hasReliableLiveTracker: true,
    logoKey: 'one',
    userVisible: true,
    notificationEligible: true,
    aliases: [],
  },
  {
    code: 'BKFC',
    canonicalPromotion: 'BKFC',
    shortLabel: 'BKFC',
    fullLabel: 'BKFC',
    scraperType: 'bkfc',
    hasReliableLiveTracker: true,
    logoKey: 'bkfc',
    userVisible: true,
    notificationEligible: true,
    aliases: [],
  },
  {
    code: 'OKTAGON',
    canonicalPromotion: 'OKTAGON',
    shortLabel: 'OKTAGON',
    fullLabel: 'Oktagon MMA',
    scraperType: 'oktagon',
    hasReliableLiveTracker: true,
    logoKey: 'oktagon',
    userVisible: true,
    notificationEligible: true,
    aliases: [],
  },
  {
    code: 'RIZIN',
    canonicalPromotion: 'RIZIN',
    shortLabel: 'RIZIN',
    fullLabel: 'RIZIN',
    scraperType: 'tapology',
    hasReliableLiveTracker: false,
    logoKey: 'rizin',
    userVisible: true,
    notificationEligible: true,
    tapologyHub: {
      url: 'https://www.tapology.com/fightcenter/promotions/1561-rizin-fighting-federation-rff',
      slugFilter: ['rizin'],
    },
    aliases: ['Rizin'],
  },
  {
    code: 'KARATE_COMBAT',
    canonicalPromotion: 'Karate Combat',
    shortLabel: 'KARATE COMBAT',
    fullLabel: 'Karate Combat',
    scraperType: 'tapology',
    hasReliableLiveTracker: false,
    logoKey: 'karate_combat',
    userVisible: true,
    notificationEligible: true,
    tapologyHub: {
      url: 'https://www.tapology.com/fightcenter/promotions/3637-karate-combat-kc',
      slugFilter: ['karate-combat', 'kc-'],
    },
    aliases: ['KARATE_COMBAT', 'KARATE COMBAT'],
  },
  {
    code: 'DIRTY_BOXING',
    canonicalPromotion: 'Dirty Boxing',
    shortLabel: 'DIRTY BOXING',
    fullLabel: 'Dirty Boxing',
    scraperType: 'tapology',
    hasReliableLiveTracker: false,
    logoKey: 'dirty_boxing',
    userVisible: true,
    notificationEligible: true,
    tapologyHub: {
      url: 'https://www.tapology.com/fightcenter/promotions/5649-dirty-boxing-championship-dbc',
      slugFilter: ['dirty-boxing', 'dbx-', 'dbc-'],
    },
    aliases: ['DIRTY_BOXING', 'DBX', 'Dirty Boxing Championship'],
  },
  {
    code: 'ZUFFA_BOXING',
    canonicalPromotion: 'Zuffa Boxing',
    shortLabel: 'ZUFFA BOXING',
    fullLabel: 'Zuffa Boxing',
    scraperType: 'tapology',
    hasReliableLiveTracker: false,
    logoKey: 'zuffa_boxing',
    userVisible: true,
    notificationEligible: true,
    tapologyHub: {
      url: 'https://www.tapology.com/fightcenter/promotions/6299-zuffa-boxing-zb',
      slugFilter: ['zuffa'],
    },
    aliases: ['ZUFFA_BOXING', 'ZUFFA'],
  },
  {
    code: 'TOP_RANK',
    // Parser writes TOP_RANK; the underscore is the canonical form until the
    // one-shot DB normalization runs (step 5 of the registry rollout).
    canonicalPromotion: 'TOP_RANK',
    shortLabel: 'TOP RANK',
    fullLabel: 'Top Rank',
    scraperType: 'tapology',
    hasReliableLiveTracker: false,
    logoKey: 'top_rank',
    userVisible: true,
    notificationEligible: true,
    tapologyHub: {
      // Top Rank event URLs on Tapology are named by headliners (no "top-rank"
      // prefix), so a slug filter misses most cards. Use DOM scoping instead.
      url: 'https://www.tapology.com/fightcenter/promotions/2487-top-rank-tr',
      slugFilter: [],
      scopeSelector: '#content',
    },
    aliases: ['Top Rank', 'TOP RANK'],
  },
  {
    code: 'GOLDEN_BOY',
    canonicalPromotion: 'Golden Boy',
    shortLabel: 'GOLDEN BOY',
    fullLabel: 'Golden Boy',
    scraperType: 'tapology',
    hasReliableLiveTracker: false,
    logoKey: 'golden_boy',
    userVisible: true,
    notificationEligible: true,
    tapologyHub: {
      // Same pattern as Top Rank — event URLs use headliners, not the org slug.
      url: 'https://www.tapology.com/fightcenter/promotions/1979-golden-boy-promotions-gbp',
      slugFilter: [],
      scopeSelector: '#content',
    },
    aliases: ['GOLDEN_BOY', 'GOLDEN BOY'],
  },
  {
    code: 'GOLD_STAR',
    canonicalPromotion: 'Gold Star',
    shortLabel: 'GOLD STAR',
    fullLabel: 'Gold Star',
    scraperType: 'tapology',
    hasReliableLiveTracker: false,
    logoKey: 'gold_star',
    userVisible: true,
    notificationEligible: true,
    tapologyHub: {
      // Gold Star events use fighter-vs-fighter slugs with no org marker.
      // Scope to #content to exclude sidebar events from other promotions.
      url: 'https://www.tapology.com/fightcenter/promotions/6908-gold-star-promotions-gsp',
      slugFilter: [],
      scopeSelector: '#content',
    },
    aliases: ['GOLD_STAR', 'GOLD STAR'],
  },
  {
    code: 'MVP',
    canonicalPromotion: 'MVP',
    shortLabel: 'MVP',
    fullLabel: 'MVP',
    scraperType: 'tapology',
    hasReliableLiveTracker: false,
    logoKey: 'mvp',
    userVisible: true,
    notificationEligible: true,
    tapologyHub: {
      url: 'https://www.tapology.com/fightcenter/promotions/4040-most-valuable-promotions-mvp',
      slugFilter: ['mvp', 'most-valuable'],
    },
    aliases: ['Most Valuable', 'MOST VALUABLE', 'MVP Boxing', 'Most Valuable Promotions'],
  },
  {
    code: 'RAF',
    canonicalPromotion: 'RAF',
    shortLabel: 'RAF',
    fullLabel: 'RAF Wrestling',
    scraperType: 'raf',
    hasReliableLiveTracker: true,
    logoKey: 'raf',
    userVisible: true,
    notificationEligible: true,
    aliases: [],
  },
  {
    code: 'GAMEBRED',
    canonicalPromotion: 'Gamebred',
    shortLabel: 'GAMEBRED',
    fullLabel: 'Gamebred Fighting Championship',
    scraperType: 'tapology',
    // Conservative until we verify the hub event-page layout. With this false
    // the bell-toggle still works and delivers the section-start fallback ping.
    // Flip to true once the generic Tapology live tracker is confirmed against
    // a real Gamebred event hub.
    hasReliableLiveTracker: false,
    logoKey: 'gamebred',
    userVisible: true,
    notificationEligible: true,
    tapologyHub: {
      url: 'https://www.tapology.com/fightcenter/promotions/3931-gamebred-fighting-championship-gbfc',
      slugFilter: ['gamebred', 'gbfc'],
    },
    aliases: ['GAMEBRED', 'GBFC', 'Gamebred Fighting Championship'],
  },
  {
    code: 'MATCHROOM',
    canonicalPromotion: 'Matchroom Boxing',
    shortLabel: 'MATCHROOM',
    fullLabel: 'Matchroom Boxing',
    scraperType: 'matchroom',
    hasReliableLiveTracker: true,
    logoKey: 'matchroom',
    // Hidden from user-facing filters per existing HIDDEN_ORGS treatment in
    // mobile + web. Admin keeps the toggle since events are still scraped.
    userVisible: false,
    notificationEligible: true,
    tapologyHub: {
      url: 'https://www.tapology.com/fightcenter/promotions/2484-matchroom-boxing-mb',
      slugFilter: ['matchroom'],
    },
    aliases: ['Matchroom'],
  },
];

// ── Indexes for O(1) lookup ──────────────────────────────────────────────────

const _byCode = new Map<string, PromotionRegistryEntry>(
  PROMOTION_REGISTRY.map(e => [e.code, e]),
);

const _byCanonical = new Map<string, PromotionRegistryEntry>(
  PROMOTION_REGISTRY.map(e => [e.canonicalPromotion.toUpperCase(), e]),
);

const _byAlias = new Map<string, PromotionRegistryEntry>();
for (const entry of PROMOTION_REGISTRY) {
  for (const alias of entry.aliases) {
    _byAlias.set(alias.toUpperCase(), entry);
  }
}

// ── Lookups ──────────────────────────────────────────────────────────────────

export function getPromotionByCode(code: string): PromotionRegistryEntry | null {
  return _byCode.get(code) ?? null;
}

/**
 * Look up a registry entry by promotion string, matching canonical first then
 * aliases. Case-insensitive.
 */
export function getPromotionByName(promotion: string | null | undefined): PromotionRegistryEntry | null {
  if (!promotion) return null;
  const upper = promotion.toUpperCase();
  return _byCanonical.get(upper) ?? _byAlias.get(upper) ?? null;
}

/**
 * Normalize an arbitrary promotion string to its canonical form.
 * Returns the input unchanged if no registry entry matches — callers
 * decide whether to log/skip unknown promotions.
 */
export function canonicalizePromotion(rawPromotion: string | null | undefined): string {
  if (!rawPromotion) return rawPromotion ?? '';
  const entry = getPromotionByName(rawPromotion);
  return entry ? entry.canonicalPromotion : rawPromotion;
}

// ── Derived collections (consumed by existing helpers) ───────────────────────

/** Set of upper-cased promotion strings whose live tracker is reliable.
 *  Used by hasReliableLiveTracker() in liveTrackerConfig.ts. */
export const RELIABLE_LIVE_TRACKER_PROMOTIONS_UPPER: Set<string> = new Set(
  PROMOTION_REGISTRY
    .filter(e => e.hasReliableLiveTracker)
    .flatMap(e => [e.canonicalPromotion.toUpperCase(), ...e.aliases.map(a => a.toUpperCase())]),
);

/** Tapology hub map keyed by canonical promotion string.
 *  Used by runTapologyLiveTracker.ts and backfillTapologyResults.ts. */
export const TAPOLOGY_PROMOTION_HUBS: Record<string, TapologyHub> = Object.fromEntries(
  PROMOTION_REGISTRY
    .filter(e => e.tapologyHub)
    .map(e => [e.canonicalPromotion, e.tapologyHub!]),
);
