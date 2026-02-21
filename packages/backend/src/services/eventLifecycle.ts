/**
 * Event Lifecycle Service
 *
 * Single background job (every 5 minutes) that manages the full lifecycle
 * of events: UPCOMING → LIVE → COMPLETED.
 *
 * Replaces: timeBasedFightStatusUpdater, eventBasedScheduler, failsafeCleanup
 *
 * Three steps per run:
 *   1. UPCOMING → LIVE: events whose start time has passed
 *   2. Section-based fight completion: mark fights COMPLETED by card section
 *   3. LIVE → COMPLETED: events past their estimated end time (or 8h hard cap)
 */

import { PrismaClient } from '@prisma/client';
import { isProductionScraper } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

const LIFECYCLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const HARD_CAP_HOURS = 8;
const MINUTES_PER_FIGHT = 30;
const BUFFER_HOURS = 1;

let lifecycleTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Get the earliest known start time for an event (fallback to event.date).
 */
function getStartTime(event: {
  date: Date;
  mainStartTime?: Date | null;
  prelimStartTime?: Date | null;
  earlyPrelimStartTime?: Date | null;
}): Date {
  return event.earlyPrelimStartTime || event.prelimStartTime || event.mainStartTime || event.date;
}

/**
 * Normalize cardType for case-insensitive matching.
 * Maps variations like "Main Card", "MAIN CARD", " MAIN CARD" → "main card"
 * Maps "Undercard" → "prelim" (so it uses prelimStartTime)
 */
function normalizeCardType(cardType: string | null): string | null {
  if (!cardType) return null;
  const trimmed = cardType.trim().toLowerCase();
  if (trimmed === 'undercard') return 'prelim';
  return trimmed;
}

/**
 * Map a normalized cardType to the relevant section start time.
 */
function getSectionTime(
  normalizedCardType: string,
  event: { mainStartTime?: Date | null; prelimStartTime?: Date | null; earlyPrelimStartTime?: Date | null },
): Date | null {
  if (normalizedCardType.includes('early prelim')) return event.earlyPrelimStartTime || null;
  if (normalizedCardType.includes('prelim')) return event.prelimStartTime || null;
  if (normalizedCardType.includes('main')) return event.mainStartTime || null;
  return null;
}

/**
 * Run the full lifecycle check. Called every 5 minutes.
 */
export async function runEventLifecycleCheck(): Promise<{
  eventsStarted: number;
  fightsCompleted: number;
  eventsCompleted: number;
}> {
  const now = new Date();
  const results = { eventsStarted: 0, fightsCompleted: 0, eventsCompleted: 0 };

  try {
    // === STEP 1: UPCOMING → LIVE ===
    // Events whose earliest start time (or date fallback) has passed
    const upcomingEvents = await prisma.event.findMany({
      where: { eventStatus: 'UPCOMING' },
      select: {
        id: true,
        name: true,
        date: true,
        mainStartTime: true,
        prelimStartTime: true,
        earlyPrelimStartTime: true,
      },
    });

    for (const event of upcomingEvents) {
      const startTime = getStartTime(event);
      if (now >= startTime) {
        await prisma.event.update({
          where: { id: event.id },
          data: { eventStatus: 'LIVE' },
        });
        results.eventsStarted++;
        console.log(`[Lifecycle] UPCOMING → LIVE: ${event.name}`);
      }
    }

    // === STEP 2: Section-based fight completion ===
    // For each LIVE event not handled by a production scraper
    const liveEvents = await prisma.event.findMany({
      where: { eventStatus: 'LIVE' },
      select: {
        id: true,
        name: true,
        date: true,
        mainStartTime: true,
        prelimStartTime: true,
        earlyPrelimStartTime: true,
        scraperType: true,
        fights: {
          where: { fightStatus: 'UPCOMING' },
          select: {
            id: true,
            cardType: true,
          },
        },
      },
    });

    for (const event of liveEvents) {
      // Skip events handled by a production scraper
      if (isProductionScraper(event.scraperType)) continue;

      // Skip events with no upcoming fights to complete
      if (event.fights.length === 0) continue;

      const hasSectionTimes = !!(event.mainStartTime || event.prelimStartTime || event.earlyPrelimStartTime);
      const hasCardTypes = event.fights.some((f) => f.cardType !== null);

      if (hasSectionTimes && hasCardTypes) {
        // Section-based: complete fights whose section start time has passed
        for (const fight of event.fights) {
          const normalized = normalizeCardType(fight.cardType);
          if (!normalized) continue;

          const sectionTime = getSectionTime(normalized, event);
          if (sectionTime && now >= sectionTime) {
            await prisma.fight.update({
              where: { id: fight.id },
              data: {
                fightStatus: 'COMPLETED',
                completionMethod: 'lifecycle-section',
                completedAt: now,
              },
            });
            results.fightsCompleted++;
          }
        }
      } else {
        // Fallback: complete ALL upcoming fights when start time has passed
        const startTime = getStartTime(event);
        if (now >= startTime) {
          const updated = await prisma.fight.updateMany({
            where: {
              eventId: event.id,
              fightStatus: 'UPCOMING',
            },
            data: {
              fightStatus: 'COMPLETED',
              completionMethod: 'lifecycle-fallback',
              completedAt: now,
            },
          });
          results.fightsCompleted += updated.count;
          if (updated.count > 0) {
            console.log(`[Lifecycle] Completed ${updated.count} fights (fallback): ${event.name}`);
          }
        }
      }
    }

    // === STEP 3: LIVE → COMPLETED (estimated end time OR hard cap) ===
    // Re-fetch live events (some may have just been started in step 1)
    const liveEventsForCompletion = await prisma.event.findMany({
      where: { eventStatus: 'LIVE' },
      select: {
        id: true,
        name: true,
        date: true,
        mainStartTime: true,
        prelimStartTime: true,
        earlyPrelimStartTime: true,
        _count: { select: { fights: true } },
      },
    });

    for (const event of liveEventsForCompletion) {
      const startTime = getStartTime(event);
      const numFights = event._count.fights;

      // Estimated duration = (numFights * 30 min) + 1 hour buffer
      const estimatedMs = (numFights * MINUTES_PER_FIGHT + BUFFER_HOURS * 60) * 60 * 1000;
      const hardCapMs = HARD_CAP_HOURS * 60 * 60 * 1000;
      const completionMs = Math.min(estimatedMs, hardCapMs);

      const completionTime = new Date(startTime.getTime() + completionMs);

      if (now >= completionTime) {
        // Complete any remaining incomplete fights first
        const remainingUpdated = await prisma.fight.updateMany({
          where: {
            eventId: event.id,
            fightStatus: { in: ['UPCOMING', 'LIVE'] },
          },
          data: {
            fightStatus: 'COMPLETED',
            completionMethod: 'lifecycle-event-end',
            completedAt: now,
          },
        });
        results.fightsCompleted += remainingUpdated.count;

        // Complete the event
        await prisma.event.update({
          where: { id: event.id },
          data: {
            eventStatus: 'COMPLETED',
            completionMethod: 'lifecycle-auto',
          },
        });
        results.eventsCompleted++;

        const hours = Math.round((now.getTime() - startTime.getTime()) / (60 * 60 * 1000));
        console.log(`[Lifecycle] LIVE → COMPLETED: ${event.name} (${hours}h after start, ${numFights} fights)`);
      }
    }

    // Log summary if anything happened
    if (results.eventsStarted > 0 || results.fightsCompleted > 0 || results.eventsCompleted > 0) {
      console.log(`[Lifecycle] Summary: ${results.eventsStarted} started, ${results.fightsCompleted} fights completed, ${results.eventsCompleted} events completed`);
    }
  } catch (error: any) {
    console.error('[Lifecycle] Error during lifecycle check:', error.message);
  }

  return results;
}

/**
 * Start the lifecycle background job (every 5 minutes).
 */
export function startEventLifecycle(): void {
  if (lifecycleTimer) {
    console.log('[Lifecycle] Already running');
    return;
  }

  console.log('[Lifecycle] Starting event lifecycle checker (every 5 minutes)');

  // Run once on startup after a short delay
  setTimeout(async () => {
    try {
      await runEventLifecycleCheck();
    } catch (error) {
      console.error('[Lifecycle] Initial check failed:', error);
    }
  }, 5000);

  lifecycleTimer = setInterval(async () => {
    try {
      await runEventLifecycleCheck();
    } catch (error) {
      console.error('[Lifecycle] Periodic check failed:', error);
    }
  }, LIFECYCLE_INTERVAL_MS);
}

/**
 * Stop the lifecycle background job.
 */
export function stopEventLifecycle(): void {
  if (lifecycleTimer) {
    clearInterval(lifecycleTimer);
    lifecycleTimer = null;
    console.log('[Lifecycle] Event lifecycle checker stopped');
  }
}
