/**
 * Set password for an admin user (for Google OAuth users who need admin panel access)
 *
 * Usage: npx ts-node scripts/set-admin-password.ts <email> <new-password>
 *
 * On Render shell:
 *   cd /app/packages/backend
 *   node -e "const bcrypt = require('bcrypt'); const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); async function run() { const hash = await bcrypt.hash('YOUR_PASSWORD', 12); await prisma.user.update({ where: { email: 'michaelsprimak@gmail.com' }, data: { password: hash } }); console.log('Done!'); } run();"
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: npx ts-node scripts/set-admin-password.ts <email> <new-password>');
    process.exit(1);
  }

  // Find user
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Update user
  await prisma.user.update({
    where: { email },
    data: { password: hashedPassword },
  });

  console.log(`Password set successfully for ${email}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
