// Quick script to create a test legacy user (simulates migrated user)
// Run with: npx ts-node scripts/create-test-legacy-user.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Use your real email to receive the verification email
  const testEmail = process.argv[2] || 'testlegacy@example.com';

  // Check if user already exists
  const existing = await prisma.user.findUnique({
    where: { email: testEmail.toLowerCase() }
  });

  if (existing) {
    console.log(`User ${testEmail} already exists!`);
    console.log(`Current password: ${existing.password ? 'SET' : 'NULL (legacy user)'}`);

    // Option to reset to legacy state
    if (process.argv[3] === '--reset') {
      await prisma.user.update({
        where: { email: testEmail.toLowerCase() },
        data: { password: null }
      });
      console.log(`Reset ${testEmail} to legacy state (password = null)`);
    }
    return;
  }

  // Create legacy user with null password
  const user = await prisma.user.create({
    data: {
      email: testEmail.toLowerCase(),
      password: null, // This is what makes it a "legacy" user
      authProvider: 'EMAIL',
      isActive: true,
      isEmailVerified: false,
      emailVerified: false,
      displayName: 'LegacyTestUser',
    }
  });

  console.log('Created test legacy user:');
  console.log(`  Email: ${user.email}`);
  console.log(`  Password: NULL (legacy user)`);
  console.log(`  ID: ${user.id}`);
  console.log('');
  console.log('Now try logging in with this email in the app!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
