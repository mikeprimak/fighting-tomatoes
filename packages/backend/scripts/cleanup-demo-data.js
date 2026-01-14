const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const GAETHJE_PIMBLETT_FIGHT_ID = '334a404f-80d1-42ca-bf4a-7e547773be49';
const YAN_MERAB_FIGHT_ID = '9fc9eb02-3f3a-4a33-a203-314b7e8b9213';

async function main() {
  console.log('Cleaning up demo data...\n');

  // Find all demo users
  const demoUsers = await prisma.user.findMany({
    where: {
      email: { contains: '@demo.fightcrew.app' }
    }
  });

  const demoUserIds = demoUsers.map(u => u.id);
  console.log(`Found ${demoUsers.length} demo users`);

  // Delete pre-fight comments for Gaethje vs Pimblett
  const deletedComments = await prisma.preFightComment.deleteMany({
    where: {
      fightId: GAETHJE_PIMBLETT_FIGHT_ID,
      userId: { in: demoUserIds },
    },
  });
  console.log(`Deleted ${deletedComments.count} pre-fight comments from Gaethje vs Pimblett`);

  // Delete predictions for Yan vs Merab
  const deletedPredictions = await prisma.fightPrediction.deleteMany({
    where: {
      fightId: YAN_MERAB_FIGHT_ID,
      userId: { in: demoUserIds },
    },
  });
  console.log(`Deleted ${deletedPredictions.count} predictions from Yan vs Merab`);

  // Delete demo users
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      email: { contains: '@demo.fightcrew.app' }
    }
  });
  console.log(`Deleted ${deletedUsers.count} demo users`);

  console.log('\n✅ Cleanup complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
