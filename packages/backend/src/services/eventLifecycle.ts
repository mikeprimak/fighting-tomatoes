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
 *   3. LIVE → COMPLETED: events past their estimated end time (or 10h hard cap)
 */

import { PrismaClient } from '@prisma/client';
import { isProductionScraper, hasReliableLiveTracker } from '../config/liveTrackerConfig';
import { startLiveTracking, getLiveTrackingStatus } from './liveEventTracker';
import { notifyEventSectionStart, notifyFightStartViaRules } from './notificationService';

const prisma = new PrismaClient();

const LIFECYCLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const HARD_CAP_HOURS = 10;
const MINUTES_PER_FIGHT = 30;
const BUFFER_HOURS = 1;
// Lead time for section-start notifications on non-tracker events. Matches
// the manual-fight-follow notifyMinutesBefore so the user-facing promise is
// consistent across orgs.
const SECTION_NOTIF_LEAD_MS = 15 * 60 * 1000;
// Events without a production live tracker get a fixed live window so users
// can still rate the fights during/after the broadcast, even though we can't
// follow the card in real time.
const NO_TRACKER_LIVE_WINDOW_HOURS = 8;

let lifecycleTimer: ReturnType<typeof setInterval> | null = null;
const lastGitHubDispatchByWorkflow: Record<string, number> = {};
const GITHUB_DISPATCH_COOLDOWN_MS = 4 * 60 * 1000; // Don't trigger more than once per 4 minutes per workflow

// VPS Scraper Service URL (if set, dispatches go to VPS instead of GitHub Actions)
const VPS_SCRAPER_URL = process.env.VPS_SCRAPER_URL || ''; // e.g. http://178.156.231.241:3009
const VPS_SCRAPER_API_KEY = process.env.VPS_SCRAPER_API_KEY || '';

// Scraper types that have a VPS handler in scraperService.ts scrapeOnce().
// Anything not in this list (e.g. raf) must dispatch via GitHub Actions
// even when the VPS is configured — VPS would silently no-op them otherwise.
const VPS_SUPPORTED_SCRAPERS = ['ufc', 'oktagon', 'bkfc', 'onefc', 'pfl'];

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
 * Check if an event has a confirmed start time (not just a date fallback).
 * Events scraped from Tapology often only have a date (midnight) because
 * the scraper can't find the actual start time on the page.
 */
function hasConfirmedStartTime(event: {
  mainStartTime?: Date | null;
  prelimStartTime?: Date | null;
  earlyPrelimStartTime?: Date | null;
}): boolean {
  return !!(event.earlyPrelimStartTime || event.prelimStartTime || event.mainStartTime);
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
        useManualLiveTracker: true,
      },
    });

    for (const event of upcomingEvents) {
      // Skip events that only have a date (midnight) and no confirmed start time.
      // These are typically Tapology-scraped events where the scraper couldn't find
      // the actual start time. They require manual intervention via the admin panel.
      if (!hasConfirmedStartTime(event)) {
        const eventDate = event.date;
        // Only log once per event (when midnight has just passed)
        const msSinceMidnight = now.getTime() - eventDate.getTime();
        if (msSinceMidnight >= 0 && msSinceMidnight < LIFECYCLE_INTERVAL_MS * 2) {
          console.warn(`[Lifecycle] BLOCKED: ${event.name} has no confirmed start time (only date: ${eventDate.toISOString()}). Set start time or manually mark LIVE via admin panel.`);
        }
        continue;
      }

      const startTime = getStartTime(event);
      if (now >= startTime) {
        await prisma.event.update({
          where: { id: event.id },
          data: { eventStatus: 'LIVE' },
        });
        results.eventsStarted++;
        console.log(`[Lifecycle] UPCOMING → LIVE: ${event.name}`);

        // Manual-tracker events: fire the first-fight ping now. Subsequent
        // pings fire when admin marks each fight COMPLETED (admin.ts).
        if (event.useManualLiveTracker) {
          try {
            const firstFight = await prisma.fight.findFirst({
              where: { eventId: event.id, fightStatus: 'UPCOMING' },
              orderBy: { orderOnCard: 'asc' },
              include: {
                fighter1: { select: { firstName: true, lastName: true } },
                fighter2: { select: { firstName: true, lastName: true } },
              },
            });
            if (firstFight) {
              const fmt = (f: { firstName: string; lastName: string }) =>
                f.firstName && f.lastName ? `${f.firstName} ${f.lastName}` : (f.lastName || f.firstName);
              await notifyFightStartViaRules(
                firstFight.id,
                fmt(firstFight.fighter1),
                fmt(firstFight.fighter2),
              );
            }
          } catch (err: any) {
            console.error(`[Lifecycle] Manual-tracker first-fight notif failed for ${event.name}: ${err.message}`);
          }
        }

        // Trigger live tracker. VPS handles ufc/oktagon/bkfc/onefc; pfl and raf
        // have no VPS scraper handler so they go straight to GitHub Actions.
        // Tapology is deliberately excluded entirely — its tracker overwrites
        // lifecycle no-tracker completions back to UPCOMING when Tapology hasn't
        // yet posted results, so all tapology orgs use the no-tracker path.
        const workflowMap: Record<string, string> = {
          ufc: 'ufc-live-tracker.yml',
          oktagon: 'oktagon-live-tracker.yml',
          bkfc: 'bkfc-live-tracker.yml',
          onefc: 'onefc-live-tracker.yml',
          raf: 'raf-live-tracker.yml',
          pfl: 'pfl-live-tracker.yml',
        };
        if (event.scraperType && VPS_SUPPORTED_SCRAPERS.includes(event.scraperType)) {
          const vpsOk = await triggerVPSLiveTracker(event.id, event.scraperType, event.name);
          if (!vpsOk) {
            const workflow = workflowMap[event.scraperType];
            if (workflow) await triggerGitHubLiveTracker(workflow, { event_id: event.id });
          }
        } else if (event.scraperType && workflowMap[event.scraperType]) {
          await triggerGitHubLiveTracker(workflowMap[event.scraperType], { event_id: event.id });
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
        scraperType: { in: ['ufc', 'oktagon', 'bkfc', 'onefc', 'raf', 'pfl'] },
      },
      select: { id: true, name: true, scraperType: true },
    });

    const liveWorkflowMap: Record<string, string> = {
      ufc: 'ufc-live-tracker.yml',
      oktagon: 'oktagon-live-tracker.yml',
      bkfc: 'bkfc-live-tracker.yml',
      onefc: 'onefc-live-tracker.yml',
      raf: 'raf-live-tracker.yml',
      pfl: 'pfl-live-tracker.yml',
    };

    // VPS handles its supported scrapers; pfl/raf have no VPS handler and must
    // re-dispatch via GitHub Actions every tick (per-workflow cooldown applies).
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
        // Re-dispatch GH Actions for scrapers VPS doesn't handle (pfl, raf).
        for (const ev of liveScraperEvents) {
          if (ev.scraperType && !VPS_SUPPORTED_SCRAPERS.includes(ev.scraperType) && liveWorkflowMap[ev.scraperType]) {
            await triggerGitHubLiveTracker(liveWorkflowMap[ev.scraperType], { event_id: ev.id });
          }
        }
      } catch (error: any) {
        console.error(`[Lifecycle] VPS check failed: ${error.message}, falling back to GitHub Actions`);
        for (const ev of liveScraperEvents) {
          const workflow = liveWorkflowMap[ev.scraperType || ''];
          if (workflow) await triggerGitHubLiveTracker(workflow, { event_id: ev.id });
        }
      }
    } else {
      // No VPS configured — use GitHub Actions for all scraper types
      for (const ev of liveScraperEvents) {
        const workflow = liveWorkflowMap[ev.scraperType || ''];
        if (workflow) await triggerGitHubLiveTracker(workflow, { event_id: ev.id });
      }
    }
  } catch (error: any) {
    console.error('[Lifecycle] Step 1.5 (GitHub dispatch) error:', error.message);
  }

  // === STEP 1.7: Section-start notifications for non-tracker events ===
  // Tracker-backed events get walkout warnings via notifyFightStartViaRules
  // from the live parser. Events without a reliable real-time tracker have
  // no per-fight signal, so we fire one notification per (user, event-
  // section) ~15 min before each section's start time. notificationSent
  // prevents re-fires.
  //
  // Gate uses hasReliableLiveTracker (NOT isProductionScraper) — the
  // Tapology scraper is "production" but only delivers reliable per-fight
  // updates for a subset of its hub-mapped promotions. Top Rank, Golden Boy,
  // Gold Star, MVP, and Matchroom are scraperType=tapology but unreliable
  // live → they need this fallback.
  try {
    const candidateEvents = await prisma.event.findMany({
      where: {
        eventStatus: { in: ['UPCOMING', 'LIVE'] },
      },
      select: {
        id: true,
        name: true,
        date: true,
        scraperType: true,
        promotion: true,
        mainStartTime: true,
        prelimStartTime: true,
        earlyPrelimStartTime: true,
        useManualLiveTracker: true,
        fights: {
          select: { id: true, cardType: true },
        },
      },
    });

    for (const event of candidateEvents) {
      if (hasReliableLiveTracker(event.scraperType, event.promotion)) continue;
      // Manual-tracker events drive their own per-fight pings (Step 1 first
      // fight + admin set-status COMPLETED → next fight). Section ping would
      // duplicate.
      if (event.useManualLiveTracker) continue;
      if (event.fights.length === 0) continue;

      // Bucket fights by normalized cardType. Unknown/null cardType bundles
      // into the main-card bucket (best-effort fallback for orgs whose
      // scrapers don't populate cardType reliably).
      const buckets: Record<'early' | 'prelim' | 'main', string[]> = {
        early: [],
        prelim: [],
        main: [],
      };
      for (const f of event.fights) {
        const n = normalizeCardType(f.cardType);
        if (n && n.includes('early prelim')) buckets.early.push(f.id);
        else if (n && n.includes('prelim')) buckets.prelim.push(f.id);
        else buckets.main.push(f.id);
      }

      type Section = { label: string | null; startTime: Date; fightIds: string[] };
      const sections: Section[] = [];

      if (event.earlyPrelimStartTime && buckets.early.length > 0) {
        sections.push({ label: 'early prelims', startTime: event.earlyPrelimStartTime, fightIds: buckets.early });
      }
      if (event.prelimStartTime && buckets.prelim.length > 0) {
        sections.push({ label: 'prelims', startTime: event.prelimStartTime, fightIds: buckets.prelim });
      }
      if (event.mainStartTime && buckets.main.length > 0) {
        sections.push({ label: 'main card', startTime: event.mainStartTime, fightIds: buckets.main });
      }

      // Fallback: no usable section start times. Fire one notification at
      // the earliest known event time for the entire card.
      if (sections.length === 0) {
        sections.push({
          label: null,
          startTime: getStartTime(event),
          fightIds: event.fights.map((f) => f.id),
        });
      }

      for (const section of sections) {
        const triggerAt = new Date(section.startTime.getTime() - SECTION_NOTIF_LEAD_MS);
        if (now < triggerAt) continue;
        await notifyEventSectionStart(event.id, section.fightIds, event.name, section.label);
      }
    }
  } catch (error: any) {
    console.error('[Lifecycle] Step 1.7 (section-start notif) error:', error.message);
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
      // Skip events handled by a production scraper — their live tracker
      // handles fight-by-fight completion with accurate timestamps.
      if (isProductionScraper(event.scraperType)) continue;

      // Skip events with no upcoming fights to complete
      if (event.fights.length === 0) continue;

      // No-tracker events: flip ALL upcoming fights to COMPLETED as soon as the
      // event goes LIVE. Fights remain ratable during the LIVE window (step 3
      // keeps the event LIVE for NO_TRACKER_LIVE_WINDOW_HOURS), and users don't
      // have to wait for a section-based timer to expire before rating.
      const updated = await prisma.fight.updateMany({
        where: {
          eventId: event.id,
          fightStatus: 'UPCOMING',
        },
        data: {
          fightStatus: 'COMPLETED',
          completionMethod: 'lifecycle-no-tracker',
          completedAt: now,
        },
      });
      results.fightsCompleted += updated.count;
      if (updated.count > 0) {
        console.log(`[Lifecycle] No-tracker event LIVE: completed ${updated.count} fights immediately: ${event.name}`);
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
        scraperType: true,
        _count: { select: { fights: true } },
      },
    });

    for (const event of liveEventsForCompletion) {
      const startTime = getStartTime(event);
      const numFights = event._count.fights;

      let completionMs: number;
      if (!isProductionScraper(event.scraperType)) {
        // No-tracker events: fixed live window so users have time to rate
        // after watching. Independent of numFights.
        completionMs = NO_TRACKER_LIVE_WINDOW_HOURS * 60 * 60 * 1000;
      } else {
        // Tracker-backed events: estimated duration = (numFights * 30 min) + 1 hour buffer
        const estimatedMs = (numFights * MINUTES_PER_FIGHT + BUFFER_HOURS * 60) * 60 * 1000;
        const hardCapMs = HARD_CAP_HOURS * 60 * 60 * 1000;
        completionMs = Math.min(estimatedMs, hardCapMs);
      }

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
