/**
 * Script to check and remove the unique constraint on fight_reviews
 * This constraint prevents users from having both a top-level review and replies
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking for unique constraints/indexes on fight_reviews...');

  // Check for unique constraints
  const constraints = await prisma.$queryRaw<Array<{ constraint_name: string }>>`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_name = 'fight_reviews'
    AND constraint_type = 'UNIQUE'
  `;

  console.log('Found constraints:', JSON.stringify(constraints, null, 2));

  // Also check for unique indexes
  const indexes = await prisma.$queryRaw<Array<{ indexname: string, indexdef: string }>>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'fight_reviews'
    AND indexdef LIKE '%UNIQUE%'
  `;

  console.log('Found unique indexes:', JSON.stringify(indexes, null, 2));

  // Drop the unique index if it exists (excluding the primary key)
  const problematicIndexes = indexes.filter(idx => idx.indexname.includes('userId_fightId'));

  if (problematicIndexes.length > 0) {
    console.log('\n⚠️  Found problematic unique index! Attempting to drop...');

    for (const idx of problematicIndexes) {
      try {
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${idx.indexname}"`);
        console.log(`✅ Dropped index: ${idx.indexname}`);
      } catch (error) {
        console.error(`❌ Failed to drop index ${idx.indexname}:`, error);
      }
    }
  } else if (constraints.length > 0) {
    console.log('\nAttempting to drop unique constraints...');

    for (const constraint of constraints) {
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "fight_reviews" DROP CONSTRAINT IF EXISTS "${constraint.constraint_name}"`);
        console.log(`✅ Dropped constraint: ${constraint.constraint_name}`);
      } catch (error) {
        console.error(`❌ Failed to drop constraint ${constraint.constraint_name}:`, error);
      }
    }
  } else {
    console.log('✅ No problematic constraints or indexes found!');
  }

  // Check again to confirm
  const remainingIndexes = await prisma.$queryRaw<Array<{ indexname: string, indexdef: string }>>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'fight_reviews'
    AND indexdef LIKE '%UNIQUE%'
    AND indexname LIKE '%userId_fightId%'
  `;

  if (remainingIndexes.length === 0) {
    console.log('\n✅ SUCCESS: Problematic unique index removed!');
    console.log('Users can now have both a top-level review AND replies on the same fight.');
  } else {
    console.log('\n❌ WARNING: Index still remains:', remainingIndexes);
  }
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
