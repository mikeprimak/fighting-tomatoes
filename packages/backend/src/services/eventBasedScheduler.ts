/**
 * Event-Based Live Tracker Scheduler
 *
 * Efficiently schedules live event tracking by:
 * 1. Using setTimeout to start tracking at exact event times
 * 2. Re-scheduling on server startup
 * 3. Running a safety check every 15 minutes to catch any missed events
 *
 * Supports multiple promotions: UFC, Matchroom Boxing, etc.
 */

import { PrismaClient } from '@prisma/client';
import { startLiveTracking, stopLiveTracking, getLiveTrackingStatus } from './liveEventTracker';
import { startMatchroomLiveTracking, stopMatchroomLiveTracking, getMatchroomTrackingStatus } from './matchroomLiveTracker';
import { startOktagonLiveTracking, stopOktagonLiveTracking, getOktagonTrackingStatus } from './oktagonLiveTracker';
import { getTrackerType, LiveTrackerType } from '../config/liveTrackerConfig';
import { scheduleTimeBasedUpdates, cancelAllTimeBasedTimers } from './timeBasedFightStatusUpdater';

const prisma = new PrismaClient();

// How many minutes before event to start tracking (15 minutes early)
const PRE_EVENT_BUFFER_MINUTES = 15;

// Track scheduled timers so we can cancel them if needed
const scheduledTimers = new Map<string, NodeJS.Timeout>();

/**
 * Get the earliest start time for an event
 */
function getEarliestStartTime(event: {
  earlyPrelimStartTime: Date | null;
  prelimStartTime: Date | null;
  mainStartTime: Date | null;
}): Date | null {
  const times = [
    event.earlyPrelimStartTime,
    event.prelimStartTime,
    event.mainStartTime
  ].filter((t): t is Date => t != null);

  if (times.length === 0) return null;

  return times.sort((a, b) => a.getTime() - b.getTime())[0];
}

/**
 * Generate UFC URL from event data
 */
function getEventUrl(event: { ufcUrl: string | null; name: string }): string {
  if (event.ufcUrl) {
    return event.ufcUrl;
  }

  // Fallback: Generate from event name
  const eventSlug = event.name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  return `https://www.ufc.com/event/${eventSlug}`;
}

/**
 * Get promotion type from event.
 * Now uses centralized config from liveTrackerConfig.ts
 */
function getPromotionType(promotion: string | null): LiveTrackerType {
  return getTrackerType(promotion);
}

/**
 * Schedule live tracking for a specific event
 */
export async function scheduleEventTracking(eventId: string): Promise<void> {
  try {
    // Get event details
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        promotion: true,
        ufcUrl: true,
        isComplete: true,
        earlyPrelimStartTime: true,
        prelimStartTime: true,
        mainStartTime: true
      }
    });

    if (!event || event.isComplete) {
      return; // Event doesn't exist or is already complete
    }

    const earliestStartTime = getEarliestStartTime(event);
    if (!earliestStartTime) {
      console.log(`[Event Scheduler] No start time for ${event.name}, skipping`);
      return;
    }

    // Calculate when to start tracking (buffer minutes before start)
    const trackingStartTime = new Date(earliestStartTime.getTime() - PRE_EVENT_BUFFER_MINUTES * 60 * 1000);
    const now = new Date();
    const millisecondsUntilStart = trackingStartTime.getTime() - now.getTime();

    const trackerType = getPromotionType(event.promotion);

    // Route to time-based fallback for promotions without live trackers
    if (trackerType === 'time-based') {
      console.log(`[Event Scheduler] ⏰ ${event.name} (${event.promotion}) - Using TIME-BASED fallback`);
      await scheduleTimeBasedUpdates(event.id);
      return;
    }

    // For real-time trackers, check if event should have already started
    if (millisecondsUntilStart <= 0) {
      console.log(`[Event Scheduler] 🔴 ${event.name} is starting now or has started, tracking immediately (${trackerType})`);
      await startEventTracking(event.id, event.name, getEventUrl(event), trackerType);
      return;
    }

    // Cancel any existing timer for this event
    if (scheduledTimers.has(eventId)) {
      clearTimeout(scheduledTimers.get(eventId)!);
    }

    // Schedule tracking to start at the right time
    const minutesUntilStart = Math.floor(millisecondsUntilStart / (60 * 1000));
    console.log(`[Event Scheduler] 🔴 Scheduled ${event.name} (${trackerType}) to start tracking in ${minutesUntilStart} minutes`);
    console.log(`[Event Scheduler]   Start time: ${trackingStartTime.toISOString()}`);

    const timer = setTimeout(async () => {
      console.log(`[Event Scheduler] Timer triggered for ${event.name}`);
      await startEventTracking(event.id, event.name, getEventUrl(event), trackerType);
      scheduledTimers.delete(eventId);
    }, millisecondsUntilStart);

    scheduledTimers.set(eventId, timer);

  } catch (error: any) {
    console.error(`[Event Scheduler] Error scheduling event ${eventId}:`, error.message);
  }
}

/**
 * Start tracking an event using the appropriate live tracker.
 * Only called for promotions with real-time trackers (UFC, Matchroom, OKTAGON).
 */
async function startEventTracking(
  eventId: string,
  eventName: string,
  eventUrl: string,
  trackerType: 'ufc' | 'matchroom' | 'oktagon'
): Promise<void> {
  try {
    // Check if already tracking something (check all trackers)
    const ufcStatus = getLiveTrackingStatus();
    const matchroomStatus = getMatchroomTrackingStatus();
    const oktagonStatus = getOktagonTrackingStatus();

    if (ufcStatus.isRunning) {
      console.log(`[Event Scheduler] Already tracking UFC event ${ufcStatus.eventName}, skipping ${eventName}`);
      return;
    }
    if (matchroomStatus.isRunning) {
      console.log(`[Event Scheduler] Already tracking Matchroom event ${matchroomStatus.eventName}, skipping ${eventName}`);
      return;
    }
    if (oktagonStatus.isRunning) {
      console.log(`[Event Scheduler] Already tracking OKTAGON event ${oktagonStatus.eventName}, skipping ${eventName}`);
      return;
    }

    // Verify event is still not complete
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { isComplete: true }
    });

    if (event?.isComplete) {
      console.log(`[Event Scheduler] Event ${eventName} is already complete, not starting tracker`);
      return;
    }

    console.log(`[Event Scheduler] 🔴 Starting live tracking for ${eventName} (${trackerType})`);
    console.log(`[Event Scheduler]   URL: ${eventUrl}`);

    // Use appropriate tracker based on type
    if (trackerType === 'matchroom') {
      await startMatchroomLiveTracking({
        eventId,
        eventUrl,
        eventName,
        intervalSeconds: 60  // Matchroom: poll every 60s
      });
    } else if (trackerType === 'oktagon') {
      await startOktagonLiveTracking({
        eventId,
        eventUrl,
        eventName,
        intervalSeconds: 60  // Oktagon: poll every 60s
      });
    } else if (trackerType === 'ufc') {
      await startLiveTracking({
        eventId,
        eventUrl,
        eventName,
        intervalSeconds: 30  // UFC: poll every 30s
      });
    }

    console.log(`[Event Scheduler] ✅ Live tracking started successfully\n`);

  } catch (error: any) {
    console.error(`[Event Scheduler] Error starting tracking for ${eventName}:`, error.message);
  }
}

/**
 * Schedule all upcoming events (all promotions).
 * - Promotions with live trackers (UFC, Matchroom, OKTAGON) use real-time tracking
 * - Other promotions use time-based fallback
 * Called on server startup and after daily scraper runs
 */
export async function scheduleAllUpcomingEvents(): Promise<number> {
  console.log('\n[Event Scheduler] Scheduling all upcoming events...');

  try {
    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    // Also catch events that started recently (within last 12 hours) - handles server restarts
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    // Find ALL incomplete events: future events OR recently started events
    const upcomingEvents = await prisma.event.findMany({
      where: {
        isComplete: false,
        OR: [
          // Events with section start times in future
          { mainStartTime: { gte: now, lte: twoWeeksFromNow } },
          { prelimStartTime: { gte: now, lte: twoWeeksFromNow } },
          { earlyPrelimStartTime: { gte: now, lte: twoWeeksFromNow } },
          // Events with section times in the recent past (catch currently live events after restart)
          { mainStartTime: { gte: twelveHoursAgo, lt: now } },
          { prelimStartTime: { gte: twelveHoursAgo, lt: now } },
          { earlyPrelimStartTime: { gte: twelveHoursAgo, lt: now } },
          // Also include events by date if no section times set
          {
            date: { gte: now, lte: twoWeeksFromNow },
            mainStartTime: null,
            prelimStartTime: null,
            earlyPrelimStartTime: null
          },
          // Or events that started today by date (no section times)
          {
            date: { gte: twelveHoursAgo, lt: now },
            mainStartTime: null,
            prelimStartTime: null,
            earlyPrelimStartTime: null
          }
        ]
      },
      select: {
        id: true,
        name: true,
        promotion: true,
        date: true,
        earlyPrelimStartTime: true,
        prelimStartTime: true,
        mainStartTime: true
      },
      orderBy: { date: 'asc' }
    });

    console.log(`[Event Scheduler] Found ${upcomingEvents.length} upcoming events`);

    // Group events by tracker type for logging
    const liveTrackerEvents = upcomingEvents.filter(e => getTrackerType(e.promotion) !== 'time-based');
    const timeBasedEvents = upcomingEvents.filter(e => getTrackerType(e.promotion) === 'time-based');

    // Log counts by tracker type
    if (liveTrackerEvents.length > 0) {
      console.log(`   🔴 Live tracker events: ${liveTrackerEvents.length}`);
      const ufcCount = liveTrackerEvents.filter(e => e.promotion === 'UFC').length;
      const matchroomCount = liveTrackerEvents.filter(e => e.promotion?.toLowerCase().includes('matchroom')).length;
      const oktagonCount = liveTrackerEvents.filter(e => e.promotion?.toLowerCase().includes('oktagon')).length;
      if (ufcCount > 0) console.log(`      - UFC: ${ufcCount}`);
      if (matchroomCount > 0) console.log(`      - Matchroom: ${matchroomCount}`);
      if (oktagonCount > 0) console.log(`      - OKTAGON: ${oktagonCount}`);
    }
    if (timeBasedEvents.length > 0) {
      console.log(`   ⏰ Time-based fallback events: ${timeBasedEvents.length}`);
      // Group by promotion for logging
      const promotionCounts: Record<string, number> = {};
      timeBasedEvents.forEach(e => {
        const p = e.promotion || 'Unknown';
        promotionCounts[p] = (promotionCounts[p] || 0) + 1;
      });
      Object.entries(promotionCounts).forEach(([promo, count]) => {
        console.log(`      - ${promo}: ${count}`);
      });
    }

    // Schedule each event
    for (const event of upcomingEvents) {
      await scheduleEventTracking(event.id);
    }

    console.log(`[Event Scheduler] ✅ Scheduled ${upcomingEvents.length} events\n`);
    return upcomingEvents.length;

  } catch (error: any) {
    console.error('[Event Scheduler] Error scheduling events:', error.message);
    return 0;
  }
}

/**
 * Safety check: Look for events that should be tracked but aren't
 * Runs every 15 minutes as a backup
 */
export async function safetyCheckEvents(): Promise<void> {
  console.log('\n[Event Scheduler] Running safety check...');

  try {
    // Check if any tracker is already running
    const ufcStatus = getLiveTrackingStatus();
    const matchroomStatus = getMatchroomTrackingStatus();

    if (ufcStatus.isRunning) {
      console.log(`[Event Scheduler] UFC tracker running for ${ufcStatus.eventName}`);

      // Verify the current event should still be tracked
      if (ufcStatus.eventId) {
        const event = await prisma.event.findUnique({
          where: { id: ufcStatus.eventId },
          select: { isComplete: true, name: true }
        });

        if (event?.isComplete) {
          console.log(`[Event Scheduler] UFC event ${event.name} is complete, stopping tracker`);
          await stopLiveTracking();
        } else {
          console.log('[Event Scheduler] UFC event still live, continuing...\n');
          return;
        }
      }
    }

    if (matchroomStatus.isRunning) {
      console.log(`[Event Scheduler] Matchroom tracker running for ${matchroomStatus.eventName}`);

      if (matchroomStatus.eventId) {
        const event = await prisma.event.findUnique({
          where: { id: matchroomStatus.eventId },
          select: { isComplete: true, name: true }
        });

        if (event?.isComplete) {
          console.log(`[Event Scheduler] Matchroom event ${event.name} is complete, stopping tracker`);
          await stopMatchroomLiveTracking();
        } else {
          console.log('[Event Scheduler] Matchroom event still live, continuing...\n');
          return;
        }
      }
    }

    const oktagonStatus = getOktagonTrackingStatus();
    if (oktagonStatus.isRunning) {
      console.log(`[Event Scheduler] OKTAGON tracker running for ${oktagonStatus.eventName}`);

      if (oktagonStatus.eventId) {
        const event = await prisma.event.findUnique({
          where: { id: oktagonStatus.eventId },
          select: { isComplete: true, name: true }
        });

        if (event?.isComplete) {
          console.log(`[Event Scheduler] OKTAGON event ${event.name} is complete, stopping tracker`);
          await stopOktagonLiveTracking();
        } else {
          console.log('[Event Scheduler] OKTAGON event still live, continuing...\n');
          return;
        }
      }
    }

    // Look for events that should be tracked NOW
    const now = new Date();
    const bufferTime = new Date(now.getTime() + PRE_EVENT_BUFFER_MINUTES * 60 * 1000);
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    const eventToTrack = await prisma.event.findFirst({
      where: {
        OR: [
          { promotion: 'UFC' },
          { promotion: { contains: 'Matchroom', mode: 'insensitive' } },
          { promotion: { contains: 'OKTAGON', mode: 'insensitive' } },
        ],
        isComplete: false,
        AND: [
          {
            OR: [
              { mainStartTime: { lte: bufferTime, gte: twelveHoursAgo } },
              { prelimStartTime: { lte: bufferTime, gte: twelveHoursAgo } },
              { earlyPrelimStartTime: { lte: bufferTime, gte: twelveHoursAgo } }
            ]
          }
        ]
      },
      orderBy: { date: 'asc' }
    });

    if (eventToTrack) {
      const trackerType = getPromotionType(eventToTrack.promotion);
      // Safety check only applies to live tracker events (time-based events use scheduled timers)
      if (trackerType !== 'time-based') {
        console.log(`[Event Scheduler] Safety check found event to track: ${eventToTrack.name} (${trackerType})`);
        await startEventTracking(eventToTrack.id, eventToTrack.name, getEventUrl(eventToTrack), trackerType);
      }
    } else {
      console.log('[Event Scheduler] Safety check: No events need tracking\n');
    }

  } catch (error: any) {
    console.error('[Event Scheduler] Safety check error:', error.message);
  }
}

/**
 * Cancel all scheduled timers (for graceful shutdown)
 */
export function cancelAllScheduledEvents(): void {
  console.log(`[Event Scheduler] Cancelling ${scheduledTimers.size} scheduled live tracker events`);

  for (const [eventId, timer] of scheduledTimers.entries()) {
    clearTimeout(timer);
  }

  scheduledTimers.clear();

  // Also cancel time-based timers
  cancelAllTimeBasedTimers();
}

/**
 * Get info about currently scheduled events
 */
export function getScheduledEventsInfo(): {
  liveTrackerEvents: Array<{ eventId: string }>;
  timeBasedEvents: Array<{ eventId: string; timerCount: number }>;
} {
  const { getTimeBasedTimersInfo } = require('./timeBasedFightStatusUpdater');

  return {
    liveTrackerEvents: Array.from(scheduledTimers.keys()).map(eventId => ({ eventId })),
    timeBasedEvents: getTimeBasedTimersInfo(),
  };
}
