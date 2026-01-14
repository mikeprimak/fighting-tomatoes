const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const FIGHT_ID = '334a404f-80d1-42ca-bf4a-7e547773be49';

// Demo users with realistic display names
const demoUsers = [
  { displayName: 'MMAJunkie_Dave', firstName: 'Dave', lastName: 'Miller' },
  { displayName: 'CageWarrior', firstName: 'Jake', lastName: 'Thompson' },
  { displayName: 'FightNerd', firstName: 'Sarah', lastName: 'Chen' },
  { displayName: 'OctagonOracle', firstName: 'Marcus', lastName: 'Reed' },
  { displayName: 'TapoutKing', firstName: 'Chris', lastName: 'Johnson' },
  { displayName: 'StrikingCoach_J', firstName: 'James', lastName: 'Wilson' },
  { displayName: 'GrappleGuru', firstName: 'Mike', lastName: 'Santos' },
  { displayName: 'UFCFanatic', firstName: 'Emily', lastName: 'Brown' },
];

// Realistic pre-fight comments for Gaethje vs Pimblett
const comments = [
  {
    userIndex: 0,
    content: "Gaethje's leg kicks are going to be the difference maker here. Paddy has never faced pressure like this.",
    upvotes: 24,
  },
  {
    userIndex: 1,
    content: "Everyone's sleeping on Paddy. His ground game is elite and Gaethje has shown vulnerability there before. I'm calling the upset!",
    upvotes: 18,
  },
  {
    userIndex: 2,
    content: "This is such a fascinating style matchup. Gaethje's wrestling defense has improved massively, but Paddy's submission threat is real. Can't wait!",
    upvotes: 31,
  },
  {
    userIndex: 3,
    content: "Gaethje by KO round 2. The power difference is just too much. Paddy's chin hasn't been tested at this level.",
    upvotes: 15,
  },
  {
    userIndex: 4,
    content: "The crowd is going to be INSANE for this one. Two of the most entertaining fighters in the sport going at it.",
    upvotes: 22,
  },
  {
    userIndex: 5,
    content: "From a technical standpoint, Gaethje's low kicks and body shots will slow Paddy down. But if it goes past round 3, Paddy's cardio could be the X-factor.",
    upvotes: 27,
  },
  {
    userIndex: 6,
    content: "If Paddy can get this to the ground early, we might see a shock submission. But that's a big IF against Gaethje's takedown defense.",
    upvotes: 12,
  },
  {
    userIndex: 7,
    content: "FOTY candidate for sure. Both guys come to fight and never have boring fights. This is what MMA is all about! 🔥",
    upvotes: 35,
  },
];

async function main() {
  console.log('Creating demo users and comments for Gaethje vs Pimblett...\n');

  // Verify the fight exists
  const fight = await prisma.fight.findUnique({
    where: { id: FIGHT_ID },
    include: {
      fighter1: true,
      fighter2: true,
      event: true,
    },
  });

  if (!fight) {
    console.error('Fight not found!');
    return;
  }

  console.log(`Fight: ${fight.fighter1.firstName} ${fight.fighter1.lastName} vs ${fight.fighter2.firstName} ${fight.fighter2.lastName}`);
  console.log(`Event: ${fight.event.name}\n`);

  // Create demo users
  const hashedPassword = await bcrypt.hash('DemoUser123!', 10);
  const createdUsers = [];

  for (const user of demoUsers) {
    const email = `${user.displayName.toLowerCase()}@demo.fightcrew.app`;

    // Check if user already exists
    let existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!existingUser) {
      existingUser = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          displayName: user.displayName,
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: true,
        },
      });
      console.log(`Created user: ${user.displayName}`);
    } else {
      console.log(`User exists: ${user.displayName}`);
    }

    createdUsers.push(existingUser);
  }

  console.log('\nCreating pre-fight comments...\n');

  // Delete existing demo comments for this fight (to allow re-running)
  const demoUserIds = createdUsers.map(u => u.id);
  await prisma.preFightComment.deleteMany({
    where: {
      fightId: FIGHT_ID,
      userId: { in: demoUserIds },
    },
  });

  // Create comments with staggered timestamps
  const baseTime = new Date();
  baseTime.setHours(baseTime.getHours() - 48); // Start from 48 hours ago

  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];
    const user = createdUsers[comment.userIndex];

    // Stagger timestamps
    const commentTime = new Date(baseTime);
    commentTime.setHours(commentTime.getHours() + (i * 6)); // 6 hours apart

    const created = await prisma.preFightComment.create({
      data: {
        userId: user.id,
        fightId: FIGHT_ID,
        content: comment.content,
        upvotes: comment.upvotes,
        createdAt: commentTime,
        updatedAt: commentTime,
      },
    });

    console.log(`Created comment by ${user.displayName} (${comment.upvotes} upvotes)`);
  }

  console.log('\n✅ Done! Demo comments created successfully.');
  console.log(`\nFight ID: ${FIGHT_ID}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
