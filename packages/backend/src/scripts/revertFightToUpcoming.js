const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FIGHT_ID = '7648e358-56bd-4d6c-be28-544f4eacd9cb'; // Pantoja vs Van

(async () => {
  try {
    // First, get the current fight details
    const fight = await prisma.fight.findUnique({
      where: { id: FIGHT_ID },
      include: {
        fighter1: true,
        fighter2: true,
        event: true,
      },
    });

    if (!fight) {
      console.log('Fight not found!');
      return;
    }

    console.log('Current fight status:');
    console.log(`${fight.fighter1.firstName} ${fight.fighter1.lastName} vs ${fight.fighter2.firstName} ${fight.fighter2.lastName}`);
    console.log(`Event: ${fight.event.name}`);
    console.log(`fightStatus: ${fight.fightStatus}`);
    console.log(`currentRound: ${fight.currentRound}`);
    console.log('');

    // Update to revert to upcoming
    const updated = await prisma.fight.update({
      where: { id: FIGHT_ID },
      data: {
        fightStatus: 'UPCOMING',
        currentRound: null,
        completedRounds: 0,
      },
    });

    console.log('✅ Fight reverted to UPCOMING status!');
    console.log(`fightStatus: ${updated.fightStatus}`);
    console.log(`currentRound: ${updated.currentRound}`);
    console.log(`completedRounds: ${updated.completedRounds}`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
})();
