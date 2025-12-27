/**
 * run-migration.ts
 *
 * Master script to run the full legacy migration process.
 *
 * This script orchestrates running all migration steps in order.
 * Each step can also be run individually.
 *
 * Usage:
 *   npx ts-node scripts/legacy-migration/run-migration.ts
 *   npx ts-node scripts/legacy-migration/run-migration.ts --dry-run
 *   npx ts-node scripts/legacy-migration/run-migration.ts --step 3
 *
 * Options:
 *   --dry-run:  Run without making changes (for all applicable steps)
 *   --step N:   Start from step N (1-7)
 *   --only N:   Run only step N
 */

import { execSync } from 'child_process';
import * as path from 'path';

// Parse command line args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const stepIndex = args.indexOf('--step');
const startStep = stepIndex >= 0 ? parseInt(args[stepIndex + 1], 10) : 1;
const onlyIndex = args.indexOf('--only');
const onlyStep = onlyIndex >= 0 ? parseInt(args[onlyIndex + 1], 10) : undefined;

const SCRIPTS_DIR = __dirname;

const steps = [
  { num: 1, name: '01-parse-legacy-data.ts', desc: 'Parse SQL dump files' },
  { num: 2, name: '02-create-fight-mapping.ts', desc: 'Create fight ID mappings' },
  { num: 3, name: '03-migrate-users.ts', desc: 'Migrate users', dryRunnable: true },
  { num: 4, name: '04-migrate-ratings.ts', desc: 'Migrate ratings', dryRunnable: true },
  { num: 5, name: '05-migrate-reviews.ts', desc: 'Migrate reviews', dryRunnable: true },
  { num: 6, name: '06-migrate-tags.ts', desc: 'Migrate tags', dryRunnable: true },
  { num: 7, name: '07-verify-migration.ts', desc: 'Verify migration' },
];

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         LEGACY DATA MIGRATION - MASTER RUNNER              ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Migrating data from fightingtomatoes.com                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('');
  }

  const stepsToRun = onlyStep
    ? steps.filter(s => s.num === onlyStep)
    : steps.filter(s => s.num >= startStep);

  if (stepsToRun.length === 0) {
    console.log('No steps to run. Check your --step or --only parameter.');
    return;
  }

  console.log(`Running steps: ${stepsToRun.map(s => s.num).join(', ')}`);
  console.log('');

  for (const step of stepsToRun) {
    console.log('═'.repeat(60));
    console.log(`STEP ${step.num}: ${step.desc}`);
    console.log('═'.repeat(60));
    console.log('');

    const scriptPath = path.join(SCRIPTS_DIR, step.name);
    const dryRunArg = isDryRun && step.dryRunnable ? ' --dry-run' : '';

    try {
      const command = `npx ts-node "${scriptPath}"${dryRunArg}`;
      console.log(`> ${command}`);
      console.log('');

      execSync(command, {
        cwd: path.join(SCRIPTS_DIR, '../..'),
        stdio: 'inherit',
        env: { ...process.env },
      });

      console.log('');
      console.log(`✅ Step ${step.num} completed successfully`);
      console.log('');
    } catch (error) {
      console.error('');
      console.error(`❌ Step ${step.num} failed!`);
      console.error('');

      if (!onlyStep) {
        console.log('Stopping migration. Fix the issue and re-run with:');
        console.log(`  npx ts-node scripts/legacy-migration/run-migration.ts --step ${step.num}`);
      }

      process.exit(1);
    }
  }

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                 MIGRATION COMPLETE                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  if (isDryRun) {
    console.log('');
    console.log('This was a DRY RUN. To perform actual migration, run without --dry-run');
  }
}

main().catch(console.error);
