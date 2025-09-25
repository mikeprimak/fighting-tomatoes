// packages/backend/src/routes/index.ts
import { FastifyInstance } from 'fastify';
import { fightRoutes } from './fights';
import { authRoutes } from './auth.fastify';
import { crewRoutes } from './crews';
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
                team: { type: 'string' },
                birthDate: { type: 'string' },
                nationality: { type: 'string' },
                reach: { type: 'number' },
                height: { type: 'string' },
                createdAt: { type: 'string' },
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
          createdAt: true,
        },
      });

      if (!fighter) {
        return reply.code(404).send({
          error: 'Fighter not found',
          code: 'FIGHTER_NOT_FOUND',
        });
      }

      return reply.code(200).send({ fighter });
    } catch (error: any) {
      request.log.error('Fighter fetch error:', error);
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

  // Register analytics routes under /api prefix - TEMPORARILY DISABLED
  // await fastify.register(async function(fastify) {
  //   await analyticsRoutes(fastify);
  // }, { prefix: '/api/analytics' });
}