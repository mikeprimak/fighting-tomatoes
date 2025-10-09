import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const targetId = '89719c27-8eb9-4e16-953e-33ec278c6271'

  console.log('Looking for event with ID:', targetId)

  // Find the event
  const event = await prisma.event.findUnique({
    where: { id: targetId }
  })

  console.log('Event found:', event ? 'YES' : 'NO')
  if (event) {
    console.log('Event name:', event.name)
    console.log('Event date:', event.date)
  }

  // Count fights for this event
  const fightCount = await prisma.fight.count({
    where: { eventId: targetId }
  })

  console.log('Fight count for this event:', fightCount)

  // Get all events with UFC 320 in the name
  const allUFC320Events = await prisma.event.findMany({
    where: {
      name: {
        contains: 'UFC 320'
      }
    },
    include: {
      _count: {
        select: {
          fights: true
        }
      }
    }
  })

  console.log('\nAll events with "UFC 320" in name:')
  allUFC320Events.forEach(e => {
    console.log(`- ${e.name} (ID: ${e.id}, fights: ${e._count.fights})`)
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
