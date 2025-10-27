import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function markRidderAllenComplete() {
  try {
    const eventId = '13bd63bc-039d-4070-9e27-d36a0e61ca19';

    console.log('Marking UFC Fight Night Ridder vs. Allen as complete...');

    // Update all fights
    const updateFights = await prisma.fight.updateMany({
      where: { eventId: eventId },
      data: { isComplete: true, hasStarted: true }
    });

    console.log(`Updated ${updateFights.count} fights`);

    // Update event
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: { isComplete: true, hasStarted: true }
    });

    console.log(`✅ Event marked as complete: ${updatedEvent.name}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

markRidderAllenComplete();
