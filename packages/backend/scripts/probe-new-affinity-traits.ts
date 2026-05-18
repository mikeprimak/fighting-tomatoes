/**
 * Probe the three new tag-aware traits (weight-class-affinity,
 * main-event-watcher, method-affinity) against real users. Runs batchCompute
 * for each and prints the resulting profile cards.
 *
 * Picks: top hypers (high signal volume), top raters (high method coverage),
 * a mid-tier tail. Confirms the cards render meaningful text rather than
 * collapsing to "everyone is a UFC lightweight watcher."
 */
import { PrismaClient } from '@prisma/client';

import { batchCompute } from '../src/services/fanDNA/engine';
import { getTrait } from '../src/services/fanDNA/registry';

const NEW_TRAITS = [
  'weight-class-affinity',
  'main-event-watcher',
  'method-affinity',
];

async function main() {
  const prisma = new PrismaClient();

  const topRaters = await prisma.$queryRaw<Array<{ userId: string; count: bigint }>>`
    SELECT "userId", COUNT(*)::bigint AS count
    FROM fight_ratings
    GROUP BY "userId"
    ORDER BY count DESC
    LIMIT 8
  `;

  const topHypers = await prisma.$queryRaw<Array<{ userId: string; count: bigint }>>`
    SELECT "userId", COUNT(*)::bigint AS count
    FROM fight_predictions
    WHERE "predictedRating" IS NOT NULL
    GROUP BY "userId"
    ORDER BY count DESC
    LIMIT 5
  `;

  const allUserIds = Array.from(
    new Set([...topRaters.map((r) => r.userId), ...topHypers.map((r) => r.userId)]),
  );

  for (const userId of allUserIds) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    const label = user?.email ?? user?.displayName ?? userId.slice(0, 8);
    console.log(`\n=== ${label} ===`);

    for (const traitId of NEW_TRAITS) {
      await batchCompute({ prisma, userId, traitId });
      const trait = getTrait(traitId);
      const row = await prisma.traitValue.findUnique({
        where: { userId_traitId: { userId, traitId } },
      });
      if (!trait || !row) {
        console.log(`  [${traitId}] no value`);
        continue;
      }
      console.log(
        `  [${traitId}] hasFloor=${row.hasFloor} conf=${row.confidence.toFixed(2)}`,
      );

      if (!trait.profileSummary) continue;
      const summary = trait.profileSummary(row.value as Record<string, unknown>);
      if (!summary) {
        console.log(`    profileSummary: (null)`);
        continue;
      }
      const cards = Array.isArray(summary) ? summary : [summary];
      for (const card of cards) {
        console.log(`    [w${card.weight}] ${card.headline}`);
        if (card.body) console.log(`      ${card.body}`);
        if (card.primaryStat) {
          console.log(
            `      stats: ${card.primaryStat}${card.secondaryStat ? ` · ${card.secondaryStat}` : ''}`,
          );
        }
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
