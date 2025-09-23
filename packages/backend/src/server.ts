import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { registerRoutes } from './routes';

// Initialize Prisma client
const prisma = new PrismaClient();

// Create Fastify instance with simplified logging
const fastify = Fastify({
  logger: true
});

// Declare Prisma on Fastify instance
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully`);
  
  try {
    // Close Prisma connection
    await prisma.$disconnect();
    console.log('Database connection closed');
    
    // Close Fastify server
    await fastify.close();
    console.log('Server closed');
    
    process.exit(0);
  } catch (err: any) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

async function start() {
  try {
    // Register CORS plugin
    await fastify.register(cors, {
      origin: [
        'http://localhost:3000',      // Web development
        'http://localhost:8081',      // Expo development
        'exp://localhost:8081',       // Expo development
        'http://192.168.1.100:8081',  // Local network (adjust IP as needed)
        'exp://192.168.1.100:8081',   // Local network Expo
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });

    // Add Prisma to Fastify context for easy access in routes
    fastify.decorate('prisma', prisma);

    // Add request logging middleware
    fastify.addHook('onRequest', async (request, reply) => {
      request.log.info({
        method: request.method,
        url: request.url,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      }, 'Incoming request');
    });

    // Add response time header
    fastify.addHook('onSend', async (request, reply, payload) => {
      const responseTime = Date.now() - (request as any).startTime;
      reply.header('X-Response-Time', `${responseTime}ms`);
      return payload;
    });

    // Add start time to request for response time calculation
    fastify.addHook('onRequest', async (request) => {
      (request as any).startTime = Date.now();
    });

    // Global error handler
    fastify.setErrorHandler(async (error, request, reply) => {
      // Log the error
      request.log.error({
        error: error.message,
        stack: error.stack,
        method: request.method,
        url: request.url,
      }, 'Request error');

      // Handle different types of errors
      if ((error as any).validation) {
        // Validation errors
        return reply.code(400).send({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: (error as any).validation,
        });
      }

      if ((error as any).statusCode === 401) {
        return reply.code(401).send({
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
        });
      }

      if ((error as any).statusCode === 403) {
        return reply.code(403).send({
          error: 'Forbidden',
          code: 'FORBIDDEN',
        });
      }

      if ((error as any).statusCode === 404) {
        return reply.code(404).send({
          error: 'Not found',
          code: 'NOT_FOUND',
        });
      }

      // Default to 500 for unknown errors
      return reply.code(500).send({
        error: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : error.message,
        code: 'INTERNAL_ERROR',
      });
    });

    // Register API routes
    await registerRoutes(fastify);

    // 404 handler for undefined routes
    fastify.setNotFoundHandler(async (request, reply) => {
      return reply.code(404).send({
        error: 'Route not found',
        code: 'ROUTE_NOT_FOUND',
        path: request.url,
        method: request.method,
      });
    });

    // Test database connection
    try {
      await prisma.$connect();
      console.log('Database connected successfully');
    } catch (err: any) {
      console.error('Failed to connect to database:', err);
      throw err;
    }

    // Start the server
    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ 
      port, 
      host,
    });

    console.log(`Fighting Tomatoes API server started on http://${host}:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Node version: ${process.version}`);

    // Log available routes in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Available routes:');
      console.log(`- Health check: http://${host}:${port}/health`);
      console.log(`- API status: http://${host}:${port}/api/status`);
      console.log(`- Test endpoint: http://${host}:${port}/api/test`);
    }

  } catch (err: any) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

// Start the server
start();

// Export for testing purposes
export { fastify };
