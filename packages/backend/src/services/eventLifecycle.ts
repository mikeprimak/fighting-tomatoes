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
const lastGitHubDispatchByWorkflow: Record<string, number> = {};
const GITHUB_DISPATCH_COOLDOWN_MS = 4 * 60 * 1000; // Don't trigger more than once per 4 minutes per workflow

// VPS Scraper Service URL (if set, dispatches go to VPS instead of GitHub Actions)
const VPS_SCRAPER_URL = process.env.VPS_SCRAPER_URL || ''; // e.g. http://178.156.231.241:3009
const VPS_SCRAPER_API_KEY = process.env.VPS_SCRAPER_API_KEY || '';

/**
 * Trigger the VPS scraper service to start tracking an event.
 * The VPS runs scrapers every 30 seconds (vs 5 min via GitHub Actions).
 */
async function triggerVPSLiveTracker(
  eventId: string,
  scraperType: string,
  eventName: string,
): Promise<boolean> {
  if (!VPS_SCRAPER_URL) return false;

  try {
    const response = await fetch(`${VPS_SCRAPER_URL}/track/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VPS_SCRAPER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventId, scraperType, eventName }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[Lifecycle] VPS tracker started for ${eventName}: ${JSON.stringify(data)}`);
      return true;
    } else {
      const text = await response.text();
      console.error(`[Lifecycle] VPS dispatch failed (${response.status}): ${text}`);
      return false;
    }
  } catch (error: any) {
    console.error(`[Lifecycle] VPS dispatch error: ${error.message}`);
    return false;
  }
}

/**
 * Trigger the UFC Live Tracker GitHub Actions workflow via API.
 * Fallback when VPS is not configured.
 * Requires GITHUB_TOKEN env var with actions:write permission.
 */
async function triggerGitHubLiveTracker(
  workflow: string,
  inputs?: Record<string, string>,
): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('[Lifecycle] No GITHUB_TOKEN set, skipping GitHub Actions dispatch');
    return false;
  }

  // Per-workflow cooldown: don't trigger if we recently dispatched this specific workflow
  const now = Date.now();
  const lastDispatch = lastGitHubDispatchByWorkflow[workflow] || 0;
  if (now - lastDispatch < GITHUB_DISPATCH_COOLDOWN_MS) {
    const secsAgo = Math.round((now - lastDispatch) / 1000);
    console.log(`[Lifecycle] GitHub dispatch skipped for ${workflow} (last dispatch ${secsAgo}s ago)`);
    return false;
  }

  try {
    const body: any = { ref: 'main' };
    if (inputs) {
      body.inputs = inputs;
    }

    const response = await fetch(
      `https://api.github.com/repos/mikeprimak/fighting-tomatoes/actions/workflows/${workflow}/dispatches`,
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
      lastGitHubDispatchByWorkflow[workflow] = now;
      console.log(`[Lifecycle] Triggered GitHub Actions workflow: ${workflow}`);
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

        // Trigger live tracker: try VPS first, fall back to GitHub Actions
        if (event.scraperType && ['ufc', 'oktagon', 'tapology', 'bkfc', 'onefc'].includes(event.scraperType)) {
          const vpsOk = await triggerVPSLiveTracker(event.id, event.scraperType, event.name);
          if (!vpsOk) {
            // Fallback to GitHub Actions
            const workflowMap: Record<string, string> = {
              ufc: 'ufc-live-tracker.yml',
              oktagon: 'oktagon-live-tracker.yml',
              tapology: 'tapology-live-tracker.yml',
              bkfc: 'bkfc-live-tracker.yml',
              onefc: 'onefc-live-tracker.yml',
            };
            const workflow = workflowMap[event.scraperType];
            if (workflow) await triggerGitHubLiveTracker(workflow, { event_id: event.id });
          }
        }
      }
    }
  } catch (error: any) {
    console.error('[Lifecycle] Step 1 (UPCOMING→LIVE) error:', error.message);
  }

  // === STEP 1.5: Trigger GitHub Actions for LIVE events with scrapers ===
  // Dispatches live tracker workflows every ~5 minutes (per-workflow cooldown)
  try {
    const liveScraperEvents = await prisma.event.findMany({
      where: {
        eventStatus: 'LIVE',
        scraperType: { in: ['ufc', 'oktagon', 'tapology', 'bkfc', 'onefc'] },
      },
      select: { id: true, name: true, scraperType: true },
    });

    // If VPS is configured, just tell it to check for active events (single call)
    if (VPS_SCRAPER_URL) {
      try {
        const response = await fetch(`${VPS_SCRAPER_URL}/track/check`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${VPS_SCRAPER_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json() as { started?: string[]; stopped?: string[] };
          if (data.started && data.started.length > 0) console.log(`[Lifecycle] VPS auto-started: ${data.started.join(', ')}`);
          if (data.stopped && data.stopped.length > 0) console.log(`[Lifecycle] VPS auto-stopped: ${data.stopped.join(', ')}`);
        }
      } catch (error: any) {
        console.error(`[Lifecycle] VPS check failed: ${error.message}, falling back to GitHub Actions`);
        // Fall through to GitHub Actions below
        for (const liveScraperEvent of liveScraperEvents) {
          const workflowMap: Record<string, string> = {
            ufc: 'ufc-live-tracker.yml', oktagon: 'oktagon-live-tracker.yml',
            tapology: 'tapology-live-tracker.yml', bkfc: 'bkfc-live-tracker.yml',
            onefc: 'onefc-live-tracker.yml',
          };
          const workflow = workflowMap[liveScraperEvent.scraperType || ''] || 'tapology-live-tracker.yml';
          await triggerGitHubLiveTracker(workflow, { event_id: liveScraperEvent.id });
        }
      }
    } else {
      // No VPS configured — use GitHub Actions (original behavior)
      for (const liveScraperEvent of liveScraperEvents) {
        const workflowMap: Record<string, string> = {
          ufc: 'ufc-live-tracker.yml', oktagon: 'oktagon-live-tracker.yml',
          tapology: 'tapology-live-tracker.yml', bkfc: 'bkfc-live-tracker.yml',
          onefc: 'onefc-live-tracker.yml',
        };
        const workflow = workflowMap[liveScraperEvent.scraperType || ''] || 'tapology-live-tracker.yml';
        await triggerGitHubLiveTracker(workflow, { event_id: liveScraperEvent.id });
      }
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
