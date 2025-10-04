import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixFighterImages() {
  try {
    // Get the fight to find the fighter IDs
    const fight = await prisma.fight.findFirst({
      where: {
        eventId: '49e6d62c-8b6b-4ff5-bcee-1be3f7f26802',
        orderOnCard: 1
      },
      include: {
        fighter1: true,
        fighter2: true
      }
    });

    if (!fight) {
      console.log('Fight not found');
      return;
    }

    console.log('\nBefore fix:');
    console.log(`Fighter1 (${fight.fighter1.firstName} ${fight.fighter1.lastName}): ${fight.fighter1.profileImage}`);
    console.log(`Fighter2 (${fight.fighter2.firstName} ${fight.fighter2.lastName}): ${fight.fighter2.profileImage}`);

    // Swap the images
    const temp = fight.fighter1.profileImage;

    await prisma.fighter.update({
      where: { id: fight.fighter1.id },
      data: { profileImage: fight.fighter2.profileImage }
    });

    await prisma.fighter.update({
      where: { id: fight.fighter2.id },
      data: { profileImage: temp }
    });

    console.log('\nImages swapped successfully!');

    // Verify
    const updatedFight = await prisma.fight.findFirst({
      where: { id: fight.id },
      include: {
        fighter1: true,
        fighter2: true
      }
    });

    console.log('\nAfter fix:');
    console.log(`Fighter1 (${updatedFight!.fighter1.firstName} ${updatedFight!.fighter1.lastName}): ${updatedFight!.fighter1.profileImage}`);
    console.log(`Fighter2 (${updatedFight!.fighter2.firstName} ${updatedFight!.fighter2.lastName}): ${updatedFight!.fighter2.profileImage}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixFighterImages();
