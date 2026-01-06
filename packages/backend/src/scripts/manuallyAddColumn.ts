/**
 * Manually add cardType column using direct SQL
 * Then mark migration as applied
 *
 * Usage: DATABASE_URL="postgresql://..." npx ts-node manuallyAddColumn.ts
 */

import { PrismaClient } from '@prisma/client';

// Use environment variable - NEVER hardcode credentials!
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL="postgresql://..." npx ts-node manuallyAddColumn.ts');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Manually adding cardType column to PRODUCTION database...\n');
  console.log('📍 Database: dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com\n');

  try {
    // Step 1: Add column using raw SQL
    console.log('Step 1: Adding cardType column...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "fights" ADD COLUMN IF NOT EXISTS "cardType" TEXT;
    `);
    console.log('✅ Column added successfully\n');

    // Step 2: Mark migration as applied
    console.log('Step 2: Marking migration as applied...');
    await prisma.$executeRawUnsafe(`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (
        gen_random_uuid(),
        '4d8c3a2f1e9b5a6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c',
        NOW(),
        '20251018000000_add_card_type_to_fights',
        NULL,
        NULL,
        NOW(),
        1
      )
      ON CONFLICT (migration_name) DO NOTHING;
    `);
    console.log('✅ Migration marked as applied\n');

    console.log('✅ All done! You can now run the import script.');
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
