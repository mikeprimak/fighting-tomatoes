/**
 * Live Event Scheduler
 * Automatically starts live tracking when events begin
 * Runs as a cron job checking every 5 minutes for events that should be tracked
 */

import { PrismaClient } from '@prisma/client';
import liveTracker, { startLiveTracking, stopLiveTracking, getLiveTrackingStatus } from './liveEventTracker';

const prisma = new PrismaClient();

// How many minutes before event to start tracking (default: 15 minutes early)
const PRE_EVENT_BUFFER_MINUTES = 15;

/**
 * Check for events that should be tracked now
 * Called by cron job every 5 minutes
 */
export async function checkAndStartLiveEvents(): Promise<void> {
  console.log('\n[Live Scheduler] Checking for events to track...');

  try {
    // Check if tracker is already running
    const currentStatus = getLiveTrackingStatus();
    if (currentStatus.isRunning) {
      console.log(`[Live Scheduler] Already tracking: ${currentStatus.eventName}`);

      // Check if current event should be stopped (event is complete)
      if (currentStatus.eventId) {
        const event = await prisma.event.findUnique({
          where: { id: currentStatus.eventId },
          select: { isComplete: true, name: true }
        });

        if (event?.isComplete) {
          console.log(`[Live Scheduler] Event ${event.name} is complete, stopping tracker`);
          await stopLiveTracking();
        } else {
          console.log(`[Live Scheduler] Event still live, continuing...`);
          return; // Keep tracking current event
        }
      } else {
        return; // Tracker running but no event ID, skip
      }
    }

    // Find events that should be tracked now
    const now = new Date();
    const bufferTime = new Date(now.getTime() + PRE_EVENT_BUFFER_MINUTES * 60 * 1000);

    // Look for UFC events that:
    // 1. Are not complete
    // 2. Have a start time within the buffer window (or already started)
    // 3. Are scheduled for today or in the past
    const upcomingEvent = await prisma.event.findFirst({
      where: {
        promotion: 'UFC',
        isComplete: false,
        OR: [
          { mainStartTime: { lte: bufferTime, gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) } },  // Main card within window (not more than 12hrs ago)
          { prelimStartTime: { lte: bufferTime, gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) } }, // Prelims within window
          { earlyPrelimStartTime: { lte: bufferTime, gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) } } // Early prelims within window
        ]
      },
      orderBy: {
        date: 'asc' // Get the earliest upcoming event
      }
    });

    if (!upcomingEvent) {
      console.log('[Live Scheduler] No events to track at this time');
      return;
    }

    // Determine the earliest start time for logging
    const earliestStartTime = [
      upcomingEvent.earlyPrelimStartTime,
      upcomingEvent.prelimStartTime,
      upcomingEvent.mainStartTime
    ].filter(t => t != null).sort((a, b) => a!.getTime() - b!.getTime())[0];

    const minutesUntilStart = earliestStartTime
      ? Math.floor((earliestStartTime.getTime() - now.getTime()) / (60 * 1000))
      : 0;

    console.log(`[Live Scheduler] Found event: ${upcomingEvent.name}`);
    console.log(`[Live Scheduler] Start time: ${earliestStartTime?.toISOString()} (in ${minutesUntilStart} minutes)`);

    // Generate UFC URL from event data
    let eventUrl: string;
    if (upcomingEvent.ufcUrl) {
      eventUrl = upcomingEvent.ufcUrl;
    } else {
      // Fallback: Generate from event name
      // e.g., "UFC Fight Night Ridder vs. Allen" -> "ufc-fight-night-ridder-vs-allen"
      const eventSlug = upcomingEvent.name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')  // Remove special chars
        .trim()
        .replace(/\s+/g, '-');         // Replace spaces with hyphens
      eventUrl = `https://www.ufc.com/event/${eventSlug}`;
    }

    console.log(`[Live Scheduler] Starting live tracker...`);
    console.log(`[Live Scheduler] URL: ${eventUrl}`);

    // Start tracking
    await startLiveTracking({
      eventId: upcomingEvent.id,
      eventUrl,
      eventName: upcomingEvent.name,
      intervalSeconds: 30
    });

    console.log(`[Live Scheduler] ✅ Live tracking started for ${upcomingEvent.name}\n`);

  } catch (error: any) {
    console.error('[Live Scheduler] Error:', error.message);
  }
}

/**
 * Manually trigger the scheduler check (for testing)
 */
export async function manualSchedulerCheck(): Promise<void> {
  console.log('[Live Scheduler] Manual check triggered');
  await checkAndStartLiveEvents();
}
