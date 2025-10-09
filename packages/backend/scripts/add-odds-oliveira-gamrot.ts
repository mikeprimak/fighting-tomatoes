import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Finding UFC Fight Night: Oliveira vs Gamrot event...');

  // Find the event
  const event = await prisma.event.findFirst({
    where: {
      name: {
        contains: 'Oliveira',
        mode: 'insensitive',
      },
    },
    include: {
      fights: {
        include: {
          fighter1: true,
          fighter2: true,
        },
        orderBy: {
          orderOnCard: 'asc',
        },
      },
    },
  });

  if (!event) {
    console.log('❌ Event not found');
    return;
  }

  console.log(`✅ Found event: ${event.name}`);
  console.log(`📊 Updating odds for ${event.fights.length} fights...\n`);

  // Generate varied odds for each fight
  const oddsVariations = [
    { fighter1: '-350', fighter2: '+250' },
    { fighter1: '-200', fighter2: '+170' },
    { fighter1: '-150', fighter2: '+130' },
    { fighter1: '+120', fighter2: '-140' },
    { fighter1: '+180', fighter2: '-220' },
    { fighter1: '-110', fighter2: '-110' },
    { fighter1: '-280', fighter2: '+210' },
    { fighter1: '-165', fighter2: '+145' },
    { fighter1: '+250', fighter2: '-300' },
    { fighter1: '-400', fighter2: '+320' },
  ];

  for (let i = 0; i < event.fights.length; i++) {
    const fight = event.fights[i];
    const odds = oddsVariations[i % oddsVariations.length];

    await prisma.fight.update({
      where: { id: fight.id },
      data: {
        fighter1Odds: odds.fighter1,
        fighter2Odds: odds.fighter2,
      },
    });

    console.log(
      `✓ ${fight.fighter1.firstName} ${fight.fighter1.lastName} (${odds.fighter1}) vs ${fight.fighter2.firstName} ${fight.fighter2.lastName} (${odds.fighter2})`
    );
  }

  console.log(`\n✅ Updated ${event.fights.length} fights with odds`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
