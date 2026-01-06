/**
 * Sync local database to Render production database
 *
 * Usage: LOCAL_DATABASE_URL="..." RENDER_DATABASE_URL="..." node scripts/sync-to-render.js
 */

const { PrismaClient } = require('@prisma/client');

// Use environment variables - NEVER hardcode credentials!
const LOCAL_URL = process.env.LOCAL_DATABASE_URL || 'postgresql://dev:devpassword@localhost:5433/yourapp_dev';
const RENDER_URL = process.env.RENDER_DATABASE_URL;

if (!RENDER_URL) {
  console.error('ERROR: RENDER_DATABASE_URL environment variable is required');
  console.error('Usage: LOCAL_DATABASE_URL="..." RENDER_DATABASE_URL="..." node scripts/sync-to-render.js');
  process.exit(1);
}

const localDb = new PrismaClient({ datasources: { db: { url: LOCAL_URL } } });
const renderDb = new PrismaClient({ datasources: { db: { url: RENDER_URL } } });

const BATCH_SIZE = 500;

async function syncTableBatch(tableName, getData, createMany) {
  console.log(`\nSyncing ${tableName}...`);
  const startTime = Date.now();

  let offset = 0;
  let totalSynced = 0;
  let totalErrors = 0;

  // Get total count
  const allData = await getData();
  const total = allData.length;
  console.log(`  Total records: ${total}`);

  if (total === 0) {
    console.log(`  ⏭️  No records to sync`);
    return;
  }

  // Process in batches
  for (let i = 0; i < allData.length; i += BATCH_SIZE) {
    const batch = allData.slice(i, i + BATCH_SIZE);

    try {
      const result = await createMany(batch);
      totalSynced += result.count;
    } catch (e) {
      totalErrors += batch.length;
      console.error(`  ❌ Batch error: ${e.message?.slice(0, 100)}`);
    }

    // Progress
    if ((i + BATCH_SIZE) % 2500 === 0 || i + BATCH_SIZE >= total) {
      const elapsed = (Date.now() - startTime) / 1000;
      const processed = Math.min(i + BATCH_SIZE, total);
      console.log(`  [${tableName}] ${processed}/${total} (${(processed/total*100).toFixed(0)}%) - ${(processed/elapsed).toFixed(0)} rec/s`);
    }
  }

  console.log(`  ✅ ${tableName}: ${totalSynced} synced, ${totalErrors} errors`);
}

async function main() {
  console.log('🚀 SYNCING LOCAL → RENDER (Batch Mode)\n');
  const startTime = Date.now();

  try {
    // Test connections
    console.log('📡 Testing connections...');
    await localDb.$queryRaw`SELECT 1`;
    console.log('  ✅ Local connected');
    await renderDb.$queryRaw`SELECT 1`;
    console.log('  ✅ Render connected');

    // Show before counts
    console.log('\n📊 Before sync:');
    console.log(`  Local:  ${await localDb.user.count()} users, ${await localDb.fighter.count()} fighters, ${await localDb.event.count()} events, ${await localDb.fight.count()} fights, ${await localDb.fightRating.count()} ratings`);
    console.log(`  Render: ${await renderDb.user.count()} users, ${await renderDb.fighter.count()} fighters, ${await renderDb.event.count()} events, ${await renderDb.fight.count()} fights, ${await renderDb.fightRating.count()} ratings`);

    // ========== LEVEL 0: Base Tables (no FK dependencies) ==========
    console.log('\n\n========== LEVEL 0: Base Tables ==========');

    await syncTableBatch('users',
      () => localDb.user.findMany({ orderBy: { createdAt: 'asc' } }),
      (data) => renderDb.user.createMany({ data, skipDuplicates: true })
    );

    await syncTableBatch('fighters',
      () => localDb.fighter.findMany({ orderBy: { createdAt: 'asc' } }),
      (data) => renderDb.fighter.createMany({ data, skipDuplicates: true })
    );

    await syncTableBatch('tags',
      () => localDb.tag.findMany(),
      (data) => renderDb.tag.createMany({ data, skipDuplicates: true })
    );

    // ========== LEVEL 1: Events (depends on nothing) ==========
    console.log('\n\n========== LEVEL 1: Events ==========');

    await syncTableBatch('events',
      () => localDb.event.findMany({ orderBy: { date: 'asc' } }),
      (data) => renderDb.event.createMany({ data, skipDuplicates: true })
    );

    // ========== LEVEL 2: Fights (depends on events, fighters) ==========
    console.log('\n\n========== LEVEL 2: Fights ==========');

    await syncTableBatch('fights',
      () => localDb.fight.findMany({ orderBy: { createdAt: 'asc' } }),
      (data) => renderDb.fight.createMany({ data, skipDuplicates: true })
    );

    // ========== LEVEL 3: Fight Activity (depends on users, fights) ==========
    console.log('\n\n========== LEVEL 3: Fight Activity ==========');

    await syncTableBatch('fightRatings',
      () => localDb.fightRating.findMany({ orderBy: { createdAt: 'asc' } }),
      (data) => renderDb.fightRating.createMany({ data, skipDuplicates: true })
    );

    await syncTableBatch('fightPredictions',
      () => localDb.fightPrediction.findMany(),
      (data) => renderDb.fightPrediction.createMany({ data, skipDuplicates: true })
    );

    // Reviews - top level first, then replies
    await syncTableBatch('fightReviews (top-level)',
      () => localDb.fightReview.findMany({ where: { parentReviewId: null }, orderBy: { createdAt: 'asc' } }),
      (data) => renderDb.fightReview.createMany({ data, skipDuplicates: true })
    );

    await syncTableBatch('fightReviews (replies)',
      () => localDb.fightReview.findMany({ where: { parentReviewId: { not: null } }, orderBy: { createdAt: 'asc' } }),
      (data) => renderDb.fightReview.createMany({ data, skipDuplicates: true })
    );

    await syncTableBatch('fightTags',
      () => localDb.fightTag.findMany(),
      (data) => renderDb.fightTag.createMany({ data, skipDuplicates: true })
    );

    // ========== Final counts ==========
    console.log('\n\n📊 After sync:');
    console.log(`  Render: ${await renderDb.user.count()} users, ${await renderDb.fighter.count()} fighters, ${await renderDb.event.count()} events, ${await renderDb.fight.count()} fights, ${await renderDb.fightRating.count()} ratings`);

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`\n\n✅ Sync complete in ${elapsed.toFixed(1)} seconds!`);

  } catch (error) {
    console.error('\n❌ Sync failed:', error);
    throw error;
  } finally {
    await localDb.$disconnect();
    await renderDb.$disconnect();
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
