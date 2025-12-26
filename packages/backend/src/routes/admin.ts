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
  triggerLiveEventScheduler,
  triggerBKFCScraper,
  triggerPFLScraper,
  triggerOneFCScraper,
  triggerMatchroomScraper,
  triggerGoldenBoyScraper,
  triggerTopRankScraper,
  triggerOktagonScraper,
  triggerAllOrganizationScrapers,
} from '../services/backgroundJobs';
import { getFailsafeStatus } from '../services/failsafeCleanup';
import { scheduleAllUpcomingEvents, safetyCheckEvents } from '../services/eventBasedScheduler';
import { uploadEventImage } from '../services/imageStorage';

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
        // For upcoming events, show soonest first; for all events, show most recent first
        orderBy: { date: upcoming === 'true' ? 'asc' : 'desc' },
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

  // Upload event banner image from URL
  // Downloads from provided URL, uploads to R2, updates event record
  fastify.post('/admin/events/:id/banner', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { imageUrl } = request.body as { imageUrl?: string };

    if (!imageUrl) {
      return reply.code(400).send({ error: 'imageUrl is required' });
    }

    // Validate URL format
    try {
      new URL(imageUrl);
    } catch {
      return reply.code(400).send({ error: 'Invalid URL format' });
    }

    // Get event to use its name for the image filename
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!event) {
      return reply.code(404).send({ error: 'Event not found' });
    }

    try {
      console.log(`[Admin] Uploading banner for event ${event.name} from: ${imageUrl}`);

      // Download from URL and upload to R2
      const bannerImageUrl = await uploadEventImage(imageUrl, event.name);

      // Update event with new banner URL
      const updatedEvent = await prisma.event.update({
        where: { id },
        data: { bannerImage: bannerImageUrl },
      });

      console.log(`[Admin] Banner uploaded successfully: ${bannerImageUrl}`);

      return reply.send({
        success: true,
        bannerImage: bannerImageUrl,
        event: updatedEvent,
      });
    } catch (error: any) {
      console.error(`[Admin] Banner upload failed:`, error.message);
      return reply.code(500).send({
        error: 'Failed to upload banner image',
        message: error.message,
      });
    }
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

  // ============================================
  // ORGANIZATION SCRAPER TRIGGERS
  // ============================================

  // Manual trigger: BKFC Scraper
  fastify.post('/admin/trigger/scraper/bkfc', async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: BKFC scraper');
      const results = await triggerBKFCScraper();
      return reply.send({
        success: true,
        message: 'BKFC scraper completed',
        data: results
      });
    } catch (error: any) {
      console.error('[Admin] BKFC scraper failed:', error);
      return reply.code(500).send({ error: 'BKFC scraper failed', message: error.message });
    }
  });

  // Manual trigger: PFL Scraper
  fastify.post('/admin/trigger/scraper/pfl', async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: PFL scraper');
      const results = await triggerPFLScraper();
      return reply.send({
        success: true,
        message: 'PFL scraper completed',
        data: results
      });
    } catch (error: any) {
      console.error('[Admin] PFL scraper failed:', error);
      return reply.code(500).send({ error: 'PFL scraper failed', message: error.message });
    }
  });

  // Manual trigger: ONE FC Scraper
  fastify.post('/admin/trigger/scraper/onefc', async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: ONE FC scraper');
      const results = await triggerOneFCScraper();
      return reply.send({
        success: true,
        message: 'ONE FC scraper completed',
        data: results
      });
    } catch (error: any) {
      console.error('[Admin] ONE FC scraper failed:', error);
      return reply.code(500).send({ error: 'ONE FC scraper failed', message: error.message });
    }
  });

  // Manual trigger: Matchroom Scraper
  fastify.post('/admin/trigger/scraper/matchroom', async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: Matchroom scraper');
      const results = await triggerMatchroomScraper();
      return reply.send({
        success: true,
        message: 'Matchroom scraper completed',
        data: results
      });
    } catch (error: any) {
      console.error('[Admin] Matchroom scraper failed:', error);
      return reply.code(500).send({ error: 'Matchroom scraper failed', message: error.message });
    }
  });

  // Manual trigger: Golden Boy Scraper
  fastify.post('/admin/trigger/scraper/goldenboy', async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: Golden Boy scraper');
      const results = await triggerGoldenBoyScraper();
      return reply.send({
        success: true,
        message: 'Golden Boy scraper completed',
        data: results
      });
    } catch (error: any) {
      console.error('[Admin] Golden Boy scraper failed:', error);
      return reply.code(500).send({ error: 'Golden Boy scraper failed', message: error.message });
    }
  });

  // Manual trigger: Top Rank Scraper
  fastify.post('/admin/trigger/scraper/toprank', async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: Top Rank scraper');
      const results = await triggerTopRankScraper();
      return reply.send({
        success: true,
        message: 'Top Rank scraper completed',
        data: results
      });
    } catch (error: any) {
      console.error('[Admin] Top Rank scraper failed:', error);
      return reply.code(500).send({ error: 'Top Rank scraper failed', message: error.message });
    }
  });

  // Manual trigger: OKTAGON Scraper
  fastify.post('/admin/trigger/scraper/oktagon', async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: OKTAGON scraper');
      const results = await triggerOktagonScraper();
      return reply.send({
        success: true,
        message: 'OKTAGON scraper completed',
        data: results
      });
    } catch (error: any) {
      console.error('[Admin] OKTAGON scraper failed:', error);
      return reply.code(500).send({ error: 'OKTAGON scraper failed', message: error.message });
    }
  });

  // Manual trigger: ALL Organization Scrapers (runs sequentially)
  fastify.post('/admin/trigger/scraper/all', async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: ALL organization scrapers');
      const results = await triggerAllOrganizationScrapers();
      const successCount = results.filter(r => r.success).length;
      return reply.send({
        success: true,
        message: `Completed ${successCount}/${results.length} organization scrapers`,
        data: results
      });
    } catch (error: any) {
      console.error('[Admin] All scrapers failed:', error);
      return reply.code(500).send({ error: 'All scrapers failed', message: error.message });
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
            ufcScraper: {
              schedule: 'Daily at 12:00pm EST (5:00pm UTC)',
              cronExpression: '0 17 * * *'
            },
            bkfcScraper: {
              schedule: 'Daily at 12:30am EST (5:30am UTC)',
              cronExpression: '30 5 * * *'
            },
            pflScraper: {
              schedule: 'Daily at 1:00am EST (6:00am UTC)',
              cronExpression: '0 6 * * *'
            },
            oneFCScraper: {
              schedule: 'Daily at 1:30am EST (6:30am UTC)',
              cronExpression: '30 6 * * *'
            },
            matchroomScraper: {
              schedule: 'Daily at 2:00am EST (7:00am UTC)',
              cronExpression: '0 7 * * *'
            },
            goldenBoyScraper: {
              schedule: 'Daily at 2:30am EST (7:30am UTC)',
              cronExpression: '30 7 * * *'
            },
            topRankScraper: {
              schedule: 'Daily at 3:00am EST (8:00am UTC)',
              cronExpression: '0 8 * * *'
            },
            oktagonScraper: {
              schedule: 'Daily at 3:30am EST (8:30am UTC)',
              cronExpression: '30 8 * * *'
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
