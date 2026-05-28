/**
 * Reconcile the aiProfileRecordAtEnrich snapshot for HAND-AUTHORED profiles whose
 * snapshot lags ONLY because a bulk record backfill landed after the bio was
 * written — NOT because the fighter actually fought.
 *
 * Signature of the artifact: snapshot = '0-0-0-0' (our DB had no record on file at
 * author time, so the author took the record from sources and the bio is already
 * correct) while the live record is now non-zero (a later backfill populated it).
 * Healing = re-stamp the snapshot to the live record. The bio is untouched.
 *
 * This is DELIBERATELY narrow: a genuine post-authoring fight produces a NON-zero
 * old snapshot (e.g. 30-10-0-0 -> 30-11-0-0), which this tool leaves alone so the
 * Opus re-author routine (fighter-profile-dump.ts FP_STALE=1) still catches it.
 *
 * Usage:
 *   pnpm exec tsx --env-file=.env scripts/fighter-profile-reconcile-snapshot.ts            # dry-run
 *   pnpm exec tsx --env-file=.env scripts/fighter-profile-reconcile-snapshot.ts --apply
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Row {
  id: string;
  name: string;
  live_record: string;
}

async function main() {
  const apply = process.argv.includes('--apply');

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      ft.id AS id,
      TRIM(ft."firstName" || ' ' || ft."lastName") AS name,
      (ft.wins || '-' || ft.losses || '-' || ft.draws || '-' || ft."noContests") AS live_record
    FROM fighters ft
    WHERE ft."aiProfileSource" = 'handauthored'
      AND ft."aiProfileRecordAtEnrich" = '0-0-0-0'
      AND (ft.wins || '-' || ft.losses || '-' || ft.draws || '-' || ft."noContests") <> '0-0-0-0'
    ORDER BY ft."lastName" ASC
  `;

  console.log(`${apply ? '[APPLY]' : '[DRY RUN]'} backfill-artifact snapshots to heal: ${rows.length}`);
  for (const r of rows.slice(0, 10)) {
    console.log(`  ${r.name}: 0-0-0-0 -> ${r.live_record}`);
  }
  if (rows.length > 10) console.log(`  ... and ${rows.length - 10} more`);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write.');
    await prisma.$disconnect();
    return;
  }

  const updated = await prisma.$executeRaw`
    UPDATE fighters
    SET "aiProfileRecordAtEnrich" =
      (wins || '-' || losses || '-' || draws || '-' || "noContests")
    WHERE "aiProfileSource" = 'handauthored'
      AND "aiProfileRecordAtEnrich" = '0-0-0-0'
      AND (wins || '-' || losses || '-' || draws || '-' || "noContests") <> '0-0-0-0'
  `;

  console.log(`\nHealed ${updated} snapshot(s).`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
