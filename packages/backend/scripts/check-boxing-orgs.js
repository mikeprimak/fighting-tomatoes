const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  // Get all unique promotions
  const events = await prisma.event.findMany({
    select: { promotion: true },
    distinct: ['promotion'],
    orderBy: { promotion: 'asc' }
  });

  console.log('All unique promotions in database:');
  events.forEach(e => console.log('  - "' + e.promotion + '"'));

  // Check for boxing-related
  console.log('\n--- Boxing-related promotions ---');
  const boxingEvents = await prisma.event.findMany({
    where: {
      OR: [
        { promotion: { contains: 'box', mode: 'insensitive' } },
        { promotion: { contains: 'rank', mode: 'insensitive' } },
        { promotion: { contains: 'golden', mode: 'insensitive' } },
        { promotion: { contains: 'matchroom', mode: 'insensitive' } },
        { promotion: { contains: 'showtime', mode: 'insensitive' } },
        { promotion: { contains: 'valuable', mode: 'insensitive' } },
      ]
    },
    select: { promotion: true },
    distinct: ['promotion'],
  });
  boxingEvents.forEach(e => console.log('  - "' + e.promotion + '"'));

  await prisma.$disconnect();
}
check();
