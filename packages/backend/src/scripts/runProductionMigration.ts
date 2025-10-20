/**
 * Run Prisma migration directly on production database
 * This is a one-time script to add the cardType column
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Override DATABASE_URL to production
process.env.DATABASE_URL = 'postgresql://fightcrewapp_user:WjU2ZdAJESuMaMumbyRGgIV1HXJWg8KU@dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com/fightcrewapp';

async function main() {
  console.log('🚀 Running Prisma migration on PRODUCTION database...\n');
  console.log('📍 Database: dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com\n');

  try {
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy', {
      cwd: process.cwd(),
      env: { ...process.env }
    });

    console.log('✅ Migration output:');
    console.log(stdout);
    if (stderr) {
      console.error('⚠️  Warnings:');
      console.error(stderr);
    }

    console.log('\n✅ Migration complete!\n');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    if (error.stdout) console.log('stdout:', error.stdout);
    if (error.stderr) console.error('stderr:', error.stderr);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });
