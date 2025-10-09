import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Get UFC 320 event
  const event = await prisma.event.findFirst({
    where: {
      name: {
        contains: 'UFC 320'
      }
    }
  })

  if (!event) {
    console.log('No UFC 320 event found')
    return
  }

  console.log('Event ID from findFirst:', event.id)
  console.log('Event name:', event.name)

  // Get all fights
  const allFights = await prisma.fight.findMany()
  console.log('\nTotal fights in database:', allFights.length)

  // Filter fights manually by eventId
  const ufc320Fights = allFights.filter(f => f.eventId === event.id)
  console.log('Fights with matching eventId (manual filter):', ufc320Fights.length)

  // Use Prisma where filter
  const prismaFilteredFights = await prisma.fight.findMany({
    where: {
      eventId: event.id
    }
  })

  console.log('Fights with matching eventId (Prisma filter):', prismaFilteredFights.length)

  // Check first fight's eventId
  if (ufc320Fights.length > 0) {
    console.log('\nFirst fight eventId:',  JSON.stringify(ufc320Fights[0].eventId))
    console.log('Event id:', JSON.stringify(event.id))
    console.log('Match:', ufc320Fights[0].eventId === event.id)
    console.log('Length of fight eventId:', ufc320Fights[0].eventId.length)
    console.log('Length of event id:', event.id.length)
    console.log('Type of fight eventId:', typeof ufc320Fights[0].eventId)
    console.log('Type of event id:', typeof event.id)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
