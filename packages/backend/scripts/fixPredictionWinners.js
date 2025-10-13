const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixPredictions() {
  try {
    // Get all predictions for test user
    const user = await prisma.user.findUnique({
      where: { email: 'test@fightingtomatoes.com' },
      select: { id: true }
    });

    if (!user) {
      console.log('User not found');
      process.exit(1);
    }

    const predictions = await prisma.fightPrediction.findMany({
      where: {
        userId: user.id
      },
      include: {
        fight: {
          include: {
            fighter1: { select: { id: true, firstName: true, lastName: true } },
            fighter2: { select: { id: true, firstName: true, lastName: true } }
          }
        }
      }
    });

    console.log(`Found ${predictions.length} predictions to fix`);

    let fixed = 0;
    let skipped = 0;

    for (const prediction of predictions) {
      const fight = prediction.fight;
      const fighter1Name = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
      const fighter2Name = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;

      // Check if predictedWinner is a name instead of ID
      if (prediction.predictedWinner === fighter1Name) {
        await prisma.fightPrediction.update({
          where: { id: prediction.id },
          data: { predictedWinner: fight.fighter1.id }
        });
        console.log(`Fixed: ${fighter1Name} -> ${fight.fighter1.id}`);
        fixed++;
      } else if (prediction.predictedWinner === fighter2Name) {
        await prisma.fightPrediction.update({
          where: { id: prediction.id },
          data: { predictedWinner: fight.fighter2.id }
        });
        console.log(`Fixed: ${fighter2Name} -> ${fight.fighter2.id}`);
        fixed++;
      } else {
        // Already a UUID or null
        skipped++;
      }
    }

    console.log(`\nFixed ${fixed} predictions, skipped ${skipped}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixPredictions();
