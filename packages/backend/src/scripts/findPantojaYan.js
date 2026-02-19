const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const fights = await prisma.fight.findMany({
      include: {
        fighter1: true,
        fighter2: true,
        event: true,
      },
    });

    const pantoja = fights.filter(f =>
      (f.fighter1.lastName.toLowerCase().includes('pantoja') || f.fighter2.lastName.toLowerCase().includes('pantoja')) &&
      (f.fighter1.lastName.toLowerCase().includes('yan') || f.fighter2.lastName.toLowerCase().includes('yan'))
    );

    if (pantoja.length === 0) {
      console.log('No Pantoja vs Yan fight found');
      console.log('\nSearching for similar fights...');
      const similar = fights.filter(f =>
        f.fighter1.lastName.toLowerCase().includes('pantoja') ||
        f.fighter2.lastName.toLowerCase().includes('pantoja') ||
        f.fighter1.lastName.toLowerCase().includes('yan') ||
        f.fighter2.lastName.toLowerCase().includes('yan')
      );
      console.log(`\nFound ${similar.length} fights with Pantoja or Yan:`);
      similar.forEach(fight => {
        console.log(`\n${fight.fighter1.firstName} ${fight.fighter1.lastName} vs ${fight.fighter2.firstName} ${fight.fighter2.lastName}`);
        console.log(`Event: ${fight.event.name}`);
        console.log(`Fight ID: ${fight.id}`);
      });
    } else {
      console.log(`Found ${pantoja.length} Pantoja vs Yan fight(s):\n`);
      pantoja.forEach(fight => {
        console.log('Fight ID:', fight.id);
        console.log('Fighter 1:', fight.fighter1.firstName, fight.fighter1.lastName);
        console.log('Fighter 2:', fight.fighter2.firstName, fight.fighter2.lastName);
        console.log('Event:', fight.event.name);
        console.log('fightStatus:', fight.fightStatus);
        console.log('');
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
})();
