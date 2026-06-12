import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

interface JwtPayload {
  userId?: string;
  id?: string; // Backwards compatibility
  email?: string;
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

    // Support both userId and id for backwards compatibility
    const userId = decoded.userId || decoded.id;

    if (!userId) {
      return reply.code(401).send({
        error: 'Invalid token - missing user ID',
        code: 'INVALID_TOKEN',
      });
    }

    // Get user from database to ensure they still exist and are active
    const user = await request.server.prisma.user.findUnique({
      where: { id: userId },
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
    await request.server.prisma.user.update({
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

/**
 * Soft verification cap (2026-06-12 decision): unverified accounts may make
 * up to UNVERIFIED_ACTION_CAP ratings / hype predictions before verification
 * is forced — capture the behavior first, put the obstacle up after the user
 * is invested. The cap (default 50) deliberately exceeds the ~30-fight
 * onboarding rate stack so a new user never hits it mid-onboarding.
 *
 * Semantics:
 *  - verified user → pass, zero queries
 *  - unverified, already has a row on THIS fight → pass (updates and
 *    removals of existing actions are never blocked by the cap)
 *  - unverified, creating a new row at/over the cap → 403 with the distinct
 *    code VERIFICATION_CAP_REACHED so mobile can show a friendly
 *    "verify to keep going" prompt instead of the generic gate message.
 *
 * UNVERIFIED_ACTION_CAP env override exists for testing (e.g. cap=3 locally
 * instead of writing 50 prod ratings). Must run AFTER authenticateUser.
 */
export function requireVerifiedOrUnderCap(kind: 'rating' | 'hype') {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;

    if (!user) {
      return reply.code(401).send({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    if (user.isEmailVerified) return;

    // Same dev escape hatch as requireEmailVerification.
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_EMAIL_VERIFICATION === 'true') {
      return;
    }

    const cap = Number(process.env.UNVERIFIED_ACTION_CAP ?? 50);
    const prisma = request.server.prisma;
    const fightId = (request.params as { id?: string } | undefined)?.id;

    if (fightId) {
      const where = { userId_fightId: { userId: user.id, fightId } };
      const existing =
        kind === 'rating'
          ? await prisma.fightRating.findUnique({ where, select: { id: true } })
          : await prisma.fightPrediction.findUnique({ where, select: { id: true } });
      if (existing) return;
    }

    const count =
      kind === 'rating'
        ? await prisma.fightRating.count({ where: { userId: user.id } })
        : await prisma.fightPrediction.count({ where: { userId: user.id } });

    if (count >= cap) {
      const noun = kind === 'rating' ? 'ratings' : 'hype predictions';
      return reply.code(403).send({
        error: `You've made ${cap} ${noun} — verify your email to keep going.`,
        code: 'VERIFICATION_CAP_REACHED',
        details: { kind, cap, count },
      });
    }
  };
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

    // Support both userId and id for backwards compatibility
    const userId = decoded.userId || decoded.id;

    if (!userId) {
      // For optional auth, just continue without user
      return;
    }

    const user = await request.server.prisma.user.findUnique({
      where: { id: userId },
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