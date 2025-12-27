import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'fightcrewapp@gmail.com' },
    select: { passwordResetToken: true }
  });
  console.log(user?.passwordResetToken);
}

main().finally(() => prisma.$disconnect());
