#!/usr/bin/env node
/**
 * ============================================================================
 * LAUNCH DAY RESET
 * ============================================================================
 *
 * Wipes production database and re-imports everything fresh from the LIVE
 * fightingtomatoes.com MySQL database. This ensures 100% clean data with
 * no test/fake fights.
 *
 * WHAT IT DOES:
 *   1. TRUNCATES all production tables (removes fake/test data)
 *   2. Calls sync-all-from-live.js (imports from live MySQL)
 *   3. Runs fix-up scripts (fight order, images, duplicates)
 *
 * USAGE:
 *   node launch-day-reset.js              # Dry run - shows what would happen
 *   node launch-day-reset.js --execute    # Actually perform the reset
 *   node launch-day-reset.js --verify     # Verify data after reset
 *
 * ============================================================================
 */

const { execSync } = require('child_process');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Use environment variable - NEVER hardcode credentials!
// Usage: PRODUCTION_DATABASE_URL="postgresql://..." node launch-day-reset.js --execute
const PRODUCTION_DB_URL = process.env.PRODUCTION_DATABASE_URL;

if (!PRODUCTION_DB_URL) {
  console.error('ERROR: PRODUCTION_DATABASE_URL environment variable is required');
  console.error('Usage: PRODUCTION_DATABASE_URL="postgresql://..." node launch-day-reset.js --execute');
  process.exit(1);
}

const MYSQL_EXPORT_DIR = path.join(__dirname, 'mysql-export');

async function main() {
  const executeMode = process.argv.includes('--execute');
  const verifyMode = process.argv.includes('--verify');

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              LAUNCH DAY RESET                              ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Wipes production and re-imports from live MySQL           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  if (verifyMode) {
    await verifyData();
    return;
  }

  console.log(`Mode: ${executeMode ? '🔴 EXECUTE (DESTRUCTIVE)' : '🟡 DRY RUN'}`);
  console.log('');

  if (!executeMode) {
    console.log('📋 DRY RUN - Would perform these steps:\n');
    console.log('   Step 1: TRUNCATE all production tables');
    console.log('           - fight_ratings, fight_reviews, fight_tags');
    console.log('           - fight_predictions, pre_fight_comments');
    console.log('           - fights, events, fighters, users');
    console.log('');
    console.log('   Step 2: Run sync-all-from-live.js');
    console.log('           - Imports events, fighters, fights from live MySQL');
    console.log('           - Imports users (password=null for claim flow)');
    console.log('           - Imports ratings, reviews, tags');
    console.log('');
    console.log('   Step 3: Run fix-up scripts');
    console.log('           - sync-fight-order.js (main event = order 1)');
    console.log('           - fix-duplicate-orders.js');
    console.log('           - import-images.js');
    console.log('           - import-event-images-v2.js');
    console.log('');
    console.log('To execute, run: node launch-day-reset.js --execute');
    return;
  }

  // Confirm before destructive action
  console.log('⚠️  WARNING: This will DELETE ALL DATA in production!');
  console.log('⚠️  You have 5 seconds to cancel (Ctrl+C)...');
  await sleep(5000);
  console.log('');

  const prisma = new PrismaClient({
    datasources: { db: { url: PRODUCTION_DB_URL } }
  });

  try {
    // =========================================================================
    // STEP 1: TRUNCATE ALL TABLES
    // =========================================================================
    console.log('═'.repeat(60));
    console.log('STEP 1: TRUNCATE ALL PRODUCTION TABLES');
    console.log('═'.repeat(60));
    console.log('');

    const tablesToTruncate = [
      'fight_ratings',
      'fight_reviews',
      'review_votes',
      'fight_tags',
      'fight_predictions',
      'pre_fight_comments',
      'pre_fight_comment_votes',
      'user_fight_tags',
      'fights',
      'events',
      'fighters',
      'users',
    ];

    for (const table of tablesToTruncate) {
      try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
        console.log(`   ✅ Truncated ${table}`);
      } catch (err) {
        // Table might not exist, that's ok
        console.log(`   ⚠️  ${table}: ${err.message.split('\n')[0]}`);
      }
    }
    console.log('');

    // =========================================================================
    // STEP 2: RUN sync-all-from-live.js
    // =========================================================================
    console.log('═'.repeat(60));
    console.log('STEP 2: SYNC FROM LIVE MYSQL');
    console.log('═'.repeat(60));
    console.log('');

    runScript('sync-all-from-live.js');

    // =========================================================================
    // STEP 3: RUN FIX-UP SCRIPTS
    // =========================================================================
    console.log('');
    console.log('═'.repeat(60));
    console.log('STEP 3: RUN FIX-UP SCRIPTS');
    console.log('═'.repeat(60));
    console.log('');

    console.log('Running sync-fight-order.js...');
    runScript('sync-fight-order.js');

    console.log('Running fix-duplicate-orders.js...');
    runScript('fix-duplicate-orders.js');

    console.log('Running import-images.js...');
    runScript('import-images.js');

    console.log('Running import-event-images-v2.js...');
    runScript('import-event-images-v2.js');

    // =========================================================================
    // DONE
    // =========================================================================
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    RESET COMPLETE                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Verify data: node launch-day-reset.js --verify');
    console.log('  2. Test the app to confirm everything works');
    console.log('');

  } finally {
    await prisma.$disconnect();
  }
}

function runScript(scriptName) {
  const scriptPath = path.join(MYSQL_EXPORT_DIR, scriptName);
  try {
    execSync(`node "${scriptPath}"`, {
      cwd: MYSQL_EXPORT_DIR,
      stdio: 'inherit',
      env: { ...process.env }
    });
  } catch (err) {
    console.error(`   ❌ ${scriptName} failed`);
    throw err;
  }
}

async function verifyData() {
  console.log('🔍 Verifying production data...\n');

  const prisma = new PrismaClient({
    datasources: { db: { url: PRODUCTION_DB_URL } }
  });

  try {
    const counts = {
      events: await prisma.event.count(),
      fighters: await prisma.fighter.count(),
      fights: await prisma.fight.count(),
      users: await prisma.user.count(),
      ratings: await prisma.fightRating.count(),
      reviews: await prisma.fightReview.count(),
    };

    console.log('📊 Production Data Counts:');
    console.log(`   Events:   ${counts.events}`);
    console.log(`   Fighters: ${counts.fighters}`);
    console.log(`   Fights:   ${counts.fights}`);
    console.log(`   Users:    ${counts.users}`);
    console.log(`   Ratings:  ${counts.ratings}`);
    console.log(`   Reviews:  ${counts.reviews}`);
    console.log('');

    // Check for fake fights (averageRating > 10)
    const fakeFights = await prisma.fight.count({
      where: { averageRating: { gt: 10 } }
    });

    if (fakeFights > 0) {
      console.log(`⚠️  WARNING: ${fakeFights} fights with averageRating > 10 (likely fake)`);
    } else {
      console.log('✅ No fake fights detected (all averageRating <= 10)');
    }

    // Check claimable users
    const claimableUsers = await prisma.user.count({
      where: { password: null }
    });
    console.log(`📧 Legacy users awaiting account claim: ${claimableUsers}`);
    console.log('');

  } finally {
    await prisma.$disconnect();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
