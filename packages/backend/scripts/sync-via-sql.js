/**
 * Sync via raw SQL - only syncs records where FKs exist
 *
 * Usage: LOCAL_DATABASE_URL="postgresql://..." RENDER_DATABASE_URL="postgresql://..." node sync-via-sql.js
 */
const { PrismaClient } = require('@prisma/client');

// Use environment variables - NEVER hardcode credentials!
const LOCAL_URL = process.env.LOCAL_DATABASE_URL || 'postgresql://dev:devpassword@localhost:5433/yourapp_dev';
const RENDER_URL = process.env.RENDER_DATABASE_URL;

if (!RENDER_URL) {
  console.error('ERROR: RENDER_DATABASE_URL environment variable is required');
  console.error('Usage: LOCAL_DATABASE_URL="..." RENDER_DATABASE_URL="..." node sync-via-sql.js');
  process.exit(1);
}

const localDb = new PrismaClient({ datasources: { db: { url: LOCAL_URL } } });
const renderDb = new PrismaClient({ datasources: { db: { url: RENDER_URL } } });

async function main() {
  console.log('=== SMART SYNC ===\n');

  // Get valid IDs from Render (to filter)
  console.log('Getting valid Render IDs...');
  const renderFightIds = new Set((await renderDb.fight.findMany({ select: { id: true } })).map(f => f.id));
  const renderUserIds = new Set((await renderDb.user.findMany({ select: { id: true } })).map(u => u.id));
  console.log(`Render has ${renderFightIds.size} fights, ${renderUserIds.size} users`);

  // Get existing rating IDs on Render
  const existingRatingIds = new Set((await renderDb.fightRating.findMany({ select: { id: true } })).map(r => r.id));
  console.log(`Render has ${existingRatingIds.size} ratings`);

  // Get local ratings that can be synced (FK exists and not already synced)
  console.log('\nFetching local ratings...');
  const localRatings = await localDb.fightRating.findMany();
  const validRatings = localRatings.filter(r =>
    renderFightIds.has(r.fightId) &&
    renderUserIds.has(r.userId) &&
    !existingRatingIds.has(r.id)
  );
  console.log(`Local: ${localRatings.length}, Valid to sync: ${validRatings.length}`);

  // Batch insert ratings
  const BATCH = 500;
  let synced = 0;
  for (let i = 0; i < validRatings.length; i += BATCH) {
    const batch = validRatings.slice(i, i + BATCH);
    try {
      await renderDb.fightRating.createMany({ data: batch, skipDuplicates: true });
      synced += batch.length;
      if (synced % 5000 === 0 || i + BATCH >= validRatings.length) {
        console.log(`  Ratings: ${synced}/${validRatings.length}`);
      }
    } catch (e) {
      console.error(`  Batch error at ${i}: ${e.message.slice(0, 80)}`);
    }
  }
  console.log(`✓ Ratings synced: ${synced}`);

  // Predictions
  console.log('\nFetching local predictions...');
  const existingPredIds = new Set((await renderDb.fightPrediction.findMany({ select: { id: true } })).map(p => p.id));
  const localPreds = await localDb.fightPrediction.findMany();
  const validPreds = localPreds.filter(p =>
    renderFightIds.has(p.fightId) &&
    renderUserIds.has(p.userId) &&
    !existingPredIds.has(p.id)
  );
  console.log(`Local: ${localPreds.length}, Valid to sync: ${validPreds.length}`);

  if (validPreds.length > 0) {
    try {
      await renderDb.fightPrediction.createMany({ data: validPreds, skipDuplicates: true });
      console.log(`✓ Predictions synced: ${validPreds.length}`);
    } catch (e) {
      console.error(`Prediction sync error: ${e.message.slice(0, 100)}`);
    }
  }

  // Reviews
  console.log('\nFetching local reviews...');
  const existingReviewIds = new Set((await renderDb.fightReview.findMany({ select: { id: true } })).map(r => r.id));
  const localReviews = await localDb.fightReview.findMany();
  const validReviews = localReviews.filter(r =>
    renderFightIds.has(r.fightId) &&
    renderUserIds.has(r.userId) &&
    !existingReviewIds.has(r.id)
  );
  console.log(`Local: ${localReviews.length}, Valid to sync: ${validReviews.length}`);

  for (let i = 0; i < validReviews.length; i += BATCH) {
    const batch = validReviews.slice(i, i + BATCH);
    try {
      await renderDb.fightReview.createMany({ data: batch, skipDuplicates: true });
    } catch (e) {
      console.error(`Review batch error: ${e.message.slice(0, 80)}`);
    }
  }
  console.log(`✓ Reviews synced: ${validReviews.length}`);

  // Pre-fight comments
  console.log('\nFetching local pre-fight comments...');
  const existingCommentIds = new Set((await renderDb.preFightComment.findMany({ select: { id: true } })).map(c => c.id));
  const localComments = await localDb.preFightComment.findMany();
  const validComments = localComments.filter(c =>
    renderFightIds.has(c.fightId) &&
    renderUserIds.has(c.userId) &&
    !existingCommentIds.has(c.id)
  );
  console.log(`Local: ${localComments.length}, Valid to sync: ${validComments.length}`);

  for (let i = 0; i < validComments.length; i += BATCH) {
    const batch = validComments.slice(i, i + BATCH);
    try {
      await renderDb.preFightComment.createMany({ data: batch, skipDuplicates: true });
    } catch (e) {
      console.error(`Comment batch error: ${e.message.slice(0, 80)}`);
    }
  }
  console.log(`✓ Comments synced: ${validComments.length}`);

  // Final counts
  console.log('\n=== RENDER DB FINAL ===');
  console.log('Ratings:', await renderDb.fightRating.count());
  console.log('Predictions:', await renderDb.fightPrediction.count());
  console.log('Reviews:', await renderDb.fightReview.count());
  console.log('Comments:', await renderDb.preFightComment.count());

  await localDb.$disconnect();
  await renderDb.$disconnect();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
