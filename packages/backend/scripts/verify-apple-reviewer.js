const { PrismaClient } = require('@prisma/client');

// Render external URL
const DATABASE_URL = 'postgresql://fightcrewappdb_nhok_user:Ny9FNR6zYbycVdBQyWWfx6umY5XBXC4i@dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com/fightcrewapp';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

async function run() {
  const user = await prisma.user.update({
    where: { email: 'applereview@goodfights.app' },
    data: { isEmailVerified: true }
  });

  console.log('Email verified for:', user.email);
  console.log('User ID:', user.id);

  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
