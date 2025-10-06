// Background Jobs Scheduler
// Runs periodic tasks like event completion checking

import * as cron from 'node-cron';
import { checkEventCompletion } from './eventCompletionChecker';

let eventCompletionJob: cron.ScheduledTask | null = null;

/**
 * Start all background jobs
 */
export function startBackgroundJobs(): void {
  console.log('[Background Jobs] Starting background jobs...');

  // Event completion checker - runs every 10 minutes
  eventCompletionJob = cron.schedule('*/10 * * * *', async () => {
    console.log('[Background Jobs] Running event completion check...');
    try {
      const results = await checkEventCompletion();
      if (results.length > 0) {
        console.log(`[Background Jobs] Completed ${results.length} events:`, results);
      }
    } catch (error) {
      console.error('[Background Jobs] Event completion check failed:', error);
    }
  });

  console.log('[Background Jobs] Event completion checker started (runs every 10 minutes)');

  // Run initial check immediately on startup
  setTimeout(async () => {
    console.log('[Background Jobs] Running initial event completion check...');
    try {
      const results = await checkEventCompletion();
      if (results.length > 0) {
        console.log(`[Background Jobs] Initial check completed ${results.length} events:`, results);
      } else {
        console.log('[Background Jobs] Initial check: no events to complete');
      }
    } catch (error) {
      console.error('[Background Jobs] Initial event completion check failed:', error);
    }
  }, 5000); // Wait 5 seconds after server starts
}

/**
 * Stop all background jobs (useful for graceful shutdown)
 */
export function stopBackgroundJobs(): void {
  console.log('[Background Jobs] Stopping background jobs...');

  if (eventCompletionJob) {
    eventCompletionJob.stop();
    console.log('[Background Jobs] Event completion checker stopped');
  }

  console.log('[Background Jobs] All background jobs stopped');
}

/**
 * Trigger event completion check manually (for testing/admin)
 */
export async function triggerEventCompletionCheck(): Promise<void> {
  console.log('[Background Jobs] Manual trigger: event completion check');
  const results = await checkEventCompletion();
  console.log(`[Background Jobs] Manual check completed ${results.length} events:`, results);
}
