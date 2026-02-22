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
import { startLiveTracking, getLiveTrackingStatus } from './liveEventTracker';

const prisma = new PrismaClient();

const LIFECYCLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const HARD_CAP_HOURS = 8;
const MINUTES_PER_FIGHT = 30;
const BUFFER_HOURS = 1;

let lifecycleTimer: ReturnType<typeof setInterval> | null = null;
let lastGitHubDispatchAt: number = 0;
const GITHUB_DISPATCH_COOLDOWN_MS = 4 * 60 * 1000; // Don't trigger more than once per 4 minutes

/**
 * Trigger the UFC Live Tracker GitHub Actions workflow via API.
 * This is more reliable than GitHub's cron scheduler.
 * Requires GITHUB_TOKEN env var with actions:write permission.
 */
async function triggerGitHubLiveTracker(eventId?: string): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('[Lifecycle] No GITHUB_TOKEN set, skipping GitHub Actions dispatch');
    return false;
  }

  // Cooldown: don't trigger if we recently dispatched
  const now = Date.now();
  if (now - lastGitHubDispatchAt < GITHUB_DISPATCH_COOLDOWN_MS) {
    const secsAgo = Math.round((now - lastGitHubDispatchAt) / 1000);
    console.log(`[Lifecycle] GitHub dispatch skipped (last dispatch ${secsAgo}s ago)`);
    return false;
  }

  try {
    const body: any = { ref: 'main' };
    if (eventId) {
      body.inputs = { event_id: eventId };
    }

    const response = await fetch(
      'https://api.github.com/repos/mikeprimak/fighting-tomatoes/actions/workflows/ufc-live-tracker.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (response.status === 204) {
      lastGitHubDispatchAt = now;
      console.log(`[Lifecycle] Triggered GitHub Actions UFC live tracker`);
      return true;
    } else {
      const text = await response.text();
      console.error(`[Lifecycle] GitHub dispatch failed (${response.status}): ${text}`);
      return false;
    }
  } catch (error: any) {
    console.error(`[Lifecycle] GitHub dispatch error: ${error.message}`);
    return false;
  }
}

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

  // Each step has its own try/catch so one step failing doesn't block the others.
  // Previously all 3 steps shared a single try/catch, meaning an error in Step 2
  // would prevent Step 3 (LIVE→COMPLETED) from ever running.

  // === STEP 1: UPCOMING → LIVE ===
  // Events whose earliest start time (or date fallback) has passed
  try {
    const upcomingEvents = await prisma.event.findMany({
      where: { eventStatus: 'UPCOMING' },
      select: {
        id: true,
        name: true,
        date: true,
        mainStartTime: true,
        prelimStartTime: true,
        earlyPrelimStartTime: true,
        scraperType: true,
        ufcUrl: true,
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

        // Trigger GitHub Actions live tracker for UFC events
        if (event.scraperType === 'ufc') {
          await triggerGitHubLiveTracker(event.id);
        }
      }
    }
  } catch (error: any) {
    console.error('[Lifecycle] Step 1 (UPCOMING→LIVE) error:', error.message);
  }

  // === STEP 1.5: Trigger GitHub Actions for LIVE UFC events ===
  // Dispatches the UFC live tracker workflow every ~5 minutes (with 4-min cooldown)
  try {
    const liveUfcEvent = await prisma.event.findFirst({
      where: {
        eventStatus: 'LIVE',
        scraperType: 'ufc',
      },
      select: { id: true, name: true },
    });

    if (liveUfcEvent) {
      await triggerGitHubLiveTracker(liveUfcEvent.id);
    }
  } catch (error: any) {
    console.error('[Lifecycle] Step 1.5 (GitHub dispatch) error:', error.message);
  }

  // === STEP 2: Section-based fight completion ===
  // For each LIVE event not handled by a production scraper
  try {
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
  } catch (error: any) {
    console.error('[Lifecycle] Step 2 (fight completion) error:', error.message);
  }

  // === STEP 3: LIVE → COMPLETED (estimated end time OR hard cap) ===
  // Re-fetch live events (some may have just been started in step 1)
  try {
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
  } catch (error: any) {
    console.error('[Lifecycle] Step 3 (LIVE→COMPLETED) error:', error.message);
  }

  // Log summary if anything happened
  if (results.eventsStarted > 0 || results.fightsCompleted > 0 || results.eventsCompleted > 0) {
    console.log(`[Lifecycle] Summary: ${results.eventsStarted} started, ${results.fightsCompleted} fights completed, ${results.eventsCompleted} events completed`);
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
