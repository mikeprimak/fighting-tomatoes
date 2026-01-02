/**
 * Migration Script: Fix Single-Name Fighters
 *
 * This script migrates single-name fighters (like "Tawanchai", "Rodtang")
 * from having their name in firstName to lastName.
 *
 * Before: { firstName: "Tawanchai", lastName: "" }
 * After:  { firstName: "", lastName: "Tawanchai" }
 *
 * This ensures:
 * - Proper sorting by lastName (the primary display name)
 * - No trailing spaces in display (e.g., "Tawanchai " → "Tawanchai")
 * - Consistent behavior across the app
 *
 * Usage:
 *   npx ts-node scripts/migrate-single-name-fighters.ts
 *   npx ts-node scripts/migrate-single-name-fighters.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateSingleNameFighters(dryRun: boolean = false) {
  console.log('=== Single-Name Fighter Migration ===\n');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}\n`);

  try {
    // Find all fighters where firstName is set but lastName is empty
    // These are likely single-name fighters stored incorrectly
    const singleNameFighters = await prisma.fighter.findMany({
      where: {
        firstName: { not: '' },
        lastName: '',
      },
      orderBy: { firstName: 'asc' },
    });

    console.log(`Found ${singleNameFighters.length} single-name fighters to migrate:\n`);

    if (singleNameFighters.length === 0) {
      console.log('No fighters need migration. Exiting.');
      return;
    }

    // Display fighters to be migrated
    for (const fighter of singleNameFighters) {
      console.log(`  - "${fighter.firstName}" → will become lastName`);
    }

    console.log('');

    if (dryRun) {
      console.log('DRY RUN: No changes made. Run without --dry-run to apply changes.');
      return;
    }

    // Perform the migration
    let migratedCount = 0;
    let errorCount = 0;

    for (const fighter of singleNameFighters) {
      try {
        await prisma.fighter.update({
          where: { id: fighter.id },
          data: {
            firstName: '',
            lastName: fighter.firstName,
          },
        });
        migratedCount++;
        console.log(`  ✓ Migrated: "${fighter.firstName}" (id: ${fighter.id})`);
      } catch (error: any) {
        errorCount++;
        console.error(`  ✗ Failed to migrate "${fighter.firstName}" (id: ${fighter.id}): ${error.message}`);
      }
    }

    console.log(`\n=== Migration Complete ===`);
    console.log(`  Migrated: ${migratedCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log(`  Total: ${singleNameFighters.length}`);

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-n');

migrateSingleNameFighters(dryRun)
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
