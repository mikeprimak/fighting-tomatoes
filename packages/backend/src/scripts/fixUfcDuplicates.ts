// Fix UFC 321/322/323 duplicates and date issues
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixUfcDuplicates() {
  console.log('🔍 Finding UFC events to fix...\n');

  // 1. Find the legacy duplicate events to delete
  const legacyDuplicates = [
    // "321" with 2 fights - legacy version
    'e60f8395-cdad-4a7e-b68e-3b844eda3d00',
    // "Fight Night Bonfim vs. Brown" with 0 fights - legacy version
    '90b7c631-1534-446b-875d-f3d40376bf21',
  ];

  // 2. Fix dates for UFC 321, 322, 323 (they're dated 2026 but should be 2025)
  const dateFixesUFC = [
    // UFC 321 - was Oct 25, 2026 -> should be Oct 25, 2025
    { id: '5d23eb8b-8d93-44b5-80d3-c3687c15985d', newDate: new Date('2025-10-25'), name: 'UFC 321' },
    // UFC 322 - was Nov 16, 2026 -> should be Nov 16, 2025
    { id: '71c88696-2ea2-45b6-bbf0-2cdc096a432f', newDate: new Date('2025-11-16'), name: 'UFC 322' },
    // UFC 323 - was Dec 7, 2026 -> should be Dec 7, 2025
    { id: '38694e9b-b845-4aa1-bf1f-a700d71fba58', newDate: new Date('2025-12-07'), name: 'UFC 323' },
  ];

  const dryRun = !process.argv.includes('--apply');

  if (dryRun) {
    console.log('DRY RUN MODE - no changes will be made\n');
  }

  // Delete legacy duplicates
  console.log('📋 Legacy duplicates to delete:');
  for (const id of legacyDuplicates) {
    const event = await prisma.event.findUnique({
      where: { id },
      select: { name: true, _count: { select: { fights: true } } }
    });

    if (event) {
      console.log(`  - ${event.name} (${event._count.fights} fights)`);

      if (!dryRun) {
        // First delete associated fights
        const deletedFights = await prisma.fight.deleteMany({
          where: { eventId: id }
        });
        console.log(`    ✓ Deleted ${deletedFights.count} fights`);

        // Then delete the event
        await prisma.event.delete({ where: { id } });
        console.log(`    ✓ Deleted event`);
      }
    } else {
      console.log(`  - Event ${id} not found (may already be deleted)`);
    }
  }

  // Fix dates
  console.log('\n📅 Date fixes:');
  for (const fix of dateFixesUFC) {
    const event = await prisma.event.findUnique({
      where: { id: fix.id },
      select: { name: true, date: true }
    });

    if (event) {
      const oldDate = event.date?.toISOString().split('T')[0] || 'N/A';
      const newDate = fix.newDate.toISOString().split('T')[0];
      console.log(`  - ${fix.name}: ${oldDate} -> ${newDate}`);

      if (!dryRun) {
        const updated = await prisma.event.update({
          where: { id: fix.id },
          data: {
            date: fix.newDate,
            isComplete: true  // Also mark as complete since these events are over
          }
        });
        console.log(`    ✓ Updated to ${updated.date?.toISOString()}, isComplete: ${updated.isComplete}`);
      }
    } else {
      console.log(`  - ${fix.name} (${fix.id}) not found`);
    }
  }

  if (dryRun) {
    console.log('\n⚠️  Run with --apply to make these changes');
  } else {
    console.log('\n✅ All fixes applied!');
  }
}

fixUfcDuplicates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
