import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const fight = await prisma.fight.findFirst({
    where: {
      fighter1Odds: { not: null },
    },
    include: {
      fighter1: true,
      fighter2: true,
    },
  });

  if (!fight) {
    console.log('No fights with odds found');
    return;
  }

  console.log('Fight ID:', fight.id);
  console.log('Fighter 1:', fight.fighter1.firstName, fight.fighter1.lastName, '- Odds:', fight.fighter1Odds);
  console.log('Fighter 2:', fight.fighter2.firstName, fight.fighter2.lastName, '- Odds:', fight.fighter2Odds);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
