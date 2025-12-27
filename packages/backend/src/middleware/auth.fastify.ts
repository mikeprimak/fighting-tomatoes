import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import fp from 'fastify-plugin';

// Authentication middleware
async function authenticateMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authorization = request.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      console.log('[AUTH] No authorization header or wrong format');
      throw new Error('Authorization token required');
    }

    const token = authorization.substring(7);
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
      console.error('[AUTH] FATAL: JWT_SECRET environment variable is not set');
      throw new Error('Server configuration error');
    }

    console.log('[AUTH] Verifying token, JWT_SECRET exists:', !!JWT_SECRET);
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    console.log('[AUTH] Token decoded, userId:', decoded.userId);

    // Get user from database
    const user = await request.server.prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        isActive: true,
        isEmailVerified: true,
        isMedia: true,
        mediaOrganization: true,
        points: true,
        level: true,
      }
    });

    console.log('[AUTH] User lookup result:', user ? `Found user ${user.email}` : 'User not found');

    if (!user || !user.isActive) {
      console.log('[AUTH] User not found or inactive');
      throw new Error('User not found or inactive');
    }

    // Add user to request object
    request.user = user;
    console.log('[AUTH] Authentication successful for user:', user.email);

  } catch (error: any) {
    console.error('[AUTH] Authentication failed:', error.message);
    return reply.code(401).send({
      error: 'Invalid or expired token',
      code: 'UNAUTHORIZED',
    });
  }
}

// Middleware to require email verification (must be used AFTER authenticate)
async function requireVerifiedMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // User must be authenticated first
  if (!request.user) {
    return reply.code(401).send({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }

  // Check if email is verified
  if (!request.user.isEmailVerified) {
    console.log('[AUTH] Email verification required for user:', request.user.email);
    return reply.code(403).send({
      error: 'Email verification required to perform this action',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }
}

// Optional authentication middleware (doesn't fail if no token)
async function optionalAuthenticateMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authorization = request.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      // No token provided, but that's okay for optional auth
      return;
    }

    const token = authorization.substring(7);
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
      console.error('[AUTH] FATAL: JWT_SECRET environment variable is not set');
      return; // Silently fail for optional auth if config is broken
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Get user from database
    const user = await request.server.prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        isActive: true,
        isEmailVerified: true,
        isMedia: true,
        mediaOrganization: true,
        points: true,
        level: true,
      }
    });

    if (user && user.isActive) {
      // Add user to request object only if valid
      request.user = user;
    }

  } catch (error) {
    // For optional auth, we don't throw errors, just continue without user
    // Silently ignore auth failures for optional authentication
  }
}

// Plugin to register authentication decorators
async function authPlugin(fastify: FastifyInstance) {
  // Register the authenticate decorator
  fastify.decorate('authenticate', authenticateMiddleware);
  fastify.decorate('optionalAuthenticate', optionalAuthenticateMiddleware);
  fastify.decorate('requireVerified', requireVerifiedMiddleware);
}

export default fp(authPlugin, {
  name: 'auth-plugin'
});

export { authenticateMiddleware, optionalAuthenticateMiddleware, requireVerifiedMiddleware };