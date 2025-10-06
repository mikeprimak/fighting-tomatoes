// Mock Live Events API Routes
// Endpoints for testing live event workflows

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { generateMockEvent, deleteMockEvent, deleteAllMockEvents } from '../services/mockEventGenerator';
import {
  startSimulation,
  pauseSimulation,
  resumeSimulation,
  skipToNext,
  stopSimulation,
  getStatus,
  resetEvent,
} from '../services/mockLiveSimulator';

// Import types directly from shared package path
interface TimeScaleConfig {
  beforeEventStartDelay?: number;
  betweenFightsDelay?: number;
  roundDuration?: number;
  betweenRoundsDelay?: number;
  fightEndDelay?: number;
  speedMultiplier?: number;
}

interface ResetOptions {
  clearUserData?: boolean;
  clearPredictions?: boolean;
  clearRatings?: boolean;
  clearRoundScores?: boolean;
  clearReviews?: boolean;
}

// Validation schemas
const generateSchema = z.object({
  fightCount: z.number().min(1).max(20).optional(),
  eventName: z.string().optional(),
  includeTitle: z.boolean().optional(),
});

const startSchema = z.object({
  eventId: z.string().uuid(),
  timeScale: z
    .object({
      beforeEventStartDelay: z.number().optional(),
      betweenFightsDelay: z.number().optional(),
      roundDuration: z.number().optional(),
      betweenRoundsDelay: z.number().optional(),
      fightEndDelay: z.number().optional(),
      speedMultiplier: z.number().optional(),
    })
    .optional(),
  autoGenerateOutcomes: z.boolean().optional(),
});

const resetSchema = z.object({
  eventId: z.string().uuid(),
  clearUserData: z.boolean().optional(),
  clearPredictions: z.boolean().optional(),
  clearRatings: z.boolean().optional(),
  clearRoundScores: z.boolean().optional(),
  clearReviews: z.boolean().optional(),
});

const quickStartSchema = z.object({
  preset: z.enum(['default', 'fast', 'ultra-fast']).optional(),
});

export default async function mockLiveEventsRoutes(fastify: FastifyInstance) {
  // Generate mock event
  fastify.post('/generate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = generateSchema.parse(request.body);

      const result = await generateMockEvent(body);

      return reply.status(201).send({
        data: {
          eventId: result.event.id,
          eventName: result.event.name,
          fightCount: result.fights.length,
          fights: result.fights.map((fight) => ({
            id: fight.id,
            fighter1: `${fight.fighter1.firstName} ${fight.fighter1.lastName}`,
            fighter2: `${fight.fighter2.firstName} ${fight.fighter2.lastName}`,
            weightClass: fight.weightClass,
            isTitle: fight.isTitle,
            scheduledRounds: fight.scheduledRounds,
          })),
        },
      });
    } catch (error: any) {
      return reply.status(400).send({
        error: error.message || 'Failed to generate mock event',
        code: 'GENERATION_ERROR',
      });
    }
  });

  // Start simulation
  fastify.post('/start', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = startSchema.parse(request.body);

      const status = await startSimulation(
        body.eventId,
        body.timeScale,
        body.autoGenerateOutcomes
      );

      return reply.status(200).send({
        data: status,
      });
    } catch (error: any) {
      return reply.status(400).send({
        error: error.message || 'Failed to start simulation',
        code: 'SIMULATION_START_ERROR',
      });
    }
  });

  // Pause simulation
  fastify.post('/pause', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = pauseSimulation();

      return reply.status(200).send({
        data: status,
      });
    } catch (error: any) {
      return reply.status(400).send({
        error: error.message || 'Failed to pause simulation',
        code: 'SIMULATION_PAUSE_ERROR',
      });
    }
  });

  // Resume simulation
  fastify.post('/resume', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = resumeSimulation();

      return reply.status(200).send({
        data: status,
      });
    } catch (error: any) {
      return reply.status(400).send({
        error: error.message || 'Failed to resume simulation',
        code: 'SIMULATION_RESUME_ERROR',
      });
    }
  });

  // Skip to next state
  fastify.post('/skip-to-next', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await skipToNext();

      return reply.status(200).send({
        data: status,
      });
    } catch (error: any) {
      return reply.status(400).send({
        error: error.message || 'Failed to skip to next state',
        code: 'SIMULATION_SKIP_ERROR',
      });
    }
  });

  // Stop simulation
  fastify.post('/stop', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      stopSimulation();

      return reply.status(200).send({
        data: { message: 'Simulation stopped successfully' },
      });
    } catch (error: any) {
      return reply.status(400).send({
        error: error.message || 'Failed to stop simulation',
        code: 'SIMULATION_STOP_ERROR',
      });
    }
  });

  // Get status
  fastify.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const status = getStatus();

    return reply.status(200).send({
      data: status,
    });
  });

  // Reset event
  fastify.post('/reset', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = resetSchema.parse(request.body);

      await resetEvent(body.eventId, body as ResetOptions);

      return reply.status(200).send({
        data: {
          eventId: body.eventId,
          status: 'reset',
          message: 'Event reset successfully',
        },
      });
    } catch (error: any) {
      return reply.status(400).send({
        error: error.message || 'Failed to reset event',
        code: 'RESET_ERROR',
      });
    }
  });

  // Quick start (generate + start with preset)
  fastify.post('/quick-start', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = quickStartSchema.parse(request.body);

      // Stop any active simulation
      try {
        stopSimulation();
      } catch (e) {
        // Ignore if no simulation running
      }

      // Delete all previous mock events
      await deleteAllMockEvents();

      // Generate event
      const mockEvent = await generateMockEvent({
        fightCount: 10,
        eventName: `Quick Start Mock Event ${Date.now()}`,
        includeTitle: true,
      });

      // Determine timescale
      let timeScale: TimeScaleConfig = {};
      if (body.preset === 'fast') {
        timeScale = {
          beforeEventStartDelay: 5,
          betweenFightsDelay: 60,
          roundDuration: 45,
          betweenRoundsDelay: 30,
          fightEndDelay: 10,
        };
      } else if (body.preset === 'ultra-fast') {
        timeScale = {
          beforeEventStartDelay: 3,
          betweenFightsDelay: 30,
          roundDuration: 20,
          betweenRoundsDelay: 10,
          fightEndDelay: 5,
        };
      } else {
        // default
        timeScale = {
          beforeEventStartDelay: 10,
          betweenFightsDelay: 120,
          roundDuration: 90,
          betweenRoundsDelay: 60,
          fightEndDelay: 20,
        };
      }

      // Start simulation
      const status = await startSimulation(mockEvent.event.id, timeScale, true);

      return reply.status(201).send({
        data: {
          eventId: mockEvent.event.id,
          eventName: mockEvent.event.name,
          fightCount: mockEvent.fights.length,
          simulation: status,
        },
      });
    } catch (error: any) {
      return reply.status(400).send({
        error: error.message || 'Failed to quick start',
        code: 'QUICK_START_ERROR',
      });
    }
  });

  // Delete mock event
  fastify.delete('/events/:eventId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { eventId } = request.params as { eventId: string };

      await deleteMockEvent(eventId);

      return reply.status(200).send({
        data: { message: 'Mock event deleted successfully' },
      });
    } catch (error: any) {
      return reply.status(400).send({
        error: error.message || 'Failed to delete mock event',
        code: 'DELETE_ERROR',
      });
    }
  });

  // Delete all mock events
  fastify.delete('/events', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Stop any active simulation first
      try {
        stopSimulation();
      } catch (e) {
        // Ignore if no simulation running
      }

      const deletedCount = await deleteAllMockEvents();

      return reply.status(200).send({
        data: {
          message: `Deleted ${deletedCount} mock events`,
          count: deletedCount,
        },
      });
    } catch (error: any) {
      return reply.status(400).send({
        error: error.message || 'Failed to delete mock events',
        code: 'DELETE_ERROR',
      });
    }
  });
}
