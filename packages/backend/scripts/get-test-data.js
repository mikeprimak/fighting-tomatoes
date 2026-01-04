const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getSampleData() {
  // Get a legacy user with ratings/reviews to test with
  const legacyUserWithData = await prisma.user.findFirst({
    where: {
      password: null,
      ratings: { some: {} }
    },
    include: {
      _count: {
        select: { ratings: true, reviews: true }
      }
    }
  });

  // Get a completed event with fights that have ratings
  const eventWithRatings = await prisma.event.findFirst({
    where: {
      fights: {
        some: {
          ratings: { some: {} }
        }
      }
    },
    include: {
      fights: {
        take: 1,
        where: { ratings: { some: {} } },
        include: {
          fighter1: true,
          fighter2: true,
          _count: { select: { ratings: true, reviews: true, tags: true } }
        }
      }
    },
    orderBy: { date: 'desc' }
  });

  // Get sample review
  const sampleReview = await prisma.fightReview.findFirst({
    where: { content: { not: '' } },
    include: {
      user: { select: { email: true, displayName: true } },
      fight: {
        include: {
          fighter1: true,
          fighter2: true,
          event: { select: { name: true } }
        }
      }
    }
  });

  // Get sample tags
  const sampleTags = await prisma.fightTag.findMany({
    take: 5,
    include: {
      tag: true,
      fight: { include: { fighter1: true, fighter2: true } }
    }
  });

  // Get a fighter with image
  const fighterWithImage = await prisma.fighter.findFirst({
    where: { profileImage: { not: '' } }
  });

  // Get an event with banner
  const eventWithBanner = await prisma.event.findFirst({
    where: { bannerImage: { not: '' } },
    orderBy: { date: 'desc' }
  });

  console.log('=== COMPREHENSIVE TEST DATA ===\n');

  console.log('========================================');
  console.log('1. LEGACY USER CLAIM FLOW TEST');
  console.log('========================================');
  if (legacyUserWithData) {
    console.log('  Email:', legacyUserWithData.email);
    console.log('  Display Name:', legacyUserWithData.displayName || '(none)');
    console.log('  Has password:', legacyUserWithData.password ? 'Yes' : 'No (legacy - claimable)');
    console.log('  Ratings count:', legacyUserWithData._count.ratings);
    console.log('  Reviews count:', legacyUserWithData._count.reviews);
    console.log('\n  TEST: Log in with this email, should see "Welcome Back" claim screen');
  }

  console.log('\n========================================');
  console.log('2. RATINGS MIGRATION TEST');
  console.log('========================================');
  if (eventWithRatings && eventWithRatings.fights[0]) {
    const f = eventWithRatings.fights[0];
    console.log('  Event:', eventWithRatings.name);
    console.log('  Date:', eventWithRatings.date.toISOString().split('T')[0]);
    console.log('  Fight:', f.fighter1.firstName, f.fighter1.lastName, 'vs', f.fighter2.firstName, f.fighter2.lastName);
    console.log('  Community ratings:', f._count.ratings);
    console.log('  Community reviews:', f._count.reviews);
    console.log('\n  TEST: Open this fight, verify community rating average is displayed');
  }

  console.log('\n========================================');
  console.log('3. REVIEWS MIGRATION TEST');
  console.log('========================================');
  if (sampleReview) {
    console.log('  Fight:', sampleReview.fight.fighter1.firstName, sampleReview.fight.fighter1.lastName,
                'vs', sampleReview.fight.fighter2.firstName, sampleReview.fight.fighter2.lastName);
    console.log('  Event:', sampleReview.fight.event.name);
    console.log('  Reviewer:', sampleReview.user.displayName || sampleReview.user.email);
    console.log('  Upvotes:', sampleReview.upvotes);
    console.log('  Content preview:', (sampleReview.content || '').substring(0, 80) + '...');
    console.log('\n  TEST: Open this fight, scroll to reviews, verify this review appears');
  }

  console.log('\n========================================');
  console.log('4. TAGS MIGRATION TEST');
  console.log('========================================');
  if (sampleTags.length > 0) {
    console.log('  Sample tags in database:');
    sampleTags.forEach(t => {
      console.log('    -', t.tag.name, 'on', t.fight.fighter1.lastName, 'vs', t.fight.fighter2.lastName);
    });
    console.log('\n  TEST: Open a fight with tags, verify tag counts appear');
  }

  console.log('\n========================================');
  console.log('5. FIGHTER IMAGES TEST');
  console.log('========================================');
  if (fighterWithImage) {
    console.log('  Fighter:', fighterWithImage.firstName, fighterWithImage.lastName);
    console.log('  Image URL:', fighterWithImage.profileImage);
    console.log('\n  TEST: Search for this fighter, verify image loads');
  }

  console.log('\n========================================');
  console.log('6. EVENT BANNERS TEST');
  console.log('========================================');
  if (eventWithBanner) {
    console.log('  Event:', eventWithBanner.name);
    console.log('  Date:', eventWithBanner.date.toISOString().split('T')[0]);
    console.log('  Banner URL:', eventWithBanner.bannerImage);
    console.log('\n  TEST: Find this event, verify banner image loads');
  }

  await prisma.$disconnect();
}

getSampleData().catch(e => { console.error(e); process.exit(1); });
