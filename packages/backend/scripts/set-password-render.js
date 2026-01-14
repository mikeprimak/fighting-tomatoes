const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

// HARDCODE the Render external URL
const DATABASE_URL = 'postgresql://fightcrewappdb_nhok_user:Ny9FNR6zYbycVdBQyWWfx6umY5XBXC4i@dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com/fightcrewapp';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

async function run() {
  const email = 'michaelsprimak@gmail.com';
  const newPassword = 'GoodFightsBluePass123!';

  console.log('Setting password for:', email);
  console.log('New password will be:', newPassword);

  // Hash password
  const hash = await bcrypt.hash(newPassword, 10);
  console.log('New hash:', hash);

  // Update
  await prisma.user.update({
    where: { email },
    data: { password: hash }
  });

  // Verify
  const user = await prisma.user.findUnique({
    where: { email },
    select: { password: true }
  });
  console.log('Saved hash:', user.password);

  // Test comparison
  const isValid = await bcrypt.compare(newPassword, user.password);
  console.log('Verification:', isValid ? 'SUCCESS' : 'FAILED');

  await prisma.$disconnect();
}

run().catch(e => {
  console.error('Error:', e.message);
  prisma.$disconnect();
});
