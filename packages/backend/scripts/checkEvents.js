const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkEvents() {
  const events = await prisma.event.findMany({
    select: {
      id: true,
      name: true,
      date: true,
      hasStarted: true,
      isComplete: true
    },
    orderBy: { date: 'asc' }
  });

  console.log('\nAll events in database:');
  console.log('Today:', new Date().toISOString());
  console.log('\n');

  events.forEach(e => {
    const eventDate = new Date(e.date);
    const isUpcoming = !e.hasStarted && !e.isComplete && eventDate >= new Date();
    console.log(JSON.stringify({
      name: e.name,
      date: e.date,
      hasStarted: e.hasStarted,
      isComplete: e.isComplete,
      isUpcoming
    }, null, 2));
  });

  await prisma.$disconnect();
}

checkEvents().catch(console.error);
