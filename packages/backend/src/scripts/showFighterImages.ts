import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function showFighterImages() {
  try {
    const fights = await prisma.fight.findMany({
      where: { eventId: '49e6d62c-8b6b-4ff5-bcee-1be3f7f26802' },
      include: {
        fighter1: true,
        fighter2: true,
      },
      orderBy: { orderOnCard: 'asc' }
    });

    console.log('\n=== FIGHTER IMAGES ===\n');

    fights.forEach(fight => {
      const f1Name = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
      const f2Name = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;

      console.log(`Fight ${fight.orderOnCard}:`);
      console.log(`  ${f1Name}: ${fight.fighter1.profileImage || 'NO IMAGE'}`);
      console.log(`  ${f2Name}: ${fight.fighter2.profileImage || 'NO IMAGE'}`);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

showFighterImages();
