import { PrismaClient, WeightClass, Sport, Gender, TagCategory, AuthProvider, ActivityType, NotificationType, ReportReason } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting comprehensive database seed...')

  // 1. Create Tags
  console.log('📝 Creating tags...')
  const tagsData = [
    // High-rating tags (9-10)
    { name: 'FOTY', category: TagCategory.QUALITY, forHighRatings: true },
    { name: 'FOTN', category: TagCategory.QUALITY, forHighRatings: true },
    { name: 'Instant Classic', category: TagCategory.QUALITY, forHighRatings: true },
    { name: 'Brutal', category: TagCategory.EMOTION, forHighRatings: true },
    { name: 'Explosive', category: TagCategory.STYLE, forHighRatings: true },
    { name: 'Brawl', category: TagCategory.STYLE, forHighRatings: true },
    { name: 'Back-and-Forth', category: TagCategory.STYLE, forHighRatings: true },
    { name: 'Edge Of Your Seat', category: TagCategory.EMOTION, forHighRatings: true },
    { name: 'Knockout', category: TagCategory.OUTCOME, forHighRatings: true },
    { name: 'Walk Off KO', category: TagCategory.OUTCOME, forHighRatings: true },
    
    // Medium-rating tags (7-8)
    { name: 'Technical', category: TagCategory.STYLE, forMediumRatings: true },
    { name: 'Submission', category: TagCategory.OUTCOME, forMediumRatings: true },
    { name: 'Great Grappling', category: TagCategory.STYLE, forMediumRatings: true },
    { name: 'Stand Up Battle', category: TagCategory.STYLE, forMediumRatings: true },
    { name: 'Competitive', category: TagCategory.STYLE, forMediumRatings: true },
    { name: 'Fast-paced', category: TagCategory.PACE, forMediumRatings: true },
    { name: 'Heart', category: TagCategory.EMOTION, forMediumRatings: true },
    { name: 'Comeback', category: TagCategory.EMOTION, forMediumRatings: true },
    
    // Low-rating tags (5-6)
    { name: 'One-sided', category: TagCategory.OUTCOME, forLowRatings: true },
    { name: 'Wrestling-oriented', category: TagCategory.STYLE, forLowRatings: true },
    { name: 'Slow burn', category: TagCategory.PACE, forLowRatings: true },
    { name: 'Disappointing', category: TagCategory.QUALITY, forLowRatings: true },
    
    // Very low rating tags (1-4)
    { name: 'Boring', category: TagCategory.QUALITY, forVeryLowRatings: true },
    { name: 'Uneventful', category: TagCategory.QUALITY, forVeryLowRatings: true },
    { name: 'Poor Performance', category: TagCategory.QUALITY, forVeryLowRatings: true },
  ]

  const tags = []
  for (const tagData of tagsData) {
    const tag = await prisma.tag.upsert({
      where: { name: tagData.name },
      update: {},
      create: tagData,
    })
    tags.push(tag)
  }

  // 2. Create Users
  console.log('👥 Creating users...')
  const hashedPassword = await bcrypt.hash('password123', 10)
  
  const usersData = [
    {
      email: 'test@fightcrewapp.com',
      password: hashedPassword,
      displayName: 'Test User',
      isEmailVerified: true,
      authProvider: AuthProvider.EMAIL,
      points: 150,
      level: 1,
    },
    {
      email: 'test@fightingtomatoes.com',
      password: hashedPassword,
      displayName: 'Fighting Tomatoes User',
      isEmailVerified: true,
      authProvider: AuthProvider.EMAIL,
      points: 100,
      level: 1,
    },
    {
      email: 'admin@fightcrewapp.com',
      password: hashedPassword,
      displayName: 'Admin User',
      isEmailVerified: true,
      authProvider: AuthProvider.EMAIL,
      points: 1000,
      level: 5,
    },
    {
      email: 'john.doe@example.com',
      password: hashedPassword,
      firstName: 'John',
      lastName: 'Doe',
      displayName: 'FightFan2024',
      isEmailVerified: true,
      authProvider: AuthProvider.EMAIL,
      points: 250,
      level: 2,
    },
    {
      email: 'jane.smith@example.com',
      password: hashedPassword,
      firstName: 'Jane',
      lastName: 'Smith',
      displayName: 'MMAExpert',
      isEmailVerified: true,
      authProvider: AuthProvider.EMAIL,
      isMedia: true,
      mediaOrganization: 'MMA Weekly',
      mediaWebsite: 'https://mmaweekly.com',
      points: 500,
      level: 3,
    },
    {
      email: 'mike.fighter@gmail.com',
      password: hashedPassword,
      firstName: 'Mike',
      lastName: 'Thompson',
      displayName: 'CasualFan',
      isEmailVerified: true,
      authProvider: AuthProvider.EMAIL,
      points: 100,
      level: 1,
    },
    {
      email: 'sarah.analyst@espn.com',
      password: hashedPassword,
      firstName: 'Sarah',
      lastName: 'Wilson',
      displayName: 'ESPN_Sarah',
      isEmailVerified: true,
      authProvider: AuthProvider.EMAIL,
      isMedia: true,
      mediaOrganization: 'ESPN',
      mediaWebsite: 'https://espn.com/mma',
      points: 750,
      level: 4,
    },
    {
      email: 'derp@fightingtomatoes.com',
      password: hashedPassword,
      displayName: 'Derp',
      isEmailVerified: true,
      authProvider: AuthProvider.EMAIL,
      points: 50,
      level: 1,
    },
    {
      email: 'fart@fightingtomatoes.com',
      password: hashedPassword,
      displayName: 'Fart',
      isEmailVerified: true,
      authProvider: AuthProvider.EMAIL,
      points: 75,
      level: 1,
    },
    {
      email: 'poop@fightingtomatoes.com',
      password: hashedPassword,
      displayName: 'Poop',
      isEmailVerified: true,
      authProvider: AuthProvider.EMAIL,
      points: 60,
      level: 1,
    },
    {
      email: 'neon@fightingtomatoes.com',
      password: hashedPassword,
      displayName: 'Neon',
      isEmailVerified: true,
      authProvider: AuthProvider.EMAIL,
      points: 80,
      level: 1,
    },
    {
      email: 'time@fightingtomatoes.com',
      password: hashedPassword,
      displayName: 'Time',
      isEmailVerified: true,
      authProvider: AuthProvider.EMAIL,
      points: 90,
      level: 1,
    }
  ]

  const users = []
  for (const userData of usersData) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: userData,
    })
    users.push(user)
  }

  // 3. Create Fighters
  console.log('🥊 Creating fighters...')
  const fightersData = [
    {
      firstName: 'Jon',
      lastName: 'Jones',
      nickname: 'Bones',
      wins: 27,
      losses: 1,
      draws: 0,
      noContests: 1,
      weightClass: WeightClass.HEAVYWEIGHT,
      sport: Sport.MMA,
      gender: Gender.MALE,
      isChampion: true,
      championshipTitle: 'UFC Heavyweight Championship',
      averageRating: 87.5,
      totalRatings: 450,
      totalFights: 29,
      greatFights: 15,
    },
    {
      firstName: 'Amanda',
      lastName: 'Nunes',
      nickname: 'The Lioness',
      wins: 22,
      losses: 5,
      draws: 0,
      noContests: 0,
      weightClass: WeightClass.WOMENS_BANTAMWEIGHT,
      sport: Sport.MMA,
      gender: Gender.FEMALE,
      isActive: false, // Retired
      averageRating: 85.2,
      totalRatings: 380,
      totalFights: 27,
      greatFights: 12,
    },
    {
      firstName: 'Islam',
      lastName: 'Makhachev',
      nickname: null,
      wins: 25,
      losses: 1,
      draws: 0,
      noContests: 0,
      weightClass: WeightClass.LIGHTWEIGHT,
      sport: Sport.MMA,
      gender: Gender.MALE,
      isChampion: true,
      championshipTitle: 'UFC Lightweight Championship',
      averageRating: 82.1,
      totalRatings: 320,
      totalFights: 26,
      greatFights: 8,
    },
    {
      firstName: 'Alexander',
      lastName: 'Volkanovski',
      nickname: 'The Great',
      wins: 26,
      losses: 3,
      draws: 0,
      noContests: 0,
      weightClass: WeightClass.FEATHERWEIGHT,
      sport: Sport.MMA,
      gender: Gender.MALE,
      isChampion: true,
      championshipTitle: 'UFC Featherweight Championship',
      averageRating: 79.8,
      totalRatings: 290,
      totalFights: 29,
      greatFights: 7,
    },
    {
      firstName: 'Tyson',
      lastName: 'Fury',
      nickname: 'The Gypsy King',
      wins: 34,
      losses: 0,
      draws: 1,
      noContests: 0,
      weightClass: WeightClass.HEAVYWEIGHT,
      sport: Sport.BOXING,
      gender: Gender.MALE,
      isChampion: true,
      championshipTitle: 'WBC Heavyweight Championship',
      averageRating: 83.4,
      totalRatings: 180,
      totalFights: 35,
      greatFights: 10,
    },
    {
      firstName: 'Katie',
      lastName: 'Taylor',
      nickname: null,
      wins: 23,
      losses: 1,
      draws: 0,
      noContests: 0,
      weightClass: WeightClass.WOMENS_FEATHERWEIGHT,
      sport: Sport.BOXING,
      gender: Gender.FEMALE,
      isChampion: true,
      championshipTitle: 'Undisputed Lightweight Championship',
      averageRating: 78.9,
      totalRatings: 120,
      totalFights: 24,
      greatFights: 6,
    }
  ]

  const fighters = []
  for (const fighterData of fightersData) {
    const fighter = await prisma.fighter.create({
      data: fighterData,
    })
    fighters.push(fighter)
  }

  // 4. Create Events
  console.log('🎪 Creating events...')
  const eventsData = [
    {
      name: 'UFC 300',
      promotion: 'UFC',
      date: new Date('2024-04-13'),
      venue: 'T-Mobile Arena',
      location: 'Las Vegas, Nevada',
      prelimStartTime: new Date('2024-04-13T19:00:00Z'),
      mainStartTime: new Date('2024-04-13T22:00:00Z'),
      mainChannel: 'ESPN+',
      mainLink: 'https://espnplus.com/ufc300',
      prelimChannel: 'ESPN+',
      prelimLink: 'https://espnplus.com/ufc300-prelims',
      averageRating: 88.5,
      totalRatings: 1250,
      greatFights: 4,
      hasStarted: true,
      isComplete: true,
    },
    {
      name: 'UFC 301',
      promotion: 'UFC',
      date: new Date('2024-05-04'),
      venue: 'Jeunesse Arena',
      location: 'Rio de Janeiro, Brazil',
      prelimStartTime: new Date('2024-05-04T19:00:00Z'),
      mainStartTime: new Date('2024-05-04T22:00:00Z'),
      mainChannel: 'ESPN+',
      mainLink: 'https://espnplus.com/ufc301',
      prelimChannel: 'ESPN+',
      prelimLink: 'https://espnplus.com/ufc301-prelims',
      averageRating: 72.3,
      totalRatings: 890,
      greatFights: 1,
      hasStarted: true,
      isComplete: true,
    },
    {
      name: 'Fury vs. Usyk',
      promotion: 'Top Rank',
      date: new Date('2024-05-18'),
      venue: 'Kingdom Arena',
      location: 'Riyadh, Saudi Arabia',
      prelimStartTime: new Date('2024-05-18T18:00:00Z'),
      mainStartTime: new Date('2024-05-18T21:00:00Z'),
      mainChannel: 'DAZN',
      mainLink: 'https://dazn.com/fury-usyk',
      prelimChannel: 'DAZN',
      prelimLink: 'https://dazn.com/fury-usyk-prelims',
      averageRating: 91.2,
      totalRatings: 2100,
      greatFights: 2,
      hasStarted: true,
      isComplete: true,
    },
    {
      name: 'UFC 310',
      promotion: 'UFC',
      date: new Date('2024-12-07'),
      venue: 'T-Mobile Arena',
      location: 'Las Vegas, Nevada',
      prelimStartTime: new Date('2024-12-07T19:00:00Z'),
      mainStartTime: new Date('2024-12-07T22:00:00Z'),
      mainChannel: 'ESPN+',
      mainLink: 'https://espnplus.com/ufc310',
      prelimChannel: 'ESPN+',
      prelimLink: 'https://espnplus.com/ufc310-prelims',
      averageRating: 0,
      totalRatings: 0,
      greatFights: 0,
      hasStarted: false,
      isComplete: false,
    }
  ]

  const events = []
  for (const eventData of eventsData) {
    const event = await prisma.event.create({
      data: eventData,
    })
    events.push(event)
  }

  // 5. Create Fights
  console.log('🥊 Creating fights...')
  const fightsData = [
    {
      eventId: events[0].id, // UFC 300
      fighter1Id: fighters[0].id, // Jon Jones
      fighter2Id: fighters[2].id, // Islam Makhachev (fantasy fight)
      weightClass: WeightClass.HEAVYWEIGHT,
      isTitle: true,
      titleName: 'UFC Heavyweight Championship',
      orderOnCard: 1,
      winner: fighters[0].id,
      method: 'TKO (Punches)',
      round: 3,
      time: '2:47',
      averageRating: 94.5,
      totalRatings: 450,
      totalReviews: 120,
      ratings1: 0, ratings2: 2, ratings3: 1, ratings4: 5, ratings5: 8,
      ratings6: 15, ratings7: 25, ratings8: 50, ratings9: 120, ratings10: 224,
      hasStarted: true,
      isComplete: true,
    },
    {
      eventId: events[0].id, // UFC 300
      fighter1Id: fighters[3].id, // Alexander Volkanovski
      fighter2Id: fighters[2].id, // Islam Makhachev
      weightClass: WeightClass.LIGHTWEIGHT,
      isTitle: true,
      titleName: 'UFC Lightweight Championship',
      orderOnCard: 2,
      winner: fighters[2].id,
      method: 'Submission (Rear Naked Choke)',
      round: 4,
      time: '3:21',
      averageRating: 87.2,
      totalRatings: 380,
      totalReviews: 95,
      ratings1: 1, ratings2: 0, ratings3: 3, ratings4: 8, ratings5: 12,
      ratings6: 20, ratings7: 45, ratings8: 85, ratings9: 130, ratings10: 76,
      hasStarted: true,
      isComplete: true,
    },
    {
      eventId: events[1].id, // UFC 301
      fighter1Id: fighters[1].id, // Amanda Nunes
      fighter2Id: fighters[5].id, // Katie Taylor (fantasy crossover)
      weightClass: WeightClass.WOMENS_BANTAMWEIGHT,
      isTitle: false,
      titleName: null,
      orderOnCard: 1,
      winner: fighters[1].id,
      method: 'Decision (Unanimous)',
      round: 3,
      time: '5:00',
      averageRating: 76.8,
      totalRatings: 290,
      totalReviews: 75,
      ratings1: 2, ratings2: 5, ratings3: 8, ratings4: 15, ratings5: 25,
      ratings6: 40, ratings7: 65, ratings8: 80, ratings9: 35, ratings10: 15,
      hasStarted: true,
      isComplete: true,
    },
    {
      eventId: events[2].id, // Fury vs. Usyk
      fighter1Id: fighters[4].id, // Tyson Fury
      fighter2Id: fighters[0].id, // Jon Jones (fantasy boxing match)
      weightClass: WeightClass.HEAVYWEIGHT,
      isTitle: true,
      titleName: 'Heavyweight Championship',
      orderOnCard: 1,
      winner: fighters[4].id,
      method: 'Decision (Split)',
      round: 12,
      time: '3:00',
      averageRating: 91.2,
      totalRatings: 520,
      totalReviews: 180,
      ratings1: 0, ratings2: 1, ratings3: 2, ratings4: 3, ratings5: 5,
      ratings6: 8, ratings7: 15, ratings8: 35, ratings9: 180, ratings10: 271,
      hasStarted: true,
      isComplete: true,
    },
    {
      eventId: events[3].id, // UFC 310 (upcoming)
      fighter1Id: fighters[2].id, // Islam Makhachev
      fighter2Id: fighters[3].id, // Alexander Volkanovski
      weightClass: WeightClass.LIGHTWEIGHT,
      isTitle: true,
      titleName: 'UFC Lightweight Championship',
      orderOnCard: 1,
      winner: null,
      method: null,
      round: null,
      time: null,
      averageRating: 0,
      totalRatings: 0,
      totalReviews: 0,
      hasStarted: false,
      isComplete: false,
    }
  ]

  const fights = []
  for (const fightData of fightsData) {
    const fight = await prisma.fight.create({
      data: fightData,
    })
    fights.push(fight)
  }

  // 6. Create Fight Ratings
  console.log('⭐ Creating fight ratings...')
  const ratingsData = [
    { userId: users[0].id, fightId: fights[0].id, rating: 10 },
    { userId: users[1].id, fightId: fights[0].id, rating: 9 },
    { userId: users[2].id, fightId: fights[0].id, rating: 10 },
    { userId: users[3].id, fightId: fights[0].id, rating: 9 },
    { userId: users[4].id, fightId: fights[0].id, rating: 9 },
    
    { userId: users[0].id, fightId: fights[1].id, rating: 8 },
    { userId: users[1].id, fightId: fights[1].id, rating: 9 },
    { userId: users[2].id, fightId: fights[1].id, rating: 8 },
    { userId: users[3].id, fightId: fights[1].id, rating: 7 },
    
    { userId: users[0].id, fightId: fights[2].id, rating: 7 },
    { userId: users[1].id, fightId: fights[2].id, rating: 8 },
    { userId: users[2].id, fightId: fights[2].id, rating: 7 },
    
    { userId: users[0].id, fightId: fights[3].id, rating: 10 },
    { userId: users[1].id, fightId: fights[3].id, rating: 9 },
    { userId: users[2].id, fightId: fights[3].id, rating: 9 },
    { userId: users[3].id, fightId: fights[3].id, rating: 8 },
    { userId: users[4].id, fightId: fights[3].id, rating: 10 },
  ]

  for (const ratingData of ratingsData) {
    await prisma.fightRating.create({
      data: ratingData,
    })
  }

  // 7. Create Fight Predictions
  console.log('🔮 Creating fight predictions...')
  const predictionsData = [
    { userId: users[0].id, fightId: fights[4].id, predictedRating: 9 }, // Upcoming fight
    { userId: users[1].id, fightId: fights[4].id, predictedRating: 8 },
    { userId: users[2].id, fightId: fights[4].id, predictedRating: 9 },
    { userId: users[3].id, fightId: fights[4].id, predictedRating: 7 },
    
    // Historical predictions with accuracy
    { userId: users[0].id, fightId: fights[0].id, predictedRating: 9, actualRating: 10, accuracy: 0.9 },
    { userId: users[1].id, fightId: fights[0].id, predictedRating: 8, actualRating: 9, accuracy: 0.9 },
    { userId: users[2].id, fightId: fights[1].id, predictedRating: 7, actualRating: 8, accuracy: 0.8 },
  ]

  for (const predictionData of predictionsData) {
    await prisma.fightPrediction.create({
      data: predictionData,
    })
  }

  // 8. Create Fight Reviews
  console.log('📝 Creating fight reviews...')
  const reviewsData = [
    {
      userId: users[2].id, // Media user
      fightId: fights[0].id,
      content: 'An absolute masterclass in heavyweight combat. Jones showed why he\'s considered the GOAT with his tactical brilliance and devastating finishing ability.',
      rating: 10,
      articleUrl: 'https://mmaweekly.com/jones-masterclass-ufc300',
      articleTitle: 'Jones Delivers Masterclass at UFC 300',
      upvotes: 45,
      downvotes: 3,
    },
    {
      userId: users[1].id,
      fightId: fights[0].id,
      content: 'Fight of the year candidate! The back and forth action had me on the edge of my seat the entire time.',
      rating: 9,
      upvotes: 23,
      downvotes: 1,
    },
    {
      userId: users[4].id, // ESPN user
      fightId: fights[1].id,
      content: 'Technical grappling showcase between two elite athletes. Makhachev\'s ground game proved too much for Volkanovski.',
      rating: 8,
      articleUrl: 'https://espn.com/mma/makhachev-dominates',
      articleTitle: 'Makhachev\'s Grappling Dominance on Display',
      upvotes: 38,
      downvotes: 5,
    },
    {
      userId: users[0].id,
      fightId: fights[2].id,
      content: 'Solid technical fight but lacked the fireworks I was hoping for. Both fighters looked sharp though.',
      rating: 7,
      upvotes: 12,
      downvotes: 2,
    },
    {
      userId: users[3].id,
      fightId: fights[3].id,
      content: 'Boxing at its finest! Two legends going at it with everything on the line. This is why we love combat sports.',
      rating: 10,
      upvotes: 67,
      downvotes: 4,
    }
  ]

  const reviews = []
  for (const reviewData of reviewsData) {
    const review = await prisma.fightReview.create({
      data: reviewData,
    })
    reviews.push(review)
  }

  // 9. Create Review Votes
  console.log('👍 Creating review votes...')
  const votesData = [
    { userId: users[0].id, reviewId: reviews[0].id, isUpvote: true },
    { userId: users[1].id, reviewId: reviews[0].id, isUpvote: true },
    { userId: users[3].id, reviewId: reviews[0].id, isUpvote: true },
    { userId: users[4].id, reviewId: reviews[0].id, isUpvote: false },
    
    { userId: users[2].id, reviewId: reviews[1].id, isUpvote: true },
    { userId: users[3].id, reviewId: reviews[1].id, isUpvote: true },
    { userId: users[4].id, reviewId: reviews[1].id, isUpvote: true },
    
    { userId: users[0].id, reviewId: reviews[2].id, isUpvote: true },
    { userId: users[1].id, reviewId: reviews[2].id, isUpvote: false },
  ]

  for (const voteData of votesData) {
    await prisma.reviewVote.create({
      data: voteData,
    })
  }

  // 10. Create Fight Tags
  console.log('🏷️ Creating fight tags...')
  const fightTagsData = [
    { userId: users[0].id, fightId: fights[0].id, tagId: tags[0].id }, // FOTY
    { userId: users[0].id, fightId: fights[0].id, tagId: tags[3].id }, // Brutal
    { userId: users[1].id, fightId: fights[0].id, tagId: tags[1].id }, // FOTN
    { userId: users[1].id, fightId: fights[0].id, tagId: tags[4].id }, // Explosive
    
    { userId: users[0].id, fightId: fights[1].id, tagId: tags[10].id }, // Technical
    { userId: users[1].id, fightId: fights[1].id, tagId: tags[11].id }, // Submission
    { userId: users[2].id, fightId: fights[1].id, tagId: tags[12].id }, // Great Grappling
    
    { userId: users[0].id, fightId: fights[2].id, tagId: tags[14].id }, // Competitive
    { userId: users[1].id, fightId: fights[2].id, tagId: tags[10].id }, // Technical
    
    { userId: users[0].id, fightId: fights[3].id, tagId: tags[0].id }, // FOTY
    { userId: users[1].id, fightId: fights[3].id, tagId: tags[6].id }, // Back-and-Forth
    { userId: users[2].id, fightId: fights[3].id, tagId: tags[13].id }, // Stand Up Battle
  ]

  for (const tagData of fightTagsData) {
    await prisma.fightTag.create({
      data: tagData,
    })
  }

  // 11. Create Fighter Follows
  console.log('👥 Creating fighter follows...')
  const followsData = [
    { userId: users[0].id, fighterId: fighters[0].id },
    { userId: users[0].id, fighterId: fighters[2].id },
    { userId: users[1].id, fighterId: fighters[1].id },
    { userId: users[1].id, fighterId: fighters[3].id },
    { userId: users[2].id, fighterId: fighters[0].id },
    { userId: users[3].id, fighterId: fighters[4].id },
  ]

  for (const followData of followsData) {
    await prisma.userFighterFollow.create({
      data: followData,
    })
  }

  // 12. Create Fight Alerts - REMOVED (legacy FightAlert table deleted in migration 20251108010000)

  // 13. Create User Activities
  console.log('📊 Creating user activities...')
  const activitiesData = [
    { userId: users[0].id, activityType: ActivityType.FIGHT_RATED, points: 10, description: 'Rated UFC 300 main event', fightId: fights[0].id },
    { userId: users[0].id, activityType: ActivityType.REVIEW_WRITTEN, points: 25, description: 'Wrote review for Jones vs Makhachev', reviewId: reviews[1].id },
    { userId: users[0].id, activityType: ActivityType.PREDICTION_ACCURATE, points: 50, description: 'Accurate prediction for UFC 300', predictionId: null },
    { userId: users[1].id, activityType: ActivityType.FIGHTER_FOLLOWED, points: 5, description: 'Followed Jon Jones' },
    { userId: users[1].id, activityType: ActivityType.DAILY_LOGIN, points: 5, description: 'Daily login bonus' },
    { userId: users[2].id, activityType: ActivityType.REVIEW_UPVOTED, points: 15, description: 'Review received upvotes' },
  ]

  for (const activityData of activitiesData) {
    await prisma.userActivity.create({
      data: activityData,
    })
  }

  // 14. Create User Notifications
  console.log('📲 Creating user notifications...')
  const notificationsData = [
    {
      userId: users[0].id,
      title: 'Fight Starting Soon!',
      message: 'Islam Makhachev vs Alexander Volkanovski starts in 15 minutes',
      type: NotificationType.FIGHT_STARTING,
      linkUrl: '/fights/' + fights[4].id,
      linkType: 'fight',
      linkId: fights[4].id,
    },
    {
      userId: users[1].id,
      title: 'Followed Fighter Fighting Tomorrow',
      message: 'Amanda Nunes has a fight scheduled for tomorrow night',
      type: NotificationType.FIGHTER_FIGHTING_SOON,
      linkUrl: '/fighters/' + fighters[1].id,
      linkType: 'fighter',
      linkId: fighters[1].id,
    },
    {
      userId: users[2].id,
      title: 'Your Review Got Upvoted!',
      message: 'Your review of Jones vs Makhachev received 5 new upvotes',
      type: NotificationType.REVIEW_UPVOTED,
      linkUrl: '/reviews/' + reviews[0].id,
      linkType: 'review',
      linkId: reviews[0].id,
      isRead: true,
    },
    {
      userId: users[1].id,
      title: 'Level Up!',
      message: 'Congratulations! You reached level 2',
      type: NotificationType.LEVEL_UP,
    },
    {
      userId: users[3].id,
      title: 'Prediction Result',
      message: 'Your prediction for UFC 300 was 90% accurate!',
      type: NotificationType.PREDICTION_RESULT,
      linkUrl: '/predictions',
      linkType: 'prediction',
    }
  ]

  for (const notificationData of notificationsData) {
    await prisma.userNotification.create({
      data: notificationData,
    })
  }

  // 15. Create Review Reports
  console.log('🚩 Creating review reports...')
  const reportsData = [
    {
      reporterId: users[3].id,
      reviewId: reviews[1].id,
      reason: ReportReason.SPAM,
      description: 'This looks like a duplicate review',
    },
    {
      reporterId: users[4].id,
      reviewId: reviews[2].id,
      reason: ReportReason.INAPPROPRIATE_CONTENT,
      description: 'Contains offensive language',
      isResolved: true,
      resolvedAt: new Date('2024-04-15T10:30:00Z'),
    }
  ]

  for (const reportData of reportsData) {
    await prisma.reviewReport.create({
      data: reportData,
    })
  }

  // 16. Create User Recommendations
  console.log('🎯 Creating user recommendations...')
  const recommendationsData = [
    {
      userId: users[0].id,
      fightId: fights[1].id,
      score: 0.92,
      reason: 'Based on your high ratings of technical grappling fights',
    },
    {
      userId: users[1].id,
      fightId: fights[3].id,
      score: 0.88,
      reason: 'You tend to rate heavyweight title fights highly',
      isViewed: true,
    },
    {
      userId: users[2].id,
      fightId: fights[2].id,
      score: 0.75,
      reason: 'Similar to other fights you\'ve rated 8/10',
      isViewed: true,
      isRated: true,
    },
    {
      userId: users[3].id,
      fightId: fights[4].id,
      score: 0.85,
      reason: 'Upcoming fight featuring fighters you follow',
    }
  ]

  for (const recommendationData of recommendationsData) {
    await prisma.userRecommendation.create({
      data: recommendationData,
    })
  }

  // 17. Create Refresh Tokens (for some users)
  console.log('🔑 Creating refresh tokens...')
  const refreshTokensData = [
    {
      token: 'refresh_token_' + Math.random().toString(36).substring(2, 15),
      userId: users[0].id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
    {
      token: 'refresh_token_' + Math.random().toString(36).substring(2, 15),
      userId: users[1].id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    }
  ]

  for (const tokenData of refreshTokensData) {
    await prisma.refreshToken.create({
      data: tokenData,
    })
  }

  // Update user stats based on created data
  console.log('📈 Updating user statistics...')
  
  // Update total ratings count for users
  await prisma.user.update({
    where: { id: users[0].id },
    data: { 
      totalRatings: 5,
      totalReviews: 1,
      upvotesReceived: 12,
      accuracyScore: 0.9
    }
  })

  await prisma.user.update({
    where: { id: users[1].id },
    data: { 
      totalRatings: 4,
      totalReviews: 1,
      upvotesReceived: 23,
      accuracyScore: 0.85
    }
  })

  await prisma.user.update({
    where: { id: users[2].id },
    data: { 
      totalRatings: 3,
      totalReviews: 2,
      upvotesReceived: 83,
      downvotesReceived: 8,
      accuracyScore: 0.75
    }
  })

  await prisma.user.update({
    where: { id: users[3].id },
    data: { 
      totalRatings: 2,
      totalReviews: 1,
      upvotesReceived: 67,
      downvotesReceived: 4,
      accuracyScore: 0.8
    }
  })

  await prisma.user.update({
    where: { id: users[4].id },
    data: { 
      totalRatings: 2,
      totalReviews: 1,
      upvotesReceived: 38,
      downvotesReceived: 5,
      accuracyScore: 0.88
    }
  })

  console.log('✅ Database seed completed successfully!')
  console.log('📊 Summary:')
  console.log(`   • ${tags.length} tags created`)
  console.log(`   • ${users.length} users created`)
  console.log(`   • ${fighters.length} fighters created`) 
  console.log(`   • ${events.length} events created`)
  console.log(`   • ${fights.length} fights created`)
  console.log(`   • ${ratingsData.length} ratings created`)
  console.log(`   • ${predictionsData.length} predictions created`)
  console.log(`   • ${reviews.length} reviews created`)
  console.log(`   • ${votesData.length} review votes created`)
  console.log(`   • ${fightTagsData.length} fight tags created`)
  console.log(`   • ${followsData.length} fighter follows created`)
  console.log(`   • ${activitiesData.length} user activities created`)
  console.log(`   • ${notificationsData.length} notifications created`)
  console.log(`   • ${reportsData.length} review reports created`)
  console.log(`   • ${recommendationsData.length} recommendations created`)
  console.log(`   • ${refreshTokensData.length} refresh tokens created`)
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })