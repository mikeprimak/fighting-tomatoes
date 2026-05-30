// One-off GDPR-style deletion script: anonymizes a user by email,
// mirroring AuthController.deleteAccount. Keeps ratings/reviews/comments
// attributed to "Deleted User"; strips PII, tokens, and sessions.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteUserByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, displayName: true, createdAt: true },
  });

  if (!user) {
    console.log(`No user found for ${email}`);
    return;
  }

  console.log(`Found user:`, user);
  const userId = user.id;

  const [ratings, reviews, predictions, preComments] = await Promise.all([
    prisma.fightRating.count({ where: { userId } }),
    prisma.fightReview.count({ where: { userId } }),
    prisma.fightPrediction.count({ where: { userId } }),
    prisma.preFightComment.count({ where: { userId } }),
  ]);
  console.log(`Content to preserve (anonymized): ratings=${ratings}, reviews=${reviews}, predictions=${predictions}, preFightComments=${preComments}`);

  const anonymousEmail = `deleted_${Date.now()}_${Math.random().toString(36).substring(7)}@deleted.local`;

  await prisma.user.update({
    where: { id: userId },
    data: {
      email: anonymousEmail,
      password: null,
      firstName: null,
      lastName: null,
      displayName: 'Deleted User',
      avatar: null,
      googleId: null,
      appleId: null,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      pushToken: null,
      isActive: false,
      isEmailVerified: false,
      wantsEmails: false,
      isMedia: false,
      mediaOrganization: null,
      mediaWebsite: null,
    },
  });

  const tokens = await prisma.refreshToken.deleteMany({ where: { userId } });
  console.log(`Deleted ${tokens.count} refresh tokens`);

  try {
    const m = await prisma.fightNotificationMatch.deleteMany({ where: { userId } });
    console.log(`Deleted ${m.count} fightNotificationMatch rows`);
  } catch (e) { console.log('Note: fightNotificationMatch cleanup skipped'); }

  try {
    const m = await prisma.userNotificationRule.deleteMany({ where: { userId } });
    console.log(`Deleted ${m.count} userNotificationRule rows`);
  } catch (e) { console.log('Note: userNotificationRule cleanup skipped'); }

  try {
    const m = await prisma.userNotification.deleteMany({ where: { userId } });
    console.log(`Deleted ${m.count} userNotification rows`);
  } catch (e) { console.log('Note: userNotification cleanup skipped'); }

  console.log(`\nDone. User ${userId} anonymized (new internal email: ${anonymousEmail}).`);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: ts-node deleteUserByEmail.ts <email>');
  process.exit(1);
}

deleteUserByEmail(email)
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
