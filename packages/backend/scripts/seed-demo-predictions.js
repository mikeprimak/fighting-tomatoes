const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find Yan vs Merab fight
  console.log('Finding Yan vs Merab fight...\n');

  const fights = await prisma.fight.findMany({
    where: {
      OR: [
        { fighter1: { lastName: { contains: 'Yan', mode: 'insensitive' } } },
        { fighter2: { lastName: { contains: 'Yan', mode: 'insensitive' } } },
      ],
      AND: [
        {
          OR: [
            { fighter1: { lastName: { contains: 'Dvalishvili', mode: 'insensitive' } } },
            { fighter2: { lastName: { contains: 'Dvalishvili', mode: 'insensitive' } } },
          ]
        }
      ]
    },
    include: {
      fighter1: { select: { id: true, firstName: true, lastName: true } },
      fighter2: { select: { id: true, firstName: true, lastName: true } },
      event: { select: { name: true, date: true } }
    },
  });

  if (fights.length === 0) {
    console.error('Fight not found!');
    return;
  }

  const fight = fights[0];
  console.log('Found fight:');
  console.log(`  ${fight.fighter1.firstName} ${fight.fighter1.lastName} vs ${fight.fighter2.firstName} ${fight.fighter2.lastName}`);
  console.log(`  Event: ${fight.event.name}`);
  console.log(`  Fight ID: ${fight.id}`);
  console.log(`  Fighter1 ID: ${fight.fighter1.id}`);
  console.log(`  Fighter2 ID: ${fight.fighter2.id}`);

  // Determine which fighter is Merab and which is Yan
  const isYanFighter1 = fight.fighter1.lastName.toLowerCase().includes('yan');
  const yanId = isYanFighter1 ? fight.fighter1.id : fight.fighter2.id;
  const merabId = isYanFighter1 ? fight.fighter2.id : fight.fighter1.id;

  console.log(`\n  Yan ID: ${yanId}`);
  console.log(`  Merab ID: ${merabId}`);

  // Get demo users we created earlier
  const demoUsers = await prisma.user.findMany({
    where: {
      email: { contains: '@demo.fightcrew.app' }
    }
  });

  console.log(`\nFound ${demoUsers.length} demo users`);

  // Create additional demo users for more predictions
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash('DemoUser123!', 10);

  const additionalUsers = [
    { displayName: 'MerabMania', firstName: 'Tom', lastName: 'Garcia' },
    { displayName: 'SiberianExpress', firstName: 'Alex', lastName: 'Petrov' },
    { displayName: 'WrestlingFan', firstName: 'Dan', lastName: 'Murphy' },
    { displayName: 'StrikerSupreme', firstName: 'Kevin', lastName: 'Lee' },
    { displayName: 'BJJBlackBelt', firstName: 'Carlos', lastName: 'Silva' },
    { displayName: 'UFCAnalyst', firstName: 'Ryan', lastName: 'Scott' },
    { displayName: 'CasualFan88', firstName: 'Matt', lastName: 'Jones' },
    { displayName: 'PredictionKing', firstName: 'Steve', lastName: 'Williams' },
    { displayName: 'FightPicker', firstName: 'John', lastName: 'Davis' },
    { displayName: 'MMAProphet', firstName: 'Lisa', lastName: 'Anderson' },
    { displayName: 'OddsBeater', firstName: 'Nick', lastName: 'Taylor' },
    { displayName: 'ChampChaser', firstName: 'Brian', lastName: 'Moore' },
  ];

  const allUsers = [...demoUsers];

  for (const user of additionalUsers) {
    const email = `${user.displayName.toLowerCase()}@demo.fightcrew.app`;
    let existingUser = await prisma.user.findUnique({ where: { email } });

    if (!existingUser) {
      existingUser = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          displayName: user.displayName,
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: true,
        },
      });
      console.log(`Created user: ${user.displayName}`);
    }
    allUsers.push(existingUser);
  }

  console.log(`\nTotal users for predictions: ${allUsers.length}`);

  // Delete existing predictions for this fight from demo users
  const demoUserIds = allUsers.map(u => u.id);
  await prisma.fightPrediction.deleteMany({
    where: {
      fightId: fight.id,
      userId: { in: demoUserIds },
    },
  });

  console.log('\nCreating predictions...\n');

  // Distribution:
  // Merab by SUB: 8 users (most popular)
  // Yan by DEC: 6 users (second most popular)
  // Merab by DEC: 3 users
  // Yan by KO: 2 users
  // Merab by KO: 1 user

  // Hype scores to average ~9.2
  // We need: 8+6+3+2+1 = 20 predictions
  // For avg 9.2: total = 20 * 9.2 = 184
  // Distribution: lots of 9s and 10s, some 8s

  const predictions = [
    // Merab by SUB (8 users) - hype: 10,10,10,9,9,9,9,8 = 74
    { winner: merabId, method: 'SUBMISSION', hype: 10 },
    { winner: merabId, method: 'SUBMISSION', hype: 10 },
    { winner: merabId, method: 'SUBMISSION', hype: 10 },
    { winner: merabId, method: 'SUBMISSION', hype: 9 },
    { winner: merabId, method: 'SUBMISSION', hype: 9 },
    { winner: merabId, method: 'SUBMISSION', hype: 9 },
    { winner: merabId, method: 'SUBMISSION', hype: 9 },
    { winner: merabId, method: 'SUBMISSION', hype: 8 },

    // Yan by DEC (6 users) - hype: 10,10,9,9,9,8 = 55
    { winner: yanId, method: 'DECISION', hype: 10 },
    { winner: yanId, method: 'DECISION', hype: 10 },
    { winner: yanId, method: 'DECISION', hype: 9 },
    { winner: yanId, method: 'DECISION', hype: 9 },
    { winner: yanId, method: 'DECISION', hype: 9 },
    { winner: yanId, method: 'DECISION', hype: 8 },

    // Merab by DEC (3 users) - hype: 10,9,9 = 28
    { winner: merabId, method: 'DECISION', hype: 10 },
    { winner: merabId, method: 'DECISION', hype: 9 },
    { winner: merabId, method: 'DECISION', hype: 9 },

    // Yan by KO (2 users) - hype: 10,9 = 19
    { winner: yanId, method: 'KO_TKO', hype: 10 },
    { winner: yanId, method: 'KO_TKO', hype: 9 },

    // Merab by KO (1 user) - hype: 8 = 8
    { winner: merabId, method: 'KO_TKO', hype: 8 },
  ];

  // Total hype: 74+55+28+19+8 = 184, avg = 184/20 = 9.2 ✓

  for (let i = 0; i < predictions.length && i < allUsers.length; i++) {
    const pred = predictions[i];
    const user = allUsers[i];

    await prisma.fightPrediction.create({
      data: {
        userId: user.id,
        fightId: fight.id,
        predictedWinner: pred.winner,
        predictedMethod: pred.method,
        predictedRating: pred.hype,
      },
    });

    const winnerName = pred.winner === merabId ? 'Merab' : 'Yan';
    console.log(`Created: ${user.displayName} - ${winnerName} by ${pred.method}, Hype: ${pred.hype}`);
  }

  // Calculate and display stats
  const totalHype = predictions.reduce((sum, p) => sum + p.hype, 0);
  const avgHype = totalHype / predictions.length;

  console.log('\n=== STATS ===');
  console.log(`Total predictions: ${predictions.length}`);
  console.log(`Average hype: ${avgHype.toFixed(1)}`);
  console.log(`Merab wins: ${predictions.filter(p => p.winner === merabId).length}`);
  console.log(`Yan wins: ${predictions.filter(p => p.winner === yanId).length}`);

  console.log('\n✅ Done! Predictions created successfully.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
