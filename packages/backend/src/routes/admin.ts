/**
 * Admin Routes
 * Endpoints for manually triggering background jobs and monitoring system health
 */

import { FastifyInstance } from 'fastify';
import {
  triggerDailyUFCScraper,
  triggerFailsafeCleanup,
  triggerLiveEventScheduler
} from '../services/backgroundJobs';
import { getFailsafeStatus } from '../services/failsafeCleanup';
import { scheduleAllUpcomingEvents, safetyCheckEvents } from '../services/eventBasedScheduler';

export async function adminRoutes(fastify: FastifyInstance) {
  // Manual trigger: Daily UFC Scraper
  fastify.post('/admin/trigger/daily-scraper', async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: Daily UFC scraper');
      const results = await triggerDailyUFCScraper();

      return reply.send({
        success: true,
        message: 'Daily UFC scraper completed',
        data: results
      });
    } catch (error: any) {
      console.error('[Admin] Daily scraper trigger failed:', error);
      return reply.code(500).send({
        error: 'Daily scraper failed',
        message: error.message
      });
    }
  });

  // Manual trigger: Failsafe Cleanup
  fastify.post('/admin/trigger/failsafe-cleanup', async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: Failsafe cleanup');
      const results = await triggerFailsafeCleanup();

      return reply.send({
        success: true,
        message: 'Failsafe cleanup completed',
        data: results
      });
    } catch (error: any) {
      console.error('[Admin] Failsafe cleanup trigger failed:', error);
      return reply.code(500).send({
        error: 'Failsafe cleanup failed',
        message: error.message
      });
    }
  });

  // Manual trigger: Live Event Scheduler (legacy, still works)
  fastify.post('/admin/trigger/live-event-scheduler', async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: Live event scheduler');
      await triggerLiveEventScheduler();

      return reply.send({
        success: true,
        message: 'Live event scheduler check completed'
      });
    } catch (error: any) {
      console.error('[Admin] Live event scheduler trigger failed:', error);
      return reply.code(500).send({
        error: 'Live event scheduler failed',
        message: error.message
      });
    }
  });

  // Manual trigger: Schedule All Upcoming Events
  fastify.post('/admin/trigger/schedule-events', async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: Schedule all upcoming events');
      const eventsScheduled = await scheduleAllUpcomingEvents();

      return reply.send({
        success: true,
        message: `Scheduled ${eventsScheduled} upcoming events`,
        data: { eventsScheduled }
      });
    } catch (error: any) {
      console.error('[Admin] Event scheduling failed:', error);
      return reply.code(500).send({
        error: 'Event scheduling failed',
        message: error.message
      });
    }
  });

  // Manual trigger: Event Scheduler Safety Check
  fastify.post('/admin/trigger/event-safety-check', async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: Event scheduler safety check');
      await safetyCheckEvents();

      return reply.send({
        success: true,
        message: 'Event safety check completed'
      });
    } catch (error: any) {
      console.error('[Admin] Event safety check failed:', error);
      return reply.code(500).send({
        error: 'Event safety check failed',
        message: error.message
      });
    }
  });

  // System Health Check
  fastify.get('/admin/health', async (request, reply) => {
    try {
      const failsafeStatus = await getFailsafeStatus();

      return reply.send({
        success: true,
        data: {
          failsafe: failsafeStatus,
          crons: {
            dailyScraper: {
              schedule: 'Daily at 12pm EST (5pm UTC)',
              cronExpression: '0 17 * * *'
            },
            failsafeCleanup: {
              schedule: 'Every hour',
              cronExpression: '0 * * * *'
            },
            eventScheduler: {
              schedule: 'Event-based (exact start times) + safety check every 15 minutes',
              cronExpression: '*/15 * * * *'
            }
          }
        }
      });
    } catch (error: any) {
      console.error('[Admin] Health check failed:', error);
      return reply.code(500).send({
        error: 'Health check failed',
        message: error.message
      });
    }
  });
}
