import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addOddsToRidderAllen() {
  try {
    // Find the Ridder vs Allen fight
    const fight = await prisma.fight.findFirst({
      where: {
        OR: [
          {
            AND: [
              { fighter1: { lastName: { contains: 'Ridder' } } },
              { fighter2: { lastName: { contains: 'Allen' } } }
            ]
          },
          {
            AND: [
              { fighter1: { lastName: { contains: 'Allen' } } },
              { fighter2: { lastName: { contains: 'Ridder' } } }
            ]
          }
        ]
      },
      include: {
        fighter1: true,
        fighter2: true,
        event: true
      }
    });

    if (!fight) {
      console.log('Fight not found. Searching for fighters...');

      // Try to find the fighters
      const ridder = await prisma.fighter.findFirst({
        where: { lastName: { contains: 'Ridder' } }
      });

      const allen = await prisma.fighter.findFirst({
        where: { lastName: { contains: 'Allen' } }
      });

      console.log('Ridder:', ridder);
      console.log('Allen:', allen);

      return;
    }

    console.log(`Found fight: ${fight.fighter1.firstName} ${fight.fighter1.lastName} vs ${fight.fighter2.firstName} ${fight.fighter2.lastName}`);
    console.log(`Event: ${fight.event.name}`);

    // Determine which fighter is Ridder and which is Allen
    const ridderIsFighter1 = fight.fighter1.lastName.includes('Ridder');

    // Ridder is typically the favorite, so give him negative odds
    const ridderOdds = '-185';
    const allenOdds = '+155';

    const updateData = ridderIsFighter1 ? {
      fighter1Odds: ridderOdds,
      fighter2Odds: allenOdds
    } : {
      fighter1Odds: allenOdds,
      fighter2Odds: ridderOdds
    };

    const updatedFight = await prisma.fight.update({
      where: { id: fight.id },
      data: updateData,
      include: {
        fighter1: true,
        fighter2: true
      }
    });

    console.log('\n✅ Odds added successfully!');
    console.log(`${updatedFight.fighter1.firstName} ${updatedFight.fighter1.lastName}: ${updatedFight.fighter1Odds}`);
    console.log(`${updatedFight.fighter2.firstName} ${updatedFight.fighter2.lastName}: ${updatedFight.fighter2Odds}`);

  } catch (error) {
    console.error('Error adding odds:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addOddsToRidderAllen();
