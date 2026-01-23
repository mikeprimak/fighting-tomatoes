/**
 * Live Events API Routes
 * Control live event tracking (start/stop/status)
 */

import { FastifyInstance } from 'fastify';
import liveTracker, { startLiveTracking, stopLiveTracking, getLiveTrackingStatus } from '../services/liveEventTracker';
import { getEventStatus } from '../services/ufcLiveParser';
import { startOneFCLiveTracking, stopOneFCLiveTracking, getOneFCTrackingStatus } from '../services/oneFCLiveTracker';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function liveEventsRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/live-events/start
   * Start live tracking for an event
   */
  fastify.post('/start', async (request, reply) => {
    try {
      const { eventId, eventUrl, eventName, intervalSeconds } = request.body as {
        eventId: string;
        eventUrl: string;
        eventName: string;
        intervalSeconds?: number;
      };

      if (!eventId || !eventUrl || !eventName) {
        return reply.status(400).send({
          error: 'Missing required fields',
          code: 'VALIDATION_ERROR',
          details: 'eventId, eventUrl and eventName are required'
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
        eventId,
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
   * POST /api/live-events/auto-start
   * Automatically find and start tracking the currently live event
   */
  fastify.post('/auto-start', async (request, reply) => {
    try {
      const currentStatus = getLiveTrackingStatus();
      if (currentStatus.isRunning) {
        return reply.status(400).send({
          error: 'Tracker already running',
          code: 'TRACKER_RUNNING',
          details: `Currently tracking: ${currentStatus.eventName}`
        });
      }

      // Find the currently live event based on time
      const now = new Date();

      // Look for events that have started (earliest start time <= now) and not completed
      const liveEvent = await prisma.event.findFirst({
        where: {
          isComplete: false,
          promotion: 'UFC',
          OR: [
            { earlyPrelimStartTime: { lte: now } },
            { prelimStartTime: { lte: now } },
            { mainStartTime: { lte: now } }
          ]
        },
        orderBy: {
          date: 'desc' // Get the most recent one
        }
      });

      if (!liveEvent) {
        return reply.status(404).send({
          error: 'No live event found',
          code: 'NO_LIVE_EVENT',
          details: 'No UFC event is currently live based on start times'
        });
      }

      // Use the ufcUrl from database if available, otherwise generate it
      let eventUrl: string;
      if (liveEvent.ufcUrl) {
        eventUrl = liveEvent.ufcUrl;
      } else {
        // Fallback: Extract event number/slug from name for URL
        // e.g., "UFC 320: Ankalaev vs. Pereira" -> "ufc-320"
        const eventSlug = liveEvent.name.toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
          .trim()
          .replace(/\s+/g, '-'); // Replace spaces with hyphens
        eventUrl = `https://www.ufc.com/event/${eventSlug}`;
      }

      await startLiveTracking({
        eventId: liveEvent.id,
        eventUrl,
        eventName: liveEvent.name,
        intervalSeconds: 30
      });

      const status = getLiveTrackingStatus();

      return reply.status(200).send({
        data: {
          message: `🔴 Auto-started tracking for ${liveEvent.name}`,
          eventId: liveEvent.id,
          eventUrl,
          status
        }
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to auto-start live tracking',
        code: 'AUTO_START_ERROR',
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

      // Find UFC 320 event ID
      const ufc320Event = await prisma.event.findFirst({
        where: {
          name: {
            contains: '320',
            mode: 'insensitive'
          }
        }
      });

      if (!ufc320Event) {
        return reply.status(404).send({
          error: 'UFC 320 not found',
          code: 'EVENT_NOT_FOUND'
        });
      }

      await startLiveTracking({
        eventId: ufc320Event.id,
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

  // ============== ONE FC LIVE TRACKING ROUTES ==============

  /**
   * POST /api/live-events/onefc/start
   * Start live tracking for a ONE FC event
   */
  fastify.post('/onefc/start', async (request, reply) => {
    try {
      const { eventId, eventUrl, eventName, intervalSeconds } = request.body as {
        eventId: string;
        eventUrl: string;
        eventName: string;
        intervalSeconds?: number;
      };

      if (!eventId || !eventUrl || !eventName) {
        return reply.status(400).send({
          error: 'Missing required fields',
          code: 'VALIDATION_ERROR',
          details: 'eventId, eventUrl and eventName are required'
        });
      }

      // Check if already running
      const currentStatus = getOneFCTrackingStatus();
      if (currentStatus.isRunning) {
        return reply.status(400).send({
          error: 'ONE FC tracker already running',
          code: 'TRACKER_RUNNING',
          details: `Currently tracking: ${currentStatus.eventName}`
        });
      }

      // Start tracking
      await startOneFCLiveTracking({
        eventId,
        eventUrl,
        eventName,
        intervalSeconds: intervalSeconds || 60
      });

      const status = getOneFCTrackingStatus();

      return reply.status(200).send({
        data: {
          message: '🔴 ONE FC live tracking started',
          status
        }
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to start ONE FC live tracking',
        code: 'ONEFC_TRACKER_START_ERROR',
        details: error.message
      });
    }
  });

  /**
   * POST /api/live-events/onefc/stop
   * Stop ONE FC live tracking
   */
  fastify.post('/onefc/stop', async (request, reply) => {
    try {
      const currentStatus = getOneFCTrackingStatus();

      if (!currentStatus.isRunning) {
        return reply.status(400).send({
          error: 'ONE FC tracker not running',
          code: 'TRACKER_NOT_RUNNING'
        });
      }

      await stopOneFCLiveTracking();

      return reply.status(200).send({
        data: {
          message: 'ONE FC live tracking stopped',
          finalStatus: currentStatus
        }
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to stop ONE FC live tracking',
        code: 'ONEFC_TRACKER_STOP_ERROR',
        details: error.message
      });
    }
  });

  /**
   * GET /api/live-events/onefc/status
   * Get current ONE FC tracker status
   */
  fastify.get('/onefc/status', async (request, reply) => {
    try {
      const status = getOneFCTrackingStatus();

      return reply.status(200).send({
        data: status
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get ONE FC tracker status',
        code: 'ONEFC_TRACKER_STATUS_ERROR',
        details: error.message
      });
    }
  });

  /**
   * POST /api/live-events/onefc/auto-start
   * Automatically find and start tracking a live ONE FC event
   */
  fastify.post('/onefc/auto-start', async (request, reply) => {
    try {
      const currentStatus = getOneFCTrackingStatus();
      if (currentStatus.isRunning) {
        return reply.status(400).send({
          error: 'ONE FC tracker already running',
          code: 'TRACKER_RUNNING',
          details: `Currently tracking: ${currentStatus.eventName}`
        });
      }

      // Find a currently live ONE FC event based on time
      const now = new Date();

      const liveEvent = await prisma.event.findFirst({
        where: {
          isComplete: false,
          promotion: 'ONE',
          OR: [
            { earlyPrelimStartTime: { lte: now } },
            { prelimStartTime: { lte: now } },
            { mainStartTime: { lte: now } }
          ]
        },
        orderBy: {
          date: 'desc'
        }
      });

      if (!liveEvent) {
        return reply.status(404).send({
          error: 'No live ONE FC event found',
          code: 'NO_LIVE_EVENT',
          details: 'No ONE FC event is currently live based on start times'
        });
      }

      // Generate ONE FC event URL from name
      // e.g., "ONE Friday Fights 139" -> "one-friday-fights-139"
      const eventSlug = liveEvent.name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      const eventUrl = `https://www.onefc.com/events/${eventSlug}/`;

      await startOneFCLiveTracking({
        eventId: liveEvent.id,
        eventUrl,
        eventName: liveEvent.name,
        intervalSeconds: 60
      });

      const status = getOneFCTrackingStatus();

      return reply.status(200).send({
        data: {
          message: `🔴 Auto-started ONE FC tracking for ${liveEvent.name}`,
          eventId: liveEvent.id,
          eventUrl,
          status
        }
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to auto-start ONE FC live tracking',
        code: 'ONEFC_AUTO_START_ERROR',
        details: error.message
      });
    }
  });
}
