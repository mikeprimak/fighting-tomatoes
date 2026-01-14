const { PrismaClient } = require('@prisma/client');

const DATABASE_URL = 'postgresql://fightcrewappdb_nhok_user:Ny9FNR6zYbycVdBQyWWfx6umY5XBXC4i@dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com/fightcrewapp';

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
});

async function run() {
  // Find Zuffa Boxing events
  const events = await prisma.event.findMany({
    where: {
      OR: [
        { promotion: { contains: 'Zuffa', mode: 'insensitive' } },
        { name: { contains: 'Zuffa', mode: 'insensitive' } },
      ]
    },
    include: {
      fights: {
        include: {
          fighter1: { select: { firstName: true, lastName: true } },
          fighter2: { select: { firstName: true, lastName: true } },
        }
      }
    }
  });

  console.log('=== ZUFFA BOXING EVENTS ===\n');

  if (events.length === 0) {
    console.log('No Zuffa Boxing events found');
  } else {
    events.forEach(event => {
      console.log('Event:', event.name);
      console.log('  ID:', event.id);
      console.log('  Promotion:', event.promotion);
      console.log('  Date:', event.date);
      console.log('  Is upcoming:', new Date(event.date) > new Date());
      console.log('  Fights:', event.fights.length);
      event.fights.forEach(f => {
        console.log(`    - ${f.fighter1.firstName} ${f.fighter1.lastName} vs ${f.fighter2.firstName} ${f.fighter2.lastName}`);
      });
      console.log('');
    });
  }

  await prisma.$disconnect();
}

run().catch(e => {
  console.error('Error:', e);
  prisma.$disconnect();
});
