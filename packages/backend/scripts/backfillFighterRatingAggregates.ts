/**
 * Backfill the dead Fighter rating aggregates (totalRatings / averageRating /
 * totalFights / greatFights) from the live per-fight data. Discovered 2026-07-01
 * while building the /fighters SEO hub: ALL FOUR columns were 0 across all 9,946
 * fighters (same class of dead aggregate as Event.totalRatings —
 * lesson_dataset_aggregates_dishonest). The real engagement signal lives on
 * fights (Fight.totalRatings is alive), so:
 *
 *   totalRatings  = SUM(fight.totalRatings) over the fighter's fights
 *   averageRating = SUM(avg*count)/SUM(count) over their rated fights (weighted)
 *   totalFights   = COUNT of their COMPLETED (non-cancelled) fights
 *   greatFights   = COUNT of their rated fights with averageRating >= 8.5
 *                   (schema comment says "fights rated 85+" — legacy 100 scale)
 *
 * Nothing writes these columns at rating time, so they DRIFT — re-run monthly
 * (see docs/operations/maintenance.md). Powers the /fighters hub's most-rated
 * ordering and the "N ratings" badges.
 *
 * DRY-RUN BY DEFAULT — prints what it would write. Pass --apply to persist.
 *   npx tsx scripts/backfillFighterRatingAggregates.ts           # dry run
 *   npx tsx scripts/backfillFighterRatingAggregates.ts --apply   # write
 *
 * Idempotent (recomputes from source every run; only writes changed rows). Uses
 * the prisma singleton. DATABASE_URL is PROD — --apply writes to production.
 */
import { prisma } from '../src/lib/prisma';

const APPLY = process.argv.includes('--apply');
const UPDATE_BATCH = 25; // gentle on the 256MB DB

type Agg = {
  id: string;
  lastName: string;
  totalRatings: number;
  averageRating: number;
  totalFights: number;
  greatFights: number;
};

async function main() {
  console.log(`Fighter rating-aggregate backfill (${APPLY ? 'APPLY' : 'dry run'})`);

  // One aggregate query over fights, both corners. CANCELLED excluded everywhere.
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    lastName: string;
    total_ratings: number;
    weighted_sum: number;
    total_fights: number;
    great_fights: number;
    cur_total: number;
    cur_avg: number;
    cur_fights: number;
    cur_great: number;
  }>>`
    SELECT
      ftr.id,
      ftr."lastName",
      COALESCE(SUM(f."totalRatings"), 0)::int                             AS total_ratings,
      COALESCE(SUM(f."averageRating" * f."totalRatings"), 0)::float       AS weighted_sum,
      COUNT(f.id) FILTER (WHERE f."fightStatus" = 'COMPLETED')::int       AS total_fights,
      COUNT(f.id) FILTER (WHERE f."totalRatings" > 0 AND f."averageRating" >= 8.5)::int AS great_fights,
      ftr."totalRatings"  AS cur_total,
      ftr."averageRating" AS cur_avg,
      ftr."totalFights"   AS cur_fights,
      ftr."greatFights"   AS cur_great
    FROM fighters ftr
    LEFT JOIN fights f
      ON (f."fighter1Id" = ftr.id OR f."fighter2Id" = ftr.id)
      AND f."fightStatus" <> 'CANCELLED'
    GROUP BY ftr.id
  `;

  const plans: Agg[] = [];
  for (const r of rows) {
    const totalRatings = r.total_ratings;
    const averageRating = totalRatings > 0
      ? Math.round((r.weighted_sum / totalRatings) * 100) / 100
      : 0;
    if (
      totalRatings !== r.cur_total ||
      averageRating !== r.cur_avg ||
      r.total_fights !== r.cur_fights ||
      r.great_fights !== r.cur_great
    ) {
      plans.push({
        id: r.id,
        lastName: r.lastName,
        totalRatings,
        averageRating,
        totalFights: r.total_fights,
        greatFights: r.great_fights,
      });
    }
  }

  console.log(`${rows.length} fighters scanned, ${plans.length} need updates.`);
  const top = [...plans].sort((a, b) => b.totalRatings - a.totalRatings).slice(0, 10);
  for (const p of top) {
    console.log(
      `  ${p.lastName}: ratings=${p.totalRatings} avg=${p.averageRating} fights=${p.totalFights} great=${p.greatFights}`,
    );
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to persist.');
    return;
  }

  for (let i = 0; i < plans.length; i += UPDATE_BATCH) {
    const batch = plans.slice(i, i + UPDATE_BATCH);
    await Promise.all(
      batch.map((p) =>
        prisma.fighter.update({
          where: { id: p.id },
          data: {
            totalRatings: p.totalRatings,
            averageRating: p.averageRating,
            totalFights: p.totalFights,
            greatFights: p.greatFights,
          },
        }),
      ),
    );
    process.stdout.write(`  wrote ${Math.min(i + UPDATE_BATCH, plans.length)}/${plans.length}\r`);
  }
  if (plans.length) process.stdout.write('\n');
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
