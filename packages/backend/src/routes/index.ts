// packages/backend/src/routes/index.ts
import { FastifyInstance } from 'fastify';
import { fightRoutes } from './fights';
import { authRoutes } from './auth.fastify';
import { crewRoutes } from './crews';
import importRoutes from './import';
import liveEventsRoutes from './liveEvents';
import mockLiveEventsRoutes from './mockLiveEvents';
import notificationsRoutes from './notifications';
import { uploadRoutes } from './upload';
import { authenticateUser } from '../middleware/auth';
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

  // Events endpoint
  fastify.get('/api/events', {
    schema: {
      description: 'Get events list',
      tags: ['events'],
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
      const [events, total] = await Promise.all([
        fastify.prisma.event.findMany({
          skip,
          take: limit,
          orderBy: { date: 'desc' },
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
        }),
        fastify.prisma.event.count(),
      ]);

      const totalPages = Math.ceil(total / limit);

      return reply.code(200).send({
        events,
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
    preHandler: authenticateUser,
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

      // Create follow
      await fastify.prisma.userFighterFollow.create({
        data: {
          userId: user.id,
          fighterId: id,
          dayBeforeNotification: true,
          startOfFightNotification: false,
        },
      });

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
    preHandler: authenticateUser,
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
    preHandler: authenticateUser,
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

      // Check if already following
      const existingAlert = await fastify.prisma.fightAlert.findUnique({
        where: {
          userId_fightId: {
            userId: user.id,
            fightId: id,
          },
        },
      });

      if (existingAlert) {
        return reply.code(200).send({
          message: 'Already following this fight',
          isFollowing: true,
        });
      }

      // Create alert - set alert time to 15 minutes before event date
      const alertTime = new Date(fight.event.date);
      alertTime.setMinutes(alertTime.getMinutes() - 15);

      await fastify.prisma.fightAlert.create({
        data: {
          userId: user.id,
          fightId: id,
          alertTime,
          isSent: false,
          isActive: true,
        },
      });

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
    preHandler: authenticateUser,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    try {
      // Delete alert if it exists
      await fastify.prisma.fightAlert.deleteMany({
        where: {
          userId: user.id,
          fightId: id,
        },
      });

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

  // Register upload routes under /api prefix
  await fastify.register(async function(fastify) {
    await uploadRoutes(fastify);
  }, { prefix: '/api' });

  // Register admin stats routes under /api/admin prefix
  const adminStatsRoutes = (await import('./adminStats')).default;
  await fastify.register(adminStatsRoutes, { prefix: '/api/admin' });

  // Register analytics routes under /api prefix - TEMPORARILY DISABLED
  // await fastify.register(async function(fastify) {
  //   await analyticsRoutes(fastify);
  // }, { prefix: '/api/analytics' });
}