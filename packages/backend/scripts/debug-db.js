const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('=== DATABASE DEBUG ===\n');

  // 1. Check connection
  console.log('1. DATABASE_URL being used:');
  const dbUrl = process.env.DATABASE_URL || 'NOT SET';
  // Mask password
  const maskedUrl = dbUrl.replace(/:([^@]+)@/, ':****@');
  console.log('   ', maskedUrl);

  // 2. Get database name
  const dbName = dbUrl.split('/').pop()?.split('?')[0] || 'unknown';
  console.log('   Database name:', dbName);

  // 3. Count total users (sanity check)
  const userCount = await prisma.user.count();
  console.log('\n2. Total users in database:', userCount);

  // 4. Get target user details
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

  // 5. Get most recent event (another sanity check to verify same DB)
  const recentEvent = await prisma.event.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, createdAt: true }
  });

  console.log('\n4. Most recent event (for DB verification):');
  if (recentEvent) {
    console.log('   ID:', recentEvent.id);
    console.log('   Name:', recentEvent.name);
    console.log('   Created:', recentEvent.createdAt);
  } else {
    console.log('   No events found');
  }

  await prisma.$disconnect();
}

run().catch(e => {
  console.error('Error:', e.message);
  prisma.$disconnect();
});
