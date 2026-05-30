/**
 * Hide all Matchroom Boxing events from the app
 * Sets isVisible = false for all events with promotion containing "MATCHROOM"
 * Run with: npx ts-node src/scripts/hideMatchroomEvents.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Finding all Matchroom events...\n');

  // First, let's see what events we're going to hide
  const matchroomEvents = await prisma.event.findMany({
    where: {
      promotion: {
        contains: 'MATCHROOM',
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
      promotion: true,
      date: true,
      isVisible: true,
    },
    orderBy: {
      date: 'desc',
    },
  });

  console.log(`Found ${matchroomEvents.length} Matchroom events:\n`);

  for (const event of matchroomEvents) {
    console.log(`  - ${event.name} (${event.promotion}) - ${event.date.toISOString().split('T')[0]} - visible: ${event.isVisible}`);
  }

  if (matchroomEvents.length === 0) {
    console.log('No Matchroom events found.');
    return;
  }

  // Update all Matchroom events to be hidden
  const result = await prisma.event.updateMany({
    where: {
      promotion: {
        contains: 'MATCHROOM',
        mode: 'insensitive',
      },
    },
    data: {
      isVisible: false,
    },
  });

  console.log(`\nHidden ${result.count} Matchroom events.`);
  console.log('These events will no longer appear in the app but data is preserved.');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
