// Update event banner image for UFC Bonfim vs Brown
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateEventImage() {
  // Find the event by searching for "Bonfim" in the name
  const events = await prisma.event.findMany({
    where: {
      OR: [
        { name: { contains: 'Bonfim', mode: 'insensitive' } },
        { name: { contains: 'November 08 2025', mode: 'insensitive' } },
        { name: { contains: 'November-08-2025', mode: 'insensitive' } },
      ]
    },
    select: {
      id: true,
      name: true,
      date: true,
      bannerImage: true,
      _count: { select: { fights: true } }
    }
  });

  console.log(`Found ${events.length} events matching "Bonfim":`);
  events.forEach(e => {
    console.log(`  - ${e.name} (${e.date?.toISOString().split('T')[0]}) - ${e._count.fights} fights`);
    console.log(`    Current image: ${e.bannerImage || 'NONE'}`);
  });

  if (events.length === 0) {
    console.log('\nNo events found. Searching more broadly...');

    // Try finding by date
    const novEvents = await prisma.event.findMany({
      where: {
        date: {
          gte: new Date('2025-11-08'),
          lt: new Date('2025-11-09')
        }
      },
      select: {
        id: true,
        name: true,
        date: true,
        bannerImage: true,
        _count: { select: { fights: true } }
      }
    });

    console.log(`Found ${novEvents.length} events on Nov 8, 2025:`);
    novEvents.forEach(e => {
      console.log(`  - ${e.name} (${e.date?.toISOString().split('T')[0]}) - ${e._count.fights} fights`);
      console.log(`    ID: ${e.id}`);
      console.log(`    Current image: ${e.bannerImage || 'NONE'}`);
    });
    return;
  }

  // If --apply flag is passed, update the event
  if (process.argv.includes('--apply')) {
    // Find the event with actual fights (the real one, not the legacy duplicate)
    const eventToUpdate = events.find(e => e._count.fights > 0) || events[0];

    const newImageUrl = 'https://fightcrewapp-backend.onrender.com/images/events/ufc-bonfim-vs-brown.jpg';

    const updated = await prisma.event.update({
      where: { id: eventToUpdate.id },
      data: { bannerImage: newImageUrl }
    });

    console.log(`\n✓ Updated ${updated.name}`);
    console.log(`  New banner image: ${newImageUrl}`);
  } else {
    console.log('\nRun with --apply to update the image');
  }
}

updateEventImage()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
