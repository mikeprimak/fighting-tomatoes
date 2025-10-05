const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixUrl() {
  const event = await prisma.event.findFirst({
    where: { name: { contains: '320' } }
  });

  if (!event) {
    console.log('UFC 320 not found');
    return;
  }

  console.log('Current event:');
  console.log('  Name:', event.name);
  console.log('  ID:', event.id);
  console.log('  Current ufcUrl:', event.ufcUrl);

  // Update to correct URL
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: { ufcUrl: 'https://www.ufc.com/event/ufc-320' }
  });

  console.log('\nUpdated to:', updated.ufcUrl);
  await prisma.$disconnect();
}

fixUrl().catch(console.error);
