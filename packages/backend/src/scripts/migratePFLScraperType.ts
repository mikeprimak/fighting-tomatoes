/**
 * One-shot migration: flip existing PFL events from scraperType='tapology' to 'pfl'.
 *
 * Run AFTER the new code is deployed. With the Tapology hub still listing 'PFL'
 * (until the D1 cleanup step) the old path remains as a safety net — but new
 * dispatches will go to the new pfl-live-tracker.yml workflow.
 *
 * Usage (from packages/backend, with .env loaded):
 *   node dist/scripts/migratePFLScraperType.js
 *   node dist/scripts/migratePFLScraperType.js --dry-run
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('========================================');
  console.log(`[migrate] PFL scraperType: 'tapology' → 'pfl'`);
  console.log(`[migrate] Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE (will write)'}`);
  console.log('========================================\n');

  const candidates = await prisma.event.findMany({
    where: { promotion: 'PFL', scraperType: 'tapology' },
    select: { id: true, name: true, date: true, eventStatus: true },
    orderBy: { date: 'desc' },
  });

  console.log(`Found ${candidates.length} PFL event(s) with scraperType='tapology'`);
  for (const e of candidates) {
    console.log(`  - ${e.name} (${e.date.toISOString().slice(0, 10)}) — ${e.eventStatus}`);
  }

  if (candidates.length === 0) {
    console.log('\nNothing to migrate.');
    return;
  }

  if (dryRun) {
    console.log('\n[dry-run] No changes written. Re-run without --dry-run to apply.');
    return;
  }

  const result = await prisma.event.updateMany({
    where: { promotion: 'PFL', scraperType: 'tapology' },
    data: { scraperType: 'pfl' },
  });

  console.log(`\n✅ Updated ${result.count} event(s).`);
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch(async (err) => {
    console.error('[migrate] Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
