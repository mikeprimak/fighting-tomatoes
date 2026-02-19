/**
 * Time-Based Fight Status Updater
 *
 * For promotions without live event trackers, this service marks fights
 * as complete at the scheduled start time of their card section.
 *
 * This ensures users can rate fights as events progress, even without
 * real-time scraping data.
 *
 * Logic:
 * - At earlyPrelimStartTime: Mark all "Early Prelims" fights as complete
 * - At prelimStartTime: Mark all "Prelims" fights as complete
 * - At mainStartTime: Mark all "Main Card" fights as complete
 * - If no section times exist, use event.date as fallback for all fights
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Track scheduled timers so we can cancel them if needed
const scheduledTimeBasedTimers = new Map<string, NodeJS.Timeout[]>();

// How many minutes before section start to trigger (0 = exactly at start time)
const PRE_START_BUFFER_MINUTES = 0;

type CardType = 'Early Prelims' | 'Prelims' | 'Main Card';

interface SectionTiming {
  cardType: CardType;
  startTime: Date;
}

/**
 * Schedule time-based status updates for an event.
 * Sets up timers to mark each section's fights as complete at the section start time.
 */
export async function scheduleTimeBasedUpdates(eventId: string): Promise<void> {
  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        promotion: true,
        date: true,
        earlyPrelimStartTime: true,
        prelimStartTime: true,
        mainStartTime: true,
        eventStatus: true,
      }
    });

    if (!event || event.eventStatus === 'COMPLETED') {
      return;
    }

    // Check if this event has already been processed by time-based system
    // If any fights have completionMethod='time-based', skip re-processing
    // This prevents overwriting manual admin changes
    const timeBasedFights = await prisma.fight.count({
      where: {
        eventId,
        completionMethod: 'time-based',
      }
    });

    if (timeBasedFights > 0) {
      console.log(`[Time-Based] ${event.name}: Already processed (${timeBasedFights} fights), skipping`);
      return;
    }

    // Cancel any existing timers for this event
    cancelTimeBasedTimers(eventId);

    const now = new Date();
    const timers: NodeJS.Timeout[] = [];

    // Build list of section timings
    const sectionTimings: SectionTiming[] = [];

    if (event.earlyPrelimStartTime) {
      sectionTimings.push({ cardType: 'Early Prelims', startTime: event.earlyPrelimStartTime });
    }
    if (event.prelimStartTime) {
      sectionTimings.push({ cardType: 'Prelims', startTime: event.prelimStartTime });
    }
    if (event.mainStartTime) {
      sectionTimings.push({ cardType: 'Main Card', startTime: event.mainStartTime });
    }

    // If no section times at all, use event date for all fights
    if (sectionTimings.length === 0) {
      const fallbackTime = event.date;
      const msUntilFallback = fallbackTime.getTime() - now.getTime();

      if (msUntilFallback <= 0) {
        // Event time has passed, mark all fights complete now
        console.log(`[Time-Based] ${event.name}: Event time passed, marking ALL fights complete now`);
        await markSectionComplete(eventId, 'all');
      } else {
        // Schedule for event start time
        console.log(`[Time-Based] ${event.name}: No section times, scheduling ALL fights for ${fallbackTime.toISOString()}`);
        const timer = setTimeout(async () => {
          console.log(`[Time-Based] ${event.name}: Timer triggered - marking ALL fights complete`);
          await markSectionComplete(eventId, 'all');
        }, msUntilFallback);
        timers.push(timer);
      }
    } else {
      // Schedule each section
      for (const section of sectionTimings) {
        const triggerTime = new Date(section.startTime.getTime() - PRE_START_BUFFER_MINUTES * 60 * 1000);
        const msUntilTrigger = triggerTime.getTime() - now.getTime();

        if (msUntilTrigger <= 0) {
          // Section time has passed, mark complete now
          console.log(`[Time-Based] ${event.name}: ${section.cardType} time passed, marking complete now`);
          await markSectionComplete(eventId, section.cardType);
        } else {
          // Schedule for section start time
          const minutesUntil = Math.floor(msUntilTrigger / (60 * 1000));
          console.log(`[Time-Based] ${event.name}: Scheduling ${section.cardType} in ${minutesUntil} minutes (${section.startTime.toISOString()})`);

          const timer = setTimeout(async () => {
            console.log(`[Time-Based] ${event.name}: Timer triggered for ${section.cardType}`);
            await markSectionComplete(eventId, section.cardType);
            await checkEventCompletion(eventId);
          }, msUntilTrigger);

          timers.push(timer);
        }
      }
    }

    // Store timers for this event
    if (timers.length > 0) {
      scheduledTimeBasedTimers.set(eventId, timers);
    }

    console.log(`[Time-Based] ${event.name}: Scheduled ${timers.length} section timer(s)`);

  } catch (error: any) {
    console.error(`[Time-Based] Error scheduling updates for event ${eventId}:`, error.message);
  }
}

/**
 * Mark all fights in a section (or all fights) as complete.
 * Also marks the event as started (for proper "upcoming" filter behavior).
 */
export async function markSectionComplete(
  eventId: string,
  cardType: CardType | 'all'
): Promise<number> {
  try {
    const now = new Date();

    // Mark the event as live (important for upcoming filter)
    await prisma.event.update({
      where: { id: eventId },
      data: { eventStatus: 'LIVE' }
    });

    // Build the where clause
    const whereClause: any = {
      eventId,
      fightStatus: { in: ['UPCOMING', 'LIVE'] },
    };

    // Filter by cardType unless marking all
    // Note: "Main Card" also includes "Main Event" fights
    if (cardType !== 'all') {
      if (cardType === 'Main Card') {
        // Main Card section includes both "Main Card" and "Main Event" fights
        whereClause.OR = [
          { cardType: 'Main Card' },
          { cardType: 'Main Event' }
        ];
      } else {
        whereClause.cardType = cardType;
      }
    }

    // Get fights that match the criteria
    const fights = await prisma.fight.findMany({
      where: whereClause,
      select: {
        id: true,
        fighter1: { select: { lastName: true } },
        fighter2: { select: { lastName: true } },
        cardType: true,
      }
    });

    if (fights.length === 0) {
      console.log(`[Time-Based] No incomplete fights found for ${cardType === 'all' ? 'event' : cardType}`);
      return 0;
    }

    // Update all matching fights
    const result = await prisma.fight.updateMany({
      where: whereClause,
      data: {
        fightStatus: 'COMPLETED',
        completionMethod: 'time-based',
        completedAt: now,
      }
    });

    // Log what was updated
    const fightNames = fights.map(f =>
      `${f.fighter1?.lastName || '?'} vs ${f.fighter2?.lastName || '?'}`
    ).join(', ');

    console.log(`[Time-Based] Marked ${result.count} fights complete (${cardType}): ${fightNames}`);

    return result.count;

  } catch (error: any) {
    console.error(`[Time-Based] Error marking section complete:`, error.message);
    return 0;
  }
}

/**
 * Check if all fights in an event are complete and update event status.
 */
async function checkEventCompletion(eventId: string): Promise<void> {
  try {
    // Count incomplete, non-cancelled fights
    const incompleteFights = await prisma.fight.count({
      where: {
        eventId,
        fightStatus: { in: ['UPCOMING', 'LIVE'] },
      }
    });

    if (incompleteFights === 0) {
      // All fights complete, mark event as complete
      await prisma.event.update({
        where: { id: eventId },
        data: {
          eventStatus: 'COMPLETED',
          completionMethod: 'time-based',
        }
      });

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { name: true }
      });

      console.log(`[Time-Based] Event ${event?.name} marked complete (all fights done)`);

      // Clean up timers for this event
      cancelTimeBasedTimers(eventId);
    }
  } catch (error: any) {
    console.error(`[Time-Based] Error checking event completion:`, error.message);
  }
}

/**
 * Cancel all scheduled timers for an event.
 */
export function cancelTimeBasedTimers(eventId: string): void {
  const timers = scheduledTimeBasedTimers.get(eventId);
  if (timers) {
    timers.forEach(timer => clearTimeout(timer));
    scheduledTimeBasedTimers.delete(eventId);
    console.log(`[Time-Based] Cancelled ${timers.length} timer(s) for event ${eventId}`);
  }
}

/**
 * Cancel all time-based timers (for graceful shutdown).
 */
export function cancelAllTimeBasedTimers(): void {
  let totalCancelled = 0;
  Array.from(scheduledTimeBasedTimers.entries()).forEach(([eventId, timers]) => {
    timers.forEach(timer => clearTimeout(timer));
    totalCancelled += timers.length;
  });
  scheduledTimeBasedTimers.clear();
  console.log(`[Time-Based] Cancelled ${totalCancelled} timer(s) across all events`);
}

/**
 * Get info about scheduled time-based timers.
 */
export function getTimeBasedTimersInfo(): Array<{ eventId: string; timerCount: number }> {
  return Array.from(scheduledTimeBasedTimers.entries()).map(([eventId, timers]) => ({
    eventId,
    timerCount: timers.length,
  }));
}

// ============== SCHEDULED START TIME CHECKER ==============

let scheduledStartTimeInterval: NodeJS.Timeout | null = null;

/**
 * Check for fights whose scheduledStartTime has arrived and auto-flip them to "live".
 * This runs on an interval and handles the per-fight scheduling approach where
 * admins manually set expected start times for individual fights.
 */
export async function checkScheduledStartTimes(): Promise<number> {
  try {
    const now = new Date();

    // Find fights that should be live: scheduledStartTime has passed, but fight is still upcoming
    const fightsToStart = await prisma.fight.findMany({
      where: {
        scheduledStartTime: { lte: now },
        fightStatus: 'UPCOMING',
        event: {
          trackerMode: 'time-based',
        },
      },
      include: {
        fighter1: { select: { lastName: true } },
        fighter2: { select: { lastName: true } },
        event: { select: { id: true, name: true, eventStatus: true } },
      },
    });

    if (fightsToStart.length === 0) return 0;

    let updated = 0;

    for (const fight of fightsToStart) {
      // Mark fight as live
      await prisma.fight.update({
        where: { id: fight.id },
        data: {
          fightStatus: 'LIVE',
          completionMethod: 'time-based',
        },
      });

      // Also mark the event as live if it's still upcoming
      if (fight.event.eventStatus === 'UPCOMING') {
        await prisma.event.update({
          where: { id: fight.event.id },
          data: { eventStatus: 'LIVE' },
        });
      }

      console.log(`[Scheduled] ${fight.event.name}: ${fight.fighter1.lastName} vs ${fight.fighter2.lastName} → LIVE (scheduled time reached)`);
      updated++;
    }

    return updated;

  } catch (error: any) {
    console.error('[Scheduled] Error checking scheduled start times:', error.message);
    return 0;
  }
}

/**
 * Start the scheduled start time checker interval.
 * Runs every 60 seconds to check for fights that should go live.
 */
export function startScheduledStartTimeChecker(): void {
  if (scheduledStartTimeInterval) return; // Already running

  // Check immediately on startup
  checkScheduledStartTimes().then(count => {
    if (count > 0) console.log(`[Scheduled] Initial check: ${count} fights set to live`);
  });

  // Then check every 60 seconds
  scheduledStartTimeInterval = setInterval(async () => {
    const count = await checkScheduledStartTimes();
    if (count > 0) {
      console.log(`[Scheduled] Interval check: ${count} fights set to live`);
    }
  }, 60 * 1000);

  console.log('[Scheduled] Start time checker started (60s interval)');
}

/**
 * Stop the scheduled start time checker interval.
 */
export function stopScheduledStartTimeChecker(): void {
  if (scheduledStartTimeInterval) {
    clearInterval(scheduledStartTimeInterval);
    scheduledStartTimeInterval = null;
    console.log('[Scheduled] Start time checker stopped');
  }
}
