import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function showFights() {
  try {
    const fights = await prisma.fight.findMany({
      where: { eventId: '49e6d62c-8b6b-4ff5-bcee-1be3f7f26802' },
      include: {
        fighter1: true,
        fighter2: true,
        event: true
      },
      orderBy: { orderOnCard: 'asc' }
    });

    if (fights.length === 0) {
      console.log('No fights found');
      return;
    }

    console.log('\n=== FIGHTS FOR', fights[0]?.event.name, '===\n');

    fights.forEach(fight => {
      const f1 = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
      const f2 = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
      console.log(`Order ${fight.orderOnCard}: ${f1} vs. ${f2}`);
    });

    console.log('\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

showFights();
