// Script to check if test users exist
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking test users...\n');

  const users = await prisma.user.findMany({
    where: {
      email: {
        endsWith: '@fightingtomatoes.com',
      },
    },
    select: {
      email: true,
      displayName: true,
      isEmailVerified: true,
      password: true,
    },
  });

  if (users.length === 0) {
    console.log('❌ No users found with @fightingtomatoes.com emails');
  } else {
    console.log(`✅ Found ${users.length} users:\n`);
    users.forEach(user => {
      console.log(`Email: ${user.email}`);
      console.log(`Display Name: ${user.displayName}`);
      console.log(`Email Verified: ${user.isEmailVerified}`);
      console.log(`Has Password: ${user.password ? 'Yes' : 'No'}`);
      console.log(`Password Hash (first 20 chars): ${user.password?.substring(0, 20)}...`);
      console.log('---');
    });
  }
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
