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

  // ============= METRICS OVER TIME =============

  /**
   * Capture daily metrics snapshot
   * POST /api/admin/metrics/capture
   */
  fastify.post('/metrics/capture', async (request, reply) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if snapshot already exists for today
      const existing = await prisma.dailyMetrics.findUnique({
        where: { date: today },
      });

      if (existing) {
        return reply.send({
          message: 'Snapshot already exists for today',
          snapshot: existing
        });
      }

      // Calculate metrics
      const now = new Date();
      const todayStart = new Date(today);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);

      const [
        totalUsers,
        newUsers,
        activeUsers,
        totalRatings,
        totalReviews,
        ratingsToday,
        reviewsToday,
        totalSessions,
        totalEvents,
        totalFights,
        totalFighters,
        fightsRated,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({
          where: {
            createdAt: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.user.count({
          where: {
            lastLoginAt: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.fightRating.count(),
        prisma.fightReview.count(),
        prisma.fightRating.count({
          where: {
            createdAt: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.fightReview.count({
          where: {
            createdAt: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.userSession.count({
          where: {
            startedAt: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.event.count(),
        prisma.fight.count(),
        prisma.fighter.count(),
        prisma.fight.count({
          where: {
            totalRatings: { gt: 0 },
          },
        }),
      ]);

      // Calculate returning users
      const returningUsers = activeUsers - newUsers;

      // Create snapshot
      const snapshot = await prisma.dailyMetrics.create({
        data: {
          date: today,
          totalUsers,
          newUsers,
          activeUsers,
          returningUsers: Math.max(0, returningUsers),
          totalRatings,
          totalReviews,
          totalSessions,
          fightsRated: ratingsToday,
          totalTags: 0,  // TODO: implement if needed
          avgSessionDuration: null,  // TODO: calculate from sessions
          totalScreenViews: 0,  // TODO: implement if needed
          avgRating: null,  // TODO: calculate from ratings
          fightsViewed: 0,  // TODO: implement if needed
        },
      });

      return reply.send({
        message: 'Daily metrics captured successfully',
        snapshot
      });
    } catch (error) {
      console.error('Error capturing daily metrics:', error);
      return reply.status(500).send({ error: 'Failed to capture metrics' });
    }
  });

  /**
   * Get historical metrics
   * GET /api/admin/metrics/history
   */
  fastify.get('/metrics/history', async (request, reply) => {
    try {
      const { days = 30 } = request.query as { days?: number };

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - Number(days));
      startDate.setHours(0, 0, 0, 0);

      const metrics = await prisma.dailyMetrics.findMany({
        where: {
          date: { gte: startDate },
        },
        orderBy: { date: 'asc' },
      });

      return reply.send({ metrics, days: Number(days) });
    } catch (error) {
      console.error('Error fetching historical metrics:', error);
      return reply.status(500).send({ error: 'Failed to fetch metrics history' });
    }
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

  // ============= UFC SCRAPER =============

  /**
   * Trigger UFC data scraper to update fight/event details
   * POST /api/admin/scrape-ufc
   */
  fastify.post('/scrape-ufc', async (request, reply) => {
    try {
      const { mode = 'automated' } = request.body as { mode?: 'manual' | 'automated' };

      // Send immediate response - scraping will happen in background
      reply.send({
        message: 'UFC scraper started',
        mode,
        note: 'Scraping is running in the background. Check logs for progress and results.'
      });

      // Run scraper in background (don't await)
      (async () => {
        try {
          console.log(`\n🚀 Starting UFC scraper in ${mode} mode...`);

          // Dynamically import and run the scraper
          const { exec } = require('child_process');
          const path = require('path');

          // In production (dist), go up to packages/backend/src, in dev use relative path
          const isDist = __dirname.includes('/dist/') || __dirname.includes('\\dist\\');
          const scraperPath = isDist
            ? path.join(__dirname, '../../src/services/scrapeAllUFCData.js')
            : path.join(__dirname, '../services/scrapeAllUFCData.js');

          const command = `node ${scraperPath}`;

          exec(command, {
            cwd: path.join(__dirname, isDist ? '../../../' : '../../'),
            env: { ...process.env, SCRAPER_MODE: mode }
          }, (error: any, stdout: any, stderr: any) => {
            if (error) {
              console.error('❌ Scraper error:', error.message);
              console.error('stderr:', stderr);
              return;
            }

            console.log('✅ Scraper completed successfully!');
            console.log(stdout);

            if (stderr) {
              console.log('Scraper warnings:', stderr);
            }
          });
        } catch (error: any) {
          console.error('❌ Failed to start scraper:', error.message);
        }
      })();

    } catch (error: any) {
      console.error('Error starting scraper:', error);
      return reply.status(500).send({
        error: 'Failed to start scraper',
        details: error.message
      });
    }
  });
};

export default adminStatsRoutes;
