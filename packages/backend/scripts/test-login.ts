// Script to test login credentials
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function testLogin(email: string, password: string) {
  console.log(`\n🔐 Testing login for: ${email}`);

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    console.log('❌ User not found');
    return false;
  }

  console.log(`✅ User found: ${user.displayName}`);
  console.log(`   Email verified: ${user.isEmailVerified}`);

  if (!user.password) {
    console.log('❌ User has no password set');
    return false;
  }

  // Test password
  const passwordMatch = await bcrypt.compare(password, user.password);

  if (passwordMatch) {
    console.log('✅ Password matches!');
    return true;
  } else {
    console.log('❌ Password does NOT match');
    return false;
  }
}

async function main() {
  console.log('🧪 Testing login credentials...');

  await testLogin('derp@fightingtomatoes.com', 'password123');
  await testLogin('fart@fightingtomatoes.com', 'password123');
  await testLogin('poop@fightingtomatoes.com', 'password123');
  await testLogin('test@fightingtomatoes.com', 'password123');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
