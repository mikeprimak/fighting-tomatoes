/**
 * Reset Admin Password
 * One-time script to reset a user's password.
 *
 * Usage: npx ts-node src/scripts/resetAdminPassword.ts <email> <newpassword>
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('Usage: npx ts-node src/scripts/resetAdminPassword.ts <email> <newpassword>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { email },
    data: { password: hashedPassword },
  });

  console.log(`Password reset successfully for ${email} (isAdmin: ${(user as any).isAdmin ?? 'unknown'})`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
