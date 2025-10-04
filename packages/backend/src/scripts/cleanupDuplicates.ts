// Cleanup duplicate fighters, events, and fights before adding unique constraints
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupDuplicateFighters() {
  console.log('\n🧹 Cleaning up duplicate fighters...');

  // Find all fighters grouped by firstName + lastName
  const fighters = await prisma.fighter.findMany({
    orderBy: { createdAt: 'asc' }
  });

  const fighterMap = new Map<string, string>();
  const duplicatesToDelete: string[] = [];
  const fightsToUpdate: Array<{id: string, field: 'fighter1Id' | 'fighter2Id', newId: string}> = [];

  for (const fighter of fighters) {
    const key = `${fighter.firstName}|${fighter.lastName}`;

    if (fighterMap.has(key)) {
      // This is a duplicate - mark for deletion
      const keepId = fighterMap.get(key)!;
      duplicatesToDelete.push(fighter.id);

      // Find fights that reference this duplicate and update them
      const fightsAsFighter1 = await prisma.fight.findMany({
        where: { fighter1Id: fighter.id }
      });
      const fightsAsFighter2 = await prisma.fight.findMany({
        where: { fighter2Id: fighter.id }
      });

      fightsAsFighter1.forEach(f => fightsToUpdate.push({id: f.id, field: 'fighter1Id', newId: keepId}));
      fightsAsFighter2.forEach(f => fightsToUpdate.push({id: f.id, field: 'fighter2Id', newId: keepId}));

      console.log(`  Found duplicate: ${fighter.firstName} ${fighter.lastName} (keeping first, deleting ${fighter.id})`);
    } else {
      // First occurrence - keep this one
      fighterMap.set(key, fighter.id);
    }
  }

  // Update fights to reference the kept fighter
  for (const update of fightsToUpdate) {
    await prisma.fight.update({
      where: { id: update.id },
      data: { [update.field]: update.newId }
    });
  }

  // Delete duplicates
  if (duplicatesToDelete.length > 0) {
    await prisma.fighter.deleteMany({
      where: { id: { in: duplicatesToDelete } }
    });
    console.log(`✅ Deleted ${duplicatesToDelete.length} duplicate fighters`);
  } else {
    console.log(`✅ No duplicate fighters found`);
  }
}

async function cleanupDuplicateEvents() {
  console.log('\n🧹 Cleaning up duplicate events...');

  const events = await prisma.event.findMany({
    orderBy: { createdAt: 'asc' }
  });

  const eventMap = new Map<string, string>();
  const duplicatesToDelete: string[] = [];
  const fightsToUpdate: Array<{id: string, newEventId: string}> = [];

  for (const event of events) {
    const dateKey = event.date.toISOString().split('T')[0];
    const key = `${event.name}|${dateKey}`;

    if (eventMap.has(key)) {
      // This is a duplicate - mark for deletion
      const keepId = eventMap.get(key)!;
      duplicatesToDelete.push(event.id);

      // Find fights that reference this duplicate and update them
      const fights = await prisma.fight.findMany({
        where: { eventId: event.id }
      });

      fights.forEach(f => fightsToUpdate.push({id: f.id, newEventId: keepId}));

      console.log(`  Found duplicate: ${event.name} (keeping first, deleting ${event.id})`);
    } else {
      // First occurrence - keep this one
      eventMap.set(key, event.id);
    }
  }

  // Update fights to reference the kept event
  for (const update of fightsToUpdate) {
    await prisma.fight.update({
      where: { id: update.id },
      data: { eventId: update.newEventId }
    });
  }

  // Delete duplicates
  if (duplicatesToDelete.length > 0) {
    await prisma.event.deleteMany({
      where: { id: { in: duplicatesToDelete } }
    });
    console.log(`✅ Deleted ${duplicatesToDelete.length} duplicate events`);
  } else {
    console.log(`✅ No duplicate events found`);
  }
}

async function cleanupDuplicateFights() {
  console.log('\n🧹 Cleaning up duplicate fights...');

  const fights = await prisma.fight.findMany({
    orderBy: { createdAt: 'asc' }
  });

  const fightMap = new Map<string, string>();
  const duplicatesToDelete: string[] = [];

  for (const fight of fights) {
    const key = `${fight.eventId}|${fight.fighter1Id}|${fight.fighter2Id}`;

    if (fightMap.has(key)) {
      // This is a duplicate - mark for deletion
      duplicatesToDelete.push(fight.id);
      console.log(`  Found duplicate fight (deleting ${fight.id})`);
    } else {
      // First occurrence - keep this one
      fightMap.set(key, fight.id);
    }
  }

  // Delete duplicates
  if (duplicatesToDelete.length > 0) {
    await prisma.fight.deleteMany({
      where: { id: { in: duplicatesToDelete } }
    });
    console.log(`✅ Deleted ${duplicatesToDelete.length} duplicate fights`);
  } else {
    console.log(`✅ No duplicate fights found`);
  }
}

async function main() {
  console.log('🚀 Starting duplicate cleanup...\n');

  try {
    await cleanupDuplicateFighters();
    await cleanupDuplicateEvents();
    await cleanupDuplicateFights();

    console.log('\n✅ Cleanup completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
