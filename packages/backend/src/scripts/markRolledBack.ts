/**
 * Mark failed migration as rolled back on production database
 *
 * Usage: DATABASE_URL="postgresql://..." npx ts-node markRolledBack.ts
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Use environment variable - NEVER hardcode credentials!
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL="postgresql://..." npx ts-node markRolledBack.ts');
  process.exit(1);
}
const prodDbUrl = process.env.DATABASE_URL;

async function main() {
  console.log('🚀 Marking failed migration as rolled back on PRODUCTION...\n');
  console.log('📍 Database: dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com\n');

  try {
    const { stdout, stderr } = await execAsync(
      'npx prisma migrate resolve --rolled-back 20251018000000_add_card_type_to_fights',
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: prodDbUrl }
      }
    );

    console.log('✅ Output:');
    console.log(stdout);
    if (stderr) {
      console.error('⚠️ Warnings:');
      console.error(stderr);
    }

    console.log('\n✅ Migration marked as rolled back!\n');
    console.log('Now Render can re-apply the fixed migration on next deployment.');
  } catch (error: any) {
    console.error('❌ Failed:', error.message);
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
