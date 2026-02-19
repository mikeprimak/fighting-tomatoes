import { PrismaClient, WeightClass, Gender } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🥊 Creating UFC 311 and UFC 312 with full fight cards...')

  // Get existing fighters
  let fighters = await prisma.fighter.findMany()

  // If we don't have enough fighters, create some basic ones
  if (fighters.length < 30) {
    console.log('Creating additional fighters for events...')

    for (let i = fighters.length; i < 30; i++) {
      const weightClasses = Object.values(WeightClass)
      const randomWeight = weightClasses[Math.floor(Math.random() * weightClasses.length)]

      await prisma.fighter.create({
        data: {
          firstName: `Fighter${i}`,
          lastName: `Name${i}`,
          nickname: i % 3 === 0 ? `Nickname${i}` : null,
          wins: Math.floor(Math.random() * 30),
          losses: Math.floor(Math.random() * 10),
          draws: Math.floor(Math.random() * 3),
          weightClass: randomWeight,
          gender: i >= 26 ? Gender.FEMALE : Gender.MALE,
        }
      })
    }

    fighters = await prisma.fighter.findMany()
  }

  console.log(`Total fighters in database: ${fighters.length}`)

  // Create UFC 311 - January 2025
  const ufc311 = await prisma.event.create({
    data: {
      name: 'UFC 311: Makhachev vs Tsarukyan 2',
      date: new Date('2025-01-18T20:00:00'),
      venue: 'Intuit Dome',
      location: 'Inglewood, California',
      promotion: 'UFC',
      eventStatus: 'UPCOMING',
    }
  })

  // Create UFC 312 - February 2025
  const ufc312 = await prisma.event.create({
    data: {
      name: 'UFC 312: Du Plessis vs Strickland 2',
      date: new Date('2025-02-08T20:00:00'),
      venue: 'Qudos Bank Arena',
      location: 'Sydney, Australia',
      promotion: 'UFC',
      eventStatus: 'UPCOMING',
    }
  })

  // Create fights for UFC 311 (13 fights)
  const ufc311Fights = [
    {
      orderOnCard: 13,
      fighter1Id: fighters[0].id,
      fighter2Id: fighters[1].id,
      weightClass: WeightClass.LIGHTWEIGHT,
      isTitle: true,
      titleName: 'UFC Lightweight Championship',
    },
    {
      orderOnCard: 12,
      fighter1Id: fighters[2].id,
      fighter2Id: fighters[3].id,
      weightClass: WeightClass.BANTAMWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 11,
      fighter1Id: fighters[4].id,
      fighter2Id: fighters[5].id,
      weightClass: WeightClass.WELTERWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 10,
      fighter1Id: fighters[6].id,
      fighter2Id: fighters[7].id,
      weightClass: WeightClass.HEAVYWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 9,
      fighter1Id: fighters[8].id,
      fighter2Id: fighters[9].id,
      weightClass: WeightClass.FEATHERWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 8,
      fighter1Id: fighters[10].id,
      fighter2Id: fighters[11].id,
      weightClass: WeightClass.MIDDLEWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 7,
      fighter1Id: fighters[12].id,
      fighter2Id: fighters[13].id,
      weightClass: WeightClass.LIGHTWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 6,
      fighter1Id: fighters[14].id,
      fighter2Id: fighters[15].id,
      weightClass: WeightClass.STRAWWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 5,
      fighter1Id: fighters[16].id,
      fighter2Id: fighters[17].id,
      weightClass: WeightClass.LIGHT_HEAVYWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 4,
      fighter1Id: fighters[18].id,
      fighter2Id: fighters[19].id,
      weightClass: WeightClass.WELTERWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 3,
      fighter1Id: fighters[20].id,
      fighter2Id: fighters[21].id,
      weightClass: WeightClass.BANTAMWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 2,
      fighter1Id: fighters[22].id,
      fighter2Id: fighters[23].id,
      weightClass: WeightClass.FLYWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 1,
      fighter1Id: fighters[24].id,
      fighter2Id: fighters[25].id,
      weightClass: WeightClass.FEATHERWEIGHT,
      isTitle: false,
    },
  ]

  for (const fightData of ufc311Fights) {
    await prisma.fight.create({
      data: {
        eventId: ufc311.id,
        ...fightData,
        fightStatus: 'UPCOMING',
      }
    })
  }

  // Create fights for UFC 312 (12 fights)
  const ufc312Fights = [
    {
      orderOnCard: 12,
      fighter1Id: fighters[1].id,
      fighter2Id: fighters[2].id,
      weightClass: WeightClass.MIDDLEWEIGHT,
      isTitle: true,
      titleName: 'UFC Middleweight Championship',
    },
    {
      orderOnCard: 11,
      fighter1Id: fighters[26].id,
      fighter2Id: fighters[27].id,
      weightClass: WeightClass.STRAWWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 10,
      fighter1Id: fighters[3].id,
      fighter2Id: fighters[4].id,
      weightClass: WeightClass.LIGHTWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 9,
      fighter1Id: fighters[5].id,
      fighter2Id: fighters[6].id,
      weightClass: WeightClass.HEAVYWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 8,
      fighter1Id: fighters[7].id,
      fighter2Id: fighters[8].id,
      weightClass: WeightClass.FEATHERWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 7,
      fighter1Id: fighters[9].id,
      fighter2Id: fighters[10].id,
      weightClass: WeightClass.WELTERWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 6,
      fighter1Id: fighters[11].id,
      fighter2Id: fighters[12].id,
      weightClass: WeightClass.LIGHT_HEAVYWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 5,
      fighter1Id: fighters[13].id,
      fighter2Id: fighters[14].id,
      weightClass: WeightClass.BANTAMWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 4,
      fighter1Id: fighters[15].id,
      fighter2Id: fighters[16].id,
      weightClass: WeightClass.FLYWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 3,
      fighter1Id: fighters[17].id,
      fighter2Id: fighters[18].id,
      weightClass: WeightClass.LIGHTWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 2,
      fighter1Id: fighters[19].id,
      fighter2Id: fighters[20].id,
      weightClass: WeightClass.MIDDLEWEIGHT,
      isTitle: false,
    },
    {
      orderOnCard: 1,
      fighter1Id: fighters[21].id,
      fighter2Id: fighters[22].id,
      weightClass: WeightClass.WELTERWEIGHT,
      isTitle: false,
    },
  ]

  for (const fightData of ufc312Fights) {
    await prisma.fight.create({
      data: {
        eventId: ufc312.id,
        ...fightData,
        fightStatus: 'UPCOMING',
      }
    })
  }

  console.log(`✅ Created UFC 311 with ${ufc311Fights.length} fights`)
  console.log(`✅ Created UFC 312 with ${ufc312Fights.length} fights`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })