const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const user = await prisma.user.findUnique({
    where: { email: 'michaelsprimak@gmail.com' },
    select: { id: true, email: true, password: true }
  });

  if (user) {
    console.log('User found:');
    console.log('  ID:', user.id);
    console.log('  Email:', user.email);
    console.log('  Has password:', !!user.password);
    if (user.password) {
      console.log('  Password hash starts with:', user.password.substring(0, 20));
    }
  } else {
    console.log('User NOT FOUND');
  }

  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
