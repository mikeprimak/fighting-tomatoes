/**
 * Admin Routes
 * Endpoints for manually triggering background jobs, monitoring system health,
 * and CRUD operations for events/fights (manual data entry)
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';
import {
  triggerDailyUFCScraper,
  triggerEventLifecycleCheck,
  triggerBKFCScraper,
  triggerPFLScraper,
  triggerOneFCScraper,
  triggerMatchroomScraper,
  triggerGoldenBoyScraper,
  triggerTopRankScraper,
  triggerOktagonScraper,
  triggerZuffaBoxingScraper,
  triggerRizinScraper,
  triggerAllOrganizationScrapers,
} from '../services/backgroundJobs';
import { uploadEventImage, uploadFighterImage } from '../services/imageStorage';
import oktagonTracker, { startOktagonLiveTracking, stopOktagonLiveTracking, getOktagonTrackingStatus } from '../services/oktagonLiveTracker';

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
  // Scraper type: null = no scraper, or a specific scraper name
  scraperType: z.enum(['ufc', 'matchroom', 'oktagon', 'onefc', 'tapology']).nullable().optional(),
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

const UpdateFightSchema = CreateFightSchema.partial().extend({
  fightStatus: z.enum(['UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED']).optional(),
  winner: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  round: z.number().int().min(1).max(12).nullable().optional(),
  time: z.string().nullable().optional(),
  scheduledStartTime: z.string().transform((val) => new Date(val)).nullable().optional(),
});

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
  // TEST SCRAPER ENDPOINT (no JWT, uses secret key)
  // Use this for testing scrapers in production:
  //   curl "https://fightcrewapp-backend.onrender.com/api/admin/test-scraper/bkfc?key=YOUR_KEY"
  // ============================================
  const TEST_SCRAPER_KEY = process.env.TEST_SCRAPER_KEY || 'fightcrew-test-2026';

  const scraperMap: Record<string, () => Promise<any>> = {
    'ufc': triggerDailyUFCScraper,
    'bkfc': triggerBKFCScraper,
    'pfl': triggerPFLScraper,
    'onefc': triggerOneFCScraper,
    'matchroom': triggerMatchroomScraper,
    'goldenboy': triggerGoldenBoyScraper,
    'toprank': triggerTopRankScraper,
    'oktagon': triggerOktagonScraper,
    'zuffa-boxing': triggerZuffaBoxingScraper,
    'zuffa': triggerZuffaBoxingScraper,
    'rizin': triggerRizinScraper,
  };

  fastify.get('/admin/test-scraper/:org', async (request, reply) => {
    const { org } = request.params as { org: string };
    const { key } = request.query as { key?: string };

    // Validate secret key
    if (key !== TEST_SCRAPER_KEY) {
      return reply.code(401).send({ error: 'Invalid key' });
    }

    const scraperFn = scraperMap[org.toLowerCase()];
    if (!scraperFn) {
      return reply.code(400).send({
        error: `Unknown org: ${org}`,
        available: Object.keys(scraperMap)
      });
    }

    console.log(`[Test Scraper] Triggering ${org.toUpperCase()} scraper...`);

    try {
      const results = await scraperFn();
      console.log(`[Test Scraper] ${org.toUpperCase()} completed:`, results);
      return reply.send({
        success: true,
        org: org.toUpperCase(),
        results
      });
    } catch (error: any) {
      console.error(`[Test Scraper] ${org.toUpperCase()} failed:`, error);
      return reply.code(500).send({
        success: false,
        org: org.toUpperCase(),
        error: error.message
      });
    }
  });

  // ============================================
  // SCRAPER STATUS - Shows last successful scrape times per org
  // Use: curl "https://fightcrewapp-backend.onrender.com/api/admin/scraper-status?key=YOUR_KEY"
  // ============================================
  fastify.get('/admin/scraper-status', async (request, reply) => {
    const { key } = request.query as { key?: string };

    if (key !== TEST_SCRAPER_KEY) {
      return reply.code(401).send({ error: 'Invalid key' });
    }

    // Get the most recent event updatedAt per organization
    // This serves as a proxy for "when did the scraper last successfully update data"
    const organizations = ['UFC', 'BKFC', 'PFL', 'ONE', 'Matchroom Boxing', 'Golden Boy', 'Top Rank', 'OKTAGON', 'Zuffa Boxing', 'RIZIN'];

    const statusPromises = organizations.map(async (org) => {
      try {
        const latestEvent = await prisma.event.findFirst({
          where: { promotion: org },
          orderBy: { updatedAt: 'desc' },
          select: {
            name: true,
            updatedAt: true,
            date: true,
          }
        });

        const eventCount = await prisma.event.count({
          where: { promotion: org }
        });

        return {
          organization: org,
          lastUpdated: latestEvent?.updatedAt || null,
          lastUpdatedEvent: latestEvent?.name || null,
          totalEvents: eventCount,
          timeSinceUpdate: latestEvent?.updatedAt
            ? Math.round((Date.now() - new Date(latestEvent.updatedAt).getTime()) / (1000 * 60 * 60)) + ' hours ago'
            : 'never'
        };
      } catch (err: any) {
        return {
          organization: org,
          error: err.message,
          lastUpdated: null,
          totalEvents: 0,
          timeSinceUpdate: 'error'
        };
      }
    });

    const statuses = await Promise.all(statusPromises);

    return reply.send({
      generatedAt: new Date().toISOString(),
      scrapers: statuses.sort((a, b) => {
        if (!a.lastUpdated) return 1;
        if (!b.lastUpdated) return -1;
        return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
      })
    });
  });

  // ============================================
  // DELETE EVENT - Key-based auth for cleanup
  // Use: curl -X DELETE "https://fightcrewapp-backend.onrender.com/api/admin/delete-event/EVENT_ID?key=YOUR_KEY"
  // ============================================
  fastify.delete('/admin/delete-event/:id', async (request, reply) => {
    const { key } = request.query as { key?: string };
    const { id } = request.params as { id: string };

    if (key !== TEST_SCRAPER_KEY) {
      return reply.code(401).send({ error: 'Invalid key' });
    }

    try {
      // Get event info first
      const event = await prisma.event.findUnique({
        where: { id },
        select: { name: true, promotion: true }
      });

      if (!event) {
        return reply.code(404).send({ error: 'Event not found' });
      }

      // Delete all fights for this event first
      const deletedFights = await prisma.fight.deleteMany({ where: { eventId: id } });

      // Then delete the event
      await prisma.event.delete({ where: { id } });

      return reply.send({
        success: true,
        deletedEvent: event.name,
        deletedFightsCount: deletedFights.count
      });
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to delete event', message: err.message });
    }
  });

  // ============================================
  // MARK EVENT AS STARTED - Key-based auth
  // Use: curl -X POST "https://fightcrewapp-backend.onrender.com/api/admin/mark-event-started/EVENT_ID?key=YOUR_KEY"
  // ============================================
  fastify.post('/admin/mark-event-started/:id', async (request, reply) => {
    const { key } = request.query as { key?: string };
    const { id } = request.params as { id: string };

    if (key !== TEST_SCRAPER_KEY) {
      return reply.code(401).send({ error: 'Invalid key' });
    }

    try {
      const event = await prisma.event.findUnique({
        where: { id },
        select: { name: true, eventStatus: true }
      });

      if (!event) {
        return reply.code(404).send({ error: 'Event not found' });
      }

      if (event.eventStatus !== 'UPCOMING') {
        return reply.send({
          success: true,
          message: 'Event was already marked as started',
          eventName: event.name
        });
      }

      await prisma.event.update({
        where: { id },
        data: { eventStatus: 'LIVE' }
      });

      console.log(`[Admin] Marked event as started: ${event.name}`);

      return reply.send({
        success: true,
        message: 'Event marked as started',
        eventName: event.name
      });
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to update event', message: err.message });
    }
  });

  // ============================================
  // CANCEL/UNCANCEL FIGHT - Key-based auth
  // Use: curl -X POST "https://fightcrewapp-backend.onrender.com/api/admin/cancel-fight/FIGHT_ID?key=YOUR_KEY"
  // Use: curl -X POST "https://fightcrewapp-backend.onrender.com/api/admin/uncancel-fight/FIGHT_ID?key=YOUR_KEY"
  // ============================================
  fastify.post('/admin/cancel-fight/:id', async (request, reply) => {
    const { key } = request.query as { key?: string };
    const { id } = request.params as { id: string };

    if (key !== TEST_SCRAPER_KEY) {
      return reply.code(401).send({ error: 'Invalid key' });
    }

    try {
      const fight = await prisma.fight.findUnique({
        where: { id },
        include: {
          fighter1: { select: { lastName: true } },
          fighter2: { select: { lastName: true } },
        }
      });

      if (!fight) {
        return reply.code(404).send({ error: 'Fight not found' });
      }

      if (fight.fightStatus === 'CANCELLED') {
        return reply.send({
          success: true,
          message: 'Fight was already cancelled',
          fight: `${fight.fighter1.lastName} vs ${fight.fighter2.lastName}`
        });
      }

      await prisma.fight.update({
        where: { id },
        data: { fightStatus: 'CANCELLED' }
      });

      console.log(`[Admin] Cancelled fight: ${fight.fighter1.lastName} vs ${fight.fighter2.lastName}`);

      return reply.send({
        success: true,
        message: 'Fight cancelled',
        fight: `${fight.fighter1.lastName} vs ${fight.fighter2.lastName}`
      });
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to cancel fight', message: err.message });
    }
  });

  fastify.post('/admin/uncancel-fight/:id', async (request, reply) => {
    const { key } = request.query as { key?: string };
    const { id } = request.params as { id: string };

    if (key !== TEST_SCRAPER_KEY) {
      return reply.code(401).send({ error: 'Invalid key' });
    }

    try {
      const fight = await prisma.fight.findUnique({
        where: { id },
        include: {
          fighter1: { select: { lastName: true } },
          fighter2: { select: { lastName: true } },
        }
      });

      if (!fight) {
        return reply.code(404).send({ error: 'Fight not found' });
      }

      if (fight.fightStatus !== 'CANCELLED') {
        return reply.send({
          success: true,
          message: 'Fight was not cancelled',
          fight: `${fight.fighter1.lastName} vs ${fight.fighter2.lastName}`
        });
      }

      await prisma.fight.update({
        where: { id },
        data: { fightStatus: 'UPCOMING' }
      });

      console.log(`[Admin] Un-cancelled fight: ${fight.fighter1.lastName} vs ${fight.fighter2.lastName}`);

      return reply.send({
        success: true,
        message: 'Fight un-cancelled',
        fight: `${fight.fighter1.lastName} vs ${fight.fighter2.lastName}`
      });
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to un-cancel fight', message: err.message });
    }
  });

  // ============================================
  // OKTAGON LIVE TRACKER - Start/Stop/Status
  // ============================================

  // Start Oktagon live tracker
  // Use: curl -X POST "https://fightcrewapp-backend.onrender.com/api/admin/live-tracker/oktagon/start?key=YOUR_KEY" \
  //        -H "Content-Type: application/json" \
  //        -d '{"eventId":"...", "eventUrl":"https://oktagonmma.com/en/events/...", "eventName":"OKTAGON 82"}'
  fastify.post('/admin/live-tracker/oktagon/start', async (request, reply) => {
    const { key } = request.query as { key?: string };

    if (key !== TEST_SCRAPER_KEY) {
      return reply.code(401).send({ error: 'Invalid key' });
    }

    const { eventId, eventUrl, eventName, intervalSeconds } = request.body as {
      eventId?: string;
      eventUrl?: string;
      eventName?: string;
      intervalSeconds?: number;
    };

    // If eventId provided but no URL, look up event in database
    let finalEventId = eventId;
    let finalEventUrl = eventUrl;
    let finalEventName = eventName;

    if (eventId && !eventUrl) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true, date: true }
      });

      if (!event) {
        return reply.code(404).send({ error: 'Event not found' });
      }

      finalEventName = event.name;
      // Construct Oktagon URL from event name
      const slug = event.name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
      finalEventUrl = `https://oktagonmma.com/en/events/${slug}/?eventDetail=true`;
    }

    if (!finalEventId || !finalEventUrl) {
      return reply.code(400).send({
        error: 'Missing required fields',
        required: 'eventId (or eventId + eventUrl)',
        example: {
          eventId: 'uuid-here',
          eventUrl: 'https://oktagonmma.com/en/events/oktagon-82-dusseldorf/?eventDetail=true',
          eventName: 'OKTAGON 82',
          intervalSeconds: 60
        }
      });
    }

    // Check if already running
    const currentStatus = getOktagonTrackingStatus();
    if (currentStatus.isRunning) {
      return reply.code(409).send({
        error: 'Tracker already running',
        currentEvent: currentStatus.eventName,
        startedAt: currentStatus.startedAt
      });
    }

    // Also mark event as started in database based on start time
    const event = await prisma.event.findUnique({
      where: { id: finalEventId },
      select: { id: true, date: true, eventStatus: true }
    });

    if (event && event.eventStatus === 'UPCOMING') {
      const now = new Date();
      const eventDate = new Date(event.date);
      if (now >= eventDate) {
        await prisma.event.update({
          where: { id: finalEventId },
          data: { eventStatus: 'LIVE' }
        });
        console.log(`[Live Tracker] Marked event ${finalEventId} as started (based on start time)`);
      }
    }

    try {
      await startOktagonLiveTracking({
        eventId: finalEventId,
        eventUrl: finalEventUrl,
        eventName: finalEventName || 'OKTAGON Event',
        intervalSeconds: intervalSeconds || 60
      });

      return reply.send({
        success: true,
        message: 'Oktagon live tracker started',
        event: {
          id: finalEventId,
          name: finalEventName,
          url: finalEventUrl
        },
        intervalSeconds: intervalSeconds || 60
      });
    } catch (error: any) {
      return reply.code(500).send({
        error: 'Failed to start tracker',
        message: error.message
      });
    }
  });

  // Stop Oktagon live tracker
  // Use: curl -X POST "https://fightcrewapp-backend.onrender.com/api/admin/live-tracker/oktagon/stop?key=YOUR_KEY"
  fastify.post('/admin/live-tracker/oktagon/stop', async (request, reply) => {
    const { key } = request.query as { key?: string };

    if (key !== TEST_SCRAPER_KEY) {
      return reply.code(401).send({ error: 'Invalid key' });
    }

    const currentStatus = getOktagonTrackingStatus();
    if (!currentStatus.isRunning) {
      return reply.send({
        success: true,
        message: 'Tracker was not running'
      });
    }

    try {
      await stopOktagonLiveTracking();

      return reply.send({
        success: true,
        message: 'Oktagon live tracker stopped',
        stats: {
          totalScrapes: currentStatus.totalScrapes,
          fightsUpdated: currentStatus.fightsUpdated
        }
      });
    } catch (error: any) {
      return reply.code(500).send({
        error: 'Failed to stop tracker',
        message: error.message
      });
    }
  });

  // Get Oktagon live tracker status
  // Use: curl "https://fightcrewapp-backend.onrender.com/api/admin/live-tracker/oktagon/status?key=YOUR_KEY"
  fastify.get('/admin/live-tracker/oktagon/status', async (request, reply) => {
    const { key } = request.query as { key?: string };

    if (key !== TEST_SCRAPER_KEY) {
      return reply.code(401).send({ error: 'Invalid key' });
    }

    const status = getOktagonTrackingStatus();

    return reply.send({
      success: true,
      tracker: status
    });
  });

  // ============================================
  // FIGHTER SEARCH (for autocomplete)
  // ============================================
  fastify.get('/admin/fighters/search', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
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
  fastify.post('/admin/fighters', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
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
  fastify.get('/admin/events', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { promotion, upcoming, current, limit = '50', offset = '0' } = request.query as {
      promotion?: string;
      upcoming?: string;
      current?: string;
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
    if (current === 'true') {
      // Events between yesterday and 2 days from now
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const twoDaysFromNow = new Date();
      twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
      twoDaysFromNow.setHours(23, 59, 59, 999);

      where.date = {
        gte: yesterday,
        lte: twoDaysFromNow,
      };
    }

    // Determine sort order: current = desc (furthest future first), upcoming = asc (soonest first), all = desc
    const orderDirection = upcoming === 'true' ? 'asc' : 'desc';

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { date: orderDirection },
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
  fastify.get('/admin/events/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
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
  fastify.post('/admin/events', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
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
  fastify.put('/admin/events/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = UpdateEventSchema.parse(request.body);

    const event = await prisma.event.update({
      where: { id },
      data,
    });

    return reply.send({ event });
  });

  // Update event status (eventStatus enum)
  // This is a manual override that sets completionMethod='manual'
  fastify.put('/admin/events/:id/status', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { eventStatus } = request.body as { eventStatus: 'UPCOMING' | 'LIVE' | 'COMPLETED' };

    const event = await prisma.event.update({
      where: { id },
      data: {
        eventStatus,
        completionMethod: 'manual',
      },
    });

    // If marking event complete, also mark all incomplete fights as complete
    if (eventStatus === 'COMPLETED') {
      await prisma.fight.updateMany({
        where: {
          eventId: id,
          fightStatus: { not: 'COMPLETED' },
        },
        data: {
          fightStatus: 'COMPLETED',
          completionMethod: 'manual',
          completedAt: new Date(),
        },
      });
    }

    console.log(`[Admin] Event ${event.name} status updated: eventStatus=${eventStatus}`);

    return reply.send({ event });
  });

  // Delete event (cascades to fights)
  fastify.delete('/admin/events/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // First delete all fights for this event
    await prisma.fight.deleteMany({ where: { eventId: id } });

    // Then delete the event
    await prisma.event.delete({ where: { id } });

    return reply.send({ success: true });
  });

  // Upload event banner image from URL
  // Downloads from provided URL, uploads to R2, updates event record
  fastify.post('/admin/events/:id/banner', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
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

  // Upload fighter profile image from URL
  // Downloads from provided URL, uploads to R2, updates fighter record
  fastify.post('/admin/fighters/:id/image', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
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

    // Get fighter to use their name for the image filename
    const fighter = await prisma.fighter.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!fighter) {
      return reply.code(404).send({ error: 'Fighter not found' });
    }

    try {
      const fighterName = `${fighter.firstName} ${fighter.lastName}`;
      console.log(`[Admin] Uploading image for fighter ${fighterName} from: ${imageUrl}`);

      // Download from URL and upload to R2
      const profileImageUrl = await uploadFighterImage(imageUrl, fighterName);

      // Update fighter with new profile image URL
      const updatedFighter = await prisma.fighter.update({
        where: { id },
        data: { profileImage: profileImageUrl },
      });

      console.log(`[Admin] Fighter image uploaded successfully: ${profileImageUrl}`);

      return reply.send({
        success: true,
        profileImage: profileImageUrl,
        fighter: updatedFighter,
      });
    } catch (error: any) {
      console.error(`[Admin] Fighter image upload failed:`, error.message);
      return reply.code(500).send({
        error: 'Failed to upload fighter image',
        message: error.message,
      });
    }
  });

  // ============================================
  // FIGHTS CRUD
  // ============================================

  // Get fights for an event
  fastify.get('/admin/events/:eventId/fights', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
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
  fastify.post('/admin/fights', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
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
  fastify.put('/admin/fights/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateFightSchema.parse(request.body);

    // Exclude relation IDs and fields that need type casting
    const { eventId, fighter1Id, fighter2Id, weightClass, ...updateData } = parsed;

    // If resetting fight to non-completed status, clear completionMethod to prevent
    // time-based system from re-marking it complete
    const additionalData: any = {};
    if (updateData.fightStatus === 'UPCOMING' || updateData.fightStatus === 'LIVE') {
      additionalData.completionMethod = null;
      additionalData.completedAt = null;
    }

    const fight = await prisma.fight.update({
      where: { id },
      data: {
        ...updateData,
        ...additionalData,
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
  fastify.delete('/admin/fights/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.fight.delete({ where: { id } });

    return reply.send({ success: true });
  });

  // ============================================
  // FIGHT STATUS CONTROL + PUBLISH
  // ============================================

  // Set fight status (upcoming / live / completed)
  // Convenience endpoint that sets the right boolean flags
  fastify.post('/admin/fights/:id/set-status', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: 'upcoming' | 'live' | 'completed' };

    if (!['upcoming', 'live', 'completed'].includes(status)) {
      return reply.code(400).send({ error: 'Status must be upcoming, live, or completed' });
    }

    const data: any = {};

    switch (status) {
      case 'upcoming':
        data.fightStatus = 'UPCOMING';
        data.completionMethod = null;
        data.completedAt = null;
        break;
      case 'live':
        data.fightStatus = 'LIVE';
        data.completionMethod = null;
        data.completedAt = null;
        break;
      case 'completed':
        data.fightStatus = 'COMPLETED';
        data.completionMethod = 'manual';
        data.completedAt = new Date();
        break;
    }

    const fight = await prisma.fight.update({
      where: { id },
      data,
      include: {
        fighter1: { select: { id: true, firstName: true, lastName: true } },
        fighter2: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    console.log(`[Admin] Fight ${fight.fighter1.lastName} vs ${fight.fighter2.lastName} set to ${status}`);
    return reply.send({ fight });
  });

  // Publish tracker data for a single fight (copy tracker* → published fields)
  fastify.post('/admin/fights/:id/publish', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const fight = await prisma.fight.findUnique({ where: { id } });
    if (!fight) {
      return reply.code(404).send({ error: 'Fight not found' });
    }

    // Build update from tracker fields (only copy non-null tracker values)
    const data: any = { completionMethod: 'manual' };

    if (fight.trackerFightStatus !== null) data.fightStatus = fight.trackerFightStatus;
    if (fight.trackerWinner !== null) data.winner = fight.trackerWinner;
    if (fight.trackerMethod !== null) data.method = fight.trackerMethod;
    if (fight.trackerRound !== null) data.round = fight.trackerRound;
    if (fight.trackerTime !== null) data.time = fight.trackerTime;
    if (fight.trackerCurrentRound !== null) data.currentRound = fight.trackerCurrentRound;
    if (fight.trackerCompletedRounds !== null) data.completedRounds = fight.trackerCompletedRounds;

    if (fight.trackerFightStatus === 'COMPLETED') {
      data.completedAt = new Date();
    }

    const updated = await prisma.fight.update({
      where: { id },
      data,
      include: {
        fighter1: { select: { id: true, firstName: true, lastName: true } },
        fighter2: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    console.log(`[Admin] Published tracker data for ${updated.fighter1.lastName} vs ${updated.fighter2.lastName}`);
    return reply.send({ fight: updated });
  });

  // Publish all tracker data for an event (bulk copy tracker* → published fields)
  fastify.post('/admin/events/:id/publish-all', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        fights: {
          include: {
            fighter1: { select: { lastName: true } },
            fighter2: { select: { lastName: true } },
          },
        },
      },
    });

    if (!event) {
      return reply.code(404).send({ error: 'Event not found' });
    }

    let publishedCount = 0;

    for (const fight of event.fights) {
      // Only publish fights that have tracker data
      if (fight.trackerFightStatus === null) {
        continue;
      }

      const data: any = { completionMethod: 'manual' };

      if (fight.trackerFightStatus !== null) data.fightStatus = fight.trackerFightStatus;
      if (fight.trackerWinner !== null) data.winner = fight.trackerWinner;
      if (fight.trackerMethod !== null) data.method = fight.trackerMethod;
      if (fight.trackerRound !== null) data.round = fight.trackerRound;
      if (fight.trackerTime !== null) data.time = fight.trackerTime;
      if (fight.trackerCurrentRound !== null) data.currentRound = fight.trackerCurrentRound;
      if (fight.trackerCompletedRounds !== null) data.completedRounds = fight.trackerCompletedRounds;

      if (fight.trackerFightStatus === 'COMPLETED') {
        data.completedAt = new Date();
      }

      await prisma.fight.update({ where: { id: fight.id }, data });
      publishedCount++;
      console.log(`[Admin] Published: ${fight.fighter1.lastName} vs ${fight.fighter2.lastName}`);
    }

    console.log(`[Admin] Published tracker data for ${publishedCount}/${event.fights.length} fights in ${event.name}`);
    return reply.send({ success: true, publishedCount, totalFights: event.fights.length });
  });

  // ============================================
  // BACKGROUND JOB TRIGGERS (existing)
  // ============================================
  // Manual trigger: Daily UFC Scraper
  fastify.post('/admin/trigger/daily-scraper', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
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

  // Manual trigger: Event Lifecycle Check
  fastify.post('/admin/trigger/lifecycle-check', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: Event lifecycle check');
      await triggerEventLifecycleCheck();

      return reply.send({
        success: true,
        message: 'Event lifecycle check completed'
      });
    } catch (error: any) {
      console.error('[Admin] Event lifecycle check failed:', error);
      return reply.code(500).send({
        error: 'Event lifecycle check failed',
        message: error.message
      });
    }
  });

  // ============================================
  // ORGANIZATION SCRAPER TRIGGERS
  // ============================================

  // GitHub Actions workflow dispatch helper
  const SCRAPER_WORKFLOWS: Record<string, string> = {
    'ufc': 'ufc-scraper.yml',
    'bkfc': 'bkfc-scraper.yml',
    'pfl': 'pfl-scraper.yml',
    'onefc': 'onefc-scraper.yml',
    'matchroom': 'matchroom-scraper.yml',
    'goldenboy': 'goldenboy-scraper.yml',
    'toprank': 'toprank-scraper.yml',
    'oktagon': 'oktagon-scraper.yml',
    'zuffa-boxing': 'zuffa-boxing-scraper.yml',
    'rizin': 'rizin-scraper.yml',
  };

  async function dispatchGitHubWorkflow(workflow: string): Promise<void> {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN not configured');
    }

    const res = await fetch(`https://api.github.com/repos/mikeprimak/fighting-tomatoes/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`GitHub dispatch failed (${res.status}): ${errorText}`);
    }
  }

  // Manual trigger: Individual scraper via GitHub Actions
  for (const [orgKey, workflow] of Object.entries(SCRAPER_WORKFLOWS)) {
    fastify.post(`/admin/trigger/scraper/${orgKey}`, {
      preValidation: [fastify.authenticate, requireAdmin],
    }, async (request, reply) => {
      try {
        console.log(`[Admin] Manual trigger: ${orgKey} scraper via GitHub Actions`);
        await dispatchGitHubWorkflow(workflow);
        return reply.send({
          success: true,
          message: `${orgKey.toUpperCase()} scraper triggered via GitHub Actions (runs in background)`,
        });
      } catch (error: any) {
        console.error(`[Admin] ${orgKey} scraper dispatch failed:`, error);
        return reply.code(500).send({ error: `${orgKey} scraper failed`, message: error.message });
      }
    });
  }

  // Manual trigger: ALL Organization Scrapers via GitHub Actions
  fastify.post('/admin/trigger/scraper/all', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    try {
      console.log('[Admin] Manual trigger: ALL organization scrapers via GitHub Actions');
      const results = [];
      for (const [orgKey, workflow] of Object.entries(SCRAPER_WORKFLOWS)) {
        try {
          await dispatchGitHubWorkflow(workflow);
          results.push({ org: orgKey, success: true });
        } catch (error: any) {
          results.push({ org: orgKey, success: false, error: error.message });
        }
      }
      const successCount = results.filter(r => r.success).length;
      return reply.send({
        success: true,
        message: `Triggered ${successCount}/${results.length} scrapers via GitHub Actions`,
        data: results
      });
    } catch (error: any) {
      console.error('[Admin] All scrapers dispatch failed:', error);
      return reply.code(500).send({ error: 'All scrapers failed', message: error.message });
    }
  });

  // System Health Check
  fastify.get('/admin/health', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    try {
      // Count live and upcoming events for health check
      const [liveEvents, upcomingEvents] = await Promise.all([
        prisma.event.count({ where: { eventStatus: 'LIVE' } }),
        prisma.event.count({ where: { eventStatus: 'UPCOMING' } }),
      ]);

      return reply.send({
        success: true,
        data: {
          events: { live: liveEvents, upcoming: upcomingEvents },
          backgroundJobs: {
            eventLifecycle: {
              schedule: 'Every 5 minutes',
              description: 'UPCOMING→LIVE, section-based fight completion, LIVE→COMPLETED',
            },
            scrapers: {
              schedule: 'Via GitHub Actions',
              description: 'All org scrapers run via GitHub Actions workflows',
            },
          },
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

  // ============================================
  // TEST EMAIL ALERTS
  // ============================================

  // Scraper failure alert endpoint (used by GitHub Actions and for testing)
  // Use: GET /api/admin/test-alert?key=YOUR_KEY&type=scraper&org=UFC&error=message
  fastify.get('/admin/test-alert', async (request, reply) => {
    const { key, type, org, error: errorMsg } = request.query as {
      key?: string;
      type?: string;
      org?: string;
      error?: string;
    };

    if (key !== TEST_SCRAPER_KEY) {
      return reply.code(401).send({ error: 'Invalid key' });
    }

    const { EmailService } = await import('../utils/email');

    if (type === 'scraper') {
      const orgName = org || 'TEST';
      const message = errorMsg || 'GitHub Actions workflow failed. Check workflow logs for details.';
      await EmailService.sendScraperFailureAlert(orgName, message);
      return reply.send({ success: true, message: `Scraper failure alert sent for ${orgName}` });
    } else if (type === 'feedback') {
      await EmailService.sendFeedbackNotification('test-id', 'test@example.com', 'This is a test feedback notification.', 'Test', '1.0.0');
      return reply.send({ success: true, message: 'Feedback notification sent' });
    } else {
      return reply.code(400).send({ error: 'Invalid type. Use type=scraper or type=feedback' });
    }
  });

  // ============================================
  // SCRAPER LOGS
  // ============================================

  // Get scraper logs
  // Use: GET /api/admin/scraper-logs?type=daily_scraper&org=UFC&limit=50
  fastify.get('/admin/scraper-logs', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { type, org, status, limit = '50', offset = '0' } = request.query as {
      type?: string;
      org?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };

    const where: any = {};
    if (type) where.type = type;
    if (org) where.organization = org;
    if (status) where.status = status;

    try {
      const [logs, total] = await Promise.all([
        prisma.scraperLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit),
          skip: parseInt(offset),
        }),
        prisma.scraperLog.count({ where }),
      ]);

      return reply.send({ logs, total });
    } catch (error: any) {
      console.error('[Admin] Failed to fetch scraper logs:', error);
      return reply.code(500).send({ error: 'Failed to fetch scraper logs', message: error.message });
    }
  });

  // Create scraper log (called by scrapers/trackers)
  // Use: POST /api/admin/scraper-logs?key=YOUR_KEY
  fastify.post('/admin/scraper-logs', async (request, reply) => {
    const { key } = request.query as { key?: string };

    // Allow both JWT auth and key-based auth (for GitHub Actions)
    if (key !== TEST_SCRAPER_KEY) {
      // Try JWT auth
      try {
        await fastify.authenticate(request, reply);
        await requireAdmin(request, reply);
      } catch {
        return reply.code(401).send({ error: 'Invalid key or unauthorized' });
      }
    }

    const {
      type,
      organization,
      status,
      eventId,
      eventName,
      eventsScraped,
      fightsUpdated,
      fightersAdded,
      errorMessage,
      duration,
      startedAt,
      completedAt,
    } = request.body as {
      type: string;
      organization: string;
      status: string;
      eventId?: string;
      eventName?: string;
      eventsScraped?: number;
      fightsUpdated?: number;
      fightersAdded?: number;
      errorMessage?: string;
      duration?: number;
      startedAt: string;
      completedAt?: string;
    };

    if (!type || !organization || !status || !startedAt) {
      return reply.code(400).send({
        error: 'Missing required fields',
        required: ['type', 'organization', 'status', 'startedAt'],
      });
    }

    try {
      const log = await prisma.scraperLog.create({
        data: {
          type,
          organization,
          status,
          eventId,
          eventName,
          eventsScraped,
          fightsUpdated,
          fightersAdded,
          errorMessage,
          duration,
          startedAt: new Date(startedAt),
          completedAt: completedAt ? new Date(completedAt) : null,
        },
      });

      return reply.code(201).send({ log });
    } catch (error: any) {
      console.error('[Admin] Failed to create scraper log:', error);
      return reply.code(500).send({ error: 'Failed to create scraper log', message: error.message });
    }
  });

  // Get latest log per organization (for Operations dashboard)
  // Use: GET /api/admin/scraper-logs/latest
  fastify.get('/admin/scraper-logs/latest', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const organizations = ['UFC', 'BKFC', 'PFL', 'ONE', 'Matchroom Boxing', 'Golden Boy', 'Top Rank', 'OKTAGON', 'Zuffa Boxing', 'RIZIN'];

    try {
      const latestLogs = await Promise.all(
        organizations.map(async (org) => {
          const log = await prisma.scraperLog.findFirst({
            where: { organization: org, type: 'daily_scraper' },
            orderBy: { createdAt: 'desc' },
          });
          return { organization: org, log };
        })
      );

      return reply.send({ latestLogs });
    } catch (error: any) {
      console.error('[Admin] Failed to fetch latest scraper logs:', error);
      return reply.code(500).send({ error: 'Failed to fetch latest logs', message: error.message });
    }
  });

  // ============================================
  // FEEDBACK MANAGEMENT
  // ============================================

  // List all feedback
  // Use: GET /api/admin/feedback?filter=unread&limit=50
  fastify.get('/admin/feedback', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { filter, limit = '50', offset = '0' } = request.query as {
      filter?: 'unread' | 'unresolved' | 'all';
      limit?: string;
      offset?: string;
    };

    const where: any = {};
    if (filter === 'unread') {
      where.isRead = false;
    } else if (filter === 'unresolved') {
      where.isResolved = false;
    }

    try {
      const [feedback, total, unreadCount] = await Promise.all([
        prisma.userFeedback.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit),
          skip: parseInt(offset),
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
              },
            },
          },
        }),
        prisma.userFeedback.count({ where }),
        prisma.userFeedback.count({ where: { isRead: false } }),
      ]);

      return reply.send({ feedback, total, unreadCount });
    } catch (error: any) {
      console.error('[Admin] Failed to fetch feedback:', error);
      return reply.code(500).send({ error: 'Failed to fetch feedback', message: error.message });
    }
  });

  // Get single feedback
  fastify.get('/admin/feedback/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const feedback = await prisma.userFeedback.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              totalRatings: true,
              totalReviews: true,
              createdAt: true,
            },
          },
        },
      });

      if (!feedback) {
        return reply.code(404).send({ error: 'Feedback not found' });
      }

      return reply.send({ feedback });
    } catch (error: any) {
      console.error('[Admin] Failed to fetch feedback:', error);
      return reply.code(500).send({ error: 'Failed to fetch feedback', message: error.message });
    }
  });

  // Update feedback (mark read, add notes, resolve)
  fastify.put('/admin/feedback/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { isRead, isResolved, adminNotes } = request.body as {
      isRead?: boolean;
      isResolved?: boolean;
      adminNotes?: string;
    };

    try {
      const feedback = await prisma.userFeedback.update({
        where: { id },
        data: {
          ...(isRead !== undefined && { isRead }),
          ...(isResolved !== undefined && { isResolved }),
          ...(adminNotes !== undefined && { adminNotes }),
        },
      });

      return reply.send({ feedback });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return reply.code(404).send({ error: 'Feedback not found' });
      }
      console.error('[Admin] Failed to update feedback:', error);
      return reply.code(500).send({ error: 'Failed to update feedback', message: error.message });
    }
  });

  // Delete feedback
  fastify.delete('/admin/feedback/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      await prisma.userFeedback.delete({ where: { id } });
      return reply.send({ success: true });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return reply.code(404).send({ error: 'Feedback not found' });
      }
      console.error('[Admin] Failed to delete feedback:', error);
      return reply.code(500).send({ error: 'Failed to delete feedback', message: error.message });
    }
  });
}
