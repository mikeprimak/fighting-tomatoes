const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkFights() {
  const event = await prisma.event.findFirst({
    where: {
      name: {
        contains: 'Ridder'
      }
    },
    include: {
      fights: {
        orderBy: { orderOnCard: 'desc' }
      }
    }
  });

  if (!event) {
    console.log('Event not found');
    return;
  }

  console.log(`\n=== ${event.name} ===`);
  console.log(`Total fights: ${event.fights.length}`);
  console.log(`\nStart times:`);
  console.log(`  Early Prelims: ${event.earlyPrelimStartTime || 'N/A'}`);
  console.log(`  Prelims: ${event.prelimStartTime || 'N/A'}`);
  console.log(`  Main Card: ${event.mainStartTime || 'N/A'}`);
  console.log(`\nFights by orderOnCard:\n`);

  event.fights.forEach(fight => {
    console.log(`${fight.orderOnCard.toString().padStart(2, ' ')}. ${fight.fighterAName} vs ${fight.fighterBName} (${fight.weightClass || 'N/A'})`);
  });

  await prisma.$disconnect();
}

checkFights().catch(console.error);
