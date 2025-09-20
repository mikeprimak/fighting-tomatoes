import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🍅 Seeding Fighting Tomatoes database...');

  // Create Organizations
  const ufc = await prisma.organization.upsert({
    where: { shortName: 'UFC' },
    update: {},
    create: {
      name: 'Ultimate Fighting Championship',
      shortName: 'UFC',
      logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/92/UFC_Logo.svg',
    },
  });

  const bellator = await prisma.organization.upsert({
    where: { shortName: 'Bellator' },
    update: {},
    create: {
      name: 'Bellator MMA',
      shortName: 'Bellator',
      logoUrl: 'https://upload.wikimedia.org/wikipedia/en/b/b4/Bellator_MMA_logo.png',
    },
  });

  // Create Fighters
  const fighters = await Promise.all([
    prisma.fighter.upsert({
      where: { id: 'jon-jones' },
      update: {},
      create: {
        id: 'jon-jones',
        firstName: 'Jon',
        lastName: 'Jones',
        nickname: 'Bones',
        record: '27-1-0',
        weightClass: 'Heavyweight',
      },
    }),
    prisma.fighter.upsert({
      where: { id: 'stipe-miocic' },
      update: {},
      create: {
        id: 'stipe-miocic',
        firstName: 'Stipe',
        lastName: 'Miocic',
        nickname: null,
        record: '20-4-0',
        weightClass: 'Heavyweight',
      },
    }),
    prisma.fighter.upsert({
      where: { id: 'alex-pereira' },
      update: {},
      create: {
        id: 'alex-pereira',
        firstName: 'Alex',
        lastName: 'Pereira',
        nickname: 'Poatan',
        record: '11-2-0',
        weightClass: 'Light Heavyweight',
      },
    }),
    prisma.fighter.upsert({
      where: { id: 'khalil-rountree' },
      update: {},
      create: {
        id: 'khalil-rountree',
        firstName: 'Khalil',
        lastName: 'Rountree Jr.',
        nickname: null,
        record: '13-5-0',
        weightClass: 'Light Heavyweight',
      },
    }),
    prisma.fighter.upsert({
      where: { id: 'charles-oliveira' },
      update: {},
      create: {
        id: 'charles-oliveira',
        firstName: 'Charles',
        lastName: 'Oliveira',
        nickname: 'Do Bronx',
        record: '34-10-0',
        weightClass: 'Lightweight',
      },
    }),
    prisma.fighter.upsert({
      where: { id: 'michael-chandler' },
      update: {},
      create: {
        id: 'michael-chandler',
        firstName: 'Michael',
        lastName: 'Chandler',
        nickname: 'Iron',
        record: '23-8-0',
        weightClass: 'Lightweight',
      },
    }),
  ]);

  console.log(`✅ Created ${fighters.length} fighters`);

  // Create Events
  const upcomingEvent = await prisma.event.upsert({
    where: { id: 'ufc-309' },
    update: {},
    create: {
      id: 'ufc-309',
      name: 'UFC 309: Jones vs Miocic',
      shortName: 'UFC 309',
      date: new Date('2024-11-16T22:00:00Z'), // Future date
      venue: 'Madison Square Garden',
      location: 'New York, NY',
      organizationId: ufc.id,
      isComplete: false,
    },
  });

  const pastEvent = await prisma.event.upsert({
    where: { id: 'ufc-307' },
    update: {},
    create: {
      id: 'ufc-307',
      name: 'UFC 307: Pereira vs Rountree Jr',
      shortName: 'UFC 307',
      date: new Date('2024-10-05T22:00:00Z'), // Past date
      venue: 'Delta Center',
      location: 'Salt Lake City, UT',
      organizationId: ufc.id,
      isComplete: true,
    },
  });

  console.log('✅ Created events');

  // Create Fights for upcoming event
  const upcomingFights = await Promise.all([
    prisma.fight.upsert({
      where: { id: 'ufc-309-main' },
      update: {},
      create: {
        id: 'ufc-309-main',
        fightOrder: 1,
        weightClass: 'Heavyweight',
        rounds: 5,
        isTitle: true,
        eventId: upcomingEvent.id,
        fighterAId: 'jon-jones',
        fighterBId: 'stipe-miocic',
      },
    }),
    prisma.fight.upsert({
      where: { id: 'ufc-309-co-main' },
      update: {},
      create: {
        id: 'ufc-309-co-main',
        fightOrder: 2,
        weightClass: 'Lightweight',
        rounds: 5,
        isTitle: false,
        eventId: upcomingEvent.id,
        fighterAId: 'charles-oliveira',
        fighterBId: 'michael-chandler',
      },
    }),
  ]);

  // Create Fights for past event (with results)
  const pastFights = await Promise.all([
    prisma.fight.upsert({
      where: { id: 'ufc-307-main' },
      update: {},
      create: {
        id: 'ufc-307-main',
        fightOrder: 1,
        weightClass: 'Light Heavyweight',
        rounds: 5,
        isTitle: true,
        result: 'TKO',
        winner: 'fighterA',
        endRound: 4,
        endTime: '1:47',
        eventId: pastEvent.id,
        fighterAId: 'alex-pereira',
        fighterBId: 'khalil-rountree',
      },
    }),
  ]);

  console.log(`✅ Created ${upcomingFights.length + pastFights.length} fights`);

  // Create a test user
  const testUser = await prisma.user.upsert({
    where: { email: 'test@fightingtomatoes.com' },
    update: {},
    create: {
      email: 'test@fightingtomatoes.com',
      username: 'testuser',
      password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewrBw/y9Q9/Q9/Q9Q', // "password123"
      firstName: 'Test',
      lastName: 'User',
      isVerified: true,
    },
  });

  // Create some sample ratings for the past fight
  const sampleRatings = await Promise.all([
    prisma.fightRating.upsert({
      where: {
        userId_fightId: {
          userId: testUser.id,
          fightId: 'ufc-307-main',
        },
      },
      update: {},
      create: {
        userId: testUser.id,
        fightId: 'ufc-307-main',
        rating: 9,
        comment: 'Amazing knockout! Pereira\'s power is unreal.',
      },
    }),
  ]);

  console.log(`✅ Created ${sampleRatings.length} sample ratings`);

  console.log('🎉 Database seeded successfully!');
  console.log('📧 Test user: test@fightingtomatoes.com / password123');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });