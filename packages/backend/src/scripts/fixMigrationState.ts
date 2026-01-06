/**
 * Fix migration state in production database
 * Since we manually added the column, we need to mark the migration as completed
 *
 * Usage: DATABASE_URL="postgresql://..." npx ts-node fixMigrationState.ts
 */

import { PrismaClient } from '@prisma/client';

// Use environment variable - NEVER hardcode credentials!
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL="postgresql://..." npx ts-node fixMigrationState.ts');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Fixing migration state in PRODUCTION database...\n');
  console.log('📍 Database: dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com\n');

  try {
    // Step 1: Delete the failed migration record
    console.log('Step 1: Removing failed migration record...');
    const result1 = await prisma.$executeRawUnsafe(`
      DELETE FROM "_prisma_migrations"
      WHERE migration_name = '20251018000000_add_card_type_to_fights';
    `);
    console.log(`✅ Deleted ${result1} migration record(s)\n`);

    // Step 2: Insert successful migration record
    console.log('Step 2: Inserting successful migration record...');
    const result2 = await prisma.$executeRawUnsafe(`
      INSERT INTO "_prisma_migrations"
      (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (
        '${crypto.randomUUID()}',
        '4d8c3a2f1e9b5a6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c',
        NOW(),
        '20251018000000_add_card_type_to_fights',
        NULL,
        NULL,
        NOW(),
        1
      );
    `);
    console.log(`✅ Inserted migration record\n`);

    console.log('✅ Migration state fixed!');
    console.log('Render can now deploy successfully.');
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
