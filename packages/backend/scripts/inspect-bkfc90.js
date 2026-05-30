const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const eventId = 'cef9ea1c-1075-4f88-94d8-ef3f0cecbbd3';
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, date: true, promotion: true, eventStatus: true, scraperType: true, mainStartTime: true },
  });
  console.log('EVENT:', JSON.stringify(ev, null, 2));

  const fights = await prisma.fight.findMany({
    where: { eventId },
    select: {
      id: true,
      orderOnCard: true,
      cardType: true,
      fightStatus: true,
      winner: true,
      trackerWinner: true,
      trackerMethod: true,
      createdAt: true,
      updatedAt: true,
      fighter1: { select: { id: true, firstName: true, lastName: true } },
      fighter2: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { orderOnCard: 'asc' },
  });
  console.log('\nFIGHTS (' + fights.length + '):');
  for (const f of fights) {
    console.log(
      `  ord=${f.orderOnCard} [${f.cardType}] ${f.fightStatus} | ` +
      `${f.fighter1?.firstName} ${f.fighter1?.lastName} (${f.fighter1?.id?.substring(0,8)}) vs ${f.fighter2?.firstName} ${f.fighter2?.lastName} (${f.fighter2?.id?.substring(0,8)}) | ` +
      `winner=${f.winner} trackerWinner=${f.trackerWinner} trackerMethod=${f.trackerMethod} | ` +
      `id=${f.id.substring(0,8)} created=${f.createdAt.toISOString()} updated=${f.updatedAt.toISOString()}`
    );
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
