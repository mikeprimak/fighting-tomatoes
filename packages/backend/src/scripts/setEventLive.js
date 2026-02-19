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
        console.log(`  eventStatus: ${e.eventStatus}`);
      });
      return;
    }

    console.log('Current event status:');
    console.log(`Event: ${event.name}`);
    console.log(`Date: ${event.date}`);
    console.log(`eventStatus: ${event.eventStatus}`);
    console.log('');

    // Update to make it live
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: {
        eventStatus: 'LIVE',
      },
    });

    console.log('✅ Event updated to LIVE status!');
    console.log(`eventStatus: ${updated.eventStatus}`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
})();
