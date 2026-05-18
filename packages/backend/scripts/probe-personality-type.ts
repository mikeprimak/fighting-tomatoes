/**
 * Probe the personality-type aggregator against real Render user data.
 *
 * Usage:
 *   pnpm tsx scripts/probe-personality-type.ts [userEmail|userId]
 *
 * If no arg, samples the 5 most active users (by rating count) and prints
 * each user's TraitValue snapshot + computed type. Used to sanity-check the
 * rule set before shipping.
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
  const arg = process.argv[2];

  let userIds: string[];

  if (arg) {
    const user = await prisma.user.findFirst({
      where: arg.includes('@') ? { email: arg } : { id: arg },
      select: { id: true },
    });
    if (!user) {
      console.error(`User not found: ${arg}`);
      process.exit(1);
    }
    userIds = [user.id];
  } else {
    const top = await prisma.$queryRaw<Array<{ userId: string; count: bigint }>>`
      SELECT "userId", COUNT(*)::bigint AS count
      FROM fight_ratings
      GROUP BY "userId"
      ORDER BY count DESC
      LIMIT 5
    `;
    userIds = top.map((r) => r.userId);
    console.log(`No arg — probing top ${userIds.length} active users by rating count.\n`);
  }

  for (const userId of userIds) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    const label = user?.email ?? user?.displayName ?? userId;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`User: ${label} (${userId})`);
    console.log('='.repeat(70));

    // Force a fresh compute for each trait so we have current values.
    const traits = getAllTraits().filter((t) => TRAITS_FOR_TYPE.includes(t.id));
    for (const trait of traits) {
      await batchCompute({ prisma, userId, traitId: trait.id });
    }

    const rows = await prisma.traitValue.findMany({
      where: { userId, traitId: { in: TRAITS_FOR_TYPE } },
      select: {
        traitId: true,
        value: true,
        hasFloor: true,
        confidence: true,
      },
    });

    console.log('\nTrait values:');
    for (const r of rows) {
      console.log(
        `  ${r.traitId.padEnd(16)} floor=${r.hasFloor ? 'Y' : 'n'}  ` +
          `conf=${r.confidence.toFixed(2)}  value=${JSON.stringify(r.value)}`,
      );
    }

    const type = await computeUserType(prisma, userId);
    console.log('\nPersonality type:');
    if (type) {
      console.log(`  id:           ${type.id}`);
      console.log(`  label:        ${type.label}`);
      console.log(`  body:         ${type.body}`);
      if (type.primaryStat) {
        console.log(`  primaryStat:  ${type.primaryStat}`);
      }
      if (type.secondaryStat) {
        console.log(`  secondaryStat: ${type.secondaryStat}`);
      }
    } else {
      console.log('  (null — no rule matched)');
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
