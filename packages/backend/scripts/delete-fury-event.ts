import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Find the event
  const event = await prisma.event.findFirst({
    where: { name: { contains: 'Fury', mode: 'insensitive' } },
    include: { fights: { include: { fighter1: true, fighter2: true } } }
  });

  if (!event) {
    console.log('Event not found');
    return;
  }

  console.log('Found event:', event.name);
  console.log('Fights:');
  for (const fight of event.fights) {
    console.log('  -', fight.fighter1.firstName, fight.fighter1.lastName, 'vs', fight.fighter2.firstName, fight.fighter2.lastName);
  }

  // Delete fights then event
  await prisma.fight.deleteMany({ where: { eventId: event.id } });
  await prisma.event.delete({ where: { id: event.id } });
  console.log('Deleted!');
}

main().finally(() => prisma.$disconnect());
