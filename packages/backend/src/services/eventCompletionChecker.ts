// Event Completion Checker
// Auto-completes events based on multiple signals: all fights done, timeouts, etc.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Time constants (in milliseconds)
const TWELVE_HOURS = 12 * 60 * 60 * 1000;
const AVERAGE_3_ROUND_FIGHT = 18 * 60 * 1000; // 18 minutes
const AVERAGE_5_ROUND_FIGHT = 28 * 60 * 1000; // 28 minutes
const BETWEEN_FIGHTS_BUFFER = 8 * 60 * 1000; // 8 minutes
const EXTRA_BUFFER = 30 * 60 * 1000; // 30 minute safety buffer

interface CompletionResult {
  eventId: string;
  eventName: string;
  method: 'all_fights' | 'timeout_12hr' | 'timeout_smart' | 'already_complete';
  message: string;
}

/**
 * Calculate expected event duration based on fight card
 */
function calculateExpectedDuration(
  totalFights: number,
  titleFights: number
): number {
  const regularFights = totalFights - titleFights;
  const fightsDuration =
    regularFights * AVERAGE_3_ROUND_FIGHT + titleFights * AVERAGE_5_ROUND_FIGHT;
  const bufferTime = totalFights * BETWEEN_FIGHTS_BUFFER + EXTRA_BUFFER;

  return fightsDuration + bufferTime;
}

/**
 * Check and auto-complete events that should be finished
 */
export async function checkEventCompletion(): Promise<CompletionResult[]> {
  const results: CompletionResult[] = [];

  try {
    // Find all events that started but aren't complete
    const liveEvents = await prisma.event.findMany({
      where: {
        hasStarted: true,
        isComplete: false,
      },
      include: {
        fights: {
          select: {
            id: true,
            isComplete: true,
            isTitle: true,
            hasStarted: true,
          },
        },
      },
    });

    console.log(`[Event Completion Checker] Found ${liveEvents.length} live events to check`);

    for (const event of liveEvents) {
      const now = new Date();
      const eventStartTime = event.mainStartTime || event.date;
      const timeSinceStart = now.getTime() - eventStartTime.getTime();

      // Method 1: All fights complete
      const totalFights = event.fights.length;
      const completedFights = event.fights.filter((f) => f.isComplete).length;
      const allFightsComplete = totalFights > 0 && completedFights === totalFights;

      if (allFightsComplete) {
        await completeEvent(event.id, 'all_fights');
        results.push({
          eventId: event.id,
          eventName: event.name,
          method: 'all_fights',
          message: `All ${totalFights} fights completed`,
        });
        console.log(
          `[Event Completion Checker] Completed ${event.name}: all fights done (${completedFights}/${totalFights})`
        );
        continue;
      }

      // Method 2: 12-hour hard timeout
      if (timeSinceStart > TWELVE_HOURS) {
        await completeEvent(event.id, 'timeout_12hr');
        await markRemainingFightsComplete(event.id);
        results.push({
          eventId: event.id,
          eventName: event.name,
          method: 'timeout_12hr',
          message: `12-hour timeout expired (${Math.round(timeSinceStart / (60 * 60 * 1000))}hrs since start)`,
        });
        console.log(
          `[Event Completion Checker] Completed ${event.name}: 12hr timeout (${completedFights}/${totalFights} fights done)`
        );
        continue;
      }

      // Method 3: Smart timeout based on card size
      const titleFights = event.fights.filter((f) => f.isTitle).length;
      const expectedDuration = calculateExpectedDuration(totalFights, titleFights);

      if (timeSinceStart > expectedDuration) {
        await completeEvent(event.id, 'timeout_smart');
        await markRemainingFightsComplete(event.id);
        results.push({
          eventId: event.id,
          eventName: event.name,
          method: 'timeout_smart',
          message: `Smart timeout expired (expected ${Math.round(expectedDuration / (60 * 60 * 1000))}hrs, actual ${Math.round(timeSinceStart / (60 * 60 * 1000))}hrs)`,
        });
        console.log(
          `[Event Completion Checker] Completed ${event.name}: smart timeout (${completedFights}/${totalFights} fights done)`
        );
        continue;
      }

      // Event still legitimately live
      console.log(
        `[Event Completion Checker] ${event.name} still live: ${completedFights}/${totalFights} fights done, ${Math.round(timeSinceStart / (60 * 1000))} mins elapsed`
      );
    }

    // Also check for events that never started but are way past their date
    const staleEvents = await prisma.event.findMany({
      where: {
        hasStarted: false,
        isComplete: false,
        date: {
          lt: new Date(Date.now() - 18 * 60 * 60 * 1000), // 18 hours ago
        },
      },
    });

    for (const event of staleEvents) {
      await completeEvent(event.id, 'timeout_smart');
      results.push({
        eventId: event.id,
        eventName: event.name,
        method: 'timeout_smart',
        message: 'Event never started, 18hrs past scheduled date',
      });
      console.log(
        `[Event Completion Checker] Completed stale event ${event.name}: never started, 18hrs past date`
      );
    }

    if (results.length === 0) {
      console.log(`[Event Completion Checker] No events to complete`);
    }

    return results;
  } catch (error) {
    console.error('[Event Completion Checker] Error:', error);
    throw error;
  }
}

/**
 * Mark an event as complete with a completion method
 */
async function completeEvent(
  eventId: string,
  method: 'all_fights' | 'timeout_12hr' | 'timeout_smart' | 'manual' | 'scraper'
): Promise<void> {
  await prisma.event.update({
    where: { id: eventId },
    data: {
      isComplete: true,
      completionMethod: method,
    },
  });
}

/**
 * Mark all remaining fights in an event as complete
 * (Used when event times out before all fights finish)
 */
async function markRemainingFightsComplete(eventId: string): Promise<void> {
  const incompleteFights = await prisma.fight.findMany({
    where: {
      eventId,
      isComplete: false,
    },
  });

  if (incompleteFights.length > 0) {
    await prisma.fight.updateMany({
      where: {
        eventId,
        isComplete: false,
      },
      data: {
        isComplete: true,
        // Don't set winner/method - leave as null to indicate no result
      },
    });

    console.log(
      `[Event Completion Checker] Marked ${incompleteFights.length} remaining fights as complete (no results)`
    );
  }
}

/**
 * Check a specific event (useful for manual triggers or testing)
 */
export async function checkSpecificEvent(eventId: string): Promise<CompletionResult | null> {
  const results = await checkEventCompletion();
  return results.find((r) => r.eventId === eventId) || null;
}

/**
 * Manually complete an event (admin action)
 */
export async function manuallyCompleteEvent(eventId: string): Promise<void> {
  await completeEvent(eventId, 'manual');
  await markRemainingFightsComplete(eventId);
  console.log(`[Event Completion Checker] Manually completed event: ${eventId}`);
}
