const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const dates = ['2026-04-18', '2026-05-16', '2026-05-23', '2026-05-30'];
  // Be flexible — grab range 2026-04-17..2026-05-31
  const start = new Date('2026-04-17T00:00:00Z');
  const end = new Date('2026-06-01T00:00:00Z');

  const events = await prisma.event.findMany({
    where: {
      date: { gte: start, lt: end },
    },
    orderBy: { date: 'asc' },
    select: {
      id: true,
      name: true,
      date: true,
      promotion: true,
      scraperType: true,
      ufcUrl: true,
      bannerImage: true,
      venue: true,
      eventStatus: true,
      fights: {
        orderBy: { orderOnCard: 'asc' },
        select: {
          id: true,
          orderOnCard: true,
          cardType: true,
          fighter1: { select: { id: true, firstName: true, lastName: true } },
          fighter2: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  for (const e of events) {
    console.log('='.repeat(80));
    console.log(`${e.name}  [${e.promotion || 'no promotion'}]`);
    console.log(`  id: ${e.id}`);
    console.log(`  date: ${e.date.toISOString()}`);
    console.log(`  scraperType: ${e.scraperType}`);
    console.log(`  venue:       ${e.venue || '-'}`);
    console.log(`  eventStatus: ${e.eventStatus}`);
    console.log(`  ufcUrl:      ${e.ufcUrl || '-'}`);
    console.log(`  bannerImage: ${e.bannerImage || '-'}`);
    console.log(`  fights (${e.fights.length}):`);
    for (const f of e.fights) {
      const f1 = `${f.fighter1?.firstName || ''} ${f.fighter1?.lastName || ''}`.trim() || '?';
      const f2 = `${f.fighter2?.firstName || ''} ${f.fighter2?.lastName || ''}`.trim() || '?';
      console.log(`    [${f.orderOnCard ?? '-'}] ${f.cardType || '?'}: ${f1} vs ${f2}  (fightId=${f.id})`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
