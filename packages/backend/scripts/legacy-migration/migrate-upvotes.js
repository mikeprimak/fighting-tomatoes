/**
 * migrate-upvotes.js
 *
 * Migrates review upvote records from legacy data.
 * The reviews already have upvote COUNTS, but not individual vote records.
 * This script creates ReviewVote records for each upvoter.
 *
 * Usage: node scripts/legacy-migration/migrate-upvotes.js [--dry-run]
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.log('='.repeat(60));
  console.log('UPVOTE MIGRATION');
  console.log(isDryRun ? '*** DRY RUN MODE ***' : '');
  console.log('='.repeat(60));
  console.log('');

  // Load legacy data
  console.log('[1/4] Loading legacy data...');
  const legacyUsers = require('./legacy-data/users.json');
  const legacyReviews = require('./legacy-data/reviews-export.json');
  const fightMappings = require('./legacy-data/fight-mapping.json');

  console.log(`  Legacy users: ${legacyUsers.length}`);
  console.log(`  Legacy reviews: ${legacyReviews.length}`);
  console.log(`  Fight mappings: ${fightMappings.length}`);

  // Build fight mapping (legacy ID -> new ID)
  const legacyToNewFight = new Map();
  fightMappings.forEach(m => legacyToNewFight.set(String(m.legacyId), m.newId));

  // Get all users from new DB and build email -> new ID mapping
  console.log('[2/4] Building user mappings...');
  const newUsers = await prisma.user.findMany({
    select: { id: true, email: true }
  });
  const emailToNewId = new Map();
  newUsers.forEach(u => emailToNewId.set(u.email.toLowerCase(), u.id));

  // Build legacy user ID -> new user ID mapping
  const legacyUserToNewUser = new Map();
  legacyUsers.forEach(legacy => {
    const email = (legacy.emailaddress || '').toLowerCase().trim();
    if (email && emailToNewId.has(email)) {
      legacyUserToNewUser.set(legacy.id, emailToNewId.get(email));
    }
  });
  console.log(`  Mapped ${legacyUserToNewUser.size} legacy users to new users`);

  // Get all reviews from new DB (to match legacy reviews)
  console.log('[3/4] Loading new reviews...');
  const newReviews = await prisma.fightReview.findMany({
    select: { id: true, userId: true, fightId: true, content: true }
  });

  // Build a key for matching: fightId + first 50 chars of content
  const reviewLookup = new Map();
  newReviews.forEach(r => {
    const key = `${r.fightId}:${r.content.substring(0, 50)}`;
    reviewLookup.set(key, r);
  });
  console.log(`  Loaded ${newReviews.length} reviews from new DB`);

  // Get existing votes to avoid duplicates
  const existingVotes = await prisma.reviewVote.findMany({
    select: { userId: true, reviewId: true }
  });
  const existingVoteKeys = new Set();
  existingVotes.forEach(v => existingVoteKeys.add(`${v.userId}:${v.reviewId}`));
  console.log(`  Found ${existingVotes.length} existing votes`);

  // Migrate upvotes
  console.log('[4/4] Migrating upvotes...');
  let created = 0;
  let skippedExisting = 0;
  let skippedNoReview = 0;
  let skippedNoUser = 0;
  let errors = 0;

  for (const legacy of legacyReviews) {
    // Skip if no upvoters
    if (!legacy.upvoters || !legacy.upvoters.data || legacy.upvoters.data.length <= 2) {
      continue;
    }

    // Decode upvoters buffer to string like "-46--914-"
    const decoded = Buffer.from(legacy.upvoters.data).toString('utf8');
    const upvoterIds = decoded.match(/\d+/g) || [];

    if (upvoterIds.length === 0) continue;

    // Find the new fight ID
    const newFightId = legacyToNewFight.get(String(legacy.legacyFightId));
    if (!newFightId) {
      skippedNoReview += upvoterIds.length;
      continue;
    }

    // Find the new review by matching fight + content
    const reviewKey = `${newFightId}:${legacy.comment.substring(0, 50)}`;
    const newReview = reviewLookup.get(reviewKey);
    if (!newReview) {
      skippedNoReview += upvoterIds.length;
      continue;
    }

    // Create vote records for each upvoter
    for (const legacyUserId of upvoterIds) {
      const newUserId = legacyUserToNewUser.get(parseInt(legacyUserId));
      if (!newUserId) {
        skippedNoUser++;
        continue;
      }

      // Check if vote already exists
      const voteKey = `${newUserId}:${newReview.id}`;
      if (existingVoteKeys.has(voteKey)) {
        skippedExisting++;
        continue;
      }

      if (!isDryRun) {
        try {
          await prisma.reviewVote.create({
            data: {
              userId: newUserId,
              reviewId: newReview.id,
              isUpvote: true
            }
          });
          created++;
          existingVoteKeys.add(voteKey);
        } catch (error) {
          errors++;
          if (!error.message.includes('Unique constraint')) {
            console.error(`  Error: ${error.message}`);
          }
        }
      } else {
        created++;
        existingVoteKeys.add(voteKey);
      }
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Summary:');
  console.log(`  Created votes:          ${created}`);
  console.log(`  Skipped (existing):     ${skippedExisting}`);
  console.log(`  Skipped (no review):    ${skippedNoReview}`);
  console.log(`  Skipped (no user):      ${skippedNoUser}`);
  console.log(`  Errors:                 ${errors}`);

  if (isDryRun) {
    console.log('');
    console.log('*** DRY RUN - No changes made ***');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
