const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  // First check current state
  const userBefore = await prisma.user.findUnique({
    where: { email: 'michaelsprimak@gmail.com' },
    select: { password: true }
  });
  console.log('Current hash:', userBefore?.password);

  // Create new hash
  const newPassword = 'fight123';
  const hash = await bcrypt.hash(newPassword, 10);
  console.log('New hash:', hash);

  // Update
  await prisma.user.update({
    where: { email: 'michaelsprimak@gmail.com' },
    data: { password: hash }
  });

  // Verify it was saved
  const userAfter = await prisma.user.findUnique({
    where: { email: 'michaelsprimak@gmail.com' },
    select: { password: true }
  });
  console.log('Saved hash:', userAfter?.password);

  // Verify comparison works
  const isValid = await bcrypt.compare(newPassword, userAfter.password);
  console.log('Local verification:', isValid);

  console.log('\nNew password is: fight123');

  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
