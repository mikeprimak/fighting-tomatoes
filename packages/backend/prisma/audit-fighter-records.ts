import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.fighter.count();

  // Fighters with a completely empty record (0-0-0, no NC)
  const empty = await prisma.fighter.count({
    where: { wins: 0, losses: 0, draws: 0, noContests: 0 },
  });

  console.log(`Total fighters: ${total}`);
  console.log(`Empty record (0-0-0): ${empty} (${((empty / total) * 100).toFixed(1)}%)`);
  console.log('');

  // Break empty-record fighters down by sport
  const bySport = await prisma.fighter.groupBy({
    by: ['sport'],
    where: { wins: 0, losses: 0, draws: 0, noContests: 0 },
    _count: { _all: true },
  });
  console.log('Empty-record fighters by sport:');
  for (const row of bySport.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${row.sport}: ${row._count._all}`);
  }
  console.log('');

  // How many empty-record fighters actually appear in fights we list
  // (i.e. they're not orphans — they matter for UX)
  const emptyWithFights = await prisma.fighter.count({
    where: {
      wins: 0, losses: 0, draws: 0, noContests: 0,
      OR: [
        { fightsAsFighter1: { some: {} } },
        { fightsAsFighter2: { some: {} } },
      ],
    },
  });
  console.log(`Empty-record fighters that appear in >=1 fight: ${emptyWithFights}`);
  console.log('');

  // How many have a UFC athlete slug (cleanly re-scrapable from ufc.com / ufcstats)
  const emptyWithUfcSlug = await prisma.fighter.count({
    where: { wins: 0, losses: 0, draws: 0, noContests: 0, ufcAthleteSlug: { not: null } },
  });
  console.log(`Empty-record fighters WITH ufcAthleteSlug: ${emptyWithUfcSlug}`);

  // Sample a few empty-record fighters that appear in fights, with their event org
  const sample = await prisma.fighter.findMany({
    where: {
      wins: 0, losses: 0, draws: 0, noContests: 0,
      OR: [
        { fightsAsFighter1: { some: {} } },
        { fightsAsFighter2: { some: {} } },
      ],
    },
    take: 15,
    select: {
      firstName: true, lastName: true, sport: true, ufcAthleteSlug: true,
      fightsAsFighter1: { take: 1, select: { event: { select: { scraperType: true, name: true } } } },
      fightsAsFighter2: { take: 1, select: { event: { select: { scraperType: true, name: true } } } },
    },
  });
  console.log('\nSample empty-record fighters in fights:');
  for (const f of sample) {
    const ev = f.fightsAsFighter1[0]?.event ?? f.fightsAsFighter2[0]?.event;
    console.log(`  ${f.firstName} ${f.lastName} [${f.sport}] slug=${f.ufcAthleteSlug ?? '-'} ev=${ev?.scraperType ?? '?'} (${ev?.name ?? '?'})`);
  }
}

main().finally(() => prisma.$disconnect());
