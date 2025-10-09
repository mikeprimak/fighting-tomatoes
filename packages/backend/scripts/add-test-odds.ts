import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding fake odds to first 10 fights...');

  const fights = await prisma.fight.findMany({
    take: 10,
    select: { id: true },
  });

  for (const fight of fights) {
    await prisma.fight.update({
      where: { id: fight.id },
      data: {
        fighter1Odds: '-350',
        fighter2Odds: '+250',
      },
    });
  }

  console.log(`✅ Updated ${fights.length} fights with test odds`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
