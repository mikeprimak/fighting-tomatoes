/**
 * 06-migrate-tags.ts
 *
 * Migrates fight tags from legacy fightingtomatoes.com to new database.
 *
 * Prerequisites:
 * - Run 01-parse-legacy-data.ts first
 * - Run 02-create-fight-mapping.ts first
 * - Run 03-migrate-users.ts first
 *
 * What this script does:
 * 1. Loads legacy tags from JSON
 * 2. Maps legacy tag IDs to new tag UUIDs (or creates tags if they don't exist)
 * 3. Loads fight mapping (legacy ID -> new UUID)
 * 4. Loads user mapping (legacy email -> new UUID)
 * 5. Creates FightTag records for matched fights, users, and tags
 *
 * Usage: npx ts-node scripts/legacy-migration/06-migrate-tags.ts
 *
 * Options:
 *   --dry-run: Show what would be done without making changes
 *   --limit N: Only process first N tags (for testing)
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import type { LegacyTag, FightMapping, UserMapping } from './types';

const prisma = new PrismaClient();

// Paths
const DATA_DIR = path.join(__dirname, 'legacy-data');
const TAGS_FILE = path.join(DATA_DIR, 'tags.json');
const FIGHT_MAPPING_FILE = path.join(DATA_DIR, 'fight-mapping.json');
const USER_MAPPING_FILE = path.join(DATA_DIR, 'user-mapping.json');

// Legacy tag ID to name mapping (from fightingtomatoes.com MySQL tags table)
// Corrected mapping based on actual legacy database
const LEGACY_TAG_NAMES: Record<string, string> = {
  '1': 'Brutal',
  '2': 'Explosive',
  '4': 'Technical',
  '6': 'Great Striking',
  '7': 'Comeback',
  '10': 'Brawl',
  '11': 'One-Sided',
  '14': 'Climactic',
  '15': 'Surprising',
  '16': 'Striking-heavy',
  '17': 'Submission-heavy',
  '18': 'Balanced',
  '19': 'Back-and-Forth',
  '20': 'Competitive',
  '21': 'Fast-paced',
  '23': 'Bloody',
  '24': 'Scrappy',
  '25': 'Close Fight',
  '26': 'Controversial',
  '27': 'One-sided',
  '28': 'Heart',
  '29': 'Walk Off KO',
  '31': 'Great Grappling',
  '32': 'Wild',
  '33': 'Chaotic',
  '34': 'Edge Of Your Seat',
  '35': 'Boring',
  '36': 'BJJ',
  '37': 'Funny',
  '38': 'Comeback',
  '39': 'FOTN',
  '40': 'FOTY',
  '41': 'POTN',
  '42': 'Disappointing',
  '43': 'Stand Up Battle',
  '44': 'Unique Style',
  '45': 'Crowd-pleasing',
  '46': 'High-stakes',
  '47': 'Instant Classic',
  '48': 'Must-watch',
  '49': 'Knockout',
  '50': 'Brawl',
  '51': 'Kick-heavy',
  '52': 'Wrestling-oriented',
  '53': 'Charged',
  '54': 'Comeback',
  '55': 'War',
};

// Map legacy tag names to new tag categories
const TAG_CATEGORY_MAP: Record<string, 'STYLE' | 'PACE' | 'OUTCOME' | 'EMOTION' | 'QUALITY'> = {
  // Emotion tags
  'Brutal': 'EMOTION',
  'Heart': 'EMOTION',
  'Controversial': 'EMOTION',
  'Surprising': 'EMOTION',
  'Climactic': 'EMOTION',
  'Charged': 'EMOTION',
  'Funny': 'EMOTION',

  // Style tags
  'Technical': 'STYLE',
  'Brawl': 'STYLE',
  'Great Striking': 'STYLE',
  'Great Grappling': 'STYLE',
  'Striking-heavy': 'STYLE',
  'Submission-heavy': 'STYLE',
  'BJJ': 'STYLE',
  'Wrestling-oriented': 'STYLE',
  'Kick-heavy': 'STYLE',
  'Stand Up Battle': 'STYLE',
  'Balanced': 'STYLE',
  'Unique Style': 'STYLE',
  'Scrappy': 'STYLE',
  'Wild': 'STYLE',
  'Chaotic': 'STYLE',

  // Pace tags
  'Fast-paced': 'PACE',
  'One-Sided': 'PACE',
  'One-sided': 'PACE',
  'Competitive': 'PACE',
  'Back-and-Forth': 'PACE',
  'Close Fight': 'PACE',
  'Edge Of Your Seat': 'PACE',
  'War': 'PACE',

  // Outcome tags
  'Knockout': 'OUTCOME',
  'Walk Off KO': 'OUTCOME',
  'Comeback': 'OUTCOME',
  'Explosive': 'OUTCOME',
  'Bloody': 'OUTCOME',

  // Quality tags
  'FOTN': 'QUALITY',
  'FOTY': 'QUALITY',
  'POTN': 'QUALITY',
  'Instant Classic': 'QUALITY',
  'Must-watch': 'QUALITY',
  'Crowd-pleasing': 'QUALITY',
  'High-stakes': 'QUALITY',
  'Boring': 'QUALITY',
  'Disappointing': 'QUALITY',
};

// Parse command line args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1], 10) : undefined;

async function main() {
  console.log('='.repeat(60));
  console.log('TAGS MIGRATION');
  console.log(isDryRun ? '*** DRY RUN MODE - No changes will be made ***' : '');
  console.log('='.repeat(60));
  console.log('');

  // Load data files
  console.log('[1/5] Loading data files...');

  // Load tags
  if (!fs.existsSync(TAGS_FILE)) {
    console.error('ERROR: tags.json not found. Run 01-parse-legacy-data.ts first.');
    process.exit(1);
  }
  let legacyTags: LegacyTag[] = JSON.parse(fs.readFileSync(TAGS_FILE, 'utf-8'));
  console.log(`    Loaded ${legacyTags.length} legacy tags`);

  if (legacyTags.length === 0) {
    console.log('');
    console.log('WARNING: No tags to migrate.');
    await prisma.$disconnect();
    return;
  }

  if (limit) {
    legacyTags = legacyTags.slice(0, limit);
    console.log(`    Limited to first ${limit} tags`);
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
  const userMapByHash = new Map<string, string>();
  for (const mapping of userMappings) {
    userMapByEmail.set(mapping.legacyEmail.toLowerCase(), mapping.newId);
    userMapByHash.set(mapping.legacyEmailHash, mapping.newId);
  }
  console.log(`    Loaded ${userMappings.length} user mappings`);

  // Load existing users from database
  console.log('[2/5] Loading existing users from database...');
  const existingUsers = await prisma.user.findMany({
    select: { id: true, email: true },
  });
  for (const user of existingUsers) {
    if (!userMapByEmail.has(user.email.toLowerCase())) {
      userMapByEmail.set(user.email.toLowerCase(), user.id);
    }
  }
  console.log(`    Total users available for mapping: ${userMapByEmail.size}`);

  // Get or create tags in new database
  console.log('[3/5] Setting up tag mappings...');
  const tagMap = new Map<string, string>(); // legacyId -> newId

  const existingTags = await prisma.tag.findMany();
  const tagByName = new Map<string, string>();
  for (const tag of existingTags) {
    tagByName.set(tag.name.toLowerCase(), tag.id);
  }

  // Map legacy tags to new tags
  for (const [legacyId, tagName] of Object.entries(LEGACY_TAG_NAMES)) {
    let newTagId = tagByName.get(tagName.toLowerCase());

    if (!newTagId && !isDryRun) {
      // Create the tag if it doesn't exist
      const category = TAG_CATEGORY_MAP[tagName] || 'QUALITY';
      try {
        const newTag = await prisma.tag.create({
          data: {
            name: tagName,
            category,
            isActive: true,
            forHighRatings: ['Fight of the Night', 'Performance of the Night', 'Knockout of the Night', 'Submission of the Night', 'Classic', 'Exciting'].includes(tagName),
            forMediumRatings: ['Great Grappling', 'Great Striking', 'Technical', 'Close Fight', 'Comeback', 'Heart'].includes(tagName),
            forLowRatings: ['One-Sided', 'Decision', 'Controversial'].includes(tagName),
            forVeryLowRatings: ['Boring'].includes(tagName),
          },
        });
        newTagId = newTag.id;
        tagByName.set(tagName.toLowerCase(), newTagId);
        console.log(`    Created new tag: ${tagName}`);
      } catch {
        // Tag might have been created by another process
        const existingTag = await prisma.tag.findFirst({ where: { name: tagName } });
        if (existingTag) {
          newTagId = existingTag.id;
          tagByName.set(tagName.toLowerCase(), newTagId);
        }
      }
    } else if (!newTagId && isDryRun) {
      newTagId = `dry-run-tag-${legacyId}`;
    }

    if (newTagId) {
      tagMap.set(legacyId, newTagId);
    }
  }
  console.log(`    Mapped ${tagMap.size} tag types`);

  // Get existing fight tags to avoid duplicates
  console.log('[4/5] Checking for existing fight tags...');
  const existingFightTags = new Set<string>();
  const currentFightTags = await prisma.fightTag.findMany({
    select: { userId: true, fightId: true, tagId: true },
  });
  for (const ft of currentFightTags) {
    existingFightTags.add(`${ft.userId}:${ft.fightId}:${ft.tagId}`);
  }
  console.log(`    Found ${currentFightTags.length} existing fight tags in database`);

  // Migrate tags
  console.log('[5/5] Migrating fight tags...');
  let created = 0;
  let skippedExisting = 0;
  let skippedNoFight = 0;
  let skippedNoUser = 0;
  let skippedNoTag = 0;
  let errors = 0;

  const tagsToCreate: Array<{
    userId: string;
    fightId: string;
    tagId: string;
  }> = [];

  for (let i = 0; i < legacyTags.length; i++) {
    const legacy = legacyTags[i];

    // Look up tag
    const newTagId = tagMap.get(String(legacy.tagid));
    if (!newTagId) {
      skippedNoTag++;
      continue;
    }

    // Look up fight
    const newFightId = fightMap.get(String(legacy.fightid));
    if (!newFightId) {
      skippedNoFight++;
      continue;
    }

    // Look up user
    let newUserId = userMapByHash.get(legacy.userEmailHash);
    if (!newUserId && legacy.userEmail) {
      newUserId = userMapByEmail.get(legacy.userEmail.toLowerCase());
    }
    if (!newUserId) {
      skippedNoUser++;
      continue;
    }

    // Check if fight tag already exists
    const tagKey = `${newUserId}:${newFightId}:${newTagId}`;
    if (existingFightTags.has(tagKey)) {
      skippedExisting++;
      continue;
    }

    tagsToCreate.push({
      userId: newUserId,
      fightId: newFightId,
      tagId: newTagId,
    });

    existingFightTags.add(tagKey); // Prevent duplicates in this batch

    // Progress indicator
    if ((i + 1) % 5000 === 0) {
      console.log(`    Processed ${i + 1}/${legacyTags.length} tags...`);
    }
  }

  console.log(`    Prepared ${tagsToCreate.length} tags for creation`);

  // Batch create tags
  if (!isDryRun && tagsToCreate.length > 0) {
    console.log('    Creating tags in batches...');
    const BATCH_SIZE = 1000;

    for (let i = 0; i < tagsToCreate.length; i += BATCH_SIZE) {
      const batch = tagsToCreate.slice(i, i + BATCH_SIZE);
      try {
        await prisma.fightTag.createMany({
          data: batch,
          skipDuplicates: true,
        });
        created += batch.length;
        console.log(`    Created batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tagsToCreate.length / BATCH_SIZE)}`);
      } catch (error: unknown) {
        errors += batch.length;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`    ERROR creating batch: ${errorMessage}`);
      }
    }
  } else if (isDryRun) {
    created = tagsToCreate.length;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Summary:');
  console.log(`  Total legacy tags:       ${legacyTags.length}`);
  console.log(`  Created:                 ${created}`);
  console.log(`  Skipped (existing):      ${skippedExisting}`);
  console.log(`  Skipped (no fight):      ${skippedNoFight}`);
  console.log(`  Skipped (no user):       ${skippedNoUser}`);
  console.log(`  Skipped (no tag type):   ${skippedNoTag}`);
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
