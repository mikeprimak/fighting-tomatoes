// packages/backend/src/routes/index.ts
import { FastifyInstance } from 'fastify';
import { fightRoutes } from './fights';
import { authRoutes } from './auth.fastify';
import { crewRoutes } from './crews';
import importRoutes from './import';
import liveEventsRoutes from './liveEvents';
import mockLiveEventsRoutes from './mockLiveEvents';
import notificationsRoutes from './notifications';
import notificationRulesRoutes from './notificationRules';
import newsRoutes from './news';
import communityRoutes from './community';
import searchRoutes from './search';
import feedbackRoutes from './feedback';
import { uploadRoutes } from './upload';
import { adminRoutes } from './admin';
import giphyRoutes from './giphy';
import { authenticateUser, requireEmailVerification } from '../middleware/auth';
import { optionalAuthenticateMiddleware } from '../middleware/auth.fastify';
import { triggerDailyUFCScraper } from '../services/backgroundJobs';
import { notificationRuleEngine } from '../services/notificationRuleEngine';

// Organization filter groups - maps filter buttons to actual promotions
// BOXING is an aggregate that includes multiple boxing promoters but excludes Dirty Boxing
const ORG_FILTER_GROUPS: Record<string, { contains?: string[]; excludes?: string[] }> = {
  'BOXING': {
    contains: ['MATCHROOM', 'TOP RANK', 'TOP_RANK', 'GOLDEN BOY', 'GOLDEN_BOY', 'SHOWTIME', 'MOST VALUABLE', 'MVP BOXING', 'PBC', 'PREMIER BOXING', 'DAZN', 'ESPN BOXING'],
    excludes: ['DIRTY'],
  },
  'DIRTY BOXING': {
    contains: ['DIRTY BOXING'],
  },
};
// import analyticsRoutes from './analytics'; // TEMPORARILY DISABLED

export async function registerRoutes(fastify: FastifyInstance) {
  // Health check endpoint
  fastify.get('/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['system'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string' },
            database: { type: 'string' },
          },
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string' },
            database: { type: 'string' },
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      
      return reply.code(200).send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'connected',
      });
    } catch (error) {
      return reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'disconnected',
        error: 'Database connection failed',
      });
    }
  });

  // API status endpoint
  fastify.get('/api/status', {
    schema: {
      description: 'API status and statistics',
      tags: ['system'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            version: { type: 'string' },
            environment: { type: 'string' },
            uptime: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' },
            features: {
              type: 'object',
              properties: {
                emailVerification: { type: 'boolean' },
                pushNotifications: { type: 'boolean' },
                realTimeUpdates: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    return reply.code(200).send({
      status: 'operational',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      features: {
        emailVerification: process.env.SKIP_EMAIL_VERIFICATION !== 'true',
        pushNotifications: false,
        realTimeUpdates: false,
      },
    });
  });

  // Simple test endpoint
  fastify.get('/api/test', async (request, reply) => {
    return reply.code(200).send({
      message: 'FightCrewApp API is working!',
      timestamp: new Date().toISOString(),
    });
  });

  // Manual trigger for daily UFC scraper (for testing R2)
  fastify.post('/api/trigger-daily-scraper', async (request, reply) => {
    try {
      console.log('[API] Manual trigger: Daily UFC scraper');
      const results = await triggerDailyUFCScraper();

      return reply.send({
        success: true,
        message: 'Daily UFC scraper completed',
        data: results
      });
    } catch (error: any) {
      console.error('[API] Daily scraper trigger failed:', error);
      return reply.code(500).send({
        error: 'Daily scraper failed',
        message: error.message
      });
    }
  });

  // Events endpoint with optional fights included
  fastify.get('/api/events', {
    preHandler: optionalAuthenticateMiddleware,
    schema: {
      description: 'Get events list with optional fights included',
      tags: ['events'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          page: { type: 'integer', minimum: 1, default: 1 },
          type: { type: 'string', enum: ['upcoming', 'past', 'all'], default: 'all' },
          includeFights: { type: 'boolean', default: false },
          promotions: { type: 'string', description: 'Comma-separated list of promotions to filter by (e.g., "UFC,PFL,ONE")' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            events: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  promotion: { type: 'string' },
                  date: { type: 'string' },
                  venue: { type: 'string' },
                  location: { type: 'string' },
                  hasStarted: { type: 'boolean' },
                  isComplete: { type: 'boolean' },
                  bannerImage: { type: ['string', 'null'] },
                  earlyPrelimStartTime: { type: ['string', 'null'] },
                  prelimStartTime: { type: ['string', 'null'] },
                  mainStartTime: { type: ['string', 'null'] },
                  fights: { type: 'array' },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
              },
            },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { limit = 20, page = 1, type = 'all', includeFights = false, promotions } = request.query as any;
    const skip = (page - 1) * limit;
    const userId = (request as any).user?.id;

    try {
      // Base filter: only return events that have at least one fight announced
      const whereClause: any = {
        fights: { some: {} }
      };

      // Add type filter for upcoming/past events
      if (type === 'upcoming') {
        whereClause.isComplete = false;
      } else if (type === 'past') {
        whereClause.isComplete = true;
      }

      // Add promotions filter if provided
      if (promotions && typeof promotions === 'string') {
        const promotionList = promotions.split(',').map((p: string) => p.trim().toUpperCase());

        // Build OR conditions for each requested promotion
        const orConditions: any[] = [];
        const excludeConditions: any[] = [];

        for (const promo of promotionList) {
          const group = ORG_FILTER_GROUPS[promo];
          if (group) {
            // This is a grouped filter (e.g., BOXING includes multiple promoters)
            if (group.contains) {
              for (const containsPromo of group.contains) {
                // Don't convert underscores - add the pattern as-is
                orConditions.push({
                  promotion: {
                    contains: containsPromo,
                    mode: 'insensitive',
                  },
                });
              }
            }
            if (group.excludes) {
              for (const excludePromo of group.excludes) {
                excludeConditions.push({
                  promotion: {
                    contains: excludePromo,
                    mode: 'insensitive',
                  },
                });
              }
            }
          } else {
            // Standard filter - just match the promotion name
            orConditions.push({
              promotion: {
                contains: promo.replace(/_/g, ' '),
                mode: 'insensitive',
              },
            });
          }
        }

        // Build the final where clause
        if (orConditions.length > 0) {
          whereClause.OR = orConditions;
        }
        // Add NOT conditions for excludes
        if (excludeConditions.length > 0) {
          whereClause.NOT = excludeConditions;
        }
      }

      // Determine sort order based on type
      // Upcoming: soonest first (asc), Past: most recent first (desc)
      // Include id as secondary sort to ensure deterministic ordering for events on same date
      const orderBy = type === 'upcoming'
        ? [{ date: 'asc' as const }, { id: 'asc' as const }]
        : [{ date: 'desc' as const }, { id: 'asc' as const }];

      // Build select object
      const select: any = {
        id: true,
        name: true,
        promotion: true,
        date: true,
        venue: true,
        location: true,
        hasStarted: true,
        isComplete: true,
        averageRating: true,
        totalRatings: true,
        greatFights: true,
        bannerImage: true,
        earlyPrelimStartTime: true,
        prelimStartTime: true,
        mainStartTime: true,
      };

      // Include fights if requested
      if (includeFights) {
        select.fights = {
          orderBy: { orderOnCard: 'asc' },
          select: {
            id: true,
            weightClass: true,
            isTitle: true,
            titleName: true,
            orderOnCard: true,
            hasStarted: true,
            isComplete: true,
            winner: true,
            method: true,
            round: true,
            time: true,
            averageRating: true,
            totalRatings: true,
            fighter1: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nickname: true,
                profileImage: true,
                wins: true,
                losses: true,
                draws: true,
              },
            },
            fighter2: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nickname: true,
                profileImage: true,
                wins: true,
                losses: true,
                draws: true,
              },
            },
            _count: {
              select: {
                preFightComments: true,
              },
            },
          },
        };
      }

      const [events, total] = await Promise.all([
        fastify.prisma.event.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy,
          select,
        }),
        fastify.prisma.event.count({ where: whereClause }),
      ]);

      // If fights are included, calculate aggregate hype/ratings for each fight
      let transformedEvents = events;
      if (includeFights && events.length > 0) {
        // Get all fight IDs across all events
        const allFightIds = events.flatMap((e: any) => e.fights?.map((f: any) => f.id) || []);

        if (allFightIds.length > 0) {
          // Batch fetch predictions for hype calculation (all users)
          const allPredictions = await fastify.prisma.fightPrediction.findMany({
            where: {
              fightId: { in: allFightIds },
              predictedRating: { not: null },
            },
            select: {
              fightId: true,
              predictedRating: true,
            },
          });

          // Group predictions by fight for average hype
          const hypeByFight = new Map<string, { total: number; count: number }>();
          for (const pred of allPredictions) {
            const existing = hypeByFight.get(pred.fightId) || { total: 0, count: 0 };
            existing.total += pred.predictedRating || 0;
            existing.count += 1;
            hypeByFight.set(pred.fightId, existing);
          }

          // Fetch user-specific data if authenticated (parallel queries for performance)
          let userRatingsByFight = new Map<string, number>();
          let userPredictionsByFight = new Map<string, { predictedRating: number | null; predictedWinner: string | null; predictedMethod: string | null }>();

          if (userId) {
            const [userRatings, userPredictions] = await Promise.all([
              fastify.prisma.fightRating.findMany({
                where: {
                  fightId: { in: allFightIds },
                  userId: userId,
                },
                select: {
                  fightId: true,
                  rating: true,
                },
              }),
              fastify.prisma.fightPrediction.findMany({
                where: {
                  fightId: { in: allFightIds },
                  userId: userId,
                },
                select: {
                  fightId: true,
                  predictedRating: true,
                  predictedWinner: true,
                  predictedMethod: true,
                },
              }),
            ]);

            for (const rating of userRatings) {
              userRatingsByFight.set(rating.fightId, rating.rating);
            }
            for (const pred of userPredictions) {
              userPredictionsByFight.set(pred.fightId, {
                predictedRating: pred.predictedRating,
                predictedWinner: pred.predictedWinner,
                predictedMethod: pred.predictedMethod,
              });
            }
          }

          // Fetch notification reasons for each fight if user is authenticated
          // Skip for past events - notification reasons are irrelevant for completed fights
          let notificationReasonsByFight = new Map<string, { willBeNotified: boolean; reasons: any[] }>();
          if (userId && type !== 'past') {
            // Batch fetch notification reasons for all fights
            const notificationPromises = allFightIds.map(async (fightId: string) => {
              const reasons = await notificationRuleEngine.getNotificationReasonsForFight(userId, fightId);
              return { fightId, reasons };
            });
            const notificationResults = await Promise.all(notificationPromises);
            for (const result of notificationResults) {
              notificationReasonsByFight.set(result.fightId, result.reasons);
            }
          }

          // Transform events to add averageHype, commentCount, and user data to fights
          transformedEvents = events.map((event: any) => ({
            ...event,
            fights: event.fights?.map((fight: any) => {
              const hypeData = hypeByFight.get(fight.id);
              const userRating = userRatingsByFight.get(fight.id);
              const userPrediction = userPredictionsByFight.get(fight.id);
              const notificationReasons = notificationReasonsByFight.get(fight.id);

              return {
                ...fight,
                averageHype: hypeData && hypeData.count > 0
                  ? Math.round((hypeData.total / hypeData.count) * 10) / 10
                  : 0,
                commentCount: fight._count?.preFightComments || 0,
                // User-specific data (null if not authenticated or no data)
                userRating: userRating ?? null,
                userHypePrediction: userPrediction?.predictedRating ?? null,
                userPredictedWinner: userPrediction?.predictedWinner ?? null,
                userPredictedMethod: userPrediction?.predictedMethod ?? null,
                // Notification data (null if not authenticated)
                notificationReasons: notificationReasons ?? null,
              };
            }) || [],
          }));
        }
      }

      const totalPages = Math.ceil(total / limit);

      return reply.code(200).send({
        events: transformedEvents,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    } catch (error: any) {
      request.log.error('Events fetch error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Single event endpoint
  fastify.get('/api/events/:id', {
    schema: {
      description: 'Get single event details',
      tags: ['events'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            event: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                promotion: { type: 'string' },
                date: { type: 'string' },
                venue: { type: 'string' },
                location: { type: 'string' },
                hasStarted: { type: 'boolean' },
                isComplete: { type: 'boolean' },
                averageRating: { type: 'number' },
                totalRatings: { type: 'integer' },
                greatFights: { type: 'integer' },
                bannerImage: { type: ['string', 'null'] },
                earlyPrelimStartTime: { type: ['string', 'null'] },
                prelimStartTime: { type: ['string', 'null'] },
                mainStartTime: { type: ['string', 'null'] },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const event = await fastify.prisma.event.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          promotion: true,
          date: true,
          venue: true,
          location: true,
          hasStarted: true,
          isComplete: true,
          averageRating: true,
          totalRatings: true,
          greatFights: true,
          bannerImage: true,
          earlyPrelimStartTime: true,
          prelimStartTime: true,
          mainStartTime: true,
        },
      });

      if (!event) {
        return reply.code(404).send({
          error: 'Event not found',
          code: 'EVENT_NOT_FOUND',
        });
      }

      return reply.code(200).send({ event });
    } catch (error: any) {
      request.log.error('Event fetch error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Event engagement endpoint - Get user's engagement stats for an event
  fastify.get('/api/events/:id/engagement', {
    schema: {
      description: 'Get user engagement summary for an event',
      tags: ['events'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    preHandler: authenticateUser,
  }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;

    try {
      // Get event with all fights
      const event = await fastify.prisma.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          name: true,
          fights: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!event) {
        return reply.code(404).send({
          error: 'Event not found',
          code: 'EVENT_NOT_FOUND',
        });
      }

      const fightIds = event.fights.map((f: any) => f.id);

      // Get fights with fighter details
      const fightsWithDetails = await fastify.prisma.fight.findMany({
        where: { id: { in: fightIds } },
        select: {
          id: true,
          fighter1Id: true,
          fighter2Id: true,
          fighter1: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          fighter2: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Get user's individual predictions
      const individualPredictions = await fastify.prisma.fightPrediction.findMany({
        where: {
          userId: user.id,
          fightId: { in: fightIds },
        },
        select: {
          fightId: true,
          predictedRating: true,
          predictedWinner: true,
        },
      });

      // Get user's crew predictions
      const crewPredictions = await fastify.prisma.crewPrediction.findMany({
        where: {
          userId: user.id,
          fightId: { in: fightIds },
        },
        select: {
          fightId: true,
          hypeLevel: true,
        },
      });

      // Combine predictions (deduplicate by fightId, keep hype level and predicted winner)
      const allPredictionsByFight = new Map<string, { hype: number | null; predictedWinner?: string }>();
      individualPredictions.forEach((p: any) => {
        if (!allPredictionsByFight.has(p.fightId)) {
          allPredictionsByFight.set(p.fightId, {
            hype: p.predictedRating,
            predictedWinner: p.predictedWinner,
          });
        }
      });
      crewPredictions.forEach((p: any) => {
        if (!allPredictionsByFight.has(p.fightId)) {
          allPredictionsByFight.set(p.fightId, {
            hype: p.hypeLevel,
          });
        }
      });

      // Get user's ratings
      const ratings = await fastify.prisma.fightRating.findMany({
        where: {
          userId: user.id,
          fightId: { in: fightIds },
        },
      });

      // Calculate average hype
      const hypeLevels = Array.from(allPredictionsByFight.values())
        .map(p => p.hype)
        .filter((rating): rating is number => rating !== null && rating > 0);
      const avgHype = hypeLevels.length > 0
        ? hypeLevels.reduce((sum, rating) => sum + rating, 0) / hypeLevels.length
        : null;

      // Get top 3 most hyped fights (hype score 7 or higher)
      const predictionsWithFights = Array.from(allPredictionsByFight.entries())
        .filter(([_, predData]) => predData.hype !== null && predData.hype >= 7)
        .map(([fightId, predData]) => {
          const fight = fightsWithDetails.find((f: any) => f.id === fightId);
          return {
            fightId,
            hype: predData.hype as number,
            fighter1: fight ? `${fight.fighter1.firstName} ${fight.fighter1.lastName}` : '',
            fighter2: fight ? `${fight.fighter2.firstName} ${fight.fighter2.lastName}` : '',
            fighter1Id: fight?.fighter1Id,
            fighter2Id: fight?.fighter2Id,
            predictedWinner: predData.predictedWinner,
          };
        })
        .sort((a, b) => b.hype - a.hype)
        .slice(0, 3);

      const engagement = {
        totalFights: event.fights.length,
        predictionsCount: allPredictionsByFight.size,
        ratingsCount: ratings.length,
        averageHype: avgHype ? Number(avgHype.toFixed(1)) : null,
        topHypedFights: predictionsWithFights,
      };

      console.log('Event engagement:', engagement);

      return reply.send(engagement);
    } catch (error: any) {
      request.log.error('Event engagement fetch error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Event predictions endpoint - Get aggregate predictions for an event
  fastify.get('/api/events/:id/predictions', async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    try {
      // Check if event exists
      const event = await fastify.prisma.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          name: true,
          hasStarted: true,
        },
      });

      if (!event) {
        return reply.code(404).send({
          error: 'Event not found',
          code: 'EVENT_NOT_FOUND',
        });
      }

      // Get all fights for this event
      const fights = await fastify.prisma.fight.findMany({
        where: { eventId },
        include: {
          fighter1: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              nickname: true,
              profileImage: true,
            },
          },
          fighter2: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              nickname: true,
              profileImage: true,
            },
          },
          predictions: {
            select: {
              id: true,
              predictedRating: true,
              predictedWinner: true,
              predictedMethod: true,
              predictedRound: true,
            },
          },
        },
        orderBy: {
          orderOnCard: 'asc', // Main event first
        },
      });

      // Calculate hype level for each fight (average predicted rating)
      const fightsWithHype = fights.map((fight: any) => {
        const predictionsWithRating = fight.predictions.filter((p: any) => p.predictedRating !== null);
        const averageHype = predictionsWithRating.length > 0
          ? predictionsWithRating.reduce((sum: number, p: any) => sum + p.predictedRating, 0) / predictionsWithRating.length
          : 0;

        const totalPredictions = fight.predictions.length;
        const fighter1Predictions = fight.predictions.filter((p: any) => p.predictedWinner === fight.fighter1Id).length;
        const fighter2Predictions = fight.predictions.filter((p: any) => p.predictedWinner === fight.fighter2Id).length;

        return {
          id: fight.id,
          fighter1: fight.fighter1,
          fighter2: fight.fighter2,
          isTitle: fight.isTitle,
          weightClass: fight.weightClass,
          orderOnCard: fight.orderOnCard,
          totalPredictions,
          averageHype: Math.round(averageHype * 10) / 10,
          fighter1Predictions,
          fighter2Predictions,
          predictions: fight.predictions,
        };
      });

      // Get top 3 most hyped fights
      const mostHypedFights = [...fightsWithHype]
        .filter(f => f.averageHype > 0)
        .sort((a, b) => b.averageHype - a.averageHype)
        .slice(0, 3)
        .map(f => ({
          fightId: f.id,
          fighter1: {
            id: f.fighter1.id,
            name: `${f.fighter1.firstName} ${f.fighter1.lastName}`,
            nickname: f.fighter1.nickname,
            profileImage: f.fighter1.profileImage,
          },
          fighter2: {
            id: f.fighter2.id,
            name: `${f.fighter2.firstName} ${f.fighter2.lastName}`,
            nickname: f.fighter2.nickname,
            profileImage: f.fighter2.profileImage,
          },
          isTitle: f.isTitle,
          weightClass: f.weightClass,
          averageHype: f.averageHype,
          totalPredictions: f.totalPredictions,
        }));

      // Aggregate all fighter win predictions across all fights
      const fighterWinCounts: Record<string, { fighter: any; opponent: any; fightId: string; count: number; totalFightPredictions: number; methods: Record<string, number>; rounds: Record<number, number> }> = {};

      fightsWithHype.forEach((fight: any) => {
        // Process fighter1 predictions
        if (fight.fighter1Predictions > 0) {
          if (!fighterWinCounts[fight.fighter1.id]) {
            fighterWinCounts[fight.fighter1.id] = {
              fighter: fight.fighter1,
              opponent: fight.fighter2,
              fightId: fight.id,
              count: 0,
              totalFightPredictions: fight.totalPredictions,
              methods: { DECISION: 0, KO_TKO: 0, SUBMISSION: 0 },
              rounds: {},
            };
          }
          fighterWinCounts[fight.fighter1.id].count += fight.fighter1Predictions;

          // Count methods and rounds for fighter1
          fight.predictions.forEach((p: any) => {
            if (p.predictedWinner === fight.fighter1.id) {
              if (p.predictedMethod) {
                fighterWinCounts[fight.fighter1.id].methods[p.predictedMethod]++;
              }
              if (p.predictedRound) {
                fighterWinCounts[fight.fighter1.id].rounds[p.predictedRound] =
                  (fighterWinCounts[fight.fighter1.id].rounds[p.predictedRound] || 0) + 1;
              }
            }
          });
        }

        // Process fighter2 predictions
        if (fight.fighter2Predictions > 0) {
          if (!fighterWinCounts[fight.fighter2.id]) {
            fighterWinCounts[fight.fighter2.id] = {
              fighter: fight.fighter2,
              opponent: fight.fighter1,
              fightId: fight.id,
              count: 0,
              totalFightPredictions: fight.totalPredictions,
              methods: { DECISION: 0, KO_TKO: 0, SUBMISSION: 0 },
              rounds: {},
            };
          }
          fighterWinCounts[fight.fighter2.id].count += fight.fighter2Predictions;

          // Count methods and rounds for fighter2
          fight.predictions.forEach((p: any) => {
            if (p.predictedWinner === fight.fighter2.id) {
              if (p.predictedMethod) {
                fighterWinCounts[fight.fighter2.id].methods[p.predictedMethod]++;
              }
              if (p.predictedRound) {
                fighterWinCounts[fight.fighter2.id].rounds[p.predictedRound] =
                  (fighterWinCounts[fight.fighter2.id].rounds[p.predictedRound] || 0) + 1;
              }
            }
          });
        }
      });

      // Sort fighters by prediction count and get top fighters
      const topFighters = Object.values(fighterWinCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10) // Top 10 fighters
        .map(f => ({
          fightId: f.fightId,
          fighterId: f.fighter.id,
          name: `${f.fighter.firstName} ${f.fighter.lastName}`,
          nickname: f.fighter.nickname,
          profileImage: f.fighter.profileImage,
          winPredictions: f.count,
          totalFightPredictions: f.totalFightPredictions,
          methodBreakdown: f.methods,
          roundBreakdown: f.rounds,
          opponent: {
            id: f.opponent.id,
            name: `${f.opponent.firstName} ${f.opponent.lastName}`,
            nickname: f.opponent.nickname,
            profileImage: f.opponent.profileImage,
          },
        }));

      // Overall stats
      const totalPredictions = fightsWithHype.reduce((sum, f) => sum + f.totalPredictions, 0);
      const averageEventHype = fightsWithHype.length > 0
        ? fightsWithHype.reduce((sum, f) => sum + f.averageHype, 0) / fightsWithHype.length
        : 0;

      return reply.send({
        eventId,
        eventName: event.name,
        hasStarted: event.hasStarted,
        totalPredictions,
        averageEventHype: Math.round(averageEventHype * 10) / 10,
        mostHypedFights,
        topFighters,
      });

    } catch (error: any) {
      request.log.error('Event predictions fetch error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Fighters endpoint
  fastify.get('/api/fighters', {
    schema: {
      description: 'Get fighters list',
      tags: ['fighters'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          page: { type: 'integer', minimum: 1, default: 1 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            fighters: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  nickname: { type: 'string' },
                  wins: { type: 'integer' },
                  losses: { type: 'integer' },
                  draws: { type: 'integer' },
                  weightClass: { type: 'string' },
                  profileImage: { type: 'string' },
                  actionImage: { type: 'string' },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
              },
            },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { limit = 20, page = 1 } = request.query as any;
    const skip = (page - 1) * limit;

    try {
      const [fighters, total] = await Promise.all([
        fastify.prisma.fighter.findMany({
          skip,
          take: limit,
          orderBy: { lastName: 'asc' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nickname: true,
            wins: true,
            losses: true,
            draws: true,
            weightClass: true,
            profileImage: true,
            actionImage: true,
          },
        }),
        fastify.prisma.fighter.count(),
      ]);

      const totalPages = Math.ceil(total / limit);

      return reply.code(200).send({
        fighters,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    } catch (error: any) {
      request.log.error('Fighters fetch error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Single fighter endpoint
  fastify.get('/api/fighters/:id', {
    schema: {
      description: 'Get single fighter details',
      tags: ['fighters'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            fighter: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                nickname: { type: 'string' },
                wins: { type: 'integer' },
                losses: { type: 'integer' },
                draws: { type: 'integer' },
                weightClass: { type: 'string' },
                rank: { type: 'string' },
                team: { type: 'string' },
                birthDate: { type: 'string' },
                nationality: { type: 'string' },
                reach: { type: 'number' },
                height: { type: 'string' },
                createdAt: { type: 'string' },
                profileImage: { type: 'string' },
                actionImage: { type: 'string' },
                isFollowing: { type: 'boolean' },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
    preValidation: async (request, reply) => {
      // Try to authenticate if token is present, but don't fail if it's not
      try {
        await authenticateUser(request, reply);
      } catch (error) {
        // Ignore authentication errors - endpoint works for both authenticated and unauthenticated users
      }
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const fighter = await fastify.prisma.fighter.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          nickname: true,
          wins: true,
          losses: true,
          draws: true,
          weightClass: true,
          rank: true,
          createdAt: true,
          profileImage: true,
          actionImage: true,
        },
      });

      if (!fighter) {
        return reply.code(404).send({
          error: 'Fighter not found',
          code: 'FIGHTER_NOT_FOUND',
        });
      }

      // Check if user is following this fighter (if authenticated)
      let isFollowing = false;
      const user = (request as any).user;
      if (user) {
        const follow = await fastify.prisma.userFighterFollow.findUnique({
          where: {
            userId_fighterId: {
              userId: user.id,
              fighterId: id,
            },
          },
        });
        isFollowing = !!follow;
      }

      return reply.code(200).send({
        fighter: {
          ...fighter,
          isFollowing,
        },
      });
    } catch (error: any) {
      request.log.error('Fighter fetch error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Follow fighter endpoint
  fastify.post('/api/fighters/:id/follow', {
    schema: {
      description: 'Follow a fighter to get notifications',
      tags: ['fighters'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            isFollowing: { type: 'boolean' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
    preHandler: [authenticateUser, requireEmailVerification],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    try {
      // Check if fighter exists
      const fighter = await fastify.prisma.fighter.findUnique({
        where: { id },
        select: { id: true, firstName: true, lastName: true },
      });

      if (!fighter) {
        return reply.code(404).send({
          error: 'Fighter not found',
          code: 'FIGHTER_NOT_FOUND',
        });
      }

      // Check if already following
      const existingFollow = await fastify.prisma.userFighterFollow.findUnique({
        where: {
          userId_fighterId: {
            userId: user.id,
            fighterId: id,
          },
        },
      });

      if (existingFollow) {
        return reply.code(200).send({
          message: 'Already following this fighter',
          isFollowing: true,
        });
      }

      // Create follow (for UI display)
      await fastify.prisma.userFighterFollow.create({
        data: {
          userId: user.id,
          fighterId: id,
        },
      });

      // Create notification rule for this fighter (auto-enabled)
      const { manageFighterNotificationRule } = await import('../services/notificationRuleHelpers');
      await manageFighterNotificationRule(user.id, id, true);

      return reply.code(200).send({
        message: `Now following ${fighter.firstName} ${fighter.lastName}`,
        isFollowing: true,
      });
    } catch (error: any) {
      request.log.error('Follow fighter error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Unfollow fighter endpoint
  fastify.delete('/api/fighters/:id/unfollow', {
    schema: {
      description: 'Unfollow a fighter',
      tags: ['fighters'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            isFollowing: { type: 'boolean' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
    preHandler: [authenticateUser, requireEmailVerification],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    try {
      // Delete follow if it exists
      await fastify.prisma.userFighterFollow.deleteMany({
        where: {
          userId: user.id,
          fighterId: id,
        },
      });

      // Deactivate notification rule for this fighter
      const { manageFighterNotificationRule } = await import('../services/notificationRuleHelpers');
      await manageFighterNotificationRule(user.id, id, false);

      return reply.code(200).send({
        message: 'Unfollowed fighter',
        isFollowing: false,
      });
    } catch (error: any) {
      request.log.error('Unfollow fighter error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Update fighter notification preferences endpoint
  // Get followed fighters endpoint
  fastify.get('/api/fighters/followed', {
    schema: {
      description: 'Get fighters that the current user is following',
      tags: ['fighters'],
      response: {
        200: {
          type: 'object',
          properties: {
            fighters: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  nickname: { type: 'string' },
                  wins: { type: 'integer' },
                  losses: { type: 'integer' },
                  draws: { type: 'integer' },
                  weightClass: { type: 'string' },
                  profileImage: { type: 'string' },
                },
              },
            },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
    preHandler: authenticateUser,
  }, async (request, reply) => {
    const user = (request as any).user;

    try {
      const followedFighters = await fastify.prisma.userFighterFollow.findMany({
        where: {
          userId: user.id,
        },
        include: {
          fighter: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              nickname: true,
              wins: true,
              losses: true,
              draws: true,
              weightClass: true,
              profileImage: true,
            },
          },
        },
      });

      // Map and sort by fighter's last name
      const fighters = followedFighters
        .map((follow: any) => ({
          ...follow.fighter,
          // Notification preferences removed - now managed via notification rules
        }))
        .sort((a: any, b: any) => a.lastName.localeCompare(b.lastName));

      return reply.code(200).send({ fighters });
    } catch (error: any) {
      request.log.error('Get followed fighters error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  fastify.patch('/api/fighters/:id/notification-preferences', {
    schema: {
      description: 'Update notification preferences for a followed fighter',
      tags: ['fighters'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          startOfFightNotification: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            startOfFightNotification: { type: 'boolean' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
    preHandler: [authenticateUser, requireEmailVerification],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { startOfFightNotification } = request.body as { startOfFightNotification?: boolean };
    const user = (request as any).user;

    try {
      // Check if user is following this fighter
      const existingFollow = await fastify.prisma.userFighterFollow.findUnique({
        where: {
          userId_fighterId: {
            userId: user.id,
            fighterId: id,
          },
        },
      });

      if (!existingFollow) {
        return reply.code(404).send({
          error: 'You are not following this fighter',
          code: 'NOT_FOLLOWING',
        });
      }

      // Update notification rule for this fighter
      if (startOfFightNotification !== undefined) {
        const { manageFighterNotificationRule } = await import('../services/notificationRuleHelpers');
        await manageFighterNotificationRule(user.id, id, startOfFightNotification);
      }

      return reply.code(200).send({
        message: 'Notification preferences updated',
        startOfFightNotification: startOfFightNotification ?? false,
      });
    } catch (error: any) {
      request.log.error('Update fighter notification preferences error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Follow fight (create alert) endpoint
  fastify.post('/api/fights/:id/follow', {
    schema: {
      description: 'Follow a fight to get notifications when it starts',
      tags: ['fights'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            isFollowing: { type: 'boolean' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
    preHandler: [authenticateUser, requireEmailVerification],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    try {
      // Check if fight exists
      const fight = await fastify.prisma.fight.findUnique({
        where: { id },
        select: { id: true, event: { select: { date: true } } },
      });

      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Use the new notification rule system
      const { manageManualFightRule, hasManualFightRule } = await import('../services/notificationRuleHelpers');

      // Check if already following
      const isAlreadyFollowing = await hasManualFightRule(user.id, id);

      if (isAlreadyFollowing) {
        return reply.code(200).send({
          message: 'Already following this fight',
          isFollowing: true,
        });
      }

      // Create notification rule for this fight
      await manageManualFightRule(user.id, id, true);

      return reply.code(200).send({
        message: 'Now following this fight',
        isFollowing: true,
      });
    } catch (error: any) {
      request.log.error('Follow fight error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Unfollow fight (delete alert) endpoint
  fastify.delete('/api/fights/:id/unfollow', {
    schema: {
      description: 'Unfollow a fight',
      tags: ['fights'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            isFollowing: { type: 'boolean' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
    preHandler: [authenticateUser, requireEmailVerification],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    try {
      // Use the new notification rule system
      const { manageManualFightRule } = await import('../services/notificationRuleHelpers');

      // Deactivate the notification rule for this fight
      await manageManualFightRule(user.id, id, false);

      return reply.code(200).send({
        message: 'Unfollowed fight',
        isFollowing: false,
      });
    } catch (error: any) {
      request.log.error('Unfollow fight error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Toggle fight notification (per-fight override)
  fastify.patch('/api/fights/:id/notification', {
    schema: {
      description: 'Toggle notification for a specific fight (override for all notification rules)',
      tags: ['fights'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
        },
        required: ['enabled'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            willBeNotified: { type: 'boolean' },
            affectedMatches: { type: 'number' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
    preHandler: [authenticateUser, requireEmailVerification],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { enabled } = request.body as { enabled: boolean };
    const user = (request as any).user;

    try {
      const { toggleFightNotificationOverride } = await import('../services/notificationRuleHelpers');

      const result = await toggleFightNotificationOverride(user.id, id, enabled);

      return reply.code(200).send({
        message: enabled
          ? 'Notification enabled for this fight'
          : 'Notification disabled for this fight',
        willBeNotified: result.willBeNotified,
        affectedMatches: result.affectedMatches,
      });
    } catch (error: any) {
      request.log.error('Toggle fight notification error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Register auth routes under /api prefix
  await fastify.register(async function(fastify) {
    await authRoutes(fastify);
  }, { prefix: '/api/auth' });

  // Register fight routes under /api prefix
  await fastify.register(async function(fastify) {
    await fightRoutes(fastify);
  }, { prefix: '/api' });

  // Register crew routes under /api prefix
  await fastify.register(async function(fastify) {
    await crewRoutes(fastify);
  }, { prefix: '/api' });

  // Register import routes under /api prefix
  await fastify.register(async function(fastify) {
    await importRoutes(fastify);
  }, { prefix: '/api/import' });

  // Register live events routes under /api prefix
  await fastify.register(async function(fastify) {
    await liveEventsRoutes(fastify);
  }, { prefix: '/api/live-events' });

  // Register mock live events routes under /api prefix
  await fastify.register(async function(fastify) {
    await mockLiveEventsRoutes(fastify);
  }, { prefix: '/api/mock-live-events' });

  // Register notifications routes under /api/notifications prefix
  await fastify.register(notificationsRoutes, { prefix: '/api/notifications' });

  // Register notification rules routes under /api/notification-rules prefix
  await fastify.register(notificationRulesRoutes, { prefix: '/api/notification-rules' });

  // Register news routes under /api prefix
  await fastify.register(newsRoutes, { prefix: '/api' });

  // Register community routes under /api/community prefix
  await fastify.register(communityRoutes, { prefix: '/api/community' });

  // Register search routes under /api prefix
  await fastify.register(searchRoutes, { prefix: '/api' });

  // Register feedback routes under /api prefix
  await fastify.register(feedbackRoutes, { prefix: '/api' });

  // Register upload routes under /api prefix
  await fastify.register(async function(fastify) {
    await uploadRoutes(fastify);
  }, { prefix: '/api' });

  // Register admin stats routes under /api/admin prefix
  const adminStatsRoutes = (await import('./adminStats')).default;
  await fastify.register(adminStatsRoutes, { prefix: '/api/admin' });

  // Register admin background job routes under /api prefix
  await fastify.register(async function(fastify) {
    await adminRoutes(fastify);
  }, { prefix: '/api' });

  // Register Giphy proxy routes under /api/giphy prefix
  await fastify.register(giphyRoutes, { prefix: '/api/giphy' });

  // Register analytics routes under /api prefix - TEMPORARILY DISABLED
  // await fastify.register(async function(fastify) {
  //   await analyticsRoutes(fastify);
  // }, { prefix: '/api/analytics' });
}
 
