import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function markEventComplete() {
  try {
    // First, find events that match
    const events = await prisma.event.findMany({
      where: {
        OR: [
          { name: { contains: 'Allen', mode: 'insensitive' } },
          { name: { contains: 'Riddell', mode: 'insensitive' } },
          { name: { contains: 'Ridder', mode: 'insensitive' } },
          { eventStatus: 'LIVE' }
        ]
      },
      select: {
        id: true,
        name: true,
        eventStatus: true,
        _count: { select: { fights: true } }
      }
    });

    console.log(`Found ${events.length} matching events:`);
    events.forEach(e => {
      console.log(`- ${e.name}`);
      console.log(`  ID: ${e.id}`);
      console.log(`  Status: ${e.eventStatus}`);
      console.log(`  Fights: ${e._count.fights}`);
    });

    if (events.length === 0) {
      console.log('\nNo matching events found. Listing all LIVE events:');
      const startedEvents = await prisma.event.findMany({
        where: { eventStatus: 'LIVE' },
        select: { id: true, name: true, eventStatus: true }
      });
      startedEvents.forEach(e => console.log(`- ${e.name} (Status: ${e.eventStatus})`));
      return;
    }

    // Mark the first matching event as complete
    const eventToComplete = events[0];
    console.log(`\nMarking event as complete: ${eventToComplete.name}`);

    // Update all fights
    const updateFights = await prisma.fight.updateMany({
      where: { eventId: eventToComplete.id },
      data: { fightStatus: 'COMPLETED' }
    });

    console.log(`Updated ${updateFights.count} fights`);

    // Update event
    const updatedEvent = await prisma.event.update({
      where: { id: eventToComplete.id },
      data: { eventStatus: 'COMPLETED' }
    });

    console.log(`✅ Event marked as complete: ${updatedEvent.name}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

markEventComplete();
