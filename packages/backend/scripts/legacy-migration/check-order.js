const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkOrder() {
  // Check a sample event to understand the ordering
  const event = await prisma.event.findFirst({
    where: { name: { contains: 'Whittaker' } },
    include: {
      fights: {
        orderBy: { orderOnCard: 'asc' },
        include: { fighter1: true, fighter2: true }
      }
    }
  });

  if (event) {
    console.log('Event:', event.name);
    console.log('Fights (ordered by orderOnCard ASC):');
    event.fights.forEach((f, i) => {
      console.log(`  ${i+1}. orderOnCard=${f.orderOnCard} | ${f.fighter1.firstName} ${f.fighter1.lastName} vs ${f.fighter2.firstName} ${f.fighter2.lastName}`);
    });
  } else {
    console.log('Event not found');
  }
}

checkOrder().then(() => prisma.$disconnect());
