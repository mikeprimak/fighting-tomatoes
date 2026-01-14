const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const hash = await bcrypt.hash('admin123', 12);
  await prisma.user.update({
    where: { email: 'michaelsprimak@gmail.com' },
    data: { password: hash }
  });
  console.log('Password set successfully for michaelsprimak@gmail.com');
  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
