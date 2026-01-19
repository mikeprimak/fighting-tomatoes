/**
 * Fix Event Dates Script
 *
 * Identifies and fixes events with incorrect dates:
 * - UFC 321/322/323 (2025 events showing as upcoming)
 * - Golden Boy Jan 15 (showing "in 1 year")
 * - PFL March events (showing wrong time)
 *
 * Run: npx ts-node src/scripts/fixEventDates.ts
 * Or after build: node dist/scripts/fixEventDates.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface EventFix {
  name: string;
  pattern: string;
  action: 'mark_complete' | 'fix_date' | 'investigate';
  correctDate?: Date;
}

// Known events with date issues
const KNOWN_FIXES: EventFix[] = [
  // UFC 2025 events - should be marked as complete
  {
    name: 'UFC 321',
    pattern: 'UFC 321',
    action: 'mark_complete',
  },
  {
    name: 'UFC 322',
    pattern: 'UFC 322',
    action: 'mark_complete',
  },
  {
    name: 'UFC 323',
    pattern: 'UFC 323',
    action: 'mark_complete',
  },
  // Golden Boy Jan 15 - fix date to Jan 15, 2026 and mark complete
  {
    name: 'Golden Boy Jan 15',
    pattern: 'jan-15',
    action: 'fix_date',
    correctDate: new Date(2026, 0, 15), // Jan 15, 2026
  },
];

async function analyzeEvents() {
  console.log('\n📊 Analyzing events for date issues...\n');
  console.log('='.repeat(60));

  const now = new Date();
  const oneYearFromNow = new Date(now);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  // Find events with potentially wrong dates
  // 1. Events dated far in the future (> 6 months) that aren't isComplete
  // 2. Events that should be past but aren't marked complete

  const suspiciousEvents = await prisma.event.findMany({
    where: {
      isComplete: false,
      date: {
        gt: now,
      },
    },
    select: {
      id: true,
      name: true,
      date: true,
      isComplete: true,
      hasStarted: true,
      promotion: true,
      organization: {
        select: {
          name: true,
          shortName: true,
        },
      },
    },
    orderBy: {
      date: 'asc',
    },
  });

  console.log(`\nFound ${suspiciousEvents.length} upcoming events\n`);

  // Categorize events
  const farFutureEvents = suspiciousEvents.filter(e => e.date > oneYearFromNow);
  const ufcEvents = suspiciousEvents.filter(e =>
    e.name?.includes('UFC 321') ||
    e.name?.includes('UFC 322') ||
    e.name?.includes('UFC 323')
  );
  const goldenBoyJan = suspiciousEvents.filter(e =>
    (e.promotion === 'Golden Boy' || e.organization?.name === 'Golden Boy') &&
    e.name?.toLowerCase().includes('jan')
  );

  if (farFutureEvents.length > 0) {
    console.log('⚠️  Events dated > 1 year in future (possibly wrong):');
    for (const event of farFutureEvents) {
      console.log(`   - ${event.name} (${event.date.toLocaleDateString()}) - ${event.promotion || event.organization?.name}`);
    }
    console.log('');
  }

  if (ufcEvents.length > 0) {
    console.log('🥊 UFC 321/322/323 (should be 2025 events, need marking complete):');
    for (const event of ufcEvents) {
      console.log(`   - ${event.name} (${event.date.toLocaleDateString()}) - isComplete: ${event.isComplete}`);
    }
    console.log('');
  }

  if (goldenBoyJan.length > 0) {
    console.log('🥊 Golden Boy January events (check dates):');
    for (const event of goldenBoyJan) {
      console.log(`   - ${event.name} (${event.date.toLocaleDateString()}) - isComplete: ${event.isComplete}`);
    }
    console.log('');
  }

  return { suspiciousEvents, farFutureEvents, ufcEvents, goldenBoyJan };
}

async function fixEvents(dryRun: boolean = true) {
  console.log(`\n${dryRun ? '🔍 DRY RUN' : '🔧 FIXING'} - Applying known fixes...\n`);

  for (const fix of KNOWN_FIXES) {
    const events = await prisma.event.findMany({
      where: {
        OR: [
          { name: { contains: fix.pattern, mode: 'insensitive' } },
          { ufcUrl: { contains: fix.pattern, mode: 'insensitive' } },
        ],
        isComplete: false,
      },
    });

    if (events.length === 0) {
      console.log(`   ⏭️  ${fix.name}: No matching events found (already fixed or doesn't exist)`);
      continue;
    }

    for (const event of events) {
      console.log(`   📍 ${fix.name}: Found "${event.name}" (${event.date.toLocaleDateString()})`);

      if (fix.action === 'mark_complete') {
        if (!dryRun) {
          await prisma.event.update({
            where: { id: event.id },
            data: { isComplete: true },
          });
          // Also mark all fights as complete
          await prisma.fight.updateMany({
            where: { eventId: event.id },
            data: { isComplete: true },
          });
          console.log(`      ✅ Marked as complete`);
        } else {
          console.log(`      🔍 Would mark as complete`);
        }
      } else if (fix.action === 'fix_date' && fix.correctDate) {
        if (!dryRun) {
          await prisma.event.update({
            where: { id: event.id },
            data: {
              date: fix.correctDate,
              isComplete: true, // If we're fixing a past date, it's likely complete
            },
          });
          // Also mark all fights as complete
          await prisma.fight.updateMany({
            where: { eventId: event.id },
            data: { isComplete: true },
          });
          console.log(`      ✅ Fixed date to ${fix.correctDate.toLocaleDateString()} and marked complete`);
        } else {
          console.log(`      🔍 Would fix date to ${fix.correctDate.toLocaleDateString()}`);
        }
      }
    }
  }

  console.log('\n' + '='.repeat(60));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');

  console.log('\n🚀 Event Date Fix Script');
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made');
    console.log('   Use --apply flag to actually apply fixes\n');
  } else {
    console.log('\n🔧 APPLY MODE - Changes will be made to database\n');
  }

  try {
    // First analyze
    await analyzeEvents();

    // Then apply fixes
    await fixEvents(dryRun);

    if (dryRun) {
      console.log('\n✅ Dry run complete. Run with --apply to fix issues.\n');
    } else {
      console.log('\n✅ Fixes applied successfully!\n');
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
