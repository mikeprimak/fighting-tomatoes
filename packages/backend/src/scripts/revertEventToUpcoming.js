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
      return;
    }

    console.log('Current event status:');
    console.log(`Event: ${event.name}`);
    console.log(`eventStatus: ${event.eventStatus}`);
    console.log('');

    // Update to revert to upcoming
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: {
        eventStatus: 'UPCOMING',
      },
    });

    console.log('✅ Event reverted to UPCOMING status!');
    console.log(`eventStatus: ${updated.eventStatus}`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
})();
