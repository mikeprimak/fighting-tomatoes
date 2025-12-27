/**
 * 04-migrate-ratings.ts
 *
 * Migrates fight ratings from legacy fightingtomatoes.com to new database.
 *
 * Prerequisites:
 * - Run 01-parse-legacy-data.ts first
 * - Run 02-create-fight-mapping.ts first
 * - Run 03-migrate-users.ts first
 *
 * What this script does:
 * 1. Loads legacy ratings from JSON
 * 2. Loads fight mapping (legacy ID -> new UUID)
 * 3. Loads user mapping (legacy email -> new UUID)
 * 4. Creates FightRating records for matched fights and users
 *
 * Usage: npx ts-node scripts/legacy-migration/04-migrate-ratings.ts
 *
 * Options:
 *   --dry-run: Show what would be done without making changes
 *   --limit N: Only process first N ratings (for testing)
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import type { LegacyRating, FightMapping, UserMapping } from './types';

const prisma = new PrismaClient();

// Paths
const DATA_DIR = path.join(__dirname, 'legacy-data');
const RATINGS_FILE = path.join(DATA_DIR, 'ratings.json');
const FIGHT_MAPPING_FILE = path.join(DATA_DIR, 'fight-mapping.json');
const USER_MAPPING_FILE = path.join(DATA_DIR, 'user-mapping.json');

// Parse command line args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1], 10) : undefined;

async function main() {
  console.log('='.repeat(60));
  console.log('RATINGS MIGRATION');
  console.log(isDryRun ? '*** DRY RUN MODE - No changes will be made ***' : '');
  console.log('='.repeat(60));
  console.log('');

  // Load data files
  console.log('[1/4] Loading data files...');

  // Load ratings
  if (!fs.existsSync(RATINGS_FILE)) {
    console.error('ERROR: ratings.json not found. Run 01-parse-legacy-data.ts first.');
    process.exit(1);
  }
  let legacyRatings: LegacyRating[] = JSON.parse(fs.readFileSync(RATINGS_FILE, 'utf-8'));
  console.log(`    Loaded ${legacyRatings.length} legacy ratings`);

  if (limit) {
    legacyRatings = legacyRatings.slice(0, limit);
    console.log(`    Limited to first ${limit} ratings`);
  }

  // Load fight mapping
  if (!fs.existsSync(FIGHT_MAPPING_FILE)) {
    console.error('ERROR: fight-mapping.json not found. Run 02-create-fight-mapping.ts first.');
    process.exit(1);
  }
  const fightMappings: FightMapping[] = JSON.parse(fs.readFileSync(FIGHT_MAPPING_FILE, 'utf-8'));
  const fightMap = new Map<string, string>(); // legacyId -> newId
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
  const userMapByEmail = new Map<string, string>(); // email -> newId
  const userMapByHash = new Map<string, string>(); // emailHash -> newId
  for (const mapping of userMappings) {
    userMapByEmail.set(mapping.legacyEmail.toLowerCase(), mapping.newId);
    userMapByHash.set(mapping.legacyEmailHash, mapping.newId);
  }
  console.log(`    Loaded ${userMappings.length} user mappings`);

  // Also look up existing users by email (in case they registered separately)
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

  // Get existing ratings to avoid duplicates
  console.log('[3/4] Checking for existing ratings...');
  const existingRatings = new Set<string>();
  const currentRatings = await prisma.fightRating.findMany({
    select: { userId: true, fightId: true },
  });
  for (const rating of currentRatings) {
    existingRatings.add(`${rating.userId}:${rating.fightId}`);
  }
  console.log(`    Found ${existingRatings.size} existing ratings in database`);

  // Migrate ratings
  console.log('[4/4] Migrating ratings...');
  let created = 0;
  let skippedExisting = 0;
  let skippedNoFight = 0;
  let skippedNoUser = 0;
  let skippedInvalid = 0;
  let errors = 0;

  const ratingsToCreate: Array<{
    userId: string;
    fightId: string;
    rating: number;
    createdAt: Date;
  }> = [];

  for (let i = 0; i < legacyRatings.length; i++) {
    const legacy = legacyRatings[i];

    // Validate rating value
    if (!legacy.score || legacy.score < 1 || legacy.score > 10) {
      skippedInvalid++;
      continue;
    }

    // Look up fight
    const newFightId = fightMap.get(String(legacy.fightid));
    if (!newFightId) {
      skippedNoFight++;
      continue;
    }

    // Look up user - try by email hash first, then by email
    let newUserId = userMapByHash.get(legacy.userEmailHash);
    if (!newUserId && legacy.userEmail) {
      newUserId = userMapByEmail.get(legacy.userEmail.toLowerCase());
    }
    if (!newUserId) {
      skippedNoUser++;
      continue;
    }

    // Check if rating already exists
    const ratingKey = `${newUserId}:${newFightId}`;
    if (existingRatings.has(ratingKey)) {
      skippedExisting++;
      continue;
    }

    // Parse timestamp
    let createdAt = new Date();
    if (legacy.time_of_rating) {
      const timestamp = parseInt(legacy.time_of_rating, 10);
      if (!isNaN(timestamp)) {
        createdAt = new Date(timestamp * 1000); // Unix timestamp in seconds
      }
    }

    ratingsToCreate.push({
      userId: newUserId,
      fightId: newFightId,
      rating: legacy.score,
      createdAt,
    });

    existingRatings.add(ratingKey); // Prevent duplicates in this batch

    // Progress indicator
    if ((i + 1) % 10000 === 0) {
      console.log(`    Processed ${i + 1}/${legacyRatings.length} ratings...`);
    }
  }

  console.log(`    Prepared ${ratingsToCreate.length} ratings for creation`);

  // Batch create ratings
  if (!isDryRun && ratingsToCreate.length > 0) {
    console.log('    Creating ratings in batches...');
    const BATCH_SIZE = 1000;

    for (let i = 0; i < ratingsToCreate.length; i += BATCH_SIZE) {
      const batch = ratingsToCreate.slice(i, i + BATCH_SIZE);
      try {
        await prisma.fightRating.createMany({
          data: batch,
          skipDuplicates: true,
        });
        created += batch.length;
        console.log(`    Created batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(ratingsToCreate.length / BATCH_SIZE)}`);
      } catch (error: unknown) {
        errors += batch.length;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`    ERROR creating batch: ${errorMessage}`);
      }
    }
  } else if (isDryRun) {
    created = ratingsToCreate.length;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Summary:');
  console.log(`  Total legacy ratings:    ${legacyRatings.length}`);
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
