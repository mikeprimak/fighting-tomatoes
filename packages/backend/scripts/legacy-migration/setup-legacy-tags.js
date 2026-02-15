#!/usr/bin/env node
/**
 * ============================================================================
 * SETUP LEGACY TAGS
 * ============================================================================
 *
 * Replaces all tags with the legacy fightingtomatoes.com tags.
 * Mimics the production setup where legacy tags have all forX flags = false.
 *
 * USAGE:
 *   node setup-legacy-tags.js --dry-run    # Preview changes
 *   node setup-legacy-tags.js --confirm    # Execute
 *
 * ============================================================================
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CONFIRM = args.includes('--confirm');

// Legacy tags from fightingtomatoes.com fightdb.tags table
// All have forHighRatings/forMediumRatings/forLowRatings/forVeryLowRatings = false
// This means they're available for ANY rating (not filtered by score)
const LEGACY_TAGS = [
  { legacyId: 1, name: 'Brutal', category: 'EMOTION' },
  { legacyId: 2, name: 'Explosive', category: 'STYLE' },
  { legacyId: 4, name: 'Technical', category: 'STYLE' },
  { legacyId: 14, name: 'Climactic', category: 'EMOTION' },
  { legacyId: 15, name: 'Surprising', category: 'EMOTION' },
  { legacyId: 16, name: 'Striking-heavy', category: 'STYLE' },
  { legacyId: 17, name: 'Submission-heavy', category: 'STYLE' },
  { legacyId: 18, name: 'Balanced', category: 'STYLE' },
  { legacyId: 19, name: 'Back-and-Forth', category: 'STYLE' },
  { legacyId: 20, name: 'Competitive', category: 'STYLE' },
  { legacyId: 21, name: 'Fast-paced', category: 'PACE' },
  { legacyId: 23, name: 'Bloody', category: 'OUTCOME' },
  { legacyId: 24, name: 'Scrappy', category: 'STYLE' },
  { legacyId: 26, name: 'Controversial', category: 'EMOTION' },
  { legacyId: 27, name: 'One-sided', category: 'OUTCOME' },
  { legacyId: 28, name: 'Heart', category: 'EMOTION' },
  { legacyId: 29, name: 'Walk Off', category: 'OUTCOME' },
  { legacyId: 31, name: 'Great Grappling', category: 'STYLE' },
  { legacyId: 32, name: 'Wild', category: 'STYLE' },
  { legacyId: 33, name: 'Chaotic', category: 'STYLE' },  // Fixed typo from legacy "Choatic"
  { legacyId: 34, name: 'Edge Of Your Seat', category: 'EMOTION' },
  { legacyId: 35, name: 'Boring', category: 'QUALITY' },
  { legacyId: 36, name: 'BJJ', category: 'STYLE' },
  { legacyId: 37, name: 'Funny', category: 'EMOTION' },
  { legacyId: 38, name: 'Comeback', category: 'EMOTION' },
  { legacyId: 39, name: 'FOTN', category: 'QUALITY' },
  { legacyId: 40, name: 'FOTY', category: 'QUALITY' },
  { legacyId: 41, name: 'POTN', category: 'QUALITY' },
  { legacyId: 42, name: 'Disappointing', category: 'QUALITY' },
  { legacyId: 43, name: 'Stand Up Battle', category: 'STYLE' },
  { legacyId: 44, name: 'Unique Style', category: 'STYLE' },
  { legacyId: 45, name: 'Crowd-pleasing', category: 'EMOTION' },
  { legacyId: 46, name: 'High-stakes', category: 'EMOTION' },
  { legacyId: 47, name: 'Instant Classic', category: 'QUALITY' },
  { legacyId: 48, name: 'Must-watch', category: 'QUALITY' },
  { legacyId: 49, name: 'KO', category: 'OUTCOME' },
  { legacyId: 50, name: 'Brawl', category: 'STYLE' },
  { legacyId: 51, name: 'Kick-heavy', category: 'STYLE' },
  { legacyId: 52, name: 'Wrestling-oriented', category: 'STYLE' },
  { legacyId: 53, name: 'Charged', category: 'EMOTION' },
  { legacyId: 54, name: 'War', category: 'STYLE' },
  // Note: legacyId 54 was "Comeback" duplicate in legacy, using 55 for War
];

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║               SETUP LEGACY TAGS                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  if (!CONFIRM && !DRY_RUN) {
    console.log('Usage:');
    console.log('  node setup-legacy-tags.js --dry-run    # Preview changes');
    console.log('  node setup-legacy-tags.js --confirm    # Execute');
    console.log('');
    console.log('⚠️  This will DELETE all existing tags. Use --confirm to execute.');
    await prisma.$disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Step 1: Check existing tags and fight_tags
  const existingTags = await prisma.tag.count();
  const existingFightTags = await prisma.fightTag.count();

  console.log(`Current state:`);
  console.log(`  Tags:       ${existingTags}`);
  console.log(`  FightTags:  ${existingFightTags}`);
  console.log('');

  if (!DRY_RUN) {
    // Step 2: Delete all fight_tags first (FK constraint)
    console.log('Deleting existing fight_tags...');
    const deletedFightTags = await prisma.fightTag.deleteMany({});
    console.log(`  Deleted ${deletedFightTags.count} fight_tags`);

    // Step 3: Delete all tags
    console.log('Deleting existing tags...');
    const deletedTags = await prisma.tag.deleteMany({});
    console.log(`  Deleted ${deletedTags.count} tags`);
    console.log('');

    // Step 4: Create legacy tags
    console.log(`Creating ${LEGACY_TAGS.length} legacy tags...`);

    const createdTags = [];
    for (const tag of LEGACY_TAGS) {
      const created = await prisma.tag.create({
        data: {
          name: tag.name,
          category: tag.category,
          isActive: true,
          sortOrder: tag.legacyId, // Use legacy ID for sort order
          forHighRatings: false,
          forMediumRatings: false,
          forLowRatings: false,
          forVeryLowRatings: false,
        }
      });
      createdTags.push({ ...created, legacyId: tag.legacyId });
    }

    console.log(`  Created ${createdTags.length} tags\n`);

    // Step 5: Output mapping for sync script
    console.log('Legacy ID → New ID mapping:');
    console.log('─'.repeat(60));
    for (const tag of createdTags) {
      console.log(`  ${String(tag.legacyId).padStart(2)} → ${tag.id}  (${tag.name})`);
    }
    console.log('');

    // Save mapping to file for sync script
    const mapping = {};
    for (const tag of createdTags) {
      mapping[tag.legacyId] = tag.id;
    }

    const fs = require('fs');
    const mappingPath = __dirname + '/legacy-tag-mapping.json';
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    console.log(`Mapping saved to: ${mappingPath}`);
  } else {
    console.log(`Would delete ${existingFightTags} fight_tags`);
    console.log(`Would delete ${existingTags} tags`);
    console.log(`Would create ${LEGACY_TAGS.length} legacy tags`);
  }

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      COMPLETE                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  if (!DRY_RUN) {
    console.log('Next steps:');
    console.log('  1. Update sync-all-from-live.js to use legacy-tag-mapping.json');
    console.log('  2. Run: node sync-all-from-live.js --only=tags');
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
