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
            eventStatus: { not: 'COMPLETED' },
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
   * Acquisition-readiness snapshot — the numbers a buyer would ask about.
   * Live-events and operational fields wait on PostHog (TASK 3); they return null for now.
   * GET /api/admin/metrics/acquisition-snapshot
   */
  fastify.get('/metrics/acquisition-snapshot', async (request, reply) => {
    try {
      const now = new Date();
      const day = 24 * 60 * 60 * 1000;
      const oneDayAgo = new Date(now.getTime() - 1 * day);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * day);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * day);

      // ============= AUDIENCE =============
      const [
        totalUsers,
        activeUsers30d,
        activeUsers1d,
        newUsersLast30d,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { lastLoginAt: { gte: thirtyDaysAgo } } }),
        prisma.user.count({ where: { lastLoginAt: { gte: oneDayAgo } } }),
        prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      ]);

      const dauMauRatio = activeUsers30d > 0 ? activeUsers1d / activeUsers30d : 0;

      // 90-day growth rate via DailyMetrics snapshot. Falls back to null if we don't have
      // a snapshot from ~90 days ago — early in the project this will often be null.
      let growthRate90d: number | null = null;
      const ninetyDayWindowStart = new Date(ninetyDaysAgo);
      ninetyDayWindowStart.setHours(0, 0, 0, 0);
      const ninetyDayWindowEnd = new Date(ninetyDaysAgo);
      ninetyDayWindowEnd.setDate(ninetyDayWindowEnd.getDate() + 7);
      ninetyDayWindowEnd.setHours(23, 59, 59, 999);
      const ninetyDayBack = await prisma.dailyMetrics.findFirst({
        where: { date: { gte: ninetyDayWindowStart, lte: ninetyDayWindowEnd } },
        orderBy: { date: 'asc' },
      });
      if (ninetyDayBack && ninetyDayBack.totalUsers > 0) {
        growthRate90d = (totalUsers - ninetyDayBack.totalUsers) / ninetyDayBack.totalUsers;
      }

      // ============= DATASET =============
      const [
        totalRatings,
        totalReviews,
        uniqueFightsRated,
        uniqueFightsWith10PlusRatings,
        promotionGroups,
        oldestRating,
      ] = await Promise.all([
        prisma.fightRating.count(),
        prisma.fightReview.count(),
        prisma.fight.count({ where: { totalRatings: { gt: 0 } } }),
        prisma.fight.count({ where: { totalRatings: { gte: 10 } } }),
        prisma.event.groupBy({ by: ['promotion'] }),
        prisma.fightRating.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
      ]);

      const coveragePromotions = promotionGroups.length;
      const oldestRatingDate = oldestRating?.createdAt?.toISOString() ?? null;
      const avgRatingsPerActiveFight = uniqueFightsRated > 0 ? totalRatings / uniqueFightsRated : 0;

      // ============= ENGAGEMENT =============
      // Distinct users who rated in the last 30 days — pulled via raw SQL to avoid
      // hydrating all rating rows just to count distinct user IDs.
      const distinctRatingUsersResult = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "userId") AS count
        FROM fight_ratings
        WHERE "createdAt" >= ${thirtyDaysAgo}
      `;
      const usersWithRecentRating = Number(distinctRatingUsersResult[0]?.count ?? 0n);

      const [
        ratingsLast30d,
        activeUsersWithPushToken,
        followedByActiveUsers,
      ] = await Promise.all([
        prisma.fightRating.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
        prisma.user.count({
          where: {
            lastLoginAt: { gte: thirtyDaysAgo },
            pushToken: { not: null },
          },
        }),
        prisma.userFighterFollow.count({
          where: { user: { lastLoginAt: { gte: thirtyDaysAgo } } },
        }),
      ]);

      const ratingsPerActiveUser30d = activeUsers30d > 0 ? ratingsLast30d / activeUsers30d : 0;
      const pctMauWithRecentRating = activeUsers30d > 0 ? usersWithRecentRating / activeUsers30d : 0;
      const notificationOptInPct = activeUsers30d > 0 ? activeUsersWithPushToken / activeUsers30d : 0;
      const avgFollowedFightersPerActiveUser = activeUsers30d > 0
        ? followedByActiveUsers / activeUsers30d
        : 0;

      // ============= LIVE EVENTS =============
      // Event.totalRatings is denormalized and not kept in sync, so compute the
      // most recent COMPLETED event with at least one community rating via a
      // raw join. ORDER BY date DESC for the rating-recency story; the buyer
      // wants "the last card we ran," not "the card with the most ratings."
      const lastEventRows = await prisma.$queryRaw<{
        name: string;
        promotion: string;
        date: Date;
        rating_count: bigint;
      }[]>`
        SELECT e.name, e.promotion, e.date, COUNT(fr.id) AS rating_count
        FROM events e
        JOIN fights f ON f."eventId" = e.id
        JOIN fight_ratings fr ON fr."fightId" = f.id
        WHERE e."eventStatus" = 'COMPLETED'
          AND e.date <= NOW()
        GROUP BY e.id, e.name, e.promotion, e.date
        ORDER BY e.date DESC
        LIMIT 1
      `;
      const lastEvent = lastEventRows[0] ?? null;

      // ============= RESPONSE =============
      return reply.send({
        capturedAt: now.toISOString(),
        audience: {
          totalUsers,
          activeUsers30d,
          activeUsers1d,
          dauMauRatio: Number(dauMauRatio.toFixed(4)),
          newUsersLast30d,
          growthRate90d: growthRate90d !== null ? Number(growthRate90d.toFixed(4)) : null,
        },
        dataset: {
          totalRatings,
          totalReviews,
          uniqueFightsRated,
          uniqueFightsWith10PlusRatings,
          coveragePromotions,
          oldestRatingDate,
          avgRatingsPerActiveFight: Number(avgRatingsPerActiveFight.toFixed(2)),
        },
        engagement: {
          ratingsPerActiveUser30d: Number(ratingsPerActiveUser30d.toFixed(2)),
          pctMauWithRecentRating: Number(pctMauWithRecentRating.toFixed(4)),
          notificationOptInPct: Number(notificationOptInPct.toFixed(4)),
          avgFollowedFightersPerActiveUser: Number(avgFollowedFightersPerActiveUser.toFixed(2)),
        },
        liveEvents: {
          lastEventName: lastEvent?.name ?? null,
          lastEventPromotion: lastEvent?.promotion ?? null,
          lastEventDate: lastEvent?.date?.toISOString() ?? null,
          lastEventPeakConcurrentUsers: null,
          lastEventRatingsSubmitted: lastEvent ? Number(lastEvent.rating_count) : 0,
        },
        operational: {
          crashFreeSessionRate: null,
          backendUptimePct: null,
        },
      });
    } catch (error) {
      console.error('Error fetching acquisition snapshot:', error);
      return reply.status(500).send({
        error: 'Failed to fetch acquisition snapshot',
        code: 'ACQUISITION_SNAPSHOT_ERROR',
      });
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

  // ============= EVENTS/FIGHTERS/FIGHTS CRUD =============
  // NOTE: CRUD operations for events, fighters, and fights are now handled by
  // the admin.ts routes (registered under /api prefix) with proper Zod validation.
  // See: /api/admin/events, /api/admin/fighters/search, /api/admin/fights

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

          // Dynamically import and run the scraper with real-time output
          const { spawn } = require('child_process');
          const path = require('path');

          // In production (dist), go up to packages/backend/src, in dev use relative path
          const isDist = __dirname.includes('/dist/') || __dirname.includes('\\dist\\');
          const scraperPath = isDist
            ? path.join(__dirname, '../../src/services/scrapeAllUFCData.js')
            : path.join(__dirname, '../services/scrapeAllUFCData.js');

          console.log('📂 Scraper path info:', {
            __dirname,
            isDist,
            scraperPath,
            cwd: path.join(__dirname, isDist ? '../../../' : '../../'),
          });

          const scraper = spawn('node', [scraperPath], {
            cwd: path.join(__dirname, isDist ? '../../../' : '../../'),
            env: { ...process.env, SCRAPER_MODE: mode },
            stdio: ['ignore', 'pipe', 'pipe']
          });

          // Stream stdout in real-time
          scraper.stdout.on('data', (data: any) => {
            console.log('[SCRAPER]', data.toString().trim());
          });

          // Stream stderr in real-time
          scraper.stderr.on('data', (data: any) => {
            console.error('[SCRAPER ERROR]', data.toString().trim());
          });

          // Handle process exit
          scraper.on('close', (code: number) => {
            if (code === 0) {
              console.log('✅ Scraper completed successfully!');
            } else {
              console.error(`❌ Scraper exited with code ${code}`);
            }
          });

          // Handle spawn errors
          scraper.on('error', (error: any) => {
            console.error('❌ Failed to start scraper process:', error);
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
