import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔍 Checking UFC 320 fights...\n')

  // Find UFC 320 event
  const event = await prisma.event.findFirst({
    where: {
      name: {
        contains: 'UFC 320'
      }
    },
    include: {
      fights: {
        include: {
          fighter1: true,
          fighter2: true
        }
      }
    }
  })

  if (!event) {
    console.log('❌ UFC 320 event not found')
    return
  }

  console.log(`Event: ${event.name}`)
  console.log(`Date: ${event.date}`)
  console.log(`Has Started: ${event.hasStarted}`)
  console.log(`Is Complete: ${event.isComplete}`)
  console.log(`Total Fights: ${event.fights.length}\n`)

  event.fights.forEach((fight, index) => {
    console.log(`Fight ${index + 1}: ${fight.fighter1.firstName} ${fight.fighter1.lastName} vs ${fight.fighter2.firstName} ${fight.fighter2.lastName}`)
    console.log(`  - hasStarted: ${fight.hasStarted}`)
    console.log(`  - isComplete: ${fight.isComplete}`)
    console.log(`  - winner: ${fight.winner || 'null'}`)
    console.log(`  - method: ${fight.method || 'null'}`)
    console.log(`  - round: ${fight.round || 'null'}`)
    console.log(`  - time: ${fight.time || 'null'}`)
    console.log('')
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
