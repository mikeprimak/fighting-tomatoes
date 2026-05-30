import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const events = await prisma.event.findMany({
    where: {
      id: {
        in: [
          '5d23eb8b-8d93-44b5-80d3-c3687c15985d', // UFC 321
          '71c88696-2ea2-45b6-bbf0-2cdc096a432f', // UFC 322
          '38694e9b-b845-4aa1-bf1f-a700d71fba58'  // UFC 323
        ]
      }
    },
    select: { id: true, name: true, date: true, eventStatus: true }
  });

  console.log('Direct query for UFC 321/322/323:');
  events.forEach(e => {
    console.log(`${e.name} - Date: ${e.date?.toISOString()} - Status: ${e.eventStatus}`);
  });

  await prisma.$disconnect();
}

check().catch(console.error);
