/**
 * Live Events API Routes
 * Control live event tracking (start/stop/status)
 */

import { FastifyInstance } from 'fastify';
import liveTracker, { startLiveTracking, stopLiveTracking, getLiveTrackingStatus } from '../services/liveEventTracker';
import { getEventStatus } from '../services/ufcLiveParser';

export default async function liveEventsRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/live-events/start
   * Start live tracking for an event
   */
  fastify.post('/start', async (request, reply) => {
    try {
      const { eventUrl, eventName, intervalSeconds } = request.body as {
        eventUrl: string;
        eventName: string;
        intervalSeconds?: number;
      };

      if (!eventUrl || !eventName) {
        return reply.status(400).send({
          error: 'Missing required fields',
          code: 'VALIDATION_ERROR',
          details: 'eventUrl and eventName are required'
        });
      }

      // Check if already running
      const currentStatus = getLiveTrackingStatus();
      if (currentStatus.isRunning) {
        return reply.status(400).send({
          error: 'Tracker already running',
          code: 'TRACKER_RUNNING',
          details: `Currently tracking: ${currentStatus.eventName}`
        });
      }

      // Start tracking
      await startLiveTracking({
        eventUrl,
        eventName,
        intervalSeconds: intervalSeconds || 30
      });

      const status = getLiveTrackingStatus();

      return reply.status(200).send({
        data: {
          message: 'Live tracking started',
          status
        }
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to start live tracking',
        code: 'TRACKER_START_ERROR',
        details: error.message
      });
    }
  });

  /**
   * POST /api/live-events/stop
   * Stop live tracking
   */
  fastify.post('/stop', async (request, reply) => {
    try {
      const currentStatus = getLiveTrackingStatus();

      if (!currentStatus.isRunning) {
        return reply.status(400).send({
          error: 'Tracker not running',
          code: 'TRACKER_NOT_RUNNING'
        });
      }

      await stopLiveTracking();

      return reply.status(200).send({
        data: {
          message: 'Live tracking stopped',
          finalStatus: currentStatus
        }
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to stop live tracking',
        code: 'TRACKER_STOP_ERROR',
        details: error.message
      });
    }
  });

  /**
   * GET /api/live-events/status
   * Get current tracker status
   */
  fastify.get('/status', async (request, reply) => {
    try {
      const status = getLiveTrackingStatus();

      return reply.status(200).send({
        data: status
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get tracker status',
        code: 'TRACKER_STATUS_ERROR',
        details: error.message
      });
    }
  });

  /**
   * GET /api/live-events/event-status/:eventName
   * Get detailed status of an event from database
   */
  fastify.get('/event-status/:eventName', async (request, reply) => {
    try {
      const { eventName } = request.params as { eventName: string };

      const eventStatus = await getEventStatus(eventName);

      if (!eventStatus) {
        return reply.status(404).send({
          error: 'Event not found',
          code: 'EVENT_NOT_FOUND'
        });
      }

      return reply.status(200).send({
        data: eventStatus
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get event status',
        code: 'EVENT_STATUS_ERROR',
        details: error.message
      });
    }
  });

  /**
   * POST /api/live-events/quick-start-ufc320
   * Quick start for UFC 320 (convenience endpoint for tonight)
   */
  fastify.post('/quick-start-ufc320', async (request, reply) => {
    try {
      const currentStatus = getLiveTrackingStatus();
      if (currentStatus.isRunning) {
        return reply.status(400).send({
          error: 'Tracker already running',
          code: 'TRACKER_RUNNING',
          details: `Currently tracking: ${currentStatus.eventName}`
        });
      }

      await startLiveTracking({
        eventUrl: 'https://www.ufc.com/event/ufc-320',
        eventName: 'UFC 320',
        intervalSeconds: 30
      });

      const status = getLiveTrackingStatus();

      return reply.status(200).send({
        data: {
          message: '🔴 UFC 320 live tracking started!',
          status
        }
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to start UFC 320 tracking',
        code: 'UFC320_START_ERROR',
        details: error.message
      });
    }
  });
}
