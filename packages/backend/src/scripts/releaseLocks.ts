/**
 * Release all Prisma advisory locks on production database
 */

import { PrismaClient } from '@prisma/client';

// Override DATABASE_URL to production
process.env.DATABASE_URL = 'postgresql://fightcrewapp_user:WjU2ZdAJESuMaMumbyRGgIV1HXJWg8KU@dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com/fightcrewapp';

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
