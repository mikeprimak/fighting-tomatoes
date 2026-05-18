/**
 * Wider sample: distribution of personality types across top hypers + a
 * random tail. Helps confirm we're not collapsing everyone to one type and
 * that low-data users correctly get null.
 */
import { PrismaClient } from '@prisma/client';

import { batchCompute } from '../src/services/fanDNA/engine';
import { computeUserType } from '../src/services/fanDNA/personalityType';
import { getAllTraits } from '../src/services/fanDNA/registry';

const TRAITS_FOR_TYPE = [
  'org-affinity',
  'rating-bias',
  'hype-bias',
  'hype-accuracy',
  'trailblazer',
];

async function main() {
  const prisma = new PrismaClient();

  // Top hypers
  const topHypers = await prisma.$queryRaw<Array<{ userId: string; count: bigint }>>`
    SELECT "userId", COUNT(*)::bigint AS count
    FROM fight_predictions
    WHERE "predictedRating" IS NOT NULL
    GROUP BY "userId"
    ORDER BY count DESC
    LIMIT 10
  `;

  // Mid-tier raters
  const midRaters = await prisma.$queryRaw<Array<{ userId: string; count: bigint }>>`
    SELECT "userId", COUNT(*)::bigint AS count
    FROM fight_ratings
    GROUP BY "userId"
    HAVING COUNT(*) BETWEEN 30 AND 100
    ORDER BY RANDOM()
    LIMIT 5
  `;

  const allUserIds = Array.from(
    new Set([...topHypers.map((r) => r.userId), ...midRaters.map((r) => r.userId)]),
  );

  const distribution: Record<string, number> = {};
  const traits = getAllTraits().filter((t) => TRAITS_FOR_TYPE.includes(t.id));

  for (const userId of allUserIds) {
    for (const trait of traits) {
      await batchCompute({ prisma, userId, traitId: trait.id });
    }
    const type = await computeUserType(prisma, userId);
    const key = type?.id ?? '(null)';
    distribution[key] = (distribution[key] ?? 0) + 1;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    const label = user?.email ?? user?.displayName ?? userId.slice(0, 8);
    console.log(`${(type?.id ?? '(null)').padEnd(22)} ${label}`);
  }

  console.log('\nDistribution:');
  for (const [k, v] of Object.entries(distribution).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
