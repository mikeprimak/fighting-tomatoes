const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkOliveiraRank() {
  try {
    const fighter = await prisma.fighter.findFirst({
      where: {
        firstName: 'Charles',
        lastName: { contains: 'Oliveira' }
      }
    });

    console.log('Charles Oliveira data:');
    console.log(JSON.stringify(fighter, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkOliveiraRank();
