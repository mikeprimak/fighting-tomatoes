// packages/backend/src/routes/index.ts
import { FastifyInstance } from 'fastify';
import { fightRoutes } from './fights';
import { authRoutes } from './auth.fastify';
import { crewRoutes } from './crews';
import importRoutes from './import';
import liveEventsRoutes from './liveEvents';
import mockLiveEventsRoutes from './mockLiveEvents';
import notificationsRoutes from './notifications';
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

  // Register admin stats routes under /api/admin prefix
  const adminStatsRoutes = (await import('./adminStats')).default;
  await fastify.register(adminStatsRoutes, { prefix: '/api/admin' });

  // Register analytics routes under /api prefix - TEMPORARILY DISABLED
  // await fastify.register(async function(fastify) {
  //   await analyticsRoutes(fastify);
  // }, { prefix: '/api/analytics' });
}