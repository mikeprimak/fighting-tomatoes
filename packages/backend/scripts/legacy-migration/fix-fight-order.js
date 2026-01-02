/**
 * fix-fight-order.js
 * Inverts fight order so orderOnCard=1 is the main event
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixFightOrder() {
  console.log('Fixing fight order...\n');

  // Get all events with their fights
  const events = await prisma.event.findMany({
    include: {
      fights: {
        orderBy: { orderOnCard: 'asc' }
      }
    }
  });

  console.log(`Found ${events.length} events to process\n`);

  let eventsFixed = 0;
  let fightsFixed = 0;

  for (const event of events) {
    if (event.fights.length === 0) continue;

    // Find max orderOnCard for this event
    const maxOrder = Math.max(...event.fights.map(f => f.orderOnCard));

    // Update each fight's order: newOrder = maxOrder - oldOrder + 1
    for (const fight of event.fights) {
      const newOrder = maxOrder - fight.orderOnCard + 1;

      if (newOrder !== fight.orderOnCard) {
        await prisma.fight.update({
          where: { id: fight.id },
          data: { orderOnCard: newOrder }
        });
        fightsFixed++;
      }
    }

    eventsFixed++;
    if (eventsFixed % 100 === 0) {
      console.log(`  Processed ${eventsFixed}/${events.length} events...`);
    }
  }

  console.log(`\nDone! Fixed ${fightsFixed} fights across ${eventsFixed} events.`);
}

fixFightOrder()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
  });
