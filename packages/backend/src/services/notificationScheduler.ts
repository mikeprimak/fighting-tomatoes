import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { checkAndSendPreEventReports } from './preEventReportService';
import { runFollowFighterCron } from './followFighterNotifications';

/**
 * Notification Scheduler Service
 *
 * Manages scheduled tasks for sending notifications:
 * - Pre-event reports: Sent 7-8 hours before main card (checked hourly)
 * - Follow-fighter 3-day-warn + morning-of: Every 15 min
 */

let scheduledTask: ScheduledTask | null = null;
let followFighterTask: ScheduledTask | null = null;

/**
 * Initialize the notification scheduler
 * Starts cron jobs for pre-event reports (hourly) and follow-fighter
 * 3-day-warn + morning-of dispatch (every 15 min).
 */
export function initializeNotificationScheduler(): void {
  // Pre-event reports: hourly
  scheduledTask = cron.schedule('0 * * * *', async () => {
    console.log('[Notification Scheduler] Running hourly check for pre-event reports');
    try {
      await checkAndSendPreEventReports();
      console.log('[Notification Scheduler] Pre-event report check completed');
    } catch (error) {
      console.error('[Notification Scheduler] Error checking pre-event reports:', error);
    }
  });

  // Follow-fighter lanes: every 15 minutes
  followFighterTask = cron.schedule('*/15 * * * *', async () => {
    try {
      await runFollowFighterCron();
    } catch (error) {
      console.error('[Notification Scheduler] Error in follow-fighter cron:', error);
    }
  });

  console.log('[Notification Scheduler] Initialized - pre-event hourly + follow-fighter every 15min');
}

/**
 * Stop the notification scheduler
 * Useful for graceful shutdown
 */
export function stopNotificationScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  if (followFighterTask) {
    followFighterTask.stop();
    followFighterTask = null;
  }
  console.log('[Notification Scheduler] Stopped');
}

/**
 * Manually trigger a check for pre-event reports
 * Useful for testing or manual runs
 */
export async function manualCheckPreEventReports(): Promise<void> {
  console.log('[Notification Scheduler] Manual check triggered');
  try {
    await checkAndSendPreEventReports();
    console.log('[Notification Scheduler] Manual check completed');
  } catch (error) {
    console.error('[Notification Scheduler] Error in manual check:', error);
    throw error;
  }
}
