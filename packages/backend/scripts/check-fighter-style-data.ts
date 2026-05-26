import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const totalFighters = await prisma.fighter.count();
  const totalFights = await prisma.fight.count();
  const completedFights = await prisma.fight.count({
    where: { fightStatus: 'COMPLETED' },
  });
  const fightsWithMethod = await prisma.fight.count({
    where: { fightStatus: 'COMPLETED', method: { not: null } },
  });

  const methodBreakdown = await prisma.fight.groupBy({
    by: ['method'],
    where: { fightStatus: 'COMPLETED', method: { not: null } },
    _count: true,
  });

  const sportBreakdown = await prisma.fighter.groupBy({
    by: ['sport'],
    _count: true,
  });

  const fightsPerFighter = await prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
    WITH per AS (
      SELECT f.id AS fighter_id, COUNT(fi.id) AS finished_fights
      FROM fighters f
      LEFT JOIN fights fi
        ON (fi."fighter1Id" = f.id OR fi."fighter2Id" = f.id)
        AND fi."fightStatus" = 'COMPLETED'
        AND fi.method IS NOT NULL
      GROUP BY f.id
    )
    SELECT
      CASE
        WHEN finished_fights = 0 THEN '0'
        WHEN finished_fights BETWEEN 1 AND 2 THEN '1-2'
        WHEN finished_fights BETWEEN 3 AND 4 THEN '3-4'
        WHEN finished_fights BETWEEN 5 AND 9 THEN '5-9'
        WHEN finished_fights BETWEEN 10 AND 19 THEN '10-19'
        ELSE '20+'
      END AS bucket,
      COUNT(*)::bigint AS count
    FROM per
    GROUP BY bucket
    ORDER BY bucket;
  `;

  const sampleEnoughFighters = await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH per AS (
      SELECT f.id, COUNT(fi.id) AS n
      FROM fighters f
      LEFT JOIN fights fi
        ON (fi."fighter1Id" = f.id OR fi."fighter2Id" = f.id)
        AND fi."fightStatus" = 'COMPLETED'
        AND fi.method IS NOT NULL
      WHERE f."isActive" = true
      GROUP BY f.id
    )
    SELECT COUNT(*)::bigint AS count FROM per WHERE n >= 5;
  `;

  const upcomingFighters = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT fighter_id)::bigint AS count
    FROM (
      SELECT "fighter1Id" AS fighter_id FROM fights WHERE "fightStatus" = 'UPCOMING'
      UNION
      SELECT "fighter2Id" AS fighter_id FROM fights WHERE "fightStatus" = 'UPCOMING'
    ) u;
  `;

  const upcomingFightersWithEnoughHistory = await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH upcoming AS (
      SELECT "fighter1Id" AS fighter_id FROM fights WHERE "fightStatus" = 'UPCOMING'
      UNION
      SELECT "fighter2Id" AS fighter_id FROM fights WHERE "fightStatus" = 'UPCOMING'
    ),
    history AS (
      SELECT u.fighter_id, COUNT(fi.id) AS n
      FROM upcoming u
      LEFT JOIN fights fi
        ON (fi."fighter1Id" = u.fighter_id OR fi."fighter2Id" = u.fighter_id)
        AND fi."fightStatus" = 'COMPLETED'
        AND fi.method IS NOT NULL
      GROUP BY u.fighter_id
    )
    SELECT COUNT(*)::bigint AS count FROM history WHERE n >= 5;
  `;

  console.log('\n=== Totals ===');
  console.log(`Fighters: ${totalFighters}`);
  console.log(`Fights total: ${totalFights}`);
  console.log(`Fights completed: ${completedFights}`);
  console.log(`Fights completed with method: ${fightsWithMethod}`);

  console.log('\n=== Sport breakdown (fighters) ===');
  sportBreakdown.forEach(r => console.log(`  ${r.sport}: ${r._count}`));

  console.log('\n=== Method breakdown (completed fights) ===');
  methodBreakdown
    .sort((a, b) => b._count - a._count)
    .forEach(r => console.log(`  ${r.method}: ${r._count}`));

  console.log('\n=== Fights per fighter (history depth) ===');
  fightsPerFighter.forEach(r => console.log(`  ${r.bucket}: ${r.count}`));

  console.log('\n=== Coverage for style derivation (≥5 fights with method) ===');
  console.log(`Active fighters with ≥5 fights: ${sampleEnoughFighters[0].count}`);

  console.log('\n=== Upcoming-fight coverage ===');
  console.log(`Fighters on upcoming cards: ${upcomingFighters[0].count}`);
  console.log(`...of which have ≥5 fights of history: ${upcomingFightersWithEnoughHistory[0].count}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
