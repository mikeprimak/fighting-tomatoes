/**
 * Release all Prisma advisory locks on production database
 *
 * Usage: DATABASE_URL="postgresql://..." npx ts-node releaseLocks.ts
 */

import { PrismaClient } from '@prisma/client';

// Use environment variable - NEVER hardcode credentials!
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL="postgresql://..." npx ts-node releaseLocks.ts');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  console.log('🔓 Releasing Prisma advisory locks on production database...\n');

  try {
    // Release the specific Prisma migration advisory lock
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock_all();`);
    console.log('✅ All advisory locks released\n');

    // Show any remaining locks (cast regclass to text to avoid deserialization error)
    const locks = await prisma.$queryRawUnsafe(`
      SELECT
        locktype,
        relation::regclass::text,
        mode,
        granted,
        pid,
        pg_blocking_pids(pid) as blocking_pids
      FROM pg_locks
      WHERE locktype = 'advisory';
    `);

    console.log('Remaining advisory locks:', locks);
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
