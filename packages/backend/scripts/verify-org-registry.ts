/**
 * Org Registry Verification Script
 *
 * Asserts that the derived exports from src/config/orgs.ts still match the
 * pre-registry hardcoded values that exist in production. Run before deploying any
 * change to orgs.ts to confirm zero behavior change.
 *
 *   npx tsx scripts/verify-org-registry.ts          # registry assertions only
 *   npx tsx scripts/verify-org-registry.ts --db     # also check DB promotion coverage
 *
 * Exits 0 on success, 1 on any mismatch.
 *
 * When intentionally changing a value in orgs.ts (e.g. fixing a bug, adding an org),
 * update the corresponding EXPECTED_* snapshot below. Treat this script the way you'd
 * treat a snapshot test.
 */

import * as assert from 'node:assert/strict';
import {
  ORGS,
  ALL_SCRAPER_TYPES,
  DERIVED_PRODUCTION_SCRAPERS,
  DERIVED_HIDDEN_PROMOTIONS,
  SHARED_DAILY_SCRAPER_ORG_KEYS,
  ADMIN_TRIGGER_ORG_ORDER,
  buildTapologyPromotionHubs,
  buildOrgFilterGroups,
  BOXING_AGGREGATE_PROMOTIONS,
  getOrg,
  type ScraperType,
} from '../src/config/orgs';

// ============================================================================
// Snapshots — pin every derived export to its pre-registry value.
// ============================================================================

const EXPECTED_ALL_SCRAPER_TYPES: ScraperType[] = ['ufc', 'matchroom', 'oktagon', 'onefc', 'tapology', 'bkfc', 'raf'];

const EXPECTED_PRODUCTION_SCRAPERS: ScraperType[] = ['ufc', 'oktagon', 'tapology', 'bkfc', 'onefc', 'raf'];

const EXPECTED_HIDDEN_PROMOTIONS: string[] = ['MATCHROOM'];

const EXPECTED_SHARED_DAILY_KEYS: string[] = [
  'BKFC', 'PFL', 'ONEFC', 'MATCHROOM', 'GOLDENBOY', 'GOLDSTAR', 'TOPRANK',
  'OKTAGON', 'RIZIN', 'ZUFFA_BOXING', 'DIRTY_BOXING', 'KARATE_COMBAT', 'MVP', 'RAF',
];

const EXPECTED_TAPOLOGY_HUBS: Record<string, { url: string; slugFilter: string[]; scopeSelector?: string }> = {
  'Zuffa Boxing': {
    url: 'https://www.tapology.com/fightcenter/promotions/6299-zuffa-boxing-zb',
    slugFilter: ['zuffa'],
  },
  'PFL': {
    url: 'https://www.tapology.com/fightcenter/promotions/1969-professional-fighters-league-pfl',
    slugFilter: ['pfl'],
  },
  'RIZIN': {
    url: 'https://www.tapology.com/fightcenter/promotions/1561-rizin-fighting-federation-rff',
    slugFilter: ['rizin'],
  },
  'Dirty Boxing': {
    url: 'https://www.tapology.com/fightcenter/promotions/5649-dirty-boxing-championship-dbc',
    slugFilter: ['dirty-boxing', 'dbx-', 'dbc-'],
  },
  'Karate Combat': {
    url: 'https://www.tapology.com/fightcenter/promotions/3637-karate-combat-kc',
    slugFilter: ['karate-combat', 'kc-'],
  },
  'TOP_RANK': {
    url: 'https://www.tapology.com/fightcenter/promotions/2487-top-rank-tr',
    slugFilter: ['top-rank'],
  },
  'Golden Boy': {
    url: 'https://www.tapology.com/fightcenter/promotions/1979-golden-boy-promotions-gbp',
    slugFilter: ['golden-boy'],
  },
  'Gold Star': {
    url: 'https://www.tapology.com/fightcenter/promotions/6908-gold-star-promotions-gsp',
    slugFilter: [],
    scopeSelector: '#content',
  },
  'Matchroom Boxing': {
    url: 'https://www.tapology.com/fightcenter/promotions/2484-matchroom-boxing-mb',
    slugFilter: ['matchroom'],
  },
  'MVP': {
    url: 'https://www.tapology.com/fightcenter/promotions/4040-most-valuable-promotions-mvp',
    slugFilter: ['mvp', 'most-valuable'],
  },
};

const EXPECTED_ORG_FILTER_GROUPS: Record<string, { contains?: string[] }> = {
  BOXING: {
    contains: [
      'MATCHROOM', 'TOP RANK', 'TOP_RANK', 'GOLDEN BOY', 'GOLDEN_BOY',
      'GOLD STAR', 'GOLD_STAR', 'SHOWTIME', 'MOST VALUABLE', 'MVP BOXING',
      'MVP', 'PBC', 'PREMIER BOXING', 'DAZN', 'ESPN BOXING',
      'ZUFFA BOXING', 'ZUFFA_BOXING', 'ZUFFA',
    ],
  },
  'DIRTY BOXING': { contains: ['DIRTY BOXING'] },
};

const EXPECTED_ADMIN_SCRAPER_MAP_KEYS: string[] = [
  'ufc', 'bkfc', 'pfl', 'onefc', 'matchroom', 'goldenboy', 'goldstar',
  'toprank', 'oktagon', 'zuffa-boxing', 'zuffa', 'rizin',
];

interface ExpectedDailyScraper {
  scraperFile: string;
  importFnName: string;
  timeoutMs: number;
  longDisplayName: string;
}

const EXPECTED_DAILY_SCRAPER_BY_KEY: Record<string, ExpectedDailyScraper> = {
  BKFC:          { scraperFile: 'scrapeAllBKFCData.js',          importFnName: 'importBKFCData',         timeoutMs: 1500000, longDisplayName: 'BKFC (Bare Knuckle FC)' },
  PFL:           { scraperFile: 'scrapeAllPFLData.js',           importFnName: 'importPFLData',          timeoutMs: 1500000, longDisplayName: 'PFL (Professional Fighters League)' },
  ONEFC:         { scraperFile: 'scrapeAllOneFCData.js',         importFnName: 'importOneFCData',        timeoutMs: 1500000, longDisplayName: 'ONE Championship' },
  MATCHROOM:     { scraperFile: 'scrapeAllMatchroomData.js',     importFnName: 'importMatchroomData',    timeoutMs: 1500000, longDisplayName: 'Matchroom Boxing' },
  GOLDENBOY:     { scraperFile: 'scrapeAllGoldenBoyData.js',     importFnName: 'importGoldenBoyData',    timeoutMs: 1500000, longDisplayName: 'Golden Boy Promotions' },
  GOLDSTAR:      { scraperFile: 'scrapeGoldStarTapology.js',     importFnName: 'importGoldStarData',     timeoutMs: 1500000, longDisplayName: 'Gold Star Promotions' },
  TOPRANK:       { scraperFile: 'scrapeAllTopRankData.js',       importFnName: 'importTopRankData',      timeoutMs: 1500000, longDisplayName: 'Top Rank Boxing' },
  OKTAGON:       { scraperFile: 'scrapeAllOktagonData.js',       importFnName: 'importOktagonData',      timeoutMs: 1500000, longDisplayName: 'OKTAGON MMA' },
  RIZIN:         { scraperFile: 'scrapeAllRizinData.js',         importFnName: 'importRizinData',        timeoutMs: 1500000, longDisplayName: 'Rizin Fighting Federation' },
  ZUFFA_BOXING:  { scraperFile: 'scrapeZuffaBoxingTapology.js',  importFnName: 'importZuffaBoxingData',  timeoutMs: 1500000, longDisplayName: 'Zuffa Boxing' },
  DIRTY_BOXING:  { scraperFile: 'scrapeDirtyBoxingTapology.js',  importFnName: 'importDirtyBoxingData',  timeoutMs: 1500000, longDisplayName: 'Dirty Boxing Championship' },
  KARATE_COMBAT: { scraperFile: 'scrapeKarateCombatTapology.js', importFnName: 'importKarateCombatData', timeoutMs: 1500000, longDisplayName: 'Karate Combat' },
  MVP:           { scraperFile: 'scrapeMVPTapology.js',          importFnName: 'importMVPData',          timeoutMs: 1500000, longDisplayName: 'Most Valuable Promotions' },
  RAF:           { scraperFile: 'scrapeAllRAFData.js',           importFnName: 'importRAFData',          timeoutMs: 600000,  longDisplayName: 'Real American Freestyle' },
};

// ============================================================================
// Assertions
// ============================================================================

const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failures.push(`${name}: ${err.message}`);
    console.error(`  ✗ ${name}`);
    console.error(`     ${err.message.split('\n').slice(0, 6).join('\n     ')}`);
  }
}

console.log('Org registry verification\n');

console.log('Scraper types & production list:');
check('ALL_SCRAPER_TYPES matches snapshot', () => {
  assert.deepStrictEqual([...ALL_SCRAPER_TYPES], EXPECTED_ALL_SCRAPER_TYPES);
});
check('DERIVED_PRODUCTION_SCRAPERS matches snapshot', () => {
  assert.deepStrictEqual([...DERIVED_PRODUCTION_SCRAPERS], EXPECTED_PRODUCTION_SCRAPERS);
});

console.log('\nHidden promotions:');
check('DERIVED_HIDDEN_PROMOTIONS matches snapshot', () => {
  assert.deepStrictEqual([...DERIVED_HIDDEN_PROMOTIONS], EXPECTED_HIDDEN_PROMOTIONS);
});

console.log('\nDaily scraper config:');
check('SHARED_DAILY_SCRAPER_ORG_KEYS order matches snapshot', () => {
  assert.deepStrictEqual([...SHARED_DAILY_SCRAPER_ORG_KEYS], EXPECTED_SHARED_DAILY_KEYS);
});
for (const key of EXPECTED_SHARED_DAILY_KEYS) {
  check(`  ${key} dailyScraper config matches snapshot`, () => {
    const org = getOrg(key as any);
    assert.ok(org.dailyScraper, `Org ${key} missing dailyScraper`);
    const exp = EXPECTED_DAILY_SCRAPER_BY_KEY[key];
    assert.equal(org.dailyScraper!.scraperFile, exp.scraperFile, 'scraperFile');
    assert.equal(org.dailyScraper!.importFnName, exp.importFnName, 'importFnName');
    assert.equal(org.dailyScraper!.timeoutMs, exp.timeoutMs, 'timeoutMs');
    assert.equal(org.longDisplayName, exp.longDisplayName, 'longDisplayName');
  });
}

console.log('\nTapology hubs:');
check('buildTapologyPromotionHubs() matches snapshot', () => {
  const actual = buildTapologyPromotionHubs();
  assert.deepStrictEqual(Object.keys(actual), Object.keys(EXPECTED_TAPOLOGY_HUBS));
  assert.deepStrictEqual(actual, EXPECTED_TAPOLOGY_HUBS);
});

console.log('\nORG_FILTER_GROUPS:');
check('buildOrgFilterGroups() matches snapshot', () => {
  const actual = buildOrgFilterGroups();
  assert.deepStrictEqual(actual, EXPECTED_ORG_FILTER_GROUPS);
});
check('BOXING_AGGREGATE_PROMOTIONS matches snapshot', () => {
  assert.deepStrictEqual([...BOXING_AGGREGATE_PROMOTIONS], EXPECTED_ORG_FILTER_GROUPS.BOXING.contains);
});

console.log('\nAdmin scraper map:');
check('Admin scraperMap keys match snapshot', () => {
  const keys: string[] = [];
  for (const orgKey of ADMIN_TRIGGER_ORG_ORDER) {
    const org = getOrg(orgKey);
    for (const k of org.adminTriggerKeys) keys.push(k);
  }
  assert.deepStrictEqual(keys, EXPECTED_ADMIN_SCRAPER_MAP_KEYS);
});

console.log('\nRegistry consistency:');
check('every scraperType is in ALL_SCRAPER_TYPES', () => {
  for (const org of ORGS) {
    if (org.scraperType === null) continue;
    assert.ok(
      ALL_SCRAPER_TYPES.includes(org.scraperType),
      `Org ${org.key} has scraperType '${org.scraperType}' not in ALL_SCRAPER_TYPES`,
    );
  }
});
check('isProductionScraper flag matches DERIVED_PRODUCTION_SCRAPERS', () => {
  for (const org of ORGS) {
    if (org.scraperType === null) {
      assert.equal(org.isProductionScraper, false, `${org.key} has null scraperType but isProductionScraper=true`);
      continue;
    }
    const expected = DERIVED_PRODUCTION_SCRAPERS.includes(org.scraperType);
    assert.equal(
      org.isProductionScraper,
      expected,
      `${org.key} isProductionScraper=${org.isProductionScraper} but scraperType '${org.scraperType}' production-status is ${expected}`,
    );
  }
});
check('every dbPromotion is unique', () => {
  const seen = new Map<string, string>();
  for (const org of ORGS) {
    const prev = seen.get(org.dbPromotion);
    if (prev) {
      throw new Error(`Duplicate dbPromotion '${org.dbPromotion}': ${prev} and ${org.key}`);
    }
    seen.set(org.dbPromotion, org.key);
  }
});

// ============================================================================
// Optional: DB coverage
// ============================================================================

async function checkDbCoverage(): Promise<void> {
  console.log('\nDB coverage check:');
  // Lazy-import Prisma so the script can run without DATABASE_URL set.
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.event.findMany({
      select: { promotion: true },
      distinct: ['promotion'],
    });

    const knownDbPromotions = new Set(ORGS.map((o) => o.dbPromotion));
    const knownAggregateUpper = new Set(BOXING_AGGREGATE_PROMOTIONS.map((s) => s.toUpperCase()));
    const unknownPromotions: string[] = [];

    for (const row of rows) {
      if (!row.promotion) continue;
      if (knownDbPromotions.has(row.promotion)) continue;
      if (knownAggregateUpper.has(row.promotion.toUpperCase())) continue;
      unknownPromotions.push(row.promotion);
    }

    check(`every event.promotion (${rows.length} distinct) is recognized`, () => {
      assert.deepStrictEqual(
        unknownPromotions.sort(),
        [],
        `Unknown event.promotion values found in DB:\n  ${unknownPromotions.sort().join('\n  ')}\n` +
          `Either add them to the registry as new orgs, add them to BOXING_AGGREGATE_PROMOTIONS, or rewrite them in the DB.`,
      );
    });
  } finally {
    await prisma.$disconnect();
  }
}

// ============================================================================
// Entry point
// ============================================================================

async function main(): Promise<void> {
  if (process.argv.includes('--db')) {
    await checkDbCoverage();
  }

  console.log();
  if (failures.length === 0) {
    console.log('✅ All registry assertions passed.');
    process.exit(0);
  } else {
    console.error(`❌ ${failures.length} assertion(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in verify-org-registry:', err);
  process.exit(2);
});
