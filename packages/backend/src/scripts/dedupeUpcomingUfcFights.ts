/**
 * Dedupe Upcoming UFC Fights
 *
 * Finds duplicate fight rows in upcoming UFC events. A "duplicate" is two Fight
 * rows on the same event whose fighter pairs have the same name signature but
 * different fighter row IDs — the pattern that emerges when UFC corrects a
 * fighter's display name and the daily scraper (pre 47c74a6) forks a fresh
 * Fighter row, which then forks a fresh Fight row.
 *
 * For each duplicate group, picks a canonical fight to keep using:
 *   1. Both fighters have ufcAthleteSlug set (post-fix scrape)
 *   2. More user activity (ratings + reviews + predictions)
 *   3. Older createdAt
 *
 * Then deletes the loser Fight row (and any of its dependent rows) inside a
 * transaction. Stale Fighter rows are left behind for fighter-dedup/merge to
 * sweep up — that script consolidates ratings/follows/aliases properly.
 *
 * Usage:
 *   npx ts-node src/scripts/dedupeUpcomingUfcFights.ts            # dry run
 *   npx ts-node src/scripts/dedupeUpcomingUfcFights.ts --apply    # delete dupes
 *   npx ts-node src/scripts/dedupeUpcomingUfcFights.ts --event <eventId> --apply
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type FightRow = Awaited<ReturnType<typeof loadUpcomingUfcFights>>[number];

async function loadUpcomingUfcFights(eventIdFilter?: string) {
  const now = new Date();
  return prisma.fight.findMany({
    where: {
      event: {
        scraperType: 'ufc',
        date: { gte: now },
        ...(eventIdFilter ? { id: eventIdFilter } : {}),
      },
    },
    include: {
      event: { select: { id: true, name: true, date: true } },
      fighter1: {
        select: { id: true, firstName: true, lastName: true, ufcAthleteSlug: true },
      },
      fighter2: {
        select: { id: true, firstName: true, lastName: true, ufcAthleteSlug: true },
      },
      _count: {
        select: { ratings: true, reviews: true, predictions: true, tags: true },
      },
    },
  });
}

function nameSig(f: FightRow) {
  const a = `${f.fighter1.firstName} ${f.fighter1.lastName}`.toLowerCase().trim();
  const b = `${f.fighter2.firstName} ${f.fighter2.lastName}`.toLowerCase().trim();
  return [a, b].sort().join(' || ');
}

function userActivity(f: FightRow) {
  return f._count.ratings + f._count.reviews + f._count.predictions + f._count.tags;
}

function bothHaveSlugs(f: FightRow) {
  return !!f.fighter1.ufcAthleteSlug && !!f.fighter2.ufcAthleteSlug;
}

function pickCanonical(group: FightRow[]): { keep: FightRow; drop: FightRow[] } {
  const sorted = [...group].sort((a, b) => {
    const slugDelta = Number(bothHaveSlugs(b)) - Number(bothHaveSlugs(a));
    if (slugDelta !== 0) return slugDelta;
    const activityDelta = userActivity(b) - userActivity(a);
    if (activityDelta !== 0) return activityDelta;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return { keep: sorted[0], drop: sorted.slice(1) };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const eventIdx = args.indexOf('--event');
  const eventIdFilter = eventIdx >= 0 ? args[eventIdx + 1] : undefined;

  console.log(`Dedupe Upcoming UFC Fights ${apply ? '[APPLY]' : '[DRY RUN]'}`);
  if (eventIdFilter) console.log(`Restricted to event: ${eventIdFilter}`);
  console.log('='.repeat(70));

  const fights = await loadUpcomingUfcFights(eventIdFilter);

  // Group by (eventId, name signature)
  const groups = new Map<string, FightRow[]>();
  for (const f of fights) {
    const key = `${f.eventId}::${nameSig(f)}`;
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }

  const dupGroups = Array.from(groups.values()).filter((g) => g.length > 1);

  if (dupGroups.length === 0) {
    console.log('\nNo duplicate fights detected on upcoming UFC events. Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nFound ${dupGroups.length} duplicate group(s):\n`);

  let totalToDrop = 0;
  for (const group of dupGroups) {
    const ev = group[0].event;
    console.log('-'.repeat(70));
    console.log(`Event: ${ev.name}  (${ev.date.toISOString().split('T')[0]})`);
    console.log(`Match: ${nameSig(group[0])}`);

    const { keep, drop } = pickCanonical(group);

    console.log(`  KEEP  fight=${keep.id}`);
    console.log(
      `        fighters=[${keep.fighter1.id} slug=${keep.fighter1.ufcAthleteSlug ?? '-'}] vs [${keep.fighter2.id} slug=${keep.fighter2.ufcAthleteSlug ?? '-'}]`,
    );
    console.log(
      `        status=${keep.fightStatus}  activity=${userActivity(keep)}  createdAt=${keep.createdAt.toISOString()}`,
    );

    for (const d of drop) {
      console.log(`  DROP  fight=${d.id}`);
      console.log(
        `        fighters=[${d.fighter1.id} slug=${d.fighter1.ufcAthleteSlug ?? '-'}] vs [${d.fighter2.id} slug=${d.fighter2.ufcAthleteSlug ?? '-'}]`,
      );
      console.log(
        `        status=${d.fightStatus}  activity=${userActivity(d)}  createdAt=${d.createdAt.toISOString()}`,
      );
      if (userActivity(d) > 0) {
        console.log(
          `        ⚠ has user activity — will be deleted with the fight row (cascade through Fight relations)`,
        );
      }
      totalToDrop++;
    }
  }

  console.log('-'.repeat(70));
  console.log(`\nSummary: ${totalToDrop} fight row(s) to delete across ${dupGroups.length} group(s).`);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to delete.');
    await prisma.$disconnect();
    return;
  }

  console.log('\nApplying deletions...\n');
  for (const group of dupGroups) {
    const { drop } = pickCanonical(group);
    for (const d of drop) {
      await prisma.$transaction(async (tx) => {
        // Clean up dependent rows that don't cascade automatically.
        await tx.fightRating.deleteMany({ where: { fightId: d.id } });
        await tx.fightReview.deleteMany({ where: { fightId: d.id } });
        await tx.preFightComment.deleteMany({ where: { fightId: d.id } });
        await tx.fightPrediction.deleteMany({ where: { fightId: d.id } });
        await tx.fightTag.deleteMany({ where: { fightId: d.id } });
        await tx.crewMessage.deleteMany({ where: { fightId: d.id } });
        await tx.crewPrediction.deleteMany({ where: { fightId: d.id } });
        await tx.crewRoundVote.deleteMany({ where: { fightId: d.id } });
        await tx.crewReaction.deleteMany({ where: { fightId: d.id } });
        await tx.fight.delete({ where: { id: d.id } });
      });
      console.log(`  Deleted fight ${d.id}`);
    }
  }

  console.log('\nDone. Note: orphaned duplicate Fighter rows (if any) are left behind.');
  console.log('Use scripts/fighter-dedup/merge-fighters.ts to consolidate them.');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
