import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkFighterImages() {
  // Check specific fighters mentioned
  const khalil = await prisma.fighter.findFirst({
    where: {
      OR: [
        { firstName: { contains: 'Khalil', mode: 'insensitive' } },
        { lastName: { contains: 'Roundtree', mode: 'insensitive' } }
      ]
    }
  });

  const treston = await prisma.fighter.findFirst({
    where: {
      OR: [
        { firstName: { contains: 'Treston', mode: 'insensitive' } },
        { firstName: { contains: 'Tre', mode: 'insensitive' } },
        { lastName: { contains: 'Vines', mode: 'insensitive' } }
      ]
    }
  });

  console.log('Khalil Roundtree Jr:');
  if (khalil) {
    console.log(`  Name: ${khalil.firstName} ${khalil.lastName}`);
    console.log(`  Image: ${khalil.profileImage || 'null'}`);
  } else {
    console.log('  Not found');
  }

  console.log('\nTre\'ston Vines:');
  if (treston) {
    console.log(`  Name: ${treston.firstName} ${treston.lastName}`);
    console.log(`  Image: ${treston.profileImage || 'null'}`);
  } else {
    console.log('  Not found');
  }

  // Sample some fighters to see URL patterns
  console.log('\nSample of 10 fighter image URLs:');
  const sample = await prisma.fighter.findMany({
    take: 10,
    select: {
      firstName: true,
      lastName: true,
      profileImage: true
    }
  });

  sample.forEach(f => {
    console.log(`${f.firstName} ${f.lastName}: ${f.profileImage || 'null'}`);
  });

  await prisma.$disconnect();
}

checkFighterImages().catch(console.error);
