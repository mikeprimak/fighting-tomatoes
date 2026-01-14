const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const user = await prisma.user.findUnique({
    where: { email: 'michaelsprimak@gmail.com' },
    select: {
      id: true,
      email: true,
      password: true,
      isActive: true,
      isEmailVerified: true,
    }
  });

  console.log('User details:', JSON.stringify(user, null, 2));

  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
