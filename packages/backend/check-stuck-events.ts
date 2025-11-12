import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStuckEvents() {
  console.log('Checking for stuck live events...\n');

  const stuckEvents = await prisma.event.findMany({
    where: {
      hasStarted: true,
      isComplete: false
    },
    select: {
      id: true,
      name: true,
      date: true,
      hasStarted: true,
      isComplete: true,
      createdAt: true,
      _count: {
        select: {
          fights: true
        }
      }
    },
    orderBy: { date: 'desc' },
    take: 20
  });

  console.log(`Found ${stuckEvents.length} events with hasStarted=true and isComplete=false:\n`);

  stuckEvents.forEach(event => {
    console.log(`- ${event.name}`);
    console.log(`  Date: ${event.date.toISOString()}`);
    console.log(`  Total Fights: ${event._count.fights}`);
    console.log(`  Days ago: ${Math.floor((Date.now() - event.date.getTime()) / (1000 * 60 * 60 * 24))}`);
    console.log('');
  });

  // Also check for stuck fights
  console.log('\nChecking for stuck live fights...\n');

  const stuckFights = await prisma.fight.findMany({
    where: {
      hasStarted: true,
      isComplete: false,
      event: {
        date: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // More than 24 hours ago
        }
      }
    },
    select: {
      id: true,
      event: {
        select: {
          name: true,
          date: true
        }
      },
      fighter1: {
        select: { lastName: true }
      },
      fighter2: {
        select: { lastName: true }
      }
    },
    take: 20
  });

  console.log(`Found ${stuckFights.length} fights with hasStarted=true and isComplete=false from past events:\n`);

  stuckFights.forEach(fight => {
    console.log(`- ${fight.fighter1.lastName} vs ${fight.fighter2.lastName}`);
    console.log(`  Event: ${fight.event.name}`);
    console.log(`  Date: ${fight.event.date.toISOString()}`);
    console.log('');
  });

  await prisma.$disconnect();
}

checkStuckEvents();
