/**
 * Resolve failed Prisma migration on production
 * Marks the migration as rolled back and re-applies it
 *
 * Usage: DATABASE_URL="postgresql://..." npx ts-node resolveMigration.ts
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Use environment variable - NEVER hardcode credentials!
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL="postgresql://..." npx ts-node resolveMigration.ts');
  process.exit(1);
}

async function main() {
  console.log('🚀 Resolving failed migration on PRODUCTION database...\n');
  console.log('📍 Database: dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com\n');

  try {
    // Step 1: Mark migration as rolled back
    console.log('Step 1: Marking failed migration as rolled back...');
    const { stdout: stdout1, stderr: stderr1 } = await execAsync(
      'npx prisma migrate resolve --rolled-back 20251018000000_add_card_type_to_fights',
      {
        cwd: process.cwd(),
        env: { ...process.env }
      }
    );
    console.log(stdout1);
    if (stderr1) console.error(stderr1);

    // Step 2: Deploy migrations again
    console.log('\nStep 2: Deploying migrations...');
    const { stdout: stdout2, stderr: stderr2 } = await execAsync('npx prisma migrate deploy', {
      cwd: process.cwd(),
      env: { ...process.env }
    });
    console.log(stdout2);
    if (stderr2) console.error(stderr2);

    console.log('\n✅ Migration resolved and deployed!\n');
  } catch (error: any) {
    console.error('❌ Migration resolution failed:', error.message);
    if (error.stdout) console.log('stdout:', error.stdout);
    if (error.stderr) console.error('stderr:', error.stderr);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
