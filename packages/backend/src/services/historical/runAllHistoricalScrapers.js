/**
 * Master Orchestrator for Historical Fight Data Scraping
 *
 * Runs all Wikipedia scrapers to collect historical fight outcomes for:
 * - UFC (1,772 fights needed)
 * - Bellator (1,491 fights needed)
 * - ONE Championship (669 fights needed)
 * - Pride FC (514 fights needed)
 * - WEC (459 fights needed)
 * - BKFC (374 fights needed)
 * - PFL (255 fights needed)
 * - Strikeforce (198 fights needed)
 *
 * Usage:
 *   node runAllHistoricalScrapers.js [--promotion <name>] [--quick]
 *
 * Options:
 *   --promotion <name>  Only run scraper for specific promotion (ufc, bellator, one, etc.)
 *   --quick            Only scrape first 10 events per promotion (for testing)
 */

const fs = require('fs');
const path = require('path');

// Import scrapers
const ufcScraper = require('./scrapeWikipediaUFC');
const mmaScraper = require('./scrapeWikipediaMMA');
const bkfcScraper = require('./scrapeWikipediaBKFC');

const OUTPUT_DIR = path.join(__dirname, '../../../scraped-data/historical');

// Scraper configuration
const SCRAPERS = {
  ufc: {
    name: 'UFC',
    scraper: ufcScraper.main,
    estimatedFights: 1772
  },
  bellator: {
    name: 'Bellator',
    scraper: () => mmaScraper.scrapePromotion('bellator'),
    estimatedFights: 1491
  },
  one: {
    name: 'ONE Championship',
    scraper: () => mmaScraper.scrapePromotion('one'),
    estimatedFights: 669
  },
  pride: {
    name: 'Pride FC',
    scraper: () => mmaScraper.scrapePromotion('pride'),
    estimatedFights: 514
  },
  wec: {
    name: 'WEC',
    scraper: () => mmaScraper.scrapePromotion('wec'),
    estimatedFights: 459
  },
  bkfc: {
    name: 'BKFC',
    scraper: bkfcScraper.main,
    estimatedFights: 374
  },
  pfl: {
    name: 'PFL',
    scraper: () => mmaScraper.scrapePromotion('pfl'),
    estimatedFights: 255
  },
  strikeforce: {
    name: 'Strikeforce',
    scraper: () => mmaScraper.scrapePromotion('strikeforce'),
    estimatedFights: 198
  },
  invicta: {
    name: 'Invicta FC',
    scraper: () => mmaScraper.scrapePromotion('invicta'),
    estimatedFights: 185
  }
};

/**
 * Run a single scraper with timing and error handling
 */
async function runScraper(key, config) {
  console.log('\n' + '='.repeat(70));
  console.log(`🥊 Starting ${config.name} scraper`);
  console.log(`   Estimated fights to collect: ${config.estimatedFights}`);
  console.log('='.repeat(70) + '\n');

  const startTime = Date.now();

  try {
    const result = await config.scraper();
    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log(`\n✅ ${config.name} completed in ${duration} seconds`);

    return {
      promotion: config.name,
      success: true,
      duration,
      events: result?.totalEvents || 0,
      fights: result?.totalFights || 0
    };

  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n❌ ${config.name} failed after ${duration} seconds:`, error.message);

    return {
      promotion: config.name,
      success: false,
      duration,
      error: error.message
    };
  }
}

/**
 * Main orchestrator
 */
async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║         HISTORICAL FIGHT DATA SCRAPING ORCHESTRATOR                  ║');
  console.log('║                                                                      ║');
  console.log('║   Collecting fight outcomes from Wikipedia for database backfill    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  let specificPromotion = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--promotion' && args[i + 1]) {
      specificPromotion = args[i + 1].toLowerCase();
    }
  }

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Determine which scrapers to run
  let scrapersToRun;
  if (specificPromotion) {
    if (!SCRAPERS[specificPromotion]) {
      console.error(`Unknown promotion: ${specificPromotion}`);
      console.log('Available promotions:', Object.keys(SCRAPERS).join(', '));
      process.exit(1);
    }
    scrapersToRun = { [specificPromotion]: SCRAPERS[specificPromotion] };
  } else {
    scrapersToRun = SCRAPERS;
  }

  // Summary of what we're about to do
  console.log('📋 SCRAPING PLAN:\n');
  let totalEstimatedFights = 0;
  for (const [key, config] of Object.entries(scrapersToRun)) {
    console.log(`   • ${config.name}: ~${config.estimatedFights} fights`);
    totalEstimatedFights += config.estimatedFights;
  }
  console.log(`\n   Total estimated fights: ~${totalEstimatedFights}`);
  console.log(`   Estimated time: ${Math.round(totalEstimatedFights * 2 / 60)} minutes (at 2s per fight)\n`);

  // Run scrapers
  const overallStartTime = Date.now();
  const results = [];

  for (const [key, config] of Object.entries(scrapersToRun)) {
    const result = await runScraper(key, config);
    results.push(result);

    // Save progress after each promotion
    const progressFile = path.join(OUTPUT_DIR, 'scraping-progress.json');
    fs.writeFileSync(progressFile, JSON.stringify({
      lastUpdated: new Date().toISOString(),
      results
    }, null, 2));
  }

  // Final summary
  const overallDuration = Math.round((Date.now() - overallStartTime) / 1000);

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                         FINAL SUMMARY                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  let totalEvents = 0;
  let totalFights = 0;
  let successCount = 0;
  let failCount = 0;

  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    const stats = result.success
      ? `${result.events} events, ${result.fights} fights`
      : `Error: ${result.error}`;

    console.log(`   ${status} ${result.promotion}: ${stats} (${result.duration}s)`);

    if (result.success) {
      totalEvents += result.events;
      totalFights += result.fights;
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log('\n' + '-'.repeat(60) + '\n');
  console.log(`   Total scrapers run: ${results.length}`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`   Total events collected: ${totalEvents}`);
  console.log(`   Total fights collected: ${totalFights}`);
  console.log(`   Total time: ${Math.round(overallDuration / 60)} minutes`);

  // Save final summary
  const summaryFile = path.join(OUTPUT_DIR, 'historical-scrape-summary.json');
  fs.writeFileSync(summaryFile, JSON.stringify({
    scrapeDate: new Date().toISOString(),
    totalDuration: overallDuration,
    totalEvents,
    totalFights,
    successCount,
    failCount,
    results
  }, null, 2));

  console.log(`\n   Summary saved to: ${summaryFile}`);
  console.log('\n✅ Historical scraping complete!\n');

  // List output files
  console.log('📁 Output files:\n');
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const stats = fs.statSync(path.join(OUTPUT_DIR, file));
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`   ${file} (${sizeMB} MB)`);
  }
  console.log('\n');
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main, SCRAPERS };
