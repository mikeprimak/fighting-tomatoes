/**
 * Migration Script: Fix Fighter Name Split
 *
 * Problem: Fighter names were being split incorrectly:
 * - OLD (wrong): firstName = all but last word, lastName = last word
 *   Example: "Lance Gibson Jr" -> firstName: "Lance Gibson", lastName: "Jr"
 *
 * - NEW (correct): firstName = first word, lastName = everything else
 *   Example: "Lance Gibson Jr" -> firstName: "Lance", lastName: "Gibson Jr"
 *
 * This script fixes all existing fighters in the database.
 *
 * Usage: npx ts-node scripts/fixFighterNameSplit.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixFighterNames() {
  console.log('Starting fighter name fix migration...\n');

  // Get all fighters
  const fighters = await prisma.fighter.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
    }
  });

  console.log(`Found ${fighters.length} fighters to check.\n`);

  let fixedCount = 0;
  let skippedCount = 0;

  for (const fighter of fighters) {
    // Reconstruct the full name
    const fullName = `${fighter.firstName} ${fighter.lastName}`.trim();
    const parts = fullName.split(/\s+/).filter(p => p.length > 0);

    // Skip single-name fighters (e.g., "Mizuki")
    if (parts.length <= 1) {
      skippedCount++;
      continue;
    }

    // Calculate correct split
    const correctFirstName = parts[0];
    const correctLastName = parts.slice(1).join(' ');

    // Check if already correct
    if (fighter.firstName === correctFirstName && fighter.lastName === correctLastName) {
      skippedCount++;
      continue;
    }

    // Check if this is a case where the name was stored backwards
    // (firstName has multiple words OR lastName has only one word when fullName has 3+ words)
    const hasMultipleWordsInFirstName = fighter.firstName.split(/\s+/).length > 1;
    const hasOnlyOneWordInLastName = fighter.lastName.split(/\s+/).length === 1;
    const fullNameHasThreeOrMoreWords = parts.length >= 3;

    // Only fix if it looks like the backwards case
    if (hasMultipleWordsInFirstName || (fullNameHasThreeOrMoreWords && hasOnlyOneWordInLastName)) {
      console.log(`Fixing: "${fighter.firstName}" "${fighter.lastName}" -> "${correctFirstName}" "${correctLastName}"`);

      await prisma.fighter.update({
        where: { id: fighter.id },
        data: {
          firstName: correctFirstName,
          lastName: correctLastName,
        }
      });

      fixedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\n✅ Migration complete!`);
  console.log(`   Fixed: ${fixedCount} fighters`);
  console.log(`   Skipped: ${skippedCount} fighters (already correct or single name)`);
}

// Run the migration
fixFighterNames()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
