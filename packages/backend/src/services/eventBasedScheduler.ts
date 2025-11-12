/**
 * Event-Based Live Tracker Scheduler
 *
 * Efficiently schedules live event tracking by:
 * 1. Using setTimeout to start tracking at exact event times
 * 2. Re-scheduling on server startup
 * 3. Running a safety check every 15 minutes to catch any missed events
 */

import { PrismaClient } from '@prisma/client';
import { startLiveTracking, stopLiveTracking, getLiveTrackingStatus } from './liveEventTracker';

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

    // If event should have already started (or is starting very soon)
    if (millisecondsUntilStart <= 0) {
      console.log(`[Event Scheduler] Event ${event.name} is starting now or has started, tracking immediately`);
      await startEventTracking(event.id, event.name, getEventUrl(event));
      return;
    }

    // Cancel any existing timer for this event
    if (scheduledTimers.has(eventId)) {
      clearTimeout(scheduledTimers.get(eventId)!);
    }

    // Schedule tracking to start at the right time
    const minutesUntilStart = Math.floor(millisecondsUntilStart / (60 * 1000));
    console.log(`[Event Scheduler] Scheduled ${event.name} to start tracking in ${minutesUntilStart} minutes`);
    console.log(`[Event Scheduler]   Start time: ${trackingStartTime.toISOString()}`);

    const timer = setTimeout(async () => {
      console.log(`[Event Scheduler] Timer triggered for ${event.name}`);
      await startEventTracking(event.id, event.name, getEventUrl(event));
      scheduledTimers.delete(eventId);
    }, millisecondsUntilStart);

    scheduledTimers.set(eventId, timer);

  } catch (error: any) {
    console.error(`[Event Scheduler] Error scheduling event ${eventId}:`, error.message);
  }
}

/**
 * Start tracking an event
 */
async function startEventTracking(eventId: string, eventName: string, eventUrl: string): Promise<void> {
  try {
    // Check if already tracking something
    const currentStatus = getLiveTrackingStatus();
    if (currentStatus.isRunning) {
      console.log(`[Event Scheduler] Already tracking ${currentStatus.eventName}, skipping ${eventName}`);
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

    console.log(`[Event Scheduler] 🔴 Starting live tracking for ${eventName}`);
    console.log(`[Event Scheduler]   URL: ${eventUrl}`);

    await startLiveTracking({
      eventId,
      eventUrl,
      eventName,
      intervalSeconds: 30
    });

    console.log(`[Event Scheduler] ✅ Live tracking started successfully\n`);

  } catch (error: any) {
    console.error(`[Event Scheduler] Error starting tracking for ${eventName}:`, error.message);
  }
}

/**
 * Schedule all upcoming UFC events
 * Called on server startup and after daily scraper runs
 */
export async function scheduleAllUpcomingEvents(): Promise<number> {
  console.log('\n[Event Scheduler] Scheduling all upcoming events...');

  try {
    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Find all upcoming UFC events in the next 2 weeks
    const upcomingEvents = await prisma.event.findMany({
      where: {
        promotion: 'UFC',
        isComplete: false,
        OR: [
          { mainStartTime: { gte: now, lte: twoWeeksFromNow } },
          { prelimStartTime: { gte: now, lte: twoWeeksFromNow } },
          { earlyPrelimStartTime: { gte: now, lte: twoWeeksFromNow } }
        ]
      },
      select: {
        id: true,
        name: true,
        date: true,
        earlyPrelimStartTime: true,
        prelimStartTime: true,
        mainStartTime: true
      },
      orderBy: { date: 'asc' }
    });

    console.log(`[Event Scheduler] Found ${upcomingEvents.length} upcoming events`);

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
    // Check if tracker is already running
    const currentStatus = getLiveTrackingStatus();
    if (currentStatus.isRunning) {
      console.log(`[Event Scheduler] Tracker already running for ${currentStatus.eventName}`);

      // Verify the current event should still be tracked
      if (currentStatus.eventId) {
        const event = await prisma.event.findUnique({
          where: { id: currentStatus.eventId },
          select: { isComplete: true, name: true }
        });

        if (event?.isComplete) {
          console.log(`[Event Scheduler] Current event ${event.name} is complete, stopping tracker`);
          await stopLiveTracking();
        } else {
          console.log('[Event Scheduler] Current event still live, continuing...\n');
          return;
        }
      }
    }

    // Look for events that should be tracked NOW
    const now = new Date();
    const bufferTime = new Date(now.getTime() + PRE_EVENT_BUFFER_MINUTES * 60 * 1000);

    const eventToTrack = await prisma.event.findFirst({
      where: {
        promotion: 'UFC',
        isComplete: false,
        OR: [
          { mainStartTime: { lte: bufferTime, gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) } },
          { prelimStartTime: { lte: bufferTime, gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) } },
          { earlyPrelimStartTime: { lte: bufferTime, gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) } }
        ]
      },
      orderBy: { date: 'asc' }
    });

    if (eventToTrack) {
      console.log(`[Event Scheduler] Safety check found event to track: ${eventToTrack.name}`);
      await startEventTracking(eventToTrack.id, eventToTrack.name, getEventUrl(eventToTrack));
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
  console.log(`[Event Scheduler] Cancelling ${scheduledTimers.size} scheduled events`);

  for (const [eventId, timer] of scheduledTimers.entries()) {
    clearTimeout(timer);
  }

  scheduledTimers.clear();
}

/**
 * Get info about currently scheduled events
 */
export function getScheduledEventsInfo(): Array<{ eventId: string }> {
  return Array.from(scheduledTimers.keys()).map(eventId => ({ eventId }));
}
