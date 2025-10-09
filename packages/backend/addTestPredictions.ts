import { PrismaClient, PredictionMethod } from '@prisma/client';

const prisma = new PrismaClient();

async function addTestPredictions() {
  try {
    // UFC 320 fight ID (from the logs)
    const fightId = '10d9b1e1-5844-49f5-9c1c-04ceaf0e0285';

    // Get the fight details
    const fight = await prisma.fight.findUnique({
      where: { id: fightId },
      include: {
        fighter1: true,
        fighter2: true,
      },
    });

    if (!fight) {
      console.error('Fight not found!');
      return;
    }

    console.log(`Fight: ${fight.fighter1.firstName} ${fight.fighter1.lastName} vs ${fight.fighter2.firstName} ${fight.fighter2.lastName}`);
    console.log(`Fighter 1 ID: ${fight.fighter1Id}`);
    console.log(`Fighter 2 ID: ${fight.fighter2Id}`);

    // Get or create test users
    const testUsers = [];
    for (let i = 1; i <= 5; i++) {
      const email = `testprediction${i}@fightcrewapp.com`;
      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            password: '$2b$10$dummyhashfortest',
            firstName: `Test`,
            lastName: `User${i}`,
            isEmailVerified: true,
          },
        });
        console.log(`Created user: ${email}`);
      } else {
        console.log(`Using existing user: ${email}`);
      }
      testUsers.push(user);
    }

    // Create diverse predictions
    const predictions = [
      // User 1: Predicts Pereira by KO/TKO in Round 2, Hype 9
      {
        userId: testUsers[0].id,
        fightId,
        predictedWinner: fight.fighter2Id, // Pereira
        predictedMethod: PredictionMethod.KO_TKO,
        predictedRound: 2,
        predictedRating: 9,
      },
      // User 2: Predicts Ankalaev by Decision, Hype 7
      {
        userId: testUsers[1].id,
        fightId,
        predictedWinner: fight.fighter1Id, // Ankalaev
        predictedMethod: PredictionMethod.DECISION,
        predictedRound: 5,
        predictedRating: 7,
      },
      // User 3: Predicts Pereira by KO/TKO in Round 1, Hype 10
      {
        userId: testUsers[2].id,
        fightId,
        predictedWinner: fight.fighter2Id, // Pereira
        predictedMethod: PredictionMethod.KO_TKO,
        predictedRound: 1,
        predictedRating: 10,
      },
      // User 4: Predicts Pereira by KO/TKO in Round 3, Hype 8
      {
        userId: testUsers[3].id,
        fightId,
        predictedWinner: fight.fighter2Id, // Pereira
        predictedMethod: PredictionMethod.KO_TKO,
        predictedRound: 3,
        predictedRating: 8,
      },
      // User 5: Predicts Ankalaev by Submission in Round 4, Hype 6
      {
        userId: testUsers[4].id,
        fightId,
        predictedWinner: fight.fighter1Id, // Ankalaev
        predictedMethod: PredictionMethod.SUBMISSION,
        predictedRound: 4,
        predictedRating: 6,
      },
    ];

    // Delete existing predictions for these test users (if any)
    await prisma.fightPrediction.deleteMany({
      where: {
        userId: { in: testUsers.map(u => u.id) },
        fightId,
      },
    });

    // Create all predictions
    for (const pred of predictions) {
      await prisma.fightPrediction.create({ data: pred });
      console.log(`Created prediction: User ${pred.userId.slice(0, 8)}... predicts ${pred.predictedWinner === fight.fighter1Id ? 'Ankalaev' : 'Pereira'} by ${pred.predictedMethod} in Round ${pred.predictedRound} (Hype: ${pred.predictedRating})`);
    }

    console.log('\n✅ Successfully created 5 test predictions!');
    console.log('Predictions breakdown:');
    console.log('- Pereira: 3 predictions');
    console.log('- Ankalaev: 2 predictions');
    console.log('- Methods: 4 KO/TKO, 1 Decision, 1 Submission');

  } catch (error) {
    console.error('Error creating test predictions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addTestPredictions();
