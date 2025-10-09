const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function assignRanksToOliveiraGamrotEvent() {
  try {
    // Find the event
    console.log('Searching for UFC Fight Night: Oliveira vs. Gamrot...');
    const event = await prisma.event.findFirst({
      where: {
        name: {
          contains: 'Oliveira',
          mode: 'insensitive'
        }
      },
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true
          }
        }
      }
    });

    if (!event) {
      console.log('Event not found!');
      return;
    }

    console.log(`Found event: ${event.name}`);
    console.log(`Total fights: ${event.fights.length}`);

    // Collect all unique fighters
    const fightersMap = new Map();

    event.fights.forEach(fight => {
      if (!fightersMap.has(fight.fighter1.id)) {
        fightersMap.set(fight.fighter1.id, fight.fighter1);
      }
      if (!fightersMap.has(fight.fighter2.id)) {
        fightersMap.set(fight.fighter2.id, fight.fighter2);
      }
    });

    const fighters = Array.from(fightersMap.values());
    console.log(`\nTotal unique fighters: ${fighters.length}`);

    // Assign test ranks to fighters
    // Main event fighters get top ranks, others get various ranks
    const testRanks = ['#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8', '#9', '#10', '#11', '#12', '#13', '#14', '#15', 'NR', 'NR', 'NR', 'NR', 'NR'];

    console.log('\nAssigning ranks to fighters...');

    for (let i = 0; i < fighters.length; i++) {
      const fighter = fighters[i];
      const rank = testRanks[i] || 'NR';

      await prisma.fighter.update({
        where: { id: fighter.id },
        data: { rank }
      });

      console.log(`✓ ${fighter.firstName} ${fighter.lastName}: ${rank}`);
    }

    console.log('\n✅ Ranks assigned successfully!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

assignRanksToOliveiraGamrotEvent();
