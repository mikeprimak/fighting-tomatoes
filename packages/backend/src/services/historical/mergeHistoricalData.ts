/**
 * Historical Fight Data Merge Script
 *
 * Merges scraped Wikipedia fight outcomes into the existing database.
 * Updates fights with winner, method, round, and time data.
 *
 * Usage:
 *   npx ts-node src/services/historical/mergeHistoricalData.ts --dry-run
 *   npx ts-node src/services/historical/mergeHistoricalData.ts --apply
 *   npx ts-node src/services/historical/mergeHistoricalData.ts --promotion ufc --apply
 *   npx ts-node src/services/historical/mergeHistoricalData.ts --all --verbose
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import {
  ScrapedData,
  ScrapedEvent,
  MergeStats,
  MergeReport,
  MergeOptions,
  MatchConfidence,
  FightMatchResult,
} from './mergeTypes';
import {
  matchEvent,
  matchFight,
  getFightsNeedingOutcome,
  normalizeMethod,
} from './matchingUtils';

const prisma = new PrismaClient();

// Scraped data directory
const SCRAPED_DATA_DIR = path.join(__dirname, '../../../scraped-data/historical');

// Promotion to file mapping
const PROMOTION_FILES: Record<string, string> = {
  ufc: 'ufc-historical-latest.json',
  bellator: 'bellator-historical-latest.json',
  one: 'one-historical-latest.json',
  pride: 'pride-historical-latest.json',
  wec: 'wec-historical-latest.json',
  pfl: 'pfl-historical-latest.json',
  bkfc: 'bkfc-historical-latest.json',
};

// Promotion name mapping (file key -> database promotion name)
const PROMOTION_NAMES: Record<string, string> = {
  ufc: 'UFC',
  bellator: 'Bellator',
  one: 'ONE Championship',
  pride: 'Pride FC',
  wec: 'WEC',
  pfl: 'PFL',
  bkfc: 'BKFC',
};

/**
 * Load scraped data from JSON file
 */
function loadScrapedData(promotion: string): ScrapedData | null {
  const filename = PROMOTION_FILES[promotion.toLowerCase()];
  if (!filename) {
    console.error(`Unknown promotion: ${promotion}`);
    return null;
  }

  const filepath = path.join(SCRAPED_DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.error(`File not found: ${filepath}`);
    return null;
  }

  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content) as ScrapedData;
  } catch (error) {
    console.error(`Error loading ${filepath}:`, error);
    return null;
  }
}

/**
 * Check if confidence level meets minimum threshold
 */
function meetsConfidenceThreshold(confidence: MatchConfidence, minConfidence: MatchConfidence): boolean {
  const levels: MatchConfidence[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];
  return levels.indexOf(confidence) >= levels.indexOf(minConfidence);
}

/**
 * Process a single event
 */
async function processEvent(
  scrapedEvent: ScrapedEvent,
  dbPromotion: string,
  options: MergeOptions,
  stats: MergeStats,
  report: MergeReport
): Promise<void> {
  const { dryRun, verbose, minConfidence } = options;

  // Match event to database
  const eventMatch = await matchEvent(prisma, scrapedEvent, dbPromotion);

  if (!eventMatch.dbEvent) {
    stats.eventsUnmatched++;
    report.unmatchedEvents.push({
      eventName: scrapedEvent.eventName,
      eventDate: scrapedEvent.eventDate,
      reason: eventMatch.reason,
    });
    if (verbose) {
      console.log(`  ❌ Event not found: "${scrapedEvent.eventName}" - ${eventMatch.reason}`);
    }
    return;
  }

  stats.eventsMatched++;
  if (verbose) {
    console.log(`  ✓ Matched: "${scrapedEvent.eventName}" → "${eventMatch.dbEvent.name}" (${eventMatch.confidence})`);
  }

  // Get fights needing outcome data
  const dbFights = await getFightsNeedingOutcome(prisma, eventMatch.dbEvent.id);

  if (dbFights.length === 0 && verbose) {
    console.log(`    (no fights need outcome data)`);
    return;
  }

  // Process each scraped fight
  for (const scrapedFight of scrapedEvent.fights) {
    stats.fightsProcessed++;

    // Match fight
    const fightMatch = matchFight(scrapedFight, dbFights);

    if (!fightMatch.dbFightId) {
      stats.fightsSkippedNoMatch++;
      report.unmatchedFights.push({
        eventName: scrapedEvent.eventName,
        winner: scrapedFight.winner,
        loser: scrapedFight.loser,
        reason: fightMatch.reason,
      });
      if (verbose) {
        console.log(`    ❌ No match: "${scrapedFight.winner}" vs "${scrapedFight.loser}"`);
      }
      continue;
    }

    // Check confidence threshold
    if (!meetsConfidenceThreshold(fightMatch.confidence, minConfidence)) {
      stats.fightsSkippedLowConfidence++;
      report.lowConfidenceFights.push({
        eventName: scrapedEvent.eventName,
        scrapedWinner: scrapedFight.winner,
        scrapedLoser: scrapedFight.loser,
        dbFighter1: fightMatch.dbFighter1Name,
        dbFighter2: fightMatch.dbFighter2Name,
        confidence: fightMatch.confidence,
        reason: fightMatch.reason,
      });
      if (verbose) {
        console.log(`    ⚠ Low confidence (${fightMatch.confidence}): "${scrapedFight.winner}" vs "${scrapedFight.loser}" - ${fightMatch.reason}`);
      }
      continue;
    }

    // Apply update
    if (!dryRun) {
      try {
        await prisma.fight.update({
          where: { id: fightMatch.dbFightId },
          data: {
            winner: fightMatch.winnerId,
            method: normalizeMethod(scrapedFight.method),
            round: scrapedFight.round,
            time: scrapedFight.time,
          },
        });
        stats.fightsUpdated++;
        if (verbose) {
          console.log(`    ✓ Updated: "${scrapedFight.winner}" def. "${scrapedFight.loser}" (${fightMatch.confidence})`);
        }
      } catch (error) {
        stats.fightsSkippedError++;
        report.errors.push({
          context: `Fight: ${scrapedFight.winner} vs ${scrapedFight.loser} in ${scrapedEvent.eventName}`,
          error: String(error),
        });
        if (verbose) {
          console.log(`    ❌ Error updating fight: ${error}`);
        }
      }
    } else {
      stats.fightsUpdated++;
      if (verbose) {
        console.log(`    [DRY-RUN] Would update: "${scrapedFight.winner}" def. "${scrapedFight.loser}" (${fightMatch.confidence})`);
      }
    }
  }
}

/**
 * Process all events for a promotion
 */
async function processPromotion(
  promotion: string,
  options: MergeOptions
): Promise<MergeReport> {
  const dbPromotion = PROMOTION_NAMES[promotion.toLowerCase()] || promotion;
  console.log(`\n📦 Processing ${dbPromotion}...`);

  const scrapedData = loadScrapedData(promotion);
  if (!scrapedData) {
    return {
      timestamp: new Date().toISOString(),
      promotion: dbPromotion,
      dryRun: options.dryRun,
      stats: {
        eventsProcessed: 0,
        eventsMatched: 0,
        eventsUnmatched: 0,
        fightsProcessed: 0,
        fightsUpdated: 0,
        fightsSkippedAlreadyHasOutcome: 0,
        fightsSkippedLowConfidence: 0,
        fightsSkippedNoMatch: 0,
        fightsSkippedError: 0,
      },
      unmatchedEvents: [],
      unmatchedFights: [],
      lowConfidenceFights: [],
      errors: [{ context: 'Loading data', error: 'Failed to load scraped data file' }],
    };
  }

  console.log(`  Loaded ${scrapedData.totalEvents} events, ${scrapedData.totalFights} fights`);

  const stats: MergeStats = {
    eventsProcessed: 0,
    eventsMatched: 0,
    eventsUnmatched: 0,
    fightsProcessed: 0,
    fightsUpdated: 0,
    fightsSkippedAlreadyHasOutcome: 0,
    fightsSkippedLowConfidence: 0,
    fightsSkippedNoMatch: 0,
    fightsSkippedError: 0,
  };

  const report: MergeReport = {
    timestamp: new Date().toISOString(),
    promotion: dbPromotion,
    dryRun: options.dryRun,
    stats,
    unmatchedEvents: [],
    unmatchedFights: [],
    lowConfidenceFights: [],
    errors: [],
  };

  // Process each event
  for (const event of scrapedData.events) {
    stats.eventsProcessed++;
    await processEvent(event, dbPromotion, options, stats, report);
  }

  // Print summary
  console.log(`\n📊 ${dbPromotion} Summary:`);
  console.log(`   Events: ${stats.eventsMatched}/${stats.eventsProcessed} matched`);
  console.log(`   Fights updated: ${stats.fightsUpdated}`);
  console.log(`   Fights skipped (low confidence): ${stats.fightsSkippedLowConfidence}`);
  console.log(`   Fights skipped (no match): ${stats.fightsSkippedNoMatch}`);
  if (stats.fightsSkippedError > 0) {
    console.log(`   Fights with errors: ${stats.fightsSkippedError}`);
  }

  return report;
}

/**
 * Save merge report to file
 */
function saveReport(reports: MergeReport[], dryRun: boolean): void {
  const filename = dryRun
    ? `merge-report-dry-run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    : `merge-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  const filepath = path.join(SCRAPED_DATA_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(reports, null, 2));
  console.log(`\n📄 Report saved to: ${filepath}`);
}

/**
 * Main merge function
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: MergeOptions = {
    dryRun: !args.includes('--apply'),
    promotion: undefined,
    verbose: args.includes('--verbose') || args.includes('-v'),
    minConfidence: 'MEDIUM',
  };

  // Check for promotion argument
  const promotionIndex = args.indexOf('--promotion');
  if (promotionIndex !== -1 && args[promotionIndex + 1]) {
    options.promotion = args[promotionIndex + 1].toLowerCase();
  }

  // Header
  console.log('\n' + '='.repeat(60));
  console.log('  HISTORICAL FIGHT DATA MERGE');
  console.log('='.repeat(60));
  console.log(`  Mode: ${options.dryRun ? 'DRY RUN (no changes)' : 'APPLY CHANGES'}`);
  console.log(`  Min confidence: ${options.minConfidence}`);
  console.log(`  Verbose: ${options.verbose}`);
  console.log('='.repeat(60));

  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No database changes will be made');
    console.log('   Use --apply to actually update the database\n');
  } else {
    console.log('\n🔥 APPLY MODE - Database will be updated!\n');
  }

  const reports: MergeReport[] = [];

  // Determine which promotions to process
  const promotionsToProcess = options.promotion
    ? [options.promotion]
    : Object.keys(PROMOTION_FILES);

  // Process each promotion
  for (const promotion of promotionsToProcess) {
    const report = await processPromotion(promotion, options);
    reports.push(report);
  }

  // Save combined report
  saveReport(reports, options.dryRun);

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('  FINAL SUMMARY');
  console.log('='.repeat(60));

  let totalEventsProcessed = 0;
  let totalEventsMatched = 0;
  let totalFightsUpdated = 0;
  let totalFightsSkipped = 0;

  for (const report of reports) {
    totalEventsProcessed += report.stats.eventsProcessed;
    totalEventsMatched += report.stats.eventsMatched;
    totalFightsUpdated += report.stats.fightsUpdated;
    totalFightsSkipped += report.stats.fightsSkippedLowConfidence + report.stats.fightsSkippedNoMatch;
  }

  console.log(`  Total events processed: ${totalEventsProcessed}`);
  console.log(`  Total events matched: ${totalEventsMatched}`);
  console.log(`  Total fights updated: ${totalFightsUpdated}`);
  console.log(`  Total fights skipped: ${totalFightsSkipped}`);
  console.log('='.repeat(60) + '\n');

  await prisma.$disconnect();
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  prisma.$disconnect();
  process.exit(1);
});
