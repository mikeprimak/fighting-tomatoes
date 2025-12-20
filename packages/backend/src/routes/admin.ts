/**
 * Admin Routes
 * Endpoints for manually triggering background jobs, monitoring system health,
 * and CRUD operations for events/fights (manual data entry)
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  triggerDailyUFCScraper,
  triggerFailsafeCleanup,
  triggerLiveEventScheduler
} from '../services/backgroundJobs';
import { getFailsafeStatus } from '../services/failsafeCleanup';
import { scheduleAllUpcomingEvents, safetyCheckEvents } from '../services/eventBasedScheduler';

// Zod schemas for admin CRUD operations
const CreateEventSchema = z.object({
  name: z.string().min(1).max(200),
  promotion: z.string().min(1).max(100),
  date: z.string().transform((val) => new Date(val)),
  venue: z.string().optional(),
  location: z.string().optional(),
  bannerImage: z.string().url().optional(),
  mainChannel: z.string().optional(),
  mainLink: z.string().url().optional(),
  prelimChannel: z.string().optional(),
  prelimLink: z.string().url().optional(),
  earlyPrelimStartTime: z.string().transform((val) => new Date(val)).optional(),
  prelimStartTime: z.string().transform((val) => new Date(val)).optional(),
  mainStartTime: z.string().transform((val) => new Date(val)).optional(),
});

const UpdateEventSchema = CreateEventSchema.partial();

const CreateFightSchema = z.object({
  eventId: z.string().uuid(),
  fighter1Id: z.string().uuid(),
  fighter2Id: z.string().uuid(),
  weightClass: z.string().optional(),
  isTitle: z.boolean().default(false),
  titleName: z.string().optional(),
  scheduledRounds: z.number().int().min(1).max(12).default(3),
  orderOnCard: z.number().int().min(1),
  cardType: z.string().optional(),
  fighter1Odds: z.string().optional(),
  fighter2Odds: z.string().optional(),
});

const UpdateFightSchema = CreateFightSchema.partial();

const CreateFighterSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  nickname: z.string().optional(),
  wins: z.number().int().min(0).default(0),
  losses: z.number().int().min(0).default(0),
  draws: z.number().int().min(0).default(0),
  gender: z.enum(['MALE', 'FEMALE']).default('MALE'),
  sport: z.enum(['MMA', 'BOXING', 'BARE_KNUCKLE_BOXING', 'MUAY_THAI', 'KICKBOXING']).default('MMA'),
  weightClass: z.string().optional(),
});

export async function adminRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  // ============================================
  // FIGHTER SEARCH (for autocomplete)
  // ============================================
  fastify.get('/admin/fighters/search', async (request, reply) => {
    const { q } = request.query as { q?: string };

    if (!q || q.length < 2) {
      return reply.send({ fighters: [] });
    }

    const fighters = await prisma.fighter.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { nickname: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        profileImage: true,
        wins: true,
        losses: true,
        draws: true,
        weightClass: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 10,
    });

    return reply.send({ fighters });
  });

  // ============================================
  // FIGHTER CREATE (inline for admin)
  // ============================================
  fastify.post('/admin/fighters', async (request, reply) => {
    try {
      const data = CreateFighterSchema.parse(request.body);

      const fighter = await prisma.fighter.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          nickname: data.nickname,
          wins: data.wins,
          losses: data.losses,
          draws: data.draws,
          gender: data.gender as any,
          sport: data.sport as any,
          weightClass: data.weightClass as any,
        },
      });

      return reply.code(201).send({ fighter });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.code(409).send({ error: 'Fighter already exists with this name' });
      }
      throw error;
    }
  });

  // ============================================
  // EVENTS CRUD
  // ============================================

  // List events (with optional promotion filter)
  fastify.get('/admin/events', async (request, reply) => {
    const { promotion, upcoming, limit = '50', offset = '0' } = request.query as {
      promotion?: string;
      upcoming?: string;
      limit?: string;
      offset?: string;
    };

    const where: any = {};
    if (promotion) {
      where.promotion = { equals: promotion, mode: 'insensitive' };
    }
    if (upcoming === 'true') {
      where.date = { gte: new Date() };
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { date: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
        include: {
          _count: { select: { fights: true } },
        },
      }),
      prisma.event.count({ where }),
    ]);

    return reply.send({ events, total });
  });

  // Get single event
  fastify.get('/admin/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        fights: {
          include: {
            fighter1: { select: { id: true, firstName: true, lastName: true, nickname: true, profileImage: true } },
            fighter2: { select: { id: true, firstName: true, lastName: true, nickname: true, profileImage: true } },
          },
          orderBy: { orderOnCard: 'asc' },
        },
      },
    });

    if (!event) {
      return reply.code(404).send({ error: 'Event not found' });
    }

    return reply.send({ event });
  });

  // Create event
  fastify.post('/admin/events', async (request, reply) => {
    try {
      const data = CreateEventSchema.parse(request.body);

      const event = await prisma.event.create({
        data: {
          name: data.name,
          promotion: data.promotion,
          date: data.date,
          venue: data.venue,
          location: data.location,
          bannerImage: data.bannerImage,
          mainChannel: data.mainChannel,
          mainLink: data.mainLink,
          prelimChannel: data.prelimChannel,
          prelimLink: data.prelimLink,
          earlyPrelimStartTime: data.earlyPrelimStartTime,
          prelimStartTime: data.prelimStartTime,
          mainStartTime: data.mainStartTime,
        },
      });

      return reply.code(201).send({ event });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.code(409).send({ error: 'Event already exists with this name and date' });
      }
      throw error;
    }
  });

  // Update event
  fastify.put('/admin/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = UpdateEventSchema.parse(request.body);

    const event = await prisma.event.update({
      where: { id },
      data,
    });

    return reply.send({ event });
  });

  // Delete event (cascades to fights)
  fastify.delete('/admin/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // First delete all fights for this event
    await prisma.fight.deleteMany({ where: { eventId: id } });

    // Then delete the event
    await prisma.event.delete({ where: { id } });

    return reply.send({ success: true });
  });

  // ============================================
  // FIGHTS CRUD
  // ============================================

  // Get fights for an event
  fastify.get('/admin/events/:eventId/fights', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };

    const fights = await prisma.fight.findMany({
      where: { eventId },
      include: {
        fighter1: { select: { id: true, firstName: true, lastName: true, nickname: true, profileImage: true } },
        fighter2: { select: { id: true, firstName: true, lastName: true, nickname: true, profileImage: true } },
      },
      orderBy: { orderOnCard: 'asc' },
    });

    return reply.send({ fights });
  });

  // Create fight
  fastify.post('/admin/fights', async (request, reply) => {
    try {
      const data = CreateFightSchema.parse(request.body);

      const fight = await prisma.fight.create({
        data: {
          eventId: data.eventId,
          fighter1Id: data.fighter1Id,
          fighter2Id: data.fighter2Id,
          weightClass: data.weightClass as any,
          isTitle: data.isTitle,
          titleName: data.titleName,
          scheduledRounds: data.scheduledRounds,
          orderOnCard: data.orderOnCard,
          cardType: data.cardType,
          fighter1Odds: data.fighter1Odds,
          fighter2Odds: data.fighter2Odds,
        },
        include: {
          fighter1: { select: { id: true, firstName: true, lastName: true, nickname: true } },
          fighter2: { select: { id: true, firstName: true, lastName: true, nickname: true } },
        },
      });

      return reply.code(201).send({ fight });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.code(409).send({ error: 'This fight already exists for this event' });
      }
      if (error.code === 'P2003') {
        return reply.code(400).send({ error: 'Invalid fighter or event ID' });
      }
      throw error;
    }
  });

  // Update fight
  fastify.put('/admin/fights/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateFightSchema.parse(request.body);

    // Exclude relation IDs and fields that need type casting
    const { eventId, fighter1Id, fighter2Id, weightClass, ...updateData } = parsed;

    const fight = await prisma.fight.update({
      where: { id },
      data: {
        ...updateData,
        // Cast weightClass to enum if provided
        ...(weightClass && { weightClass: weightClass as any }),
        // Only update relations if provided
        ...(fighter1Id && { fighter1: { connect: { id: fighter1Id } } }),
        ...(fighter2Id && { fighter2: { connect: { id: fighter2Id } } }),
        ...(eventId && { event: { connect: { id: eventId } } }),
      },
      include: {
        fighter1: { select: { id: true, firstName: true, lastName: true, nickname: true } },
        fighter2: { select: { id: true, firstName: true, lastName: true, nickname: true } },
      },
    });

    return reply.send({ fight });
  });

  // Delete fight
  fastify.delete('/admin/fights/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.fight.delete({ where: { id } });

    return reply.send({ success: true });
  });

  // ============================================
  // BACKGROUND JOB TRIGGERS (existing)
  // ============================================
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
