import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface JwtPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

// Main authentication middleware
export async function authenticateUser(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: 'No token provided',
        code: 'NO_TOKEN',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    const decoded = jwt.verify(token, secret) as JwtPayload;
    
    // Get user from database to ensure they still exist and are active
    const user = await prisma.user.findUnique({
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
      },
    });

    if (!user) {
      return reply.code(401).send({
        error: 'Invalid token - user not found',
        code: 'INVALID_TOKEN',
      });
    }

    if (!user.isActive) {
      return reply.code(401).send({
        error: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    // Attach user to request for use in route handlers
    (request as any).user = user;
    
    // Update last login time
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return reply.code(401).send({
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    }
    
    if (error instanceof jwt.TokenExpiredError) {
      return reply.code(401).send({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }

    // Log unexpected errors
    console.error('Authentication error:', error);
    return reply.code(500).send({
      error: 'Authentication failed',
      code: 'AUTH_ERROR',
    });
  }
}

// Email verification middleware (used for actions that require verified email)
export async function requireEmailVerification(request: FastifyRequest, reply: FastifyReply) {
  const user = (request as any).user;
  
  if (!user) {
    return reply.code(401).send({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
  }

  // Skip email verification in development if disabled
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_EMAIL_VERIFICATION === 'true') {
    return;
  }

  if (!user.isEmailVerified) {
    return reply.code(403).send({
      error: 'Email verification required to perform this action',
      code: 'EMAIL_NOT_VERIFIED',
      details: {
        message: 'Please check your email and verify your account to continue',
        userId: user.id,
      },
    });
  }
}

// Optional authentication middleware (for endpoints that work with or without auth)
export async function optionalAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided - continue without authentication
      return;
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    const decoded = jwt.verify(token, secret) as JwtPayload;
    
    const user = await prisma.user.findUnique({
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
      },
    });

    if (user && user.isActive) {
      (request as any).user = user;
    }
  } catch (error) {
    // For optional auth, we log the error but continue without authentication
    // This allows the endpoint to work for anonymous users
    console.log('OptionalAuth error (continuing without auth):', error);
  }
}

// Admin-only middleware (for admin operations)
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = (request as any).user;
  
  if (!user) {
    return reply.code(401).send({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
  }

  // Check if user has admin privileges
  // For now, we'll use a simple email-based check, but this could be enhanced
  // with proper role-based permissions in the future
  const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
  
  if (!adminEmails.includes(user.email)) {
    return reply.code(403).send({
      error: 'Admin privileges required',
      code: 'ADMIN_REQUIRED',
    });
  }
}

// Media user middleware (for media-specific features)
export async function requireMedia(request: FastifyRequest, reply: FastifyReply) {
  const user = (request as any).user;
  
  if (!user) {
    return reply.code(401).send({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
  }

  if (!user.isMedia) {
    return reply.code(403).send({
      error: 'Media credentials required',
      code: 'MEDIA_REQUIRED',
    });
  }
}

// Rate limiting helper (can be used with other middleware)
export function createRateLimiter(options: {
  max: number;
  windowMs: number;
  skipSuccessfulRequests?: boolean;
}) {
  // This is a placeholder for rate limiting logic
  // In production, you'd want to use a proper rate limiting library
  // like express-rate-limit or implement Redis-based rate limiting
  
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Rate limiting implementation would go here
    // For now, this is just a placeholder
  };
}

// Helper function to extract user ID from request (with type safety)
export function getUserId(request: FastifyRequest): string | null {
  const user = (request as any).user;
  return user?.id || null;
}

// Helper function to check if user is authenticated
export function isAuthenticated(request: FastifyRequest): boolean {
  return !!(request as any).user;
}

// Helper function to check if user has verified email
export function hasVerifiedEmail(request: FastifyRequest): boolean {
  const user = (request as any).user;
  return !!(user?.isEmailVerified);
}

// Helper function to get user permissions context
export function getUserContext(request: FastifyRequest) {
  const user = (request as any).user;
  if (!user) {
    return {
      isAuthenticated: false,
      isEmailVerified: false,
      isMedia: false,
      isAdmin: false,
      userId: null,
    };
  }

  const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
  
  return {
    isAuthenticated: true,
    isEmailVerified: user.isEmailVerified,
    isMedia: user.isMedia,
    isAdmin: adminEmails.includes(user.email),
    userId: user.id,
    user,
  };
}