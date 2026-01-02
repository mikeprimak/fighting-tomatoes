/**
 * Fast sync ratings using batch inserts
 */
const { PrismaClient } = require('@prisma/client');

const LOCAL_URL = 'postgresql://dev:devpassword@localhost:5433/yourapp_dev';
const RENDER_URL = 'postgresql://fightcrewappdb_k127_user:DLeYZBwCclr4JOEKDndStpQT0hBGNRlL@dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com/fightcrewapp';

const localDb = new PrismaClient({ datasources: { db: { url: LOCAL_URL } } });
const renderDb = new PrismaClient({ datasources: { db: { url: RENDER_URL } } });

const BATCH_SIZE = 1000;

async function syncRatings() {
  console.log('Fetching local ratings...');
  const localRatings = await localDb.fightRating.findMany();
  console.log(`Found ${localRatings.length} local ratings`);

  // Get existing IDs on Render to skip
  console.log('Fetching existing Render rating IDs...');
  const existingIds = new Set(
    (await renderDb.fightRating.findMany({ select: { id: true } })).map(r => r.id)
  );
  console.log(`Render has ${existingIds.size} existing ratings`);

  // Filter to only new ratings
  const newRatings = localRatings.filter(r => !existingIds.has(r.id));
  console.log(`Need to sync ${newRatings.length} new ratings`);

  // Batch insert
  let synced = 0;
  for (let i = 0; i < newRatings.length; i += BATCH_SIZE) {
    const batch = newRatings.slice(i, i + BATCH_SIZE);
    try {
      await renderDb.fightRating.createMany({
        data: batch,
        skipDuplicates: true,
      });
      synced += batch.length;
      console.log(`  ${synced}/${newRatings.length}`);
    } catch (e) {
      console.error(`Batch error: ${e.message.slice(0, 100)}`);
    }
  }

  console.log(`✓ Ratings synced: ${synced}`);
}

async function syncPredictions() {
  console.log('\nFetching local predictions...');
  const localPreds = await localDb.fightPrediction.findMany();
  console.log(`Found ${localPreds.length} local predictions`);

  const existingIds = new Set(
    (await renderDb.fightPrediction.findMany({ select: { id: true } })).map(p => p.id)
  );
  console.log(`Render has ${existingIds.size} existing predictions`);

  const newPreds = localPreds.filter(p => !existingIds.has(p.id));
  console.log(`Need to sync ${newPreds.length} new predictions`);

  if (newPreds.length > 0) {
    await renderDb.fightPrediction.createMany({
      data: newPreds,
      skipDuplicates: true,
    });
  }
  console.log(`✓ Predictions synced`);
}

async function syncReviews() {
  console.log('\nFetching local reviews...');
  const localReviews = await localDb.fightReview.findMany();
  console.log(`Found ${localReviews.length} local reviews`);

  const existingIds = new Set(
    (await renderDb.fightReview.findMany({ select: { id: true } })).map(r => r.id)
  );

  const newReviews = localReviews.filter(r => !existingIds.has(r.id));
  console.log(`Need to sync ${newReviews.length} new reviews`);

  for (let i = 0; i < newReviews.length; i += BATCH_SIZE) {
    const batch = newReviews.slice(i, i + BATCH_SIZE);
    try {
      await renderDb.fightReview.createMany({
        data: batch,
        skipDuplicates: true,
      });
    } catch (e) {
      console.error(`Batch error: ${e.message.slice(0, 100)}`);
    }
  }
  console.log(`✓ Reviews synced`);
}

async function syncPreFightComments() {
  console.log('\nFetching local pre-fight comments...');
  const localComments = await localDb.preFightComment.findMany();
  console.log(`Found ${localComments.length} local pre-fight comments`);

  const existingIds = new Set(
    (await renderDb.preFightComment.findMany({ select: { id: true } })).map(c => c.id)
  );

  const newComments = localComments.filter(c => !existingIds.has(c.id));
  console.log(`Need to sync ${newComments.length} new comments`);

  for (let i = 0; i < newComments.length; i += BATCH_SIZE) {
    const batch = newComments.slice(i, i + BATCH_SIZE);
    try {
      await renderDb.preFightComment.createMany({
        data: batch,
        skipDuplicates: true,
      });
    } catch (e) {
      console.error(`Batch error: ${e.message.slice(0, 100)}`);
    }
  }
  console.log(`✓ Pre-fight comments synced`);
}

async function main() {
  console.log('=== FAST SYNC: Remaining Tables ===\n');

  await syncRatings();
  await syncPredictions();
  await syncReviews();
  await syncPreFightComments();

  // Final counts
  console.log('\n=== RENDER DB FINAL ===');
  console.log('Ratings:', await renderDb.fightRating.count());
  console.log('Predictions:', await renderDb.fightPrediction.count());
  console.log('Reviews:', await renderDb.fightReview.count());
  console.log('PreFightComments:', await renderDb.preFightComment.count());

  await localDb.$disconnect();
  await renderDb.$disconnect();
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
