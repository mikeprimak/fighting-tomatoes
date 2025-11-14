// Script to add test users with autofill-friendly credentials
import { PrismaClient, AuthProvider } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Adding test users...');

  // Hash the password once (same for all users)
  const hashedPassword = await bcrypt.hash('password123', 10);

  // Define the three test users
  const testUsers = [
    {
      email: 'derp@fightingtomatoes.com',
      displayName: 'Derp',
      password: hashedPassword,
    },
    {
      email: 'fart@fightingtomatoes.com',
      displayName: 'Fart',
      password: hashedPassword,
    },
    {
      email: 'poop@fightingtomatoes.com',
      displayName: 'Poop',
      password: hashedPassword,
    },
  ];

  // Create each user
  for (const userData of testUsers) {
    try {
      const user = await prisma.user.upsert({
        where: { email: userData.email },
        update: {
          password: userData.password,
          displayName: userData.displayName,
          isEmailVerified: true,
          authProvider: AuthProvider.EMAIL,
        },
        create: {
          email: userData.email,
          password: userData.password,
          displayName: userData.displayName,
          isEmailVerified: true,
          authProvider: AuthProvider.EMAIL,
          points: 0,
          level: 1,
        },
      });
      console.log(`✅ Created/Updated user: ${user.email} (${user.displayName})`);
    } catch (error) {
      console.error(`❌ Error creating user ${userData.email}:`, error);
    }
  }

  console.log('✅ Test users added successfully!');
  console.log('\nLogin credentials:');
  console.log('Email: derp@fightingtomatoes.com | Password: password123');
  console.log('Email: fart@fightingtomatoes.com | Password: password123');
  console.log('Email: poop@fightingtomatoes.com | Password: password123');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
