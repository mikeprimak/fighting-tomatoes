const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EVENT_NAME = 'UFC 323: Dvalishvili vs. Yan';

(async () => {
  try {
    // Find the event by name
    const event = await prisma.event.findFirst({
      where: {
        name: {
          contains: EVENT_NAME,
          mode: 'insensitive',
        },
      },
    });

    if (!event) {
      console.log('Event not found!');
      console.log('Searching for similar events...');

      const events = await prisma.event.findMany({
        take: 10,
        orderBy: {
          date: 'desc',
        },
      });

      console.log('\nRecent events:');
      events.forEach(e => {
        console.log(`- ${e.name} (ID: ${e.id})`);
        console.log(`  hasStarted: ${e.hasStarted}, isComplete: ${e.isComplete}`);
      });
      return;
    }

    console.log('Current event status:');
    console.log(`Event: ${event.name}`);
    console.log(`Date: ${event.date}`);
    console.log(`hasStarted: ${event.hasStarted}`);
    console.log(`isComplete: ${event.isComplete}`);
    console.log('');

    // Update to make it live
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: {
        hasStarted: true,
        isComplete: false,
      },
    });

    console.log('✅ Event updated to LIVE status!');
    console.log(`hasStarted: ${updated.hasStarted}`);
    console.log(`isComplete: ${updated.isComplete}`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
})();
