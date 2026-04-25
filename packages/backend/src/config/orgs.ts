/**
 * Org Registry — Single Source of Truth for Combat Sports Organizations
 *
 * Every org touchpoint in the codebase should read from this registry rather than
 * hardcoding org names/scrapers/workflows. To add a new org, add an entry here and
 * run `pnpm verify:orgs` to confirm every derived export is consistent.
 *
 * PR 1 status: registry exists; the following call sites have been migrated to derive
 * from it (zero behavior change vs. pre-registry hardcoded values):
 *   - config/liveTrackerConfig.ts        (ScraperType, PRODUCTION_SCRAPERS)
 *   - config/hiddenPromotions.ts         (HIDDEN_PROMOTIONS)
 *   - services/dailyAllScrapers.ts       (SCRAPER_CONFIG, organizations[])
 *   - scraperService.ts                  (TAPOLOGY_PROMOTION_HUBS)
 *   - routes/admin.ts                    (scraperMap, scraperType zod enum)
 *   - routes/index.ts                    (ORG_FILTER_GROUPS)
 *
 * Still hardcoded (planned for follow-up PRs — see docs/areas/onboarding-new-org.md):
 *   - services/eventLifecycle.ts (3 inline workflowMap copies; one quirk preserved)
 *   - public/admin.html dropdowns (PR 2 — serve via API)
 *   - packages/web/src/lib/orgFilter.tsx (PR 3)
 *   - packages/mobile/store/OrgFilterContext.tsx (PR 4)
 *   - per-org parsers (hardcoded `promotion: '...'` strings)
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Lowercase scraper type identifier. Stored on `Event.scraperType` and used for
 * routing live trackers (VPS switch, GitHub Actions workflow dispatch).
 *
 * Multiple orgs can share a scraperType (e.g. PFL, RIZIN, Karate Combat all use
 * 'tapology' because they share the Tapology live tracker).
 */
export type ScraperType = 'ufc' | 'matchroom' | 'oktagon' | 'onefc' | 'tapology' | 'bkfc' | 'raf';

/**
 * UPPERCASE org key. Used internally as the registry primary key and as the
 * OrganizationType in dailyAllScrapers.ts.
 */
export type OrgKey =
  | 'UFC'
  | 'BKFC'
  | 'PFL'
  | 'ONEFC'
  | 'MATCHROOM'
  | 'GOLDENBOY'
  | 'GOLDSTAR'
  | 'TOPRANK'
  | 'OKTAGON'
  | 'RIZIN'
  | 'ZUFFA_BOXING'
  | 'DIRTY_BOXING'
  | 'KARATE_COMBAT'
  | 'MVP'
  | 'RAF';

export interface DailyScraperConfig {
  /** JS file in src/services (executed via `node`). */
  scraperFile: string;
  /** Function name exported from the parser module — referenced for documentation. */
  importFnName: string;
  /** Timeout for the scraper subprocess. */
  timeoutMs: number;
}

export interface TapologyHubConfig {
  /** Display key used in TAPOLOGY_PROMOTION_HUBS lookup (matches `event.promotion` strings). */
  hubKey: string;
  url: string;
  slugFilter: string[];
  scopeSelector?: string;
}

export interface OrgDefinition {
  /** Registry primary key (UPPERCASE). */
  key: OrgKey;

  /** Lowercase scraper type written to `event.scraperType` (null = no live tracker). */
  scraperType: ScraperType | null;

  /** True iff this scraperType is in PRODUCTION_SCRAPERS (auto-publishes results). */
  isProductionScraper: boolean;

  /** Canonical value parsers should set for `event.promotion`. */
  dbPromotion: string;

  /** Short display name (used in admin & filters). */
  displayName: string;

  /** Long display name (used in admin select option text). */
  longDisplayName: string;

  /** Daily scraper config — undefined for orgs that don't use the shared scraper pattern (UFC). */
  dailyScraper?: DailyScraperConfig;

  /** Live tracker GitHub Actions workflow filename (for eventLifecycle dispatch). */
  liveTrackerWorkflow?: string;

  /** Tapology hub config — present iff this org uses the shared Tapology live tracker. */
  tapologyHub?: TapologyHubConfig;

  /** Keys this org responds to in the admin /test-scraper/:org endpoint. */
  adminTriggerKeys: string[];

  /** Hidden from API responses entirely (event.promotion in HIDDEN_PROMOTIONS). */
  hiddenFromApi: boolean;

  /**
   * Override for the substring used in HIDDEN_PROMOTIONS case-insensitive matching.
   * Defaults to `dbPromotion.toUpperCase()` when undefined. Specify when the legacy
   * value differed (e.g. Matchroom uses 'MATCHROOM', not 'MATCHROOM BOXING').
   */
  hiddenPromotionMatch?: string;
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Single source of truth. Order is significant (drives display order in some
 * derived exports — preserve to keep behavior identical).
 */
export const ORGS: OrgDefinition[] = [
  {
    key: 'UFC',
    scraperType: 'ufc',
    isProductionScraper: true,
    dbPromotion: 'UFC',
    displayName: 'UFC',
    longDisplayName: 'UFC',
    // UFC has its own dedicated dailyUFCScraper.ts — does not use the shared SCRAPER_CONFIG pattern.
    liveTrackerWorkflow: 'ufc-live-tracker.yml',
    adminTriggerKeys: ['ufc'],
    hiddenFromApi: false,
  },
  {
    key: 'BKFC',
    scraperType: 'bkfc',
    isProductionScraper: true,
    dbPromotion: 'BKFC',
    displayName: 'BKFC',
    longDisplayName: 'BKFC (Bare Knuckle FC)',
    dailyScraper: {
      scraperFile: 'scrapeAllBKFCData.js',
      importFnName: 'importBKFCData',
      timeoutMs: 1500000,
    },
    liveTrackerWorkflow: 'bkfc-live-tracker.yml',
    adminTriggerKeys: ['bkfc'],
    hiddenFromApi: false,
  },
  {
    key: 'PFL',
    scraperType: 'tapology',
    isProductionScraper: true, // tapology is in PRODUCTION_SCRAPERS
    dbPromotion: 'PFL',
    displayName: 'PFL',
    longDisplayName: 'PFL (Professional Fighters League)',
    dailyScraper: {
      scraperFile: 'scrapeAllPFLData.js',
      importFnName: 'importPFLData',
      timeoutMs: 1500000,
    },
    liveTrackerWorkflow: 'tapology-live-tracker.yml',
    tapologyHub: {
      hubKey: 'PFL',
      url: 'https://www.tapology.com/fightcenter/promotions/1969-professional-fighters-league-pfl',
      slugFilter: ['pfl'],
    },
    adminTriggerKeys: ['pfl'],
    hiddenFromApi: false,
  },
  {
    key: 'ONEFC',
    scraperType: 'onefc',
    isProductionScraper: true,
    dbPromotion: 'ONE FC',
    displayName: 'ONE',
    longDisplayName: 'ONE Championship',
    dailyScraper: {
      scraperFile: 'scrapeAllOneFCData.js',
      importFnName: 'importOneFCData',
      timeoutMs: 1500000,
    },
    liveTrackerWorkflow: 'onefc-live-tracker.yml',
    adminTriggerKeys: ['onefc'],
    hiddenFromApi: false,
  },
  {
    key: 'MATCHROOM',
    scraperType: 'matchroom',
    isProductionScraper: false,
    dbPromotion: 'Matchroom Boxing',
    displayName: 'Matchroom',
    longDisplayName: 'Matchroom Boxing',
    dailyScraper: {
      scraperFile: 'scrapeAllMatchroomData.js',
      importFnName: 'importMatchroomData',
      timeoutMs: 1500000,
    },
    // No live tracker workflow — Matchroom currently has scraperType='matchroom' but
    // is not dispatched by eventLifecycle workflowMap. Preserved as-is.
    tapologyHub: {
      hubKey: 'Matchroom Boxing',
      url: 'https://www.tapology.com/fightcenter/promotions/2484-matchroom-boxing-mb',
      slugFilter: ['matchroom'],
    },
    adminTriggerKeys: ['matchroom'],
    hiddenFromApi: true,
    hiddenPromotionMatch: 'MATCHROOM',
  },
  {
    key: 'GOLDENBOY',
    scraperType: 'tapology',
    isProductionScraper: true,
    dbPromotion: 'Golden Boy',
    displayName: 'Golden Boy',
    longDisplayName: 'Golden Boy Promotions',
    dailyScraper: {
      scraperFile: 'scrapeAllGoldenBoyData.js',
      importFnName: 'importGoldenBoyData',
      timeoutMs: 1500000,
    },
    liveTrackerWorkflow: 'tapology-live-tracker.yml',
    tapologyHub: {
      hubKey: 'Golden Boy',
      url: 'https://www.tapology.com/fightcenter/promotions/1979-golden-boy-promotions-gbp',
      slugFilter: ['golden-boy'],
    },
    adminTriggerKeys: ['goldenboy'],
    hiddenFromApi: false,
  },
  {
    key: 'GOLDSTAR',
    scraperType: 'tapology',
    isProductionScraper: true,
    dbPromotion: 'Gold Star',
    displayName: 'Gold Star',
    longDisplayName: 'Gold Star Promotions',
    dailyScraper: {
      scraperFile: 'scrapeGoldStarTapology.js',
      importFnName: 'importGoldStarData',
      timeoutMs: 1500000,
    },
    liveTrackerWorkflow: 'tapology-live-tracker.yml',
    tapologyHub: {
      hubKey: 'Gold Star',
      url: 'https://www.tapology.com/fightcenter/promotions/6908-gold-star-promotions-gsp',
      // Gold Star events use fighter-vs-fighter slugs with no org marker.
      // Scope to #content to exclude sidebar events from other promotions.
      slugFilter: [],
      scopeSelector: '#content',
    },
    adminTriggerKeys: ['goldstar'],
    hiddenFromApi: false,
  },
  {
    key: 'TOPRANK',
    scraperType: 'tapology',
    isProductionScraper: true,
    dbPromotion: 'Top Rank',
    displayName: 'Top Rank',
    longDisplayName: 'Top Rank Boxing',
    dailyScraper: {
      scraperFile: 'scrapeAllTopRankData.js',
      importFnName: 'importTopRankData',
      timeoutMs: 1500000,
    },
    liveTrackerWorkflow: 'tapology-live-tracker.yml',
    tapologyHub: {
      // Note: hub map uses 'TOP_RANK' key (uppercase underscore, not 'Top Rank')
      hubKey: 'TOP_RANK',
      url: 'https://www.tapology.com/fightcenter/promotions/2487-top-rank-tr',
      slugFilter: ['top-rank'],
    },
    adminTriggerKeys: ['toprank'],
    hiddenFromApi: false,
  },
  {
    key: 'OKTAGON',
    scraperType: 'oktagon',
    isProductionScraper: true,
    dbPromotion: 'OKTAGON',
    displayName: 'Oktagon',
    longDisplayName: 'OKTAGON MMA',
    dailyScraper: {
      scraperFile: 'scrapeAllOktagonData.js',
      importFnName: 'importOktagonData',
      timeoutMs: 1500000,
    },
    liveTrackerWorkflow: 'oktagon-live-tracker.yml',
    adminTriggerKeys: ['oktagon'],
    hiddenFromApi: false,
  },
  {
    key: 'RIZIN',
    scraperType: 'tapology',
    isProductionScraper: true,
    dbPromotion: 'RIZIN',
    displayName: 'Rizin',
    longDisplayName: 'Rizin Fighting Federation',
    dailyScraper: {
      scraperFile: 'scrapeAllRizinData.js',
      importFnName: 'importRizinData',
      timeoutMs: 1500000,
    },
    liveTrackerWorkflow: 'tapology-live-tracker.yml',
    tapologyHub: {
      hubKey: 'RIZIN',
      url: 'https://www.tapology.com/fightcenter/promotions/1561-rizin-fighting-federation-rff',
      slugFilter: ['rizin'],
    },
    adminTriggerKeys: ['rizin'],
    hiddenFromApi: false,
  },
  {
    key: 'ZUFFA_BOXING',
    scraperType: 'tapology',
    isProductionScraper: true,
    dbPromotion: 'Zuffa Boxing',
    displayName: 'Zuffa Boxing',
    longDisplayName: 'Zuffa Boxing',
    dailyScraper: {
      scraperFile: 'scrapeZuffaBoxingTapology.js',
      importFnName: 'importZuffaBoxingData',
      timeoutMs: 1500000,
    },
    liveTrackerWorkflow: 'tapology-live-tracker.yml',
    tapologyHub: {
      hubKey: 'Zuffa Boxing',
      url: 'https://www.tapology.com/fightcenter/promotions/6299-zuffa-boxing-zb',
      slugFilter: ['zuffa'],
    },
    // Admin maps both 'zuffa-boxing' and 'zuffa' to the Zuffa scraper.
    adminTriggerKeys: ['zuffa-boxing', 'zuffa'],
    hiddenFromApi: false,
  },
  {
    key: 'DIRTY_BOXING',
    scraperType: 'tapology',
    isProductionScraper: true,
    dbPromotion: 'Dirty Boxing',
    displayName: 'Dirty Boxing',
    longDisplayName: 'Dirty Boxing Championship',
    dailyScraper: {
      scraperFile: 'scrapeDirtyBoxingTapology.js',
      importFnName: 'importDirtyBoxingData',
      timeoutMs: 1500000,
    },
    liveTrackerWorkflow: 'tapology-live-tracker.yml',
    tapologyHub: {
      hubKey: 'Dirty Boxing',
      url: 'https://www.tapology.com/fightcenter/promotions/5649-dirty-boxing-championship-dbc',
      slugFilter: ['dirty-boxing', 'dbx-', 'dbc-'],
    },
    // Currently NOT in admin scraperMap — preserved (no adminTriggerKeys, so excluded from derived map).
    adminTriggerKeys: [],
    hiddenFromApi: false,
  },
  {
    key: 'KARATE_COMBAT',
    scraperType: 'tapology',
    isProductionScraper: true,
    dbPromotion: 'Karate Combat',
    displayName: 'Karate Combat',
    longDisplayName: 'Karate Combat',
    dailyScraper: {
      scraperFile: 'scrapeKarateCombatTapology.js',
      importFnName: 'importKarateCombatData',
      timeoutMs: 1500000,
    },
    liveTrackerWorkflow: 'tapology-live-tracker.yml',
    tapologyHub: {
      hubKey: 'Karate Combat',
      url: 'https://www.tapology.com/fightcenter/promotions/3637-karate-combat-kc',
      slugFilter: ['karate-combat', 'kc-'],
    },
    adminTriggerKeys: [],
    hiddenFromApi: false,
  },
  {
    key: 'MVP',
    scraperType: 'tapology',
    isProductionScraper: true,
    dbPromotion: 'MVP',
    displayName: 'MVP',
    longDisplayName: 'Most Valuable Promotions',
    dailyScraper: {
      scraperFile: 'scrapeMVPTapology.js',
      importFnName: 'importMVPData',
      timeoutMs: 1500000,
    },
    liveTrackerWorkflow: 'tapology-live-tracker.yml',
    tapologyHub: {
      hubKey: 'MVP',
      url: 'https://www.tapology.com/fightcenter/promotions/4040-most-valuable-promotions-mvp',
      slugFilter: ['mvp', 'most-valuable'],
    },
    adminTriggerKeys: [],
    hiddenFromApi: false,
  },
  {
    key: 'RAF',
    scraperType: 'raf',
    isProductionScraper: true,
    dbPromotion: 'RAF',
    displayName: 'RAF',
    longDisplayName: 'Real American Freestyle',
    dailyScraper: {
      scraperFile: 'scrapeAllRAFData.js',
      importFnName: 'importRAFData',
      timeoutMs: 600000,
    },
    liveTrackerWorkflow: 'raf-live-tracker.yml',
    adminTriggerKeys: [],
    hiddenFromApi: false,
  },
];

// ============================================================================
// Indexes & lookups
// ============================================================================

const ORGS_BY_KEY: Record<OrgKey, OrgDefinition> = ORGS.reduce(
  (acc, org) => {
    acc[org.key] = org;
    return acc;
  },
  {} as Record<OrgKey, OrgDefinition>,
);

export function getOrg(key: OrgKey): OrgDefinition {
  return ORGS_BY_KEY[key];
}

export function findOrgByDbPromotion(promotion: string): OrgDefinition | undefined {
  return ORGS.find((o) => o.dbPromotion === promotion);
}

// ============================================================================
// Derived exports — these match the legacy hardcoded values byte-for-byte.
// Verified by scripts/verify-org-registry.ts.
// ============================================================================

/** Distinct ScraperType values present in the registry. */
export const ALL_SCRAPER_TYPES: ScraperType[] = ['ufc', 'matchroom', 'oktagon', 'onefc', 'tapology', 'bkfc', 'raf'];

/**
 * ScraperType values that auto-publish results.
 * Order matches the legacy PRODUCTION_SCRAPERS array exactly.
 */
export const DERIVED_PRODUCTION_SCRAPERS: ScraperType[] = ['ufc', 'oktagon', 'tapology', 'bkfc', 'onefc', 'raf'];

/**
 * Promotion strings hidden from all API responses.
 * Derived from `hiddenFromApi: true` orgs.
 */
export const DERIVED_HIDDEN_PROMOTIONS: string[] = ORGS
  .filter((o) => o.hiddenFromApi)
  .map((o) => o.hiddenPromotionMatch ?? o.dbPromotion.toUpperCase());

/**
 * Org keys for the shared daily scraper pattern (excludes UFC, which has a dedicated scraper).
 * Order matches the legacy `organizations` array in dailyAllScrapers.ts.
 */
export const SHARED_DAILY_SCRAPER_ORG_KEYS: Exclude<OrgKey, 'UFC'>[] = [
  'BKFC',
  'PFL',
  'ONEFC',
  'MATCHROOM',
  'GOLDENBOY',
  'GOLDSTAR',
  'TOPRANK',
  'OKTAGON',
  'RIZIN',
  'ZUFFA_BOXING',
  'DIRTY_BOXING',
  'KARATE_COMBAT',
  'MVP',
  'RAF',
];

/**
 * Tapology hub map. Key is the hub display name (matches event.promotion or a curated alias),
 * value is the scraper's lookup config.
 */
export function buildTapologyPromotionHubs(): Record<string, { url: string; slugFilter: string[]; scopeSelector?: string }> {
  const map: Record<string, { url: string; slugFilter: string[]; scopeSelector?: string }> = {};
  // Insertion order matches the legacy hardcoded TAPOLOGY_PROMOTION_HUBS in scraperService.ts.
  const order: OrgKey[] = ['ZUFFA_BOXING', 'PFL', 'RIZIN', 'DIRTY_BOXING', 'KARATE_COMBAT', 'TOPRANK', 'GOLDENBOY', 'GOLDSTAR', 'MATCHROOM', 'MVP'];
  for (const key of order) {
    const org = getOrg(key);
    if (!org.tapologyHub) continue;
    const entry: { url: string; slugFilter: string[]; scopeSelector?: string } = {
      url: org.tapologyHub.url,
      slugFilter: org.tapologyHub.slugFilter,
    };
    if (org.tapologyHub.scopeSelector !== undefined) {
      entry.scopeSelector = org.tapologyHub.scopeSelector;
    }
    map[org.tapologyHub.hubKey] = entry;
  }
  return map;
}

/**
 * Admin /test-scraper/:org → trigger function key map.
 * Each org contributes its `adminTriggerKeys`. Order matches the legacy scraperMap.
 */
export const ADMIN_TRIGGER_ORG_ORDER: OrgKey[] = ['UFC', 'BKFC', 'PFL', 'ONEFC', 'MATCHROOM', 'GOLDENBOY', 'GOLDSTAR', 'TOPRANK', 'OKTAGON', 'ZUFFA_BOXING', 'RIZIN'];

/**
 * Promotions backing the BOXING aggregate filter. Curated list — includes legacy
 * promotion strings (channels, defunct orgs) that don't appear in the registry.
 * Preserved exactly as the legacy ORG_FILTER_GROUPS['BOXING'].contains.
 */
export const BOXING_AGGREGATE_PROMOTIONS: string[] = [
  'MATCHROOM',
  'TOP RANK',
  'TOP_RANK',
  'GOLDEN BOY',
  'GOLDEN_BOY',
  'GOLD STAR',
  'GOLD_STAR',
  'SHOWTIME',
  'MOST VALUABLE',
  'MVP BOXING',
  'MVP',
  'PBC',
  'PREMIER BOXING',
  'DAZN',
  'ESPN BOXING',
  'ZUFFA BOXING',
  'ZUFFA_BOXING',
  'ZUFFA',
];

/**
 * Backend ORG_FILTER_GROUPS, derived from the registry + curated aggregates.
 */
export function buildOrgFilterGroups(): Record<string, { contains?: string[] }> {
  return {
    BOXING: { contains: BOXING_AGGREGATE_PROMOTIONS },
    'DIRTY BOXING': { contains: ['DIRTY BOXING'] },
  };
}
