const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const fights = await prisma.fight.findMany({
    where: {
      isComplete: false,
      event: {
        date: { gte: new Date() }
      }
    },
    include: {
      fighter1: { select: { firstName: true, lastName: true } },
      fighter2: { select: { firstName: true, lastName: true } },
      event: { select: { name: true, date: true, promotion: true } }
    },
    orderBy: [
      { event: { date: 'asc' } },
      { orderOnCard: 'asc' }
    ],
    take: 25
  });

  console.log('=== UPCOMING FIGHTS ===\n');

  let currentEvent = '';
  fights.forEach(f => {
    const eventKey = f.event.name;
    if (eventKey !== currentEvent) {
      currentEvent = eventKey;
      const dateStr = f.event.date.toISOString().split('T')[0];
      console.log(`\n[${f.event.promotion}] ${f.event.name} (${dateStr})`);
      console.log('─'.repeat(60));
    }

    const titleTag = f.isTitle ? ' [TITLE]' : '';
    console.log(`  ${f.orderOnCard}. ${f.fighter1.firstName} ${f.fighter1.lastName} vs ${f.fighter2.firstName} ${f.fighter2.lastName}${titleTag}`);
    console.log(`     ID: ${f.id}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
