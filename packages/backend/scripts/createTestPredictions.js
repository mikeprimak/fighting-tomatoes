const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createPredictions() {
  try {
    // 1. Find the user
    const user = await prisma.user.findUnique({
      where: { email: 'test@fightingtomatoes.com' },
      select: { id: true, email: true }
    });

    if (!user) {
      console.log('User not found');
      process.exit(1);
    }

    console.log('Found user:', user.email);

    // 2. Find UFC 320 event
    const event = await prisma.event.findFirst({
      where: {
        name: { contains: '320', mode: 'insensitive' }
      },
      select: { id: true, name: true }
    });

    if (!event) {
      console.log('UFC 320 event not found');
      process.exit(1);
    }

    console.log('Found event:', event.name);

    // 3. Get all fights for this event
    const fights = await prisma.fight.findMany({
      where: { eventId: event.id },
      select: {
        id: true,
        orderOnCard: true,
        fighter1: {
          select: {
            firstName: true,
            lastName: true
          }
        },
        fighter2: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { orderOnCard: 'desc' }
    });

    console.log(`Found ${fights.length} fights`);

    // 4. Create predictions for each fight
    const methods = ['KO_TKO', 'SUBMISSION', 'DECISION'];
    let created = 0;

    for (const fight of fights) {
      const fighter1Name = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
      const fighter2Name = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;

      // Check if prediction already exists
      const existing = await prisma.fightPrediction.findUnique({
        where: {
          userId_fightId: {
            userId: user.id,
            fightId: fight.id
          }
        }
      });

      if (existing) {
        console.log(`Prediction already exists for ${fighter1Name} vs ${fighter2Name}`);
        continue;
      }

      // Generate random prediction
      const predictedRating = Math.floor(Math.random() * 5) + 6; // 6-10
      const predictedWinner = Math.random() > 0.5 ? fighter1Name : fighter2Name;
      const predictedMethod = methods[Math.floor(Math.random() * methods.length)];
      const predictedRound = predictedMethod === 'DECISION' ? 3 : Math.floor(Math.random() * 3) + 1;

      await prisma.fightPrediction.create({
        data: {
          userId: user.id,
          fightId: fight.id,
          predictedRating,
          predictedWinner,
          predictedMethod,
          predictedRound
        }
      });

      console.log(`Created prediction for ${fighter1Name} vs ${fighter2Name}: Winner=${predictedWinner}, Method=${predictedMethod}, Round=${predictedRound}, Hype=${predictedRating}`);
      created++;
    }

    console.log(`\nSuccessfully created ${created} predictions out of ${fights.length} fights`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createPredictions();
