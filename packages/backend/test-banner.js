const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const event = await prisma.event.findUnique({
    where: { id: '49e6d62c-8b6b-4ff5-bcee-1be3f7f26802' }
  });

  console.log('Event name:', event?.name);
  console.log('Banner Image:', event?.bannerImage);

  await prisma.$disconnect();
}

test();
