// Delete duplicate Bonfim event with only 5 fights
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteDuplicateEvent() {
  const eventIdToDelete = 'dd40a2f3-fb2a-48ad-8eb9-2b8e46c885a1';

  console.log(`Deleting event ${eventIdToDelete}...`);

  // First, delete all fights associated with this event
  const deletedFights = await prisma.fight.deleteMany({
    where: { eventId: eventIdToDelete }
  });

  console.log(`✓ Deleted ${deletedFights.count} fights`);

  // Then delete the event
  const deletedEvent = await prisma.event.delete({
    where: { id: eventIdToDelete }
  });

  console.log(`✓ Deleted event: ${deletedEvent.name}`);
  console.log('Done!');
}

deleteDuplicateEvent()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
