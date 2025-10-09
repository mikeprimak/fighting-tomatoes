import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Fight outcome generator
const methods = ['KO', 'TKO', 'Submission', 'Decision']
const submissionTypes = ['Rear Naked Choke', 'Armbar', 'Triangle Choke', 'Guillotine']

function generateOutcome() {
  const method = methods[Math.floor(Math.random() * methods.length)]

  // Decision always goes to round 3 or 5 (title fights)
  if (method === 'Decision') {
    return {
      method: 'Decision',
      round: 3, // Will be adjusted for title fights
      time: '5:00'
    }
  }

  // KO/TKO/Sub can happen in any round, weighted towards earlier rounds
  const roundWeights = [0.4, 0.3, 0.2, 0.1] // 40% R1, 30% R2, 20% R3, 10% R4+
  const rand = Math.random()
  let round = 1

  if (rand < 0.4) round = 1
  else if (rand < 0.7) round = 2
  else if (rand < 0.9) round = 3
  else round = Math.floor(Math.random() * 2) + 4 // R4 or R5

  // Generate time (0:00 - 5:00)
  const minutes = Math.floor(Math.random() * 5)
  const seconds = Math.floor(Math.random() * 60)
  const time = `${minutes}:${seconds.toString().padStart(2, '0')}`

  // Add submission type if applicable
  const finalMethod = method === 'Submission'
    ? `${method} (${submissionTypes[Math.floor(Math.random() * submissionTypes.length)]})`
    : method

  return { method: finalMethod, round, time }
}

async function main() {
  console.log('🥊 Completing UFC 320 fights...\n')

  // Find UFC 320 event
  const event = await prisma.event.findFirst({
    where: {
      name: {
        contains: 'UFC 320'
      }
    }
  })

  if (!event) {
    console.log('❌ UFC 320 event not found')
    return
  }

  // Get fights separately
  const fights = await prisma.fight.findMany({
    where: {
      eventId: event.id
    },
    include: {
      fighter1: true,
      fighter2: true
    },
    orderBy: {
      orderOnCard: 'asc'
    }
  })

  console.log(`Event: ${event.name}`)
  console.log(`Total Fights: ${fights.length}\n`)

  // Update event to started and complete
  await prisma.event.update({
    where: { id: event.id },
    data: {
      hasStarted: true,
      isComplete: true
    }
  })

  // Update each fight
  for (const fight of fights) {
    const outcome = generateOutcome()

    // Adjust round for title fights (5 rounds vs 3)
    if (fight.isTitle && outcome.method === 'Decision') {
      outcome.round = 5
    }

    // 60% chance fighter1 wins, 40% fighter2 (slight favorite bias)
    const winner = Math.random() < 0.6 ? fight.fighter1Id : fight.fighter2Id

    await prisma.fight.update({
      where: { id: fight.id },
      data: {
        hasStarted: true,
        isComplete: true,
        winner,
        method: outcome.method,
        round: outcome.round,
        time: outcome.time,
        completedRounds: outcome.round
      }
    })

    const winnerName = winner === fight.fighter1Id
      ? `${fight.fighter1.firstName} ${fight.fighter1.lastName}`
      : `${fight.fighter2.firstName} ${fight.fighter2.lastName}`

    console.log(`✅ ${fight.fighter1.firstName} ${fight.fighter1.lastName} vs ${fight.fighter2.firstName} ${fight.fighter2.lastName}`)
    console.log(`   Winner: ${winnerName}`)
    console.log(`   Method: ${outcome.method} - R${outcome.round} ${outcome.time}\n`)
  }

  console.log('✅ All fights completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
