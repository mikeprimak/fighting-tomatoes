/**
 * 05-migrate-reviews.ts
 *
 * Migrates fight reviews from legacy fightingtomatoes.com to new database.
 *
 * Prerequisites:
 * - Run export-reviews.js (in mysql-export/) to export from MySQL
 * - Run 02-create-fight-mapping.ts first
 * - Run 03-migrate-users.ts first
 *
 * What this script does:
 * 1. Loads legacy reviews from reviews-export.json (MySQL export)
 * 2. Loads fight mapping (legacy ID -> new UUID)
 * 3. Loads user mapping (legacy email -> new UUID)
 * 4. Creates FightReview records for matched fights and users
 *
 * Usage: npx ts-node scripts/legacy-migration/05-migrate-reviews.ts
 *
 * Options:
 *   --dry-run: Show what would be done without making changes
 *   --limit N: Only process first N reviews (for testing)
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import type { FightMapping, UserMapping } from './types';

const prisma = new PrismaClient();

// Exported review structure from MySQL export script
interface ExportedReview {
  legacyFightId: number;
  id: number;
  commentId: string;
  score: number;
  comment: string;
  link: string | null;
  linkTitle: string;
  isMedia: number | null;
  avatar: string | null;
  displayName: string | null;
  date: string | null;
  helpful: number;
  commenterEmail: string;
  mediaOrganization: string;
  mediaOrganizationWebsite: string;
  articleClicks: number;
  homepageClicks: number;
  fightUrl: string;
  fightId: number;
  upvoters: unknown;
  upvotesRecently: number;
}

// Paths
const DATA_DIR = path.join(__dirname, 'legacy-data');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews-export.json'); // From MySQL export
const FIGHT_MAPPING_FILE = path.join(DATA_DIR, 'fight-mapping.json');
const USER_MAPPING_FILE = path.join(DATA_DIR, 'user-mapping.json');

// Parse command line args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1], 10) : undefined;

async function main() {
  console.log('='.repeat(60));
  console.log('REVIEWS MIGRATION');
  console.log(isDryRun ? '*** DRY RUN MODE - No changes will be made ***' : '');
  console.log('='.repeat(60));
  console.log('');

  // Load data files
  console.log('[1/4] Loading data files...');

  // Load reviews from MySQL export
  if (!fs.existsSync(REVIEWS_FILE)) {
    console.error('ERROR: reviews-export.json not found.');
    console.error('Run: cd mysql-export && node export-reviews.js');
    process.exit(1);
  }
  let legacyReviews: ExportedReview[] = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf-8'));
  console.log(`    Loaded ${legacyReviews.length} legacy reviews from MySQL export`);

  if (legacyReviews.length === 0) {
    console.log('');
    console.log('WARNING: No reviews to migrate.');
    await prisma.$disconnect();
    return;
  }

  if (limit) {
    legacyReviews = legacyReviews.slice(0, limit);
    console.log(`    Limited to first ${limit} reviews`);
  }

  // Load fight mapping
  if (!fs.existsSync(FIGHT_MAPPING_FILE)) {
    console.error('ERROR: fight-mapping.json not found. Run 02-create-fight-mapping.ts first.');
    process.exit(1);
  }
  const fightMappings: FightMapping[] = JSON.parse(fs.readFileSync(FIGHT_MAPPING_FILE, 'utf-8'));
  const fightMap = new Map<string, string>();
  for (const mapping of fightMappings) {
    fightMap.set(String(mapping.legacyId), mapping.newId);
  }
  console.log(`    Loaded ${fightMappings.length} fight mappings`);

  // Load user mapping
  if (!fs.existsSync(USER_MAPPING_FILE)) {
    console.error('ERROR: user-mapping.json not found. Run 03-migrate-users.ts first.');
    process.exit(1);
  }
  const userMappings: UserMapping[] = JSON.parse(fs.readFileSync(USER_MAPPING_FILE, 'utf-8'));
  const userMapByEmail = new Map<string, string>();
  for (const mapping of userMappings) {
    userMapByEmail.set(mapping.legacyEmail.toLowerCase(), mapping.newId);
  }
  console.log(`    Loaded ${userMappings.length} user mappings`);

  // Also look up existing users by email
  console.log('[2/4] Loading existing users from database...');
  const existingUsers = await prisma.user.findMany({
    select: { id: true, email: true },
  });
  for (const user of existingUsers) {
    if (!userMapByEmail.has(user.email.toLowerCase())) {
      userMapByEmail.set(user.email.toLowerCase(), user.id);
    }
  }
  console.log(`    Total users available for mapping: ${userMapByEmail.size}`);

  // Get existing reviews to avoid duplicates (using content hash approach)
  console.log('[3/4] Checking for existing reviews...');
  const existingReviews = await prisma.fightReview.findMany({
    select: { userId: true, fightId: true, content: true },
  });
  const existingReviewKeys = new Set<string>();
  for (const review of existingReviews) {
    // Create a key from user, fight, and first 50 chars of content
    const contentKey = review.content.substring(0, 50);
    existingReviewKeys.add(`${review.userId}:${review.fightId}:${contentKey}`);
  }
  console.log(`    Found ${existingReviews.length} existing reviews in database`);

  // Migrate reviews
  console.log('[4/4] Migrating reviews...');
  let created = 0;
  let skippedExisting = 0;
  let skippedNoFight = 0;
  let skippedNoUser = 0;
  let skippedInvalid = 0;
  let errors = 0;

  for (let i = 0; i < legacyReviews.length; i++) {
    const legacy = legacyReviews[i];

    // Validate review content
    if (!legacy.comment || legacy.comment.trim().length === 0) {
      skippedInvalid++;
      continue;
    }

    // Skip spam/bot reviews (very short gibberish)
    if (legacy.comment.length < 10 && legacy.commenterEmail === 'notloggedin') {
      skippedInvalid++;
      continue;
    }

    // Look up fight using legacyFightId (table name from MySQL export)
    const newFightId = fightMap.get(String(legacy.legacyFightId));
    if (!newFightId) {
      skippedNoFight++;
      continue;
    }

    // Look up user by email (commenterEmail in new format)
    if (!legacy.commenterEmail || legacy.commenterEmail === 'notloggedin') {
      skippedNoUser++;
      continue;
    }
    const newUserId = userMapByEmail.get(legacy.commenterEmail.toLowerCase());
    if (!newUserId) {
      skippedNoUser++;
      continue;
    }

    // Check if review already exists (by content similarity)
    const contentKey = legacy.comment.substring(0, 50);
    const reviewKey = `${newUserId}:${newFightId}:${contentKey}`;
    if (existingReviewKeys.has(reviewKey)) {
      skippedExisting++;
      continue;
    }

    // Parse date
    let createdAt = new Date();
    if (legacy.date && typeof legacy.date === 'string') {
      const parsedDate = new Date(legacy.date);
      if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900) {
        createdAt = parsedDate;
      }
    }

    if (!isDryRun) {
      try {
        await prisma.fightReview.create({
          data: {
            userId: newUserId,
            fightId: newFightId,
            content: legacy.comment,
            rating: legacy.score && legacy.score >= 1 && legacy.score <= 10 ? legacy.score : null,
            articleUrl: legacy.link || null,
            articleTitle: legacy.linkTitle || null,
            upvotes: legacy.helpful || 0,
            createdAt,
          },
        });
        created++;
        existingReviewKeys.add(reviewKey);
      } catch (error: unknown) {
        errors++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`    ERROR creating review: ${errorMessage}`);
      }
    } else {
      created++;
      existingReviewKeys.add(reviewKey);
    }

    // Progress indicator
    if ((i + 1) % 100 === 0) {
      console.log(`    Processed ${i + 1}/${legacyReviews.length} reviews...`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Summary:');
  console.log(`  Total legacy reviews:    ${legacyReviews.length}`);
  console.log(`  Created:                 ${created}`);
  console.log(`  Skipped (existing):      ${skippedExisting}`);
  console.log(`  Skipped (no fight):      ${skippedNoFight}`);
  console.log(`  Skipped (no user):       ${skippedNoUser}`);
  console.log(`  Skipped (invalid):       ${skippedInvalid}`);
  console.log(`  Errors:                  ${errors}`);

  if (isDryRun) {
    console.log('');
    console.log('*** This was a DRY RUN - no changes were made ***');
    console.log('Run without --dry-run to perform the actual migration.');
  }

  await prisma.$disconnect();
}

// Run the script
main().catch(console.error);
