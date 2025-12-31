const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const events = await prisma.event.findMany({
    where: {
      promotion: { contains: 'dirty', mode: 'insensitive' }
    },
    select: { id: true, name: true, promotion: true },
  });

  console.log('Dirty Boxing events and their exact promotion values:');
  events.forEach(e => {
    console.log('  Promotion: "' + e.promotion + '" | Event: ' + e.name);
  });

  await prisma.$disconnect();
}
check();
