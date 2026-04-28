/**
 * One-shot backfill: find completed fights that are draws or no-contests
 * but have winner=NULL (because the live parsers used to leave winner null
 * when the scraper produced a method but no winner side). Encode them as
 * winner='draw' or winner='nc' so the UI renders the badge.
 *
 * Mirrors what `buildTrackerUpdateData` would have written: published
 * `winner` plus shadow `trackerWinner`.
 *
 * Run once after deploying the parser fixes:
 *   DATABASE_URL=<render-external-url> pnpm --filter backend exec ts-node src/scripts/backfillDrawsNcs.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[backfill-draws-ncs] Starting...');

  const candidates = await prisma.fight.findMany({
    where: {
      winner: null,
      fightStatus: 'COMPLETED',
      method: { not: null },
    },
    select: {
      id: true,
      method: true,
      event: { select: { name: true, promotion: true } },
      fighter1: { select: { lastName: true } },
      fighter2: { select: { lastName: true } },
    },
  });

  console.log(`[backfill-draws-ncs] Found ${candidates.length} completed fights with method but no winner`);

  let drawCount = 0;
  let ncCount = 0;
  let skipped = 0;

  for (const fight of candidates) {
    const m = (fight.method || '').toLowerCase().trim();
    let resolved: 'draw' | 'nc' | null = null;
    if (m === 'nc' || m.includes('no contest')) resolved = 'nc';
    else if (m === 'draw' || m.includes('draw')) resolved = 'draw';

    if (!resolved) {
      skipped++;
      continue;
    }

    await prisma.fight.update({
      where: { id: fight.id },
      data: {
        winner: resolved,
        trackerWinner: resolved,
      },
    });

    const label = `${fight.fighter1.lastName} vs ${fight.fighter2.lastName} (${fight.event.promotion} — ${fight.event.name})`;
    console.log(`  ${resolved.toUpperCase().padEnd(4)} ${label} [method=${fight.method}]`);
    if (resolved === 'draw') drawCount++;
    else ncCount++;
  }

  console.log(`\n[backfill-draws-ncs] Done. draws=${drawCount} ncs=${ncCount} skipped=${skipped} total=${candidates.length}`);
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch(async (err) => {
    console.error('[backfill-draws-ncs] Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
