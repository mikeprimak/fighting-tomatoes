import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🗑️  Deleting old UFC 320 event...')

  const eventId = 'c68b1e85-b3cf-499d-86e7-a413bee893f5'

  // Delete all fights for this event first
  const deletedFights = await prisma.fight.deleteMany({
    where: { eventId }
  })

  console.log(`Deleted ${deletedFights.count} fights`)

  // Delete the event
  const deletedEvent = await prisma.event.delete({
    where: { id: eventId }
  })

  console.log(`✅ Deleted event: ${deletedEvent.name}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
