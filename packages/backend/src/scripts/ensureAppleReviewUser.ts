/**
 * Ensure Apple Review test account exists and is usable.
 * Upserts applereview@goodfights.app with a known password, active + email-verified.
 *
 * Usage: npx ts-node src/scripts/ensureAppleReviewUser.ts <email> <password>
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] || '').toLowerCase();
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: npx ts-node src/scripts/ensureAppleReviewUser.ts <email> <password>');
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        isActive: true,
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });
    console.log(`Updated existing user ${email}: password reset, isActive=true, isEmailVerified=true`);
  } else {
    const created = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        displayName: 'Apple Reviewer',
        firstName: 'Apple',
        lastName: 'Reviewer',
        isActive: true,
        isEmailVerified: true,
      },
    });
    console.log(`Created new user ${email} (id: ${created.id}), isActive=true, isEmailVerified=true`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
