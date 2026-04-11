const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.event.findMany({
    where: { promotion: 'RAF' },
    orderBy: { date: 'asc' },
    select: {
      id: true, name: true, date: true,
      fights: {
        orderBy: { orderOnCard: 'asc' },
        select: {
          id: true,
          orderOnCard: true,
          fightStatus: true,
          fighter1: { select: { firstName: true, lastName: true } },
          fighter2: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  for (const e of events) {
    console.log('='.repeat(80));
    console.log(`${e.name}  ${e.date.toISOString()}`);
    for (const f of e.fights) {
      const f1 = `${f.fighter1.firstName || ''} ${f.fighter1.lastName || ''}`.trim();
      const f2 = `${f.fighter2.firstName || ''} ${f.fighter2.lastName || ''}`.trim();
      console.log(`  [${f.orderOnCard}] ${f.fightStatus.padEnd(10)} ${f1} vs ${f2}  (${f.id})`);
    }
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
