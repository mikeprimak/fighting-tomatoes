/**
 * Failsafe Cleanup System
 *
 * Ensures events and fights are eventually marked complete even if live tracker fails
 * Runs every hour to catch stuck data
 *
 * Rules:
 * 1. Complete fights that started 6+ hours ago (based on actual event start time)
 * 2. Complete events when all fights are done
 * 3. Force complete events 8+ hours after start (based on actual event start time)
 *
 * IMPORTANT: Uses mainStartTime/prelimStartTime/earlyPrelimStartTime, NOT event.date
 * (event.date is just the calendar date at midnight, not the actual start time)
 *
 * IMPORTANT: Skips events with trackerMode='manual' - those require admin action
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Configuration
const FIGHT_TIMEOUT_HOURS = 6;  // Complete fights 6+ hours after event start
const EVENT_TIMEOUT_HOURS = 8;  // Force complete events 8+ hours after start

/**
 * Get the actual event start time (earliest of main/prelim/early prelim, fallback to date)
 */
function getEventStartTime(event: {
  date: Date;
  mainStartTime?: Date | null;
  prelimStartTime?: Date | null;
  earlyPrelimStartTime?: Date | null;
}): Date {
  return event.earlyPrelimStartTime || event.prelimStartTime || event.mainStartTime || event.date;
}

export interface FailsafeResults {
  fightsCompleted: number;
  eventsCompleted: number;
  details: {
    stuckFights: Array<{ id: string; fighters: string; event: string }>;
    allFightsComplete: Array<{ id: string; name: string }>;
    forcedComplete: Array<{ id: string; name: string }>;
  };
}

/**
 * Run failsafe cleanup to catch stuck events and fights
 */
export async function runFailsafeCleanup(): Promise<FailsafeResults> {
  const now = new Date();
  const results: FailsafeResults = {
    fightsCompleted: 0,
    eventsCompleted: 0,
    details: {
      stuckFights: [],
      allFightsComplete: [],
      forcedComplete: []
    }
  };

  console.log(`\n[Failsafe] Running cleanup at ${now.toISOString()}`);

  try {
    // STEP 1: Complete stuck fights (6+ hours old)
    await completeStuckFights(now, results);

    // STEP 2: Complete events where all fights are done
    await completeEventsWithAllFightsDone(now, results);

    // STEP 3: Force complete events 8+ hours after start
    await forceCompleteOldEvents(now, results);

    // Summary
    if (results.fightsCompleted > 0 || results.eventsCompleted > 0) {
      console.log(`\n[Failsafe] ✅ Completed ${results.fightsCompleted} fights, ${results.eventsCompleted} events`);
    } else {
      console.log(`[Failsafe] ✓ No cleanup needed - all data current`);
    }

  } catch (error: any) {
    console.error('[Failsafe] ❌ Error during cleanup:', error.message);
    throw error;
  }

  return results;
}

/**
 * STEP 1: Complete fights from events that started 6+ hours ago
 * Uses actual event start time (mainStartTime/prelimStartTime/earlyPrelimStartTime)
 */
async function completeStuckFights(now: Date, results: FailsafeResults): Promise<void> {
  const fightCutoffMs = FIGHT_TIMEOUT_HOURS * 60 * 60 * 1000;

  console.log(`\n[Failsafe] Step 1: Looking for stuck fights from events that started 6+ hours ago`);

  // Query all fights that have started but aren't complete
  // Skip fights from events with trackerMode='manual'
  const potentiallyStuckFights = await prisma.fight.findMany({
    where: {
      hasStarted: true,
      isComplete: false,
      event: {
        hasStarted: true,
        OR: [
          { trackerMode: null },
          { trackerMode: { not: 'manual' } },
        ],
      }
    },
    include: {
      event: {
        select: {
          name: true,
          date: true,
          mainStartTime: true,
          prelimStartTime: true,
          earlyPrelimStartTime: true
        }
      },
      fighter1: { select: { lastName: true } },
      fighter2: { select: { lastName: true } }
    },
    take: 100 // Safety limit
  });

  // Filter based on actual event start time (not just event.date)
  const stuckFights = potentiallyStuckFights.filter(fight => {
    const eventStartTime = getEventStartTime(fight.event);
    const timeSinceStart = now.getTime() - eventStartTime.getTime();
    return timeSinceStart >= fightCutoffMs;
  });

  console.log(`[Failsafe] Found ${stuckFights.length} stuck fights (checked ${potentiallyStuckFights.length} candidates)`);

  for (const fight of stuckFights) {
    const fightersName = `${fight.fighter1.lastName} vs ${fight.fighter2.lastName}`;
    const eventStartTime = getEventStartTime(fight.event);
    const hoursSinceStart = Math.round((now.getTime() - eventStartTime.getTime()) / (60 * 60 * 1000));

    await prisma.fight.update({
      where: { id: fight.id },
      data: {
        isComplete: true,
        completionMethod: 'failsafe-timeout',
        completedAt: now
      }
    });

    console.log(`  ✓ Completed: ${fightersName} (${fight.event.name}, ${hoursSinceStart}hrs since event start)`);

    results.fightsCompleted++;
    results.details.stuckFights.push({
      id: fight.id,
      fighters: fightersName,
      event: fight.event.name
    });
  }
}

/**
 * STEP 2: Complete events where all fights are marked complete
 */
async function completeEventsWithAllFightsDone(now: Date, results: FailsafeResults): Promise<void> {
  console.log(`\n[Failsafe] Step 2: Looking for events with all fights complete`);

  // Skip events with trackerMode='manual'
  const incompleteEvents = await prisma.event.findMany({
    where: {
      isComplete: false,
      hasStarted: true,
      OR: [
        { trackerMode: null },
        { trackerMode: { not: 'manual' } },
      ],
    },
    include: {
      fights: { select: { isComplete: true } }
    }
  });

  console.log(`[Failsafe] Checking ${incompleteEvents.length} incomplete events (excluding manual mode)`);

  for (const event of incompleteEvents) {
    // Check if ALL fights are complete (or no fights at all)
    const allFightsComplete = event.fights.length === 0 || event.fights.every(f => f.isComplete);

    if (allFightsComplete) {
      await prisma.event.update({
        where: { id: event.id },
        data: {
          isComplete: true,
          completionMethod: 'all-fights-complete'
        }
      });

      console.log(`  ✓ Completed: ${event.name} (all ${event.fights.length} fights done)`);

      results.eventsCompleted++;
      results.details.allFightsComplete.push({
        id: event.id,
        name: event.name
      });
    }
  }
}

/**
 * STEP 3: Force complete events 8+ hours after their actual start time
 * Uses actual event start time (mainStartTime/prelimStartTime/earlyPrelimStartTime)
 */
async function forceCompleteOldEvents(now: Date, results: FailsafeResults): Promise<void> {
  const eventCutoffMs = EVENT_TIMEOUT_HOURS * 60 * 60 * 1000;

  console.log(`\n[Failsafe] Step 3: Looking for events to force complete (started 8+ hours ago)`);

  // Query all incomplete events that have started
  // Skip events with trackerMode='manual'
  const potentiallyOldEvents = await prisma.event.findMany({
    where: {
      hasStarted: true,
      isComplete: false,
      OR: [
        { trackerMode: null },
        { trackerMode: { not: 'manual' } },
      ],
    },
    include: {
      fights: {
        select: {
          id: true,
          isComplete: true,
          fighter1: { select: { lastName: true } },
          fighter2: { select: { lastName: true } }
        }
      }
    }
  });

  // Filter based on actual event start time (not just event.date)
  const oldEvents = potentiallyOldEvents.filter(event => {
    const eventStartTime = getEventStartTime(event);
    const timeSinceStart = now.getTime() - eventStartTime.getTime();
    return timeSinceStart >= eventCutoffMs;
  });

  console.log(`[Failsafe] Found ${oldEvents.length} events to force complete (checked ${potentiallyOldEvents.length} candidates)`);

  for (const event of oldEvents) {
    const eventStartTime = getEventStartTime(event);
    const hoursSinceStart = Math.round((now.getTime() - eventStartTime.getTime()) / (60 * 60 * 1000));

    // Complete any remaining incomplete fights
    const incompleteFights = event.fights.filter(f => !f.isComplete);

    if (incompleteFights.length > 0) {
      console.log(`  ⚠️  Force completing ${incompleteFights.length} remaining fights for ${event.name}`);

      await prisma.fight.updateMany({
        where: {
          eventId: event.id,
          isComplete: false
        },
        data: {
          isComplete: true,
          completionMethod: 'failsafe-force-timeout',
          completedAt: now
        }
      });

      results.fightsCompleted += incompleteFights.length;
    }

    // Complete the event
    await prisma.event.update({
      where: { id: event.id },
      data: {
        isComplete: true,
        completionMethod: 'failsafe-force-timeout'
      }
    });

    console.log(`  ✓ Force completed: ${event.name} (${incompleteFights.length} fights auto-completed, ${hoursSinceStart}hrs since start)`);

    results.eventsCompleted++;
    results.details.forcedComplete.push({
      id: event.id,
      name: event.name
    });
  }
}

/**
 * Get status of potentially problematic events/fights for monitoring
 */
export async function getFailsafeStatus(): Promise<{
  stuckFights: number;
  incompleteEvents: number;
  oldestStuckFight: Date | null;
  oldestIncompleteEvent: Date | null;
}> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [stuckFights, incompleteEvents, oldestFight, oldestEvent] = await Promise.all([
    // Count stuck fights from past events
    prisma.fight.count({
      where: {
        hasStarted: true,
        isComplete: false,
        event: {
          date: { lt: oneDayAgo }
        }
      }
    }),

    // Count incomplete events that have started
    prisma.event.count({
      where: {
        hasStarted: true,
        isComplete: false
      }
    }),

    // Find oldest stuck fight
    prisma.fight.findFirst({
      where: {
        hasStarted: true,
        isComplete: false,
        event: {
          date: { lt: oneDayAgo }
        }
      },
      select: { event: { select: { date: true } } },
      orderBy: { event: { date: 'asc' } }
    }),

    // Find oldest incomplete event
    prisma.event.findFirst({
      where: {
        hasStarted: true,
        isComplete: false
      },
      select: { date: true },
      orderBy: { date: 'asc' }
    })
  ]);

  return {
    stuckFights,
    incompleteEvents,
    oldestStuckFight: oldestFight?.event?.date || null,
    oldestIncompleteEvent: oldestEvent?.date || null
  };
}
