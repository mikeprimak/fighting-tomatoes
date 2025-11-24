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
    console.log(`hasStarted: ${event.hasStarted}`);
    console.log(`isComplete: ${event.isComplete}`);
    console.log('');

    // Update to revert to upcoming
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: {
        hasStarted: false,
        isComplete: false,
      },
    });

    console.log('✅ Event reverted to UPCOMING status!');
    console.log(`hasStarted: ${updated.hasStarted}`);
    console.log(`isComplete: ${updated.isComplete}`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
})();
