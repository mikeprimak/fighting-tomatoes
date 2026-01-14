import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Define the test fights to find (to identify their events)
  const testFights = [
    { fighter1: 'Jon Jones', fighter2: 'Islam Makhachev', event: 'UFC 300' },
    { fighter1: 'Tyson Fury', fighter2: 'Jon Jones', event: 'Top Rank' },
    { fighter1: 'Alexander Volkanovski', fighter2: 'Islam Makhachev', event: 'UFC 300' },
    { fighter1: 'Amanda Nunes', fighter2: 'Katie Taylor', event: 'UFC 301' },
  ];

  console.log('Searching for test fights and their events...\n');

  const eventIdsToDelete = new Set<string>();

  for (const testFight of testFights) {
    const fights = await prisma.fight.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                fighter1: {
                  firstName: testFight.fighter1.split(' ')[0],
                  lastName: testFight.fighter1.split(' ').slice(1).join(' '),
                },
              },
              {
                fighter2: {
                  firstName: testFight.fighter1.split(' ')[0],
                  lastName: testFight.fighter1.split(' ').slice(1).join(' '),
                },
              },
            ],
          },
          {
            OR: [
              {
                fighter1: {
                  firstName: testFight.fighter2.split(' ')[0],
                  lastName: testFight.fighter2.split(' ').slice(1).join(' '),
                },
              },
              {
                fighter2: {
                  firstName: testFight.fighter2.split(' ')[0],
                  lastName: testFight.fighter2.split(' ').slice(1).join(' '),
                },
              },
            ],
          },
          {
            event: {
              name: {
                contains: testFight.event,
                mode: 'insensitive',
              },
            },
          },
        ],
      },
      include: {
        fighter1: true,
        fighter2: true,
        event: true,
      },
    });

    if (fights.length === 0) {
      console.log(`Not found: ${testFight.fighter1} vs ${testFight.fighter2} (${testFight.event})`);
    } else {
      for (const fight of fights) {
        console.log(`Found: ${fight.fighter1.firstName} ${fight.fighter1.lastName} vs ${fight.fighter2.firstName} ${fight.fighter2.lastName}`);
        console.log(`   Event: ${fight.event.name} (ID: ${fight.event.id})`);
        eventIdsToDelete.add(fight.event.id);
      }
    }
  }

  console.log(`\nDeleting ${eventIdsToDelete.size} test event(s) and their fights...\n`);

  for (const eventId of eventIdsToDelete) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { fights: { include: { fighter1: true, fighter2: true } } },
    });

    if (event) {
      console.log(`Deleting event: ${event.name}`);
      for (const fight of event.fights) {
        console.log(`  - ${fight.fighter1.firstName} ${fight.fighter1.lastName} vs ${fight.fighter2.firstName} ${fight.fighter2.lastName}`);
      }

      // Delete all fights first (cascade should handle this, but being explicit)
      await prisma.fight.deleteMany({ where: { eventId } });
      
      // Delete the event
      await prisma.event.delete({ where: { id: eventId } });
      console.log(`  Deleted!\n`);
    }
  }

  console.log('Done!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
