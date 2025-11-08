import { PrismaClient } from '@prisma/client';
import { notificationRuleEngine } from '../services/notificationRuleEngine';

const prisma = new PrismaClient();

async function main() {
  const userId = '4454d2e2-e235-4f4f-808e-8067304e70c9'; // test@fightingtomatoes.com

  // Find the Hyped Fights rule
  const rule = await prisma.userNotificationRule.findFirst({
    where: {
      userId,
      name: 'Hyped Fights',
    },
  });

  if (!rule) {
    console.log('No Hyped Fights rule found for user');
    return;
  }

  console.log('Found rule:', rule);
  console.log('\nSyncing matches...');

  const matchCount = await notificationRuleEngine.syncRuleMatches(rule.id);

  console.log(`Synced ${matchCount} fight matches`);

  // Verify the matches were created
  const matches = await prisma.fightNotificationMatch.findMany({
    where: {
      userId,
      ruleId: rule.id,
    },
    include: {
      rule: true,
    },
  });

  console.log(`\nFound ${matches.length} matches in database`);

  await prisma.$disconnect();
}

main().catch(console.error);
