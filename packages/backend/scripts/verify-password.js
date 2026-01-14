const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const user = await prisma.user.findUnique({
    where: { email: 'michaelsprimak@gmail.com' },
    select: { password: true }
  });

  if (!user || !user.password) {
    console.log('No user or password found');
    return;
  }

  const isValid = await bcrypt.compare('admin123', user.password);
  console.log('Password "admin123" is valid:', isValid);

  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
