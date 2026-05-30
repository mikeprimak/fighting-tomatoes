import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_EMAIL_PATTERNS = [
  'avocadomike@',
  'michaelsprimak@',
  'babyessentials',
  'test@goodfights.app',
  'testdev2@goodfights.app',
  'applereview@goodfights.app',
];

async function main() {
  // Find test user IDs to exclude
  const testUsers = await prisma.user.findMany({
    where: {
      OR: TEST_EMAIL_PATTERNS.map(p => ({
        email: { contains: p, mode: 'insensitive' as const },
      })),
    },
    select: { id: true, email: true },
  });

  console.log('Excluded test users:');
  testUsers.forEach(u => console.log(`  - ${u.email} (${u.id})`));
  console.log('');

  const excludedIds = testUsers.map(u => u.id);

  // All Manual Fight Follow rules
  const allRules = await prisma.userNotificationRule.findMany({
    where: {
      name: { startsWith: 'Manual Fight Follow:' },
    },
    select: {
      id: true,
      userId: true,
      isActive: true,
      createdAt: true,
      user: { select: { email: true, createdAt: true } },
    },
  });

  const realRules = allRules.filter(r => !excludedIds.includes(r.userId));
  const realActiveRules = realRules.filter(r => r.isActive);

  const distinctRealUsers = new Set(realRules.map(r => r.userId));
  const distinctRealActiveUsers = new Set(realActiveRules.map(r => r.userId));

  console.log('=== Manual Fight Follow Rule Stats ===');
  console.log(`Total rules in DB:                  ${allRules.length}`);
  console.log(`  ...from test accounts:            ${allRules.length - realRules.length}`);
  console.log(`  ...from real users:               ${realRules.length}`);
  console.log(`  ...from real users (ACTIVE only): ${realActiveRules.length}`);
  console.log('');
  console.log(`Distinct real users (any time):     ${distinctRealUsers.size}`);
  console.log(`Distinct real users (active only):  ${distinctRealActiveUsers.size}`);
  console.log('');

  if (distinctRealActiveUsers.size > 0) {
    console.log('Real users with active fight follows:');
    const userBreakdown: Record<string, { email: string; count: number }> = {};
    realActiveRules.forEach(r => {
      const email = r.user.email;
      if (!userBreakdown[r.userId]) userBreakdown[r.userId] = { email, count: 0 };
      userBreakdown[r.userId].count++;
    });
    Object.entries(userBreakdown)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([uid, { email, count }]) => {
        console.log(`  ${email.padEnd(40)} ${count} fights`);
      });
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
