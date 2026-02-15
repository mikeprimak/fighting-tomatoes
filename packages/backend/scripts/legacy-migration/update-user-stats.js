#!/usr/bin/env node
/**
 * ============================================================================
 * UPDATE USER STATS
 * ============================================================================
 *
 * Recalculates cached user statistics after migration:
 *   - totalRatings: Count of ratings by this user
 *   - totalReviews: Count of reviews by this user
 *   - upvotesReceived: Sum of upvotes on their reviews
 *
 * USAGE:
 *   node update-user-stats.js              # Update all users
 *   node update-user-stats.js --dry-run    # Preview changes
 *
 * RUN AFTER:
 *   - Running sync-all-from-live.js
 *   - Running update-rating-stats.js (for fight stats)
 *
 * ============================================================================
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║               UPDATE USER STATISTICS                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  const startTime = Date.now();

  // Get all users
  const users = await prisma.user.findMany({
    select: { id: true, email: true }
  });
  console.log(`Found ${users.length} users to process\n`);

  // Get rating counts per user
  console.log('Calculating rating counts...');
  const ratingCounts = await prisma.fightRating.groupBy({
    by: ['userId'],
    _count: { id: true }
  });
  const ratingCountMap = new Map(
    ratingCounts.map(r => [r.userId, r._count.id])
  );
  console.log(`  Found ratings for ${ratingCounts.length} users`);

  // Get review counts per user
  console.log('Calculating review counts...');
  const reviewCounts = await prisma.fightReview.groupBy({
    by: ['userId'],
    _count: { id: true }
  });
  const reviewCountMap = new Map(
    reviewCounts.map(r => [r.userId, r._count.id])
  );
  console.log(`  Found reviews for ${reviewCounts.length} users`);

  // Get upvotes received per user (sum of upvotes on their reviews)
  console.log('Calculating upvotes received...');
  const upvoteSums = await prisma.fightReview.groupBy({
    by: ['userId'],
    _sum: { upvotes: true }
  });
  const upvoteSumMap = new Map(
    upvoteSums.map(r => [r.userId, r._sum.upvotes || 0])
  );
  console.log(`  Found upvotes for ${upvoteSums.length} users\n`);

  // Update each user
  console.log('Updating user statistics...');
  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const totalRatings = ratingCountMap.get(user.id) || 0;
    const totalReviews = reviewCountMap.get(user.id) || 0;
    const upvotesReceived = upvoteSumMap.get(user.id) || 0;

    // Skip users with no activity
    if (totalRatings === 0 && totalReviews === 0 && upvotesReceived === 0) {
      unchanged++;
      continue;
    }

    if (!DRY_RUN) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            totalRatings,
            totalReviews,
            upvotesReceived,
          }
        });
        updated++;
      } catch (e) {
        errors++;
      }
    } else {
      updated++;
    }

    // Progress update every 500 users
    if ((i + 1) % 500 === 0) {
      console.log(`  Processed ${i + 1}/${users.length} users...`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Print summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      UPDATE COMPLETE                           ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Updated:     ${String(updated).padStart(6)} users                                   ║`);
  console.log(`║  Unchanged:   ${String(unchanged).padStart(6)} users (no activity)                   ║`);
  console.log(`║  Errors:      ${String(errors).padStart(6)}                                          ║`);
  console.log(`║  Duration:    ${String(duration).padStart(6)}s                                        ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');

  if (DRY_RUN) {
    console.log('\n*** DRY RUN - No changes made ***');
  }

  // Show sample of top users
  console.log('\nTop 10 users by ratings:');
  const topUsers = await prisma.user.findMany({
    where: { totalRatings: { gt: 0 } },
    orderBy: { totalRatings: 'desc' },
    take: 10,
    select: { email: true, totalRatings: true, totalReviews: true, upvotesReceived: true }
  });

  for (const user of topUsers) {
    console.log(`  ${user.email.padEnd(35)} ${String(user.totalRatings).padStart(5)} ratings, ${String(user.totalReviews).padStart(3)} reviews, ${String(user.upvotesReceived).padStart(4)} upvotes`);
  }

  console.log('');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
