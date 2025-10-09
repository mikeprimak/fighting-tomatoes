import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const eventId = '89719c27-8eb9-4e16-953e-33ec278c6271'

  console.log('Checking fights with eventId:', eventId)

  const fights = await prisma.fight.findMany({
    where: {
      eventId
    },
    select: {
      id: true,
      eventId: true,
      fighter1: {
        select: {
          firstName: true,
          lastName: true
        }
      },
      fighter2: {
        select: {
          firstName: true,
          lastName: true
        }
      }
    }
  })

  console.log('Found', fights.length, 'fights')

  if (fights.length > 0) {
    console.log('\nFirst fight:')
    console.log(JSON.stringify(fights[0], null, 2))
    console.log('\nEventId from first fight:', fights[0].eventId)
    console.log('Query eventId:', eventId)
    console.log('Match:', fights[0].eventId === eventId)
  }

  // Also check all fights to see their eventIds
  const allFights = await prisma.fight.findMany({
    select: {
      id: true,
      eventId: true,
      event: {
        select: {
          name: true
        }
      }
    },
    orderBy: {
      eventId: 'asc'
    }
  })

  console.log('\n\nAll fights in database grouped by event:')
  const grouped: any = {}
  allFights.forEach(f => {
    if (!grouped[f.eventId]) {
      grouped[f.eventId] = {
        eventId: f.eventId,
        eventName: f.event.name,
        count: 0
      }
    }
    grouped[f.eventId].count++
  })

  Object.values(grouped).forEach((g: any) => {
    console.log(`${g.eventName}: ${g.count} fights (eventId: ${g.eventId})`)
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
