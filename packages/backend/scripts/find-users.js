const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const users = await prisma.user.findMany({
    where: {
      email: { contains: 'primak' }
    },
    select: { id: true, email: true, password: true }
  });

  console.log('Users with "primak" in email:');
  users.forEach(u => {
    console.log('  -', u.email, '| Has password:', !!u.password);
  });

  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
