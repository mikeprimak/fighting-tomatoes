// Find duplicate UFC events (321, 322, 323)
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findUfcDuplicates() {
  // Find all events containing "321", "322", or "323"
  const events = await prisma.event.findMany({
    where: {
      OR: [
        { name: { contains: '321' } },
        { name: { contains: '322' } },
        { name: { contains: '323' } },
        // Also look for Bonfim and other recent events to understand ordering
        { name: { contains: 'Bonfim', mode: 'insensitive' } },
        { name: { contains: 'Garcia', mode: 'insensitive' } },
      ]
    },
    select: {
      id: true,
      name: true,
      date: true,
      promotion: true,
      eventStatus: true,
      ufcUrl: true,
      _count: { select: { fights: true } }
    },
    orderBy: { date: 'desc' }
  });

  console.log(`Found ${events.length} events:\n`);

  for (const event of events) {
    const dateStr = event.date?.toISOString().split('T')[0] || 'NO DATE';
    const status = event.eventStatus === 'COMPLETED' ? '✓ Complete' : (event.eventStatus === 'LIVE' ? '⏳ Started' : '○ Upcoming');
    console.log(`${status} | ${dateStr} | ${event.name}`);
    console.log(`       ID: ${event.id}`);
    console.log(`       Fights: ${event._count.fights} | Promotion: ${event.promotion || 'N/A'}`);
    console.log(`       URL: ${event.ufcUrl || 'N/A'}`);
    console.log('');
  }

  // Also show all UFC events from late 2025 for context
  console.log('\n--- All completed UFC events from Oct 2025 onward ---\n');

  const recentCompleted = await prisma.event.findMany({
    where: {
      promotion: { in: ['UFC', 'ufc'] },
      date: { gte: new Date('2025-10-01') },
      eventStatus: 'COMPLETED'
    },
    select: {
      id: true,
      name: true,
      date: true,
      eventStatus: true,
      _count: { select: { fights: true } }
    },
    orderBy: { date: 'desc' }
  });

  for (const event of recentCompleted) {
    const dateStr = event.date?.toISOString().split('T')[0] || 'NO DATE';
    console.log(`${dateStr} | ${event._count.fights} fights | ${event.name}`);
    console.log(`       ID: ${event.id}`);
    console.log('');
  }
}

findUfcDuplicates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
