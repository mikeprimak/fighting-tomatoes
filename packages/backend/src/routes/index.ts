// packages/backend/src/routes/index.ts
import { FastifyInstance } from 'fastify';

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
      // Test database connection
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
        pushNotifications: false, // To be implemented
        realTimeUpdates: false,   // To be implemented
      },
    });
  });

  // Simple test endpoint for your existing functionality
  fastify.get('/api/test', async (request, reply) => {
    return reply.code(200).send({
      message: 'Fighting Tomatoes API is working!',
      timestamp: new Date().toISOString(),
    });
  });
}