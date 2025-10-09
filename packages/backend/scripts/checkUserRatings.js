const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUserRatings() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'fart@fightingtomatoes.com' },
      select: { id: true, email: true }
    });

    console.log('User:', JSON.stringify(user, null, 2));

    if (!user) {
      console.log('User not found!');
      return;
    }

    console.log('\n--- Checking user engagement ---');

    const ratings = await prisma.fightRating.findMany({
      where: { userId: user.id },
      take: 10,
      orderBy: { createdAt: 'desc' }
    });

    console.log(`\nRatings: ${ratings.length} found`);
    if (ratings.length > 0) {
      console.log(JSON.stringify(ratings, null, 2));
    }

    const reviews = await prisma.fightReview.findMany({
      where: { userId: user.id },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    console.log(`\nReviews: ${reviews.length} found`);
    if (reviews.length > 0) {
      console.log(JSON.stringify(reviews, null, 2));
    }

    const tags = await prisma.fightTag.findMany({
      where: { userId: user.id },
      take: 5
    });

    console.log(`\nTags: ${tags.length} found`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserRatings();
