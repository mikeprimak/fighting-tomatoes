/**
 * 07-verify-migration.ts
 *
 * Verifies the migration by comparing counts and spot-checking data.
 *
 * Prerequisites: Run all previous migration scripts first
 *
 * What this script does:
 * 1. Loads migration mapping files
 * 2. Counts records in new database
 * 3. Compares to legacy data counts
 * 4. Spot-checks specific users' data
 *
 * Usage: npx ts-node scripts/legacy-migration/07-verify-migration.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import type { LegacyUser, LegacyRating, FightMapping, UserMapping } from './types';

const prisma = new PrismaClient();

// Paths
const DATA_DIR = path.join(__dirname, 'legacy-data');

async function main() {
  console.log('='.repeat(60));
  console.log('MIGRATION VERIFICATION');
  console.log('='.repeat(60));
  console.log('');

  // Load legacy data counts
  console.log('[1/4] Loading legacy data counts...');
  const legacyUsers = loadJson<LegacyUser[]>('users.json') || [];
  const legacyRatings = loadJson<LegacyRating[]>('ratings.json') || [];
  const legacyReviews = loadJson<unknown[]>('reviews.json') || [];
  const legacyTags = loadJson<unknown[]>('tags.json') || [];
  const fightMappings = loadJson<FightMapping[]>('fight-mapping.json') || [];
  const userMappings = loadJson<UserMapping[]>('user-mapping.json') || [];
  const unmatchedFights = loadJson<unknown[]>('unmatched-fights.json') || [];

  console.log('    Legacy data loaded');

  // Count records in new database
  console.log('[2/4] Counting records in new database...');
  const dbCounts = await getDbCounts();
  console.log('    Database counts retrieved');

  // Display comparison
  console.log('[3/4] Comparing counts...');
  console.log('');
  console.log('='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log('');

  console.log('USERS');
  console.log('  Legacy users (active):   ', legacyUsers.length);
  console.log('  User mappings created:   ', userMappings.length);
  console.log('  New database users:      ', dbCounts.users);
  console.log('  Migration rate:          ', `${((userMappings.length / legacyUsers.length) * 100).toFixed(1)}%`);
  console.log('');

  console.log('FIGHTS');
  console.log('  Legacy fights:           ', fightMappings.length + unmatchedFights.length);
  console.log('  Matched to new DB:       ', fightMappings.length);
  console.log('  Unmatched:               ', unmatchedFights.length);
  console.log('  Match rate:              ', `${((fightMappings.length / (fightMappings.length + unmatchedFights.length)) * 100).toFixed(1)}%`);
  console.log('');

  console.log('RATINGS');
  console.log('  Legacy ratings:          ', legacyRatings.length);
  console.log('  New database ratings:    ', dbCounts.ratings);
  console.log('  (Difference may be due to unmapped fights or users)');
  console.log('');

  console.log('REVIEWS');
  console.log('  Legacy reviews:          ', legacyReviews.length);
  console.log('  New database reviews:    ', dbCounts.reviews);
  console.log('  (Note: May need fightreviewsdb for complete review data)');
  console.log('');

  console.log('TAGS');
  console.log('  Legacy fight tags:       ', legacyTags.length);
  console.log('  New database fight tags: ', dbCounts.fightTags);
  console.log('');

  // Spot-check some migrated users
  console.log('[4/4] Spot-checking migrated users...');
  console.log('');
  console.log('='.repeat(60));
  console.log('SPOT CHECKS');
  console.log('='.repeat(60));
  console.log('');

  // Check a few specific users if they exist
  const sampleMappings = userMappings.slice(0, 5);
  for (const mapping of sampleMappings) {
    const user = await prisma.user.findUnique({
      where: { id: mapping.newId },
      include: {
        ratings: { take: 1 },
        reviews: { take: 1 },
      },
    });

    if (user) {
      const ratingsCount = await prisma.fightRating.count({ where: { userId: user.id } });
      const reviewsCount = await prisma.fightReview.count({ where: { userId: user.id } });

      console.log(`User: ${user.email}`);
      console.log(`  - ID:              ${user.id}`);
      console.log(`  - Display Name:    ${user.displayName || '(none)'}`);
      console.log(`  - Password:        ${user.password ? 'SET' : 'NULL (needs claim)'}`);
      console.log(`  - Email Verified:  ${user.isEmailVerified}`);
      console.log(`  - Ratings:         ${ratingsCount}`);
      console.log(`  - Reviews:         ${reviewsCount}`);
      console.log('');
    }
  }

  // Check if legacy users with activity have data migrated
  console.log('='.repeat(60));
  console.log('LEGACY USER DATA CHECK');
  console.log('='.repeat(60));
  console.log('');

  // Find users who had ratings in legacy
  const usersWithLegacyRatings = new Map<string, number>();
  for (const rating of legacyRatings) {
    if (rating.userEmail) {
      const count = usersWithLegacyRatings.get(rating.userEmail) || 0;
      usersWithLegacyRatings.set(rating.userEmail, count + 1);
    }
  }

  // Check top 5 users by legacy rating count
  const topLegacyUsers = [...usersWithLegacyRatings.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  for (const [email, legacyCount] of topLegacyUsers) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (user) {
      const newRatingsCount = await prisma.fightRating.count({ where: { userId: user.id } });
      console.log(`${email}`);
      console.log(`  Legacy ratings: ${legacyCount}`);
      console.log(`  New ratings:    ${newRatingsCount}`);
      console.log(`  Coverage:       ${((newRatingsCount / legacyCount) * 100).toFixed(1)}%`);
      console.log('');
    } else {
      console.log(`${email}`);
      console.log(`  Legacy ratings: ${legacyCount}`);
      console.log(`  Status:         NOT MIGRATED`);
      console.log('');
    }
  }

  console.log('='.repeat(60));
  console.log('VERIFICATION COMPLETE');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

async function getDbCounts() {
  const [users, ratings, reviews, fightTags, tags, fights] = await Promise.all([
    prisma.user.count(),
    prisma.fightRating.count(),
    prisma.fightReview.count(),
    prisma.fightTag.count(),
    prisma.tag.count(),
    prisma.fight.count(),
  ]);

  return { users, ratings, reviews, fightTags, tags, fights };
}

function loadJson<T>(filename: string): T | null {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`    Warning: ${filename} not found`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// Run the script
main().catch(console.error);
