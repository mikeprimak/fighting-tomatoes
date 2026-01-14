const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const searches = ['De Ridder', 'Garcia', 'Aspinall'];

  for (const search of searches) {
    const events = await prisma.event.findMany({
      where: { name: { contains: search } },
      select: { id: true, name: true, date: true, promotion: true },
      orderBy: { date: 'desc' }
    });
    console.log(search + ' events (' + events.length + '):');
    events.forEach(e => console.log('  ' + e.id.substring(0,8) + ' | ' + e.date.toISOString().split('T')[0] + ' | ' + e.name));
    console.log('');
  }

  await prisma.$disconnect();
}
check();
