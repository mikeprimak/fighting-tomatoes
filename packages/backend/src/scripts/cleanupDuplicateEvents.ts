// Clean up all duplicate events by keeping the one with more fights
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// IDs to delete (the ones with earlier dates / less fights)
const eventsToDelete = [
  '0791ce7f-e291-4bee-8496-f74b7ecaa9c1', // UFC Fight Night Royval vs. Kape (Dec 14)
  'c7e293b7-6495-4e0c-8531-ae0ff8219494', // UFC 323 (Dec 7)
  '073bdd90-2d06-46db-9a0e-fe444dc9687a', // UFC Fight Night Tsarukyan vs. Hooker (Nov 22 00:00)
  'b033fa5e-2a5d-4c02-9f34-a4a20b5789a2', // UFC 322 (Nov 16)
];

async function cleanupDuplicates() {
  console.log(`Cleaning up ${eventsToDelete.length} duplicate events...`);

  for (const eventId of eventsToDelete) {
    // Get event name for logging
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { name: true }
    });

    if (!event) {
      console.log(`  ⚠ Event ${eventId} not found, skipping...`);
      continue;
    }

    // Delete fights first
    const deletedFights = await prisma.fight.deleteMany({
      where: { eventId }
    });

    // Delete event
    await prisma.event.delete({
      where: { id: eventId }
    });

    console.log(`  ✓ Deleted "${event.name}" (${deletedFights.count} fights)`);
  }

  console.log('Done!');
}

cleanupDuplicates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
