const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateRatingStats() {
  console.log('Updating totalRatings and averageRating for all fights...');

  // Get all fights with their ratings
  const fights = await prisma.fight.findMany({
    include: { ratings: true }
  });

  console.log('Total fights:', fights.length);

  let updated = 0;

  for (const fight of fights) {
    const count = fight.ratings.length;
    const sum = fight.ratings.reduce((acc, r) => acc + r.rating, 0);
    const avg = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;

    // Only update if different
    if (fight.totalRatings !== count || fight.averageRating !== avg) {
      await prisma.fight.update({
        where: { id: fight.id },
        data: {
          totalRatings: count,
          averageRating: avg
        }
      });
      updated++;

      if (updated % 500 === 0) {
        console.log('  Updated', updated, 'fights...');
      }
    }
  }

  console.log('');
  console.log('Done! Updated', updated, 'fights');

  // Verify Gaethje fight
  const gaethje = await prisma.fight.findFirst({
    where: {
      fighter1: { lastName: 'Gaethje' },
      fighter2: { lastName: 'Pimblett' }
    }
  });
  console.log('');
  console.log('Gaethje vs Pimblett now:');
  console.log('  totalRatings:', gaethje?.totalRatings);
  console.log('  averageRating:', gaethje?.averageRating);

  await prisma.$disconnect();
}

updateRatingStats().catch(console.error);
