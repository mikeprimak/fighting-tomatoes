import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { checkAndSendPreEventReports } from './preEventReportService';

/**
 * Notification Scheduler Service
 *
 * Manages scheduled tasks for sending notifications:
 * - Pre-event reports: Sent 7-8 hours before main card (checked hourly)
 */

let scheduledTask: ScheduledTask | null = null;

/**
 * Initialize the notification scheduler
 * Starts a cron job that runs every hour to check for upcoming events
 */
export function initializeNotificationScheduler(): void {
  // Run every hour at :00 minutes
  // Cron pattern: '0 * * * *' = At minute 0 of every hour
  scheduledTask = cron.schedule('0 * * * *', async () => {
    console.log('[Notification Scheduler] Running hourly check for pre-event reports');
    try {
      await checkAndSendPreEventReports();
      console.log('[Notification Scheduler] Pre-event report check completed');
    } catch (error) {
      console.error('[Notification Scheduler] Error checking pre-event reports:', error);
    }
  });

  console.log('[Notification Scheduler] Initialized - will check for pre-event reports every hour');

  // Optionally run immediately on startup (useful for testing)
  // Uncomment the following lines to run on startup:
  // console.log('[Notification Scheduler] Running initial check on startup');
  // checkAndSendPreEventReports().catch(error => {
  //   console.error('[Notification Scheduler] Error in initial check:', error);
  // });
}

/**
 * Stop the notification scheduler
 * Useful for graceful shutdown
 */
export function stopNotificationScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    console.log('[Notification Scheduler] Stopped');
  }
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
