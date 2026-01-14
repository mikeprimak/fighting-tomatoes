const { PrismaClient } = require('@prisma/client');

// HARDCODE the Render external URL for this debug script
const DATABASE_URL = 'postgresql://fightcrewappdb_nhok_user:Ny9FNR6zYbycVdBQyWWfx6umY5XBXC4i@dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com/fightcrewapp';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

async function run() {
  console.log('=== DATABASE DEBUG (RENDER EXTERNAL) ===\n');

  // 1. Check connection
  console.log('1. DATABASE_URL being used:');
  const maskedUrl = DATABASE_URL.replace(/:([^@]+)@/, ':****@');
  console.log('   ', maskedUrl);
  const dbName = DATABASE_URL.split('/').pop()?.split('?')[0] || 'unknown';
  console.log('   Database name:', dbName);

  // 2. Count total users
  const userCount = await prisma.user.count();
  console.log('\n2. Total users in database:', userCount);

  // 3. Get target user details
  const user = await prisma.user.findUnique({
    where: { email: 'michaelsprimak@gmail.com' },
    select: {
      id: true,
      email: true,
      password: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    }
  });

  console.log('\n3. User michaelsprimak@gmail.com:');
  if (user) {
    console.log('   ID:', user.id);
    console.log('   Email:', user.email);
    console.log('   Password hash:', user.password);
    console.log('   isActive:', user.isActive);
    console.log('   Created:', user.createdAt);
    console.log('   Last login:', user.lastLoginAt);
  } else {
    console.log('   NOT FOUND');
  }

  // 4. Get most recent event
  const recentEvent = await prisma.event.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, createdAt: true }
  });

  console.log('\n4. Most recent event (for DB verification):');
  if (recentEvent) {
    console.log('   ID:', recentEvent.id);
    console.log('   Name:', recentEvent.name);
    console.log('   Created:', recentEvent.createdAt);
  }

  await prisma.$disconnect();
}

run().catch(e => {
  console.error('Error:', e.message);
  prisma.$disconnect();
});
