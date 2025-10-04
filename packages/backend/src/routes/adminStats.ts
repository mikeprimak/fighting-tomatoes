import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const adminStatsRoutes: FastifyPluginAsync = async (fastify, opts) => {
  /**
   * Get dashboard statistics
   * GET /api/admin/stats
   */
  fastify.get('/stats', async (request, reply) => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // User stats
      const [
        totalUsers,
        activeToday,
        activeWeek,
        newThisWeek,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({
          where: {
            lastLoginAt: { gte: today },
          },
        }),
        prisma.user.count({
          where: {
            lastLoginAt: { gte: weekAgo },
          },
        }),
        prisma.user.count({
          where: {
            createdAt: { gte: weekAgo },
          },
        }),
      ]);

      // Engagement stats
      const [
        totalRatings,
        totalReviews,
        ratingsToday,
      ] = await Promise.all([
        prisma.fightRating.count(),
        prisma.fightReview.count(),
        prisma.fightRating.count({
          where: {
            createdAt: { gte: today },
          },
        }),
      ]);

      // Content stats
      const [
        totalEvents,
        totalFights,
        totalFighters,
        upcomingEvents,
      ] = await Promise.all([
        prisma.event.count(),
        prisma.fight.count(),
        prisma.fighter.count(),
        prisma.event.count({
          where: {
            date: { gte: now },
            isComplete: false,
          },
        }),
      ]);

      // Scraper status (check live event tracker status via API)
      let scraperStatus = {
        lastRun: null,
        status: 'idle' as 'success' | 'error' | 'running' | 'idle',
        message: 'No active tracking',
      };

      try {
        const statusResponse = await fetch(`http://localhost:${process.env.PORT || 3001}/api/live-events/status`);
        if (statusResponse.ok) {
          const statusData = await statusResponse.json() as any;
          if (statusData.isTracking) {
            scraperStatus = {
              lastRun: statusData.lastScrapeTime,
              status: 'running',
              message: `Tracking ${statusData.eventName} - ${statusData.totalScrapes} scrapes completed`,
            };
          } else if (statusData.lastError) {
            scraperStatus = {
              lastRun: statusData.lastScrapeTime,
              status: 'error',
              message: statusData.lastError,
            };
          }
        }
      } catch (error) {
        console.error('Error fetching scraper status:', error);
      }

      return reply.send({
        users: {
          total: totalUsers,
          activeToday,
          activeWeek,
          newThisWeek,
        },
        engagement: {
          totalRatings,
          totalReviews,
          ratingsToday,
        },
        content: {
          totalEvents,
          totalFights,
          totalFighters,
          upcomingEvents,
        },
        scraper: scraperStatus,
      });
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      return reply.status(500).send({
        error: 'Failed to fetch stats',
        code: 'STATS_ERROR',
      });
    }
  });

  /**
   * Get error logs
   * GET /api/admin/errors
   */
  fastify.get('/errors', async (request, reply) => {
    // TODO: Implement error logging system
    // For now, return empty array
    return reply.send({ errors: [] });
  });

  // ============= EVENTS CRUD =============

  /**
   * List all events
   * GET /api/admin/events
   */
  fastify.get('/events', async (request, reply) => {
    try {
      const events = await prisma.event.findMany({
        orderBy: { date: 'desc' },
        take: 100,
      });
      return reply.send({ events });
    } catch (error) {
      console.error('Error fetching events:', error);
      return reply.status(500).send({ error: 'Failed to fetch events' });
    }
  });

  /**
   * Create event
   * POST /api/admin/events
   */
  fastify.post('/events', async (request, reply) => {
    try {
      const event = await prisma.event.create({
        data: request.body as any,
      });
      return reply.send({ event });
    } catch (error) {
      console.error('Error creating event:', error);
      return reply.status(500).send({ error: 'Failed to create event' });
    }
  });

  /**
   * Update event
   * PUT /api/admin/events/:id
   */
  fastify.put('/events/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const event = await prisma.event.update({
        where: { id },
        data: request.body as any,
      });
      return reply.send({ event });
    } catch (error) {
      console.error('Error updating event:', error);
      return reply.status(500).send({ error: 'Failed to update event' });
    }
  });

  /**
   * Delete event
   * DELETE /api/admin/events/:id
   */
  fastify.delete('/events/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.event.delete({ where: { id } });
      return reply.send({ success: true });
    } catch (error) {
      console.error('Error deleting event:', error);
      return reply.status(500).send({ error: 'Failed to delete event' });
    }
  });

  // ============= FIGHTERS CRUD =============

  /**
   * List all fighters
   * GET /api/admin/fighters
   */
  fastify.get('/fighters', async (request, reply) => {
    try {
      const fighters = await prisma.fighter.findMany({
        orderBy: { lastName: 'asc' },
        take: 200,
      });
      return reply.send({ fighters });
    } catch (error) {
      console.error('Error fetching fighters:', error);
      return reply.status(500).send({ error: 'Failed to fetch fighters' });
    }
  });

  /**
   * Create fighter
   * POST /api/admin/fighters
   */
  fastify.post('/fighters', async (request, reply) => {
    try {
      const fighter = await prisma.fighter.create({
        data: request.body as any,
      });
      return reply.send({ fighter });
    } catch (error) {
      console.error('Error creating fighter:', error);
      return reply.status(500).send({ error: 'Failed to create fighter' });
    }
  });

  /**
   * Update fighter
   * PUT /api/admin/fighters/:id
   */
  fastify.put('/fighters/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const fighter = await prisma.fighter.update({
        where: { id },
        data: request.body as any,
      });
      return reply.send({ fighter });
    } catch (error) {
      console.error('Error updating fighter:', error);
      return reply.status(500).send({ error: 'Failed to update fighter' });
    }
  });

  /**
   * Delete fighter
   * DELETE /api/admin/fighters/:id
   */
  fastify.delete('/fighters/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.fighter.delete({ where: { id } });
      return reply.send({ success: true });
    } catch (error) {
      console.error('Error deleting fighter:', error);
      return reply.status(500).send({ error: 'Failed to delete fighter' });
    }
  });

  // ============= FIGHTS CRUD =============

  /**
   * List all fights
   * GET /api/admin/fights
   */
  fastify.get('/fights', async (request, reply) => {
    try {
      const fights = await prisma.fight.findMany({
        include: {
          event: { select: { name: true, date: true } },
          fighter1: { select: { firstName: true, lastName: true } },
          fighter2: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return reply.send({ fights });
    } catch (error) {
      console.error('Error fetching fights:', error);
      return reply.status(500).send({ error: 'Failed to fetch fights' });
    }
  });

  /**
   * Update fight
   * PUT /api/admin/fights/:id
   */
  fastify.put('/fights/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const fight = await prisma.fight.update({
        where: { id },
        data: request.body as any,
      });
      return reply.send({ fight });
    } catch (error) {
      console.error('Error updating fight:', error);
      return reply.status(500).send({ error: 'Failed to update fight' });
    }
  });
};

export default adminStatsRoutes;
