import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// Auth routes with email verification, password reset, and Apple Sign-In
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import appleSignIn from 'apple-signin-auth';
import { EmailService } from '../utils/email';
import { ACCESS_TOKEN_EXPIRES, REFRESH_TOKEN_EXPIRES } from '../utils/jwt';

// Google OAuth client (lazily initialized)
let googleClient: OAuth2Client | null = null;
function getGoogleClient(): OAuth2Client {
  if (!googleClient) {
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

// Fastify-compatible auth routes
// Fixed nullable fields in schema
//
export async function authRoutes(fastify: FastifyInstance) {
  // Register endpoint
  // Rate limit: 5 attempts per 15 minutes to prevent spam registrations
  fastify.post('/register', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes',
      },
    },
    schema: {
      description: 'Register a new user',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: {
            type: 'string',
            minLength: 8,
            description: 'Password must be at least 8 characters'
          },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                displayName: { type: 'string' },
                isEmailVerified: { type: 'boolean' },
                createdAt: { type: 'string' },
                totalRatings: { type: 'integer' },
                totalReviews: { type: 'integer' },
                points: { type: 'integer' },
                level: { type: 'integer' },
              },
            },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email, password, firstName, lastName } = request.body as any;

      // Validation
      if (!email || !password) {
        return reply.code(400).send({
          error: 'Email and password are required',
          code: 'VALIDATION_ERROR',
        });
      }

      // Validate password strength (8+ chars)
      if (password.length < 8) {
        return reply.code(400).send({
          error: 'Password must be at least 8 characters',
          code: 'PASSWORD_WEAK',
        });
      }

      // Check if user already exists
      const existingUser = await fastify.prisma.user.findFirst({
        where: { email }
      });

      if (existingUser) {
        return reply.code(409).send({
          error: 'Email already registered',
          code: 'USER_EXISTS',
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Generate email verification token if verification is enabled
      const skipVerification = process.env.SKIP_EMAIL_VERIFICATION === 'true';
      const verificationToken = skipVerification ? null : EmailService.generateVerificationToken();
      const verificationExpires = skipVerification ? null : new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Create user
      const user = await fastify.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          displayName: firstName ? `${firstName} ${lastName || ''}`.trim() : email.split('@')[0],
          authProvider: 'EMAIL',
          isEmailVerified: skipVerification,
          emailVerificationToken: verificationToken,
          emailVerificationExpires: verificationExpires,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          isEmailVerified: true,
          createdAt: true,
          totalRatings: true,
          totalReviews: true,
          points: true,
          level: true,
        }
      });

      // Send verification email if verification is enabled
      if (!skipVerification && verificationToken) {
        try {
          await EmailService.sendVerificationEmail(email, verificationToken, firstName || undefined);
          request.log.info(`[Email] Verification email sent to ${email}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          request.log.error(`[Email] Failed to send verification email: ${msg}`);
          // Don't fail registration if email fails - user can request resend
        }
      }

      // Generate tokens
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
      const accessToken = jwt.sign(
        { userId: user.id },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES }
      );

      const refreshToken = jwt.sign(
        { userId: user.id, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES }
      );

      // Store refresh token in database
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);

      await fastify.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt,
        }
      });

      const message = skipVerification
        ? 'User registered successfully'
        : 'Registration successful. Please check your email to verify your account.';

      return reply.code(201).send({
        message,
        user,
        accessToken,
        refreshToken,
        requiresVerification: !skipVerification,
      });

    } catch (error: any) {
      request.log.error('Registration error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Login endpoint
  // Rate limit: 5 attempts per 15 minutes to prevent brute force attacks
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes',
      },
    },
    schema: {
      description: 'Login user',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                displayName: { type: 'string' },
                isEmailVerified: { type: 'boolean' },
                createdAt: { type: 'string' },
                totalRatings: { type: 'integer' },
                totalReviews: { type: 'integer' },
                points: { type: 'integer' },
                level: { type: 'integer' },
              },
            },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email, password } = request.body as any;

      if (!email || !password) {
        return reply.code(400).send({
          error: 'Email and password are required',
          code: 'VALIDATION_ERROR',
        });
      }

      // Find user
      const user = await fastify.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          password: true,
          firstName: true,
          lastName: true,
          displayName: true,
          isEmailVerified: true,
          isActive: true,
          createdAt: true,
          totalRatings: true,
          totalReviews: true,
          points: true,
          level: true,
        }
      });

      if (!user || !user.isActive) {
        return reply.code(401).send({
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS',
        });
      }

      // Check for legacy migrated user (password is null)
      if (!user.password) {
        return reply.code(403).send({
          error: 'Your account was migrated from fightingtomatoes.com. Please verify your email to set up your new password.',
          code: 'ACCOUNT_CLAIM_REQUIRED',
          requiresAccountClaim: true,
          email: user.email,
        });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      request.log.info(`[Login] User: ${user.email}, password hash starts with: ${user.password.substring(0, 20)}...`);

      if (!isValidPassword) {
        request.log.info(`[Login] Password check FAILED for user: ${user.email}`);
        return reply.code(401).send({
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS',
        });
      }

      request.log.info(`[Login] Password check PASSED for user: ${user.email}`);

      // Update last login
      await fastify.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      // Generate tokens
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
      const accessToken = jwt.sign(
        { userId: user.id },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES }
      );

      const refreshToken = jwt.sign(
        { userId: user.id, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES }
      );

      // Store refresh token in database
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);

      await fastify.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt,
        }
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      return reply.code(200).send({
        message: 'Login successful',
        user: userWithoutPassword,
        accessToken,
        refreshToken,
      });

    } catch (error: any) {
      request.log.error('Login error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Logout endpoint
  fastify.post('/logout', {
    schema: {
      description: 'Logout user',
      tags: ['auth'],
      body: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { refreshToken } = request.body as any;

      if (refreshToken) {
        // Revoke the refresh token
        await fastify.prisma.refreshToken.updateMany({
          where: { token: refreshToken },
          data: {
            expiresAt: new Date() // Expire it immediately
          }
        });
      }

      return reply.code(200).send({
        message: 'Logout successful',
      });
    } catch (error: any) {
      request.log.error('Logout error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Delete account endpoint
  // Anonymizes user data while preserving ratings/reviews (Apple/Google requirement)
  fastify.delete('/account', {
    preHandler: [fastify.authenticate],
    schema: {
      description: 'Delete user account (anonymizes data, preserves content)',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['confirmation'],
        properties: {
          confirmation: { type: 'string', description: 'Must be "DELETE" to confirm' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const { confirmation } = request.body as { confirmation: string };

      // Require user to confirm by typing "DELETE"
      if (confirmation !== 'DELETE') {
        return reply.code(400).send({
          error: 'Please type DELETE to confirm account deletion',
          code: 'CONFIRMATION_REQUIRED',
        });
      }

      // Generate a random anonymous email to satisfy unique constraint
      const anonymousEmail = `deleted_${Date.now()}_${Math.random().toString(36).substring(7)}@deleted.local`;

      // Anonymize user data (keep the record for content attribution)
      await fastify.prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymousEmail,
          password: null,
          firstName: null,
          lastName: null,
          displayName: 'Deleted User',
          avatar: null,
          googleId: null,
          appleId: null,
          emailVerificationToken: null,
          emailVerificationExpires: null,
          passwordResetToken: null,
          passwordResetExpires: null,
          pushToken: null,
          isActive: false,
          isEmailVerified: false,
          wantsEmails: false,
          isMedia: false,
          mediaOrganization: null,
          mediaWebsite: null,
        },
      });

      // Delete all refresh tokens (log out all sessions)
      await fastify.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      // Delete notification-related data (wrapped in try-catch in case tables don't exist)
      try {
        await fastify.prisma.fightNotificationMatch.deleteMany({ where: { userId } });
      } catch (e) { request.log.info('Note: fightNotificationMatch cleanup skipped'); }

      try {
        await fastify.prisma.userNotificationRule.deleteMany({ where: { userId } });
      } catch (e) { request.log.info('Note: userNotificationRule cleanup skipped'); }

      try {
        await fastify.prisma.userNotification.deleteMany({ where: { userId } });
      } catch (e) { request.log.info('Note: userNotification cleanup skipped'); }

      request.log.info(`[Auth] Account deleted and anonymized for user ${userId}`);

      return reply.code(200).send({
        message: 'Account deleted successfully. Your ratings and reviews have been anonymized.',
      });
    } catch (error: any) {
      request.log.error({ err: error, message: error?.message, stack: error?.stack }, 'Delete account error');
      return reply.code(500).send({
        error: 'Failed to delete account: ' + (error?.message || 'Unknown error'),
        code: 'DELETE_FAILED',
      });
    }
  });

  // Refresh token endpoint
  fastify.post('/refresh', {
    schema: {
      description: 'Refresh access token',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { refreshToken } = request.body as any;

      if (!refreshToken) {
        return reply.code(401).send({
          error: 'Refresh token required',
          code: 'MISSING_TOKEN',
        });
      }

      // Verify refresh token
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
      const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;

      if (decoded.type !== 'refresh') {
        return reply.code(401).send({
          error: 'Invalid token type',
          code: 'INVALID_TOKEN',
        });
      }

      // Check if token exists and is not expired
      const tokenRecord = await fastify.prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
          expiresAt: {
            gt: new Date()
          }
        }
      });

      if (!tokenRecord) {
        return reply.code(401).send({
          error: 'Invalid or expired refresh token',
          code: 'INVALID_TOKEN',
        });
      }

      // Generate new tokens
      const newAccessToken = jwt.sign(
        { userId: decoded.userId },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES }
      );

      const newRefreshToken = jwt.sign(
        { userId: decoded.userId, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES }
      );

      // Update refresh token in database (sliding expiration - 90 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);

      await fastify.prisma.refreshToken.update({
        where: { id: tokenRecord.id },
        data: {
          token: newRefreshToken,
          expiresAt,
        }
      });

      return reply.code(200).send({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });

    } catch (error: any) {
      request.log.error('Refresh token error:', error);
      return reply.code(401).send({
        error: 'Invalid refresh token',
        code: 'INVALID_TOKEN',
      });
    }
  });

  // Get profile endpoint (protected)
  fastify.get('/profile', {
    schema: {
      description: 'Get user profile',
      tags: ['auth'],
      headers: {
        type: 'object',
        properties: {
          authorization: { type: 'string' },
        },
        required: ['authorization'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: ['string', 'null'] },
                lastName: { type: ['string', 'null'] },
                displayName: { type: ['string', 'null'] },
                avatar: { type: ['string', 'null'] },
                isEmailVerified: { type: 'boolean' },
                createdAt: { type: 'string' },
                lastLoginAt: { type: ['string', 'null'] },
                totalRatings: { type: 'integer' },
                totalReviews: { type: 'integer' },
                averageRating: { type: 'number' },
                averageHype: { type: 'number' },
                totalHype: { type: 'integer' },
                ratingDistribution: { type: 'object', additionalProperties: { type: 'number' } },
                hypeDistribution: { type: 'object', additionalProperties: { type: 'number' } },
                totalWinnerPredictions: { type: 'integer' },
                completedWinnerPredictions: { type: 'integer' },
                correctWinnerPredictions: { type: 'integer' },
                winnerAccuracy: { type: 'number' },
                totalMethodPredictions: { type: 'integer' },
                completedMethodPredictions: { type: 'integer' },
                correctMethodPredictions: { type: 'integer' },
                methodAccuracy: { type: 'number' },
                points: { type: 'integer' },
                level: { type: 'integer' },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authorization = request.headers.authorization;

      if (!authorization || !authorization.startsWith('Bearer ')) {
        return reply.code(401).send({
          error: 'Authorization token required',
          code: 'MISSING_TOKEN',
        });
      }

      const token = authorization.substring(7);
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');

      const decoded = jwt.verify(token, JWT_SECRET) as any;

      // Get optional org filter from query params
      const { orgs } = request.query as { orgs?: string };
      const orgFilter = orgs ? orgs.split(',').map(o => o.trim().toUpperCase()) : [];

      const user = await fastify.prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          isEmailVerified: true,
          createdAt: true,
          lastLoginAt: true,
          totalRatings: true,
          totalReviews: true,
          points: true,
          level: true,
          ratings: {
            select: {
              rating: true,
              fight: {
                select: {
                  event: {
                    select: {
                      promotion: true
                    }
                  }
                }
              }
            }
          },
          predictions: {
            select: {
              predictedRating: true,
              predictedWinner: true,
              predictedMethod: true,
              fight: {
                select: {
                  isComplete: true,
                  winner: true,
                  method: true,
                  event: {
                    select: {
                      promotion: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!user) {
        return reply.code(404).send({
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
      }

      // Helper to check if promotion matches org filter
      const matchesOrgFilter = (promotion: string | null): boolean => {
        if (orgFilter.length === 0) return true; // No filter = show all
        const promo = (promotion || '').toUpperCase();
        return orgFilter.some(org => {
          const orgWithUnderscore = org.replace(/ /g, '_');
          return promo.includes(org) || promo.includes(orgWithUnderscore);
        });
      };

      // Filter ratings by org
      const filteredRatings = user.ratings.filter(r => matchesOrgFilter(r.fight?.event?.promotion));

      // Calculate average rating
      request.log.info('[GET /profile] User ratings count: ' + user.ratings.length);
      request.log.info('[GET /profile] Filtered ratings count: ' + filteredRatings.length);
      request.log.info('[GET /profile] Org filter: ' + JSON.stringify(orgFilter));

      const averageRating = filteredRatings.length > 0
        ? filteredRatings.reduce((sum, r) => sum + r.rating, 0) / filteredRatings.length
        : 0;

      // Calculate rating distribution
      const ratingDistribution: Record<string, number> = {};
      filteredRatings.forEach((r) => {
        const rating = Math.round(r.rating);
        ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
      });

      request.log.info('[GET /profile] Rating distribution keys: ' + Object.keys(ratingDistribution).length);

      // Filter predictions by org
      const filteredPredictions = user.predictions.filter(p => matchesOrgFilter(p.fight?.event?.promotion));

      // Calculate average hype (from predictions)
      const predictionsWithRating = filteredPredictions.filter(p => p.predictedRating !== null && p.predictedRating > 0);
      const averageHype = predictionsWithRating.length > 0
        ? predictionsWithRating.reduce((sum, p) => sum + (p.predictedRating || 0), 0) / predictionsWithRating.length
        : 0;

      // Calculate hype distribution
      const hypeDistribution: Record<string, number> = {};
      predictionsWithRating.forEach((p) => {
        const rating = Math.round(p.predictedRating || 0);
        hypeDistribution[rating] = (hypeDistribution[rating] || 0) + 1;
      });

      // Calculate prediction statistics (also filtered by org)
      const predictionsWithWinner = filteredPredictions.filter(p => p.predictedWinner);
      // Only count fights that are complete and have a decisive winner (not draw/nc)
      const completedPredictions = predictionsWithWinner.filter(p =>
        p.fight.isComplete &&
        p.fight.winner &&
        p.fight.winner !== 'draw' &&
        p.fight.winner !== 'nc'
      );
      const correctWinnerPredictions = completedPredictions.filter(p => p.predictedWinner === p.fight.winner);

      const predictionsWithMethod = filteredPredictions.filter(p => p.predictedWinner && p.predictedMethod);
      const completedMethodPredictions = predictionsWithMethod.filter(p =>
        p.fight.isComplete &&
        p.fight.winner &&
        p.fight.winner !== 'draw' &&
        p.fight.winner !== 'nc' &&
        p.fight.method
      );
      const correctMethodPredictions = completedMethodPredictions.filter(p =>
        p.predictedWinner === p.fight.winner && p.predictedMethod === p.fight.method
      );

      const totalWinnerPredictions = predictionsWithWinner.length;
      const completedWinnerPredictions = completedPredictions.length;
      const correctWinnerCount = correctWinnerPredictions.length;
      const winnerAccuracy = completedWinnerPredictions > 0
        ? (correctWinnerCount / completedWinnerPredictions) * 100
        : 0;

      const totalMethodPredictions = predictionsWithMethod.length;
      const completedMethodPredictionsCount = completedMethodPredictions.length;
      const correctMethodCount = correctMethodPredictions.length;
      const methodAccuracy = completedMethodPredictionsCount > 0
        ? (correctMethodCount / completedMethodPredictionsCount) * 100
        : 0;

      // Return user without ratings/predictions arrays, but with calculated averages and distributions
      const { ratings, predictions, ...userWithoutArrays } = user;

      request.log.info('[GET /profile] Returning user avatar: ' + user.avatar);
      request.log.info('[GET /profile] Average rating: ' + averageRating);
      request.log.info('[GET /profile] Average hype: ' + averageHype);
      request.log.info('[GET /profile] Rating distribution: ' + JSON.stringify(ratingDistribution));
      request.log.info('[GET /profile] Hype distribution: ' + JSON.stringify(hypeDistribution));

      return reply.code(200).send({
        user: {
          ...userWithoutArrays,
          // Override totalRatings with filtered count when org filter is active
          totalRatings: orgFilter.length > 0 ? filteredRatings.length : userWithoutArrays.totalRatings,
          averageRating: Number(averageRating.toFixed(1)),
          averageHype: Number(averageHype.toFixed(1)),
          totalHype: predictionsWithRating.length,
          ratingDistribution,
          hypeDistribution,
          totalWinnerPredictions,
          completedWinnerPredictions,
          correctWinnerPredictions: correctWinnerCount,
          winnerAccuracy: Number(winnerAccuracy.toFixed(1)),
          totalMethodPredictions,
          completedMethodPredictions: completedMethodPredictionsCount,
          correctMethodPredictions: correctMethodCount,
          methodAccuracy: Number(methodAccuracy.toFixed(1))
        }
      });

    } catch (error: any) {
      request.log.error('Get profile error:', error);
      return reply.code(401).send({
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    }
  });

  // Update profile endpoint (protected)
  fastify.put('/profile', {
    schema: {
      description: 'Update user profile',
      tags: ['auth'],
      headers: {
        type: 'object',
        properties: {
          authorization: { type: 'string' },
        },
        required: ['authorization'],
      },
      body: {
        type: 'object',
        properties: {
          displayName: { type: 'string', minLength: 3 },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          avatar: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: ['string', 'null'] },
                lastName: { type: ['string', 'null'] },
                displayName: { type: ['string', 'null'] },
                avatar: { type: ['string', 'null'] },
                isEmailVerified: { type: 'boolean' },
                createdAt: { type: 'string' },
                lastLoginAt: { type: ['string', 'null'] },
                totalRatings: { type: 'integer' },
                totalReviews: { type: 'integer' },
                points: { type: 'integer' },
                level: { type: 'integer' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authorization = request.headers.authorization;

      if (!authorization || !authorization.startsWith('Bearer ')) {
        return reply.code(401).send({
          error: 'Authorization token required',
          code: 'MISSING_TOKEN',
        });
      }

      const token = authorization.substring(7);
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');

      const decoded = jwt.verify(token, JWT_SECRET) as any;

      const { displayName, firstName, lastName, avatar } = request.body as any;

      // Check if displayName is already taken by another user
      if (displayName) {
        const existingUser = await fastify.prisma.user.findFirst({
          where: {
            displayName: {
              equals: displayName,
              mode: 'insensitive'
            },
            id: { not: decoded.userId }
          }
        });

        if (existingUser) {
          return reply.code(409).send({
            error: 'Display name is already taken',
            code: 'DISPLAY_NAME_TAKEN',
          });
        }
      }

      // Update user profile
      request.log.info('[PUT /profile] Received avatar value: ' + avatar);
      const updatedUser = await fastify.prisma.user.update({
        where: { id: decoded.userId },
        data: {
          ...(displayName !== undefined && { displayName }),
          ...(firstName !== undefined && { firstName }),
          ...(lastName !== undefined && { lastName }),
          ...(avatar !== undefined && { avatar }),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          isEmailVerified: true,
          createdAt: true,
          lastLoginAt: true,
          totalRatings: true,
          totalReviews: true,
          points: true,
          level: true,
        }
      });

      request.log.info('[PUT /profile] Saved and returning avatar: ' + updatedUser.avatar);
      return reply.code(200).send({
        message: 'Profile updated successfully',
        user: updatedUser,
      });

    } catch (error: any) {
      request.log.error('Update profile error:', error);
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return reply.code(401).send({
          error: 'Invalid token',
          code: 'INVALID_TOKEN',
        });
      }
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // GET /api/auth/profile/prediction-accuracy - Get prediction accuracy by event
  fastify.get('/profile/prediction-accuracy', async (request, reply) => {
    try {
      const authorization = request.headers.authorization;

      if (!authorization || !authorization.startsWith('Bearer ')) {
        return reply.code(401).send({
          error: 'Authorization token required',
          code: 'MISSING_TOKEN',
        });
      }

      const token = authorization.substring(7);
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const userId = decoded.userId;

      // Get the user's account creation date - users can only have predictions on events after they joined
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true }
      });
      const userCreatedAt = user?.createdAt || new Date(0);

      // Get timeFilter from query params (default: 3months)
      const { timeFilter = '3months' } = request.query as { timeFilter?: string };

      // Calculate date filter based on timeFilter
      let dateFilter: Date | null = null;

      if (timeFilter === 'week') {
        dateFilter = new Date();
        dateFilter.setDate(dateFilter.getDate() - 7);
      } else if (timeFilter === 'month') {
        dateFilter = new Date();
        dateFilter.setMonth(dateFilter.getMonth() - 1);
      } else if (timeFilter === '3months') {
        dateFilter = new Date();
        dateFilter.setMonth(dateFilter.getMonth() - 3);
      } else if (timeFilter === 'year') {
        dateFilter = new Date();
        dateFilter.setFullYear(dateFilter.getFullYear() - 1);
      }
      // 'allTime' = no date filter, but still bounded by user's account creation date

      // Ensure dateFilter never goes before user's account creation date
      // For 'allTime', use user's createdAt as the minimum date
      if (dateFilter) {
        // Use the later of the two dates (don't show events before user joined)
        if (userCreatedAt > dateFilter) {
          dateFilter = userCreatedAt;
        }
      } else if (timeFilter === 'allTime') {
        // For allTime, use user's createdAt as the minimum
        dateFilter = userCreatedAt;
      }

      // Build event filter for completed events (events with at least one fight with a result)
      const eventWhereClause: any = {
        fights: {
          some: {
            winner: { not: null }
          }
        }
      };

      if (dateFilter) {
        eventWhereClause.date = { gte: dateFilter };
      }

      // Get completed events in the time range
      const completedEvents = await fastify.prisma.event.findMany({
        where: eventWhereClause,
        select: {
          id: true,
          name: true,
          date: true,
          promotion: true
        },
        orderBy: {
          date: 'asc'
        }
      });

      // Build prediction where clause
      const predictionWhereClause: any = {
        userId,
        predictedWinner: { not: null },
        fight: {
          winner: { not: null },
        }
      };

      // Filter predictions by date range
      if (dateFilter) {
        predictionWhereClause.fight.event = { date: { gte: dateFilter } };
      }

      // Get all predictions for this user where the fight has a result
      const predictions = await fastify.prisma.fightPrediction.findMany({
        where: predictionWhereClause,
        include: {
          fight: {
            select: {
              id: true,
              winner: true,
              event: {
                select: {
                  id: true,
                  name: true,
                  date: true,
                  promotion: true
                }
              }
            }
          }
        },
        orderBy: {
          fight: {
            event: {
              date: 'asc'
            }
          }
        }
      });

      // Initialize event map with all completed events (0 predictions)
      const eventMap = new Map<string, {
        eventId: string,
        eventName: string,
        eventDate: Date,
        promotion: string | null,
        correct: number,
        incorrect: number
      }>();

      for (const event of completedEvents) {
        eventMap.set(event.id, {
          eventId: event.id,
          eventName: event.name,
          eventDate: event.date,
          promotion: event.promotion,
          correct: 0,
          incorrect: 0
        });
      }

      // Add prediction counts to events
      for (const prediction of predictions) {
        const event = prediction.fight.event;
        const isCorrect = prediction.predictedWinner === prediction.fight.winner;

        // Event should already exist in map, but add it just in case
        if (!eventMap.has(event.id)) {
          eventMap.set(event.id, {
            eventId: event.id,
            eventName: event.name,
            eventDate: event.date,
            promotion: event.promotion,
            correct: 0,
            incorrect: 0
          });
        }

        const eventStats = eventMap.get(event.id)!;
        if (isCorrect) {
          eventStats.correct++;
        } else {
          eventStats.incorrect++;
        }
      }

      // Convert to array and sort by date
      let accuracyByEvent = Array.from(eventMap.values())
        .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());

      return reply.code(200).send({
        accuracyByEvent,
        totalEvents: accuracyByEvent.length,
        totalPredictions: accuracyByEvent.reduce((sum, e) => sum + e.correct + e.incorrect, 0),
        totalCorrect: accuracyByEvent.reduce((sum, e) => sum + e.correct, 0),
        totalIncorrect: accuracyByEvent.reduce((sum, e) => sum + e.incorrect, 0)
      });

    } catch (error: any) {
      request.log.error('Get prediction accuracy error:', error);
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return reply.code(401).send({
          error: 'Invalid token',
          code: 'INVALID_TOKEN',
        });
      }
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'PREDICTION_ACCURACY_FETCH_FAILED',
      });
    }
  });

  // GET /api/auth/profile/global-standing - Get user's global ranking based on prediction accuracy
  fastify.get('/profile/global-standing', async (request, reply) => {
    try {
      const authorization = request.headers.authorization;

      if (!authorization || !authorization.startsWith('Bearer ')) {
        return reply.code(401).send({
          error: 'Authorization token required',
          code: 'MISSING_TOKEN',
        });
      }

      const token = authorization.substring(7);
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const userId = decoded.userId;

      // Get the user's account creation date - rankings should only include events since they joined
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true }
      });
      const userCreatedAt = user?.createdAt || new Date(0);

      // Get timeFilter from query params (default: 3months)
      const { timeFilter = '3months' } = request.query as { timeFilter?: string };

      // Calculate date filter based on timeFilter
      let dateFilter: Date | null = null;

      if (timeFilter === 'week') {
        dateFilter = new Date();
        dateFilter.setDate(dateFilter.getDate() - 7);
      } else if (timeFilter === 'month') {
        dateFilter = new Date();
        dateFilter.setMonth(dateFilter.getMonth() - 1);
      } else if (timeFilter === '3months') {
        dateFilter = new Date();
        dateFilter.setMonth(dateFilter.getMonth() - 3);
      } else if (timeFilter === 'year') {
        dateFilter = new Date();
        dateFilter.setFullYear(dateFilter.getFullYear() - 1);
      }
      // 'allTime' = no date filter, but bounded by user's account creation date

      // Ensure dateFilter never goes before user's account creation date
      // This ensures rankings only include events from after the user joined
      if (dateFilter) {
        if (userCreatedAt > dateFilter) {
          dateFilter = userCreatedAt;
        }
      } else if (timeFilter === 'allTime') {
        dateFilter = userCreatedAt;
      }

      // Build where clause
      const whereClause: any = {
        predictedWinner: { not: null },
        fight: { winner: { not: null } }
      };

      if (dateFilter) {
        whereClause.fight.event = { date: { gte: dateFilter } };
      }

      // Get all predictions on completed fights with winners
      const allPredictions = await fastify.prisma.fightPrediction.findMany({
        where: whereClause,
        select: {
          userId: true,
          predictedWinner: true,
          fight: { select: { winner: true } }
        }
      });

      // Group by user and calculate accuracy
      const userStatsMap = new Map<string, { correct: number; total: number }>();

      for (const prediction of allPredictions) {
        const isCorrect = prediction.predictedWinner === prediction.fight.winner;

        if (!userStatsMap.has(prediction.userId)) {
          userStatsMap.set(prediction.userId, { correct: 0, total: 0 });
        }

        const stats = userStatsMap.get(prediction.userId)!;
        stats.total++;
        if (isCorrect) stats.correct++;
      }

      // Convert to array and sort by accuracy (then by total predictions as tiebreaker)
      const sortedUsers = Array.from(userStatsMap.entries())
        .map(([id, stats]) => ({
          userId: id,
          correct: stats.correct,
          total: stats.total,
          accuracy: stats.total > 0 ? stats.correct / stats.total : 0
        }))
        .sort((a, b) => {
          if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
          return b.total - a.total;
        });

      // Find the current user's position
      const totalUsers = sortedUsers.length;
      const userIndex = sortedUsers.findIndex(u => u.userId === userId);

      if (userIndex === -1) {
        // User has no predictions yet
        return reply.code(200).send({
          position: null,
          totalUsers,
          hasRanking: false,
          message: 'Make predictions on upcoming fights to get ranked!'
        });
      }

      const position = userIndex + 1;
      const userStats = sortedUsers[userIndex];

      return reply.code(200).send({
        position,
        totalUsers,
        hasRanking: true,
        correctPredictions: userStats.correct,
        totalPredictions: userStats.total,
        accuracy: Math.round(userStats.accuracy * 100)
      });

    } catch (error: any) {
      request.log.error('Get global standing error:', error);
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return reply.code(401).send({
          error: 'Invalid token',
          code: 'INVALID_TOKEN',
        });
      }
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'GLOBAL_STANDING_FETCH_FAILED',
      });
    }
  });

  // GET /api/auth/check-displayname - Check if display name is available
  fastify.get('/check-displayname', async (request, reply) => {
    try {
      const { displayName } = request.query as { displayName: string };

      if (!displayName || displayName.trim().length < 3) {
        return reply.code(400).send({
          error: 'Display name must be at least 3 characters',
          code: 'INVALID_DISPLAY_NAME',
        });
      }

      // Get current user ID if authenticated
      const authorization = request.headers.authorization;
      let currentUserId: string | null = null;

      if (authorization && authorization.startsWith('Bearer ')) {
        try {
          const token = authorization.substring(7);
          const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
          const decoded = jwt.verify(token, JWT_SECRET) as any;
          currentUserId = decoded.userId;
        } catch (error) {
          // Invalid token, but that's okay - just means no current user
        }
      }

      // Check if displayName is taken by another user (case-insensitive)
      const existingUser = await fastify.prisma.user.findFirst({
        where: {
          displayName: {
            equals: displayName.trim(),
            mode: 'insensitive'
          },
          ...(currentUserId && { id: { not: currentUserId } })
        }
      });

      return reply.code(200).send({
        available: !existingUser,
        displayName: displayName.trim(),
      });
    } catch (error: any) {
      request.log.error('Check displayName error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Google OAuth endpoint
  fastify.post('/google', {
    schema: {
      description: 'Authenticate with Google OAuth',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['idToken'],
        properties: {
          idToken: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string', nullable: true },
                lastName: { type: 'string', nullable: true },
                displayName: { type: 'string' },
                avatar: { type: 'string', nullable: true },
                isEmailVerified: { type: 'boolean' },
                isMedia: { type: 'boolean' },
                points: { type: 'integer' },
                level: { type: 'integer' },
              },
            },
            tokens: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { idToken } = request.body as { idToken: string };

      if (!idToken) {
        return reply.code(400).send({
          error: 'ID token is required',
          code: 'VALIDATION_ERROR',
        });
      }

      // Verify the Google ID token
      const client = getGoogleClient();
      let payload;
      try {
        const ticket = await client.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } catch (verifyError: any) {
        request.log.error('Google token verification failed:', verifyError);
        return reply.code(400).send({
          error: 'Invalid Google token',
          code: 'INVALID_TOKEN',
        });
      }

      if (!payload || !payload.email) {
        return reply.code(400).send({
          error: 'Invalid Google token - no email in payload',
          code: 'INVALID_TOKEN',
        });
      }

      const { email, given_name, family_name, picture, sub: googleId } = payload;
      const normalizedEmail = email.toLowerCase();

      // Check if user exists by email
      let user = await fastify.prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (user) {
        // User exists - check if they signed up with a different provider
        if (user.authProvider !== 'GOOGLE' && user.authProvider !== 'EMAIL') {
          return reply.code(409).send({
            error: 'An account with this email already exists with a different sign-in method.',
            code: 'ACCOUNT_EXISTS_DIFFERENT_PROVIDER',
          });
        }

        // If user exists with EMAIL provider, update to GOOGLE (account linking)
        if (user.authProvider === 'EMAIL' && !user.googleId) {
          user = await fastify.prisma.user.update({
            where: { id: user.id },
            data: {
              googleId,
              authProvider: 'GOOGLE',
              isEmailVerified: true, // Google accounts are pre-verified
              avatar: user.avatar || picture, // Only update avatar if not already set
              lastLoginAt: new Date()
            }
          });
          request.log.info(`[Google Auth] Linked Google account to existing email user: ${normalizedEmail}`);
        } else {
          // Update last login
          user = await fastify.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
          });
        }
      } else {
        // Create new user with Google
        const displayName = `${given_name || 'User'}${Math.floor(Math.random() * 10000)}`;

        user = await fastify.prisma.user.create({
          data: {
            email: normalizedEmail,
            googleId,
            authProvider: 'GOOGLE',
            firstName: given_name || null,
            lastName: family_name || null,
            displayName,
            avatar: picture || null,
            isEmailVerified: true, // Google accounts are pre-verified
          }
        });
        request.log.info(`[Google Auth] Created new user via Google: ${normalizedEmail}`);
      }

      // Check if account is active
      if (!user.isActive) {
        return reply.code(403).send({
          error: 'Account is disabled',
          code: 'ACCOUNT_DISABLED',
        });
      }

      // Generate tokens
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
      const accessToken = jwt.sign(
        { userId: user.id, email: user.email, isEmailVerified: user.isEmailVerified },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES }
      );

      const refreshToken = jwt.sign(
        { userId: user.id, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES }
      );

      // Store refresh token in database
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);

      await fastify.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt,
        }
      });

      return reply.code(200).send({
        message: 'Google authentication successful',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified,
          isMedia: user.isMedia,
          points: user.points,
          level: user.level
        },
        tokens: {
          accessToken,
          refreshToken,
        }
      });

    } catch (error: any) {
      request.log.error('Google auth error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Apple Sign-In endpoint
  fastify.post('/apple', {
    schema: {
      description: 'Authenticate with Apple Sign-In',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['identityToken'],
        properties: {
          identityToken: { type: 'string' },
          // User info is only provided on first sign-in
          email: { type: 'string', nullable: true },
          firstName: { type: 'string', nullable: true },
          lastName: { type: 'string', nullable: true },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string', nullable: true },
                lastName: { type: 'string', nullable: true },
                displayName: { type: 'string' },
                avatar: { type: 'string', nullable: true },
                isEmailVerified: { type: 'boolean' },
                isMedia: { type: 'boolean' },
                points: { type: 'integer' },
                level: { type: 'integer' },
              },
            },
            tokens: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { identityToken, email: providedEmail, firstName: providedFirstName, lastName: providedLastName } = request.body as {
        identityToken: string;
        email?: string;
        firstName?: string;
        lastName?: string;
      };

      if (!identityToken) {
        return reply.code(400).send({
          error: 'Identity token is required',
          code: 'VALIDATION_ERROR',
        });
      }

      // Verify the Apple identity token
      let applePayload;
      try {
        applePayload = await appleSignIn.verifyIdToken(identityToken, {
          audience: process.env.APPLE_CLIENT_ID || 'com.fightcrewapp.mobile',
          ignoreExpiration: false,
        });
      } catch (verifyError: any) {
        request.log.error('Apple token verification failed:', verifyError);
        return reply.code(400).send({
          error: 'Invalid Apple token',
          code: 'INVALID_TOKEN',
        });
      }

      const { sub: appleId, email: tokenEmail } = applePayload;

      // Email can come from token or be provided by client (first sign-in only)
      const email = tokenEmail || providedEmail;

      if (!email) {
        // Try to find user by appleId if no email
        const existingUser = await fastify.prisma.user.findUnique({
          where: { appleId }
        });

        if (!existingUser) {
          return reply.code(400).send({
            error: 'Email is required for first sign-in',
            code: 'EMAIL_REQUIRED',
          });
        }
      }

      const normalizedEmail = email?.toLowerCase();

      // Check if user exists by appleId first, then by email
      let user = await fastify.prisma.user.findUnique({
        where: { appleId }
      });

      if (!user && normalizedEmail) {
        user = await fastify.prisma.user.findUnique({
          where: { email: normalizedEmail }
        });
      }

      if (user) {
        // User exists - check if they signed up with a different provider
        if (user.authProvider !== 'APPLE' && user.authProvider !== 'EMAIL' && !user.appleId) {
          return reply.code(409).send({
            error: 'An account with this email already exists with a different sign-in method.',
            code: 'ACCOUNT_EXISTS_DIFFERENT_PROVIDER',
          });
        }

        // If user exists with EMAIL provider, update to APPLE (account linking)
        if (user.authProvider === 'EMAIL' && !user.appleId) {
          user = await fastify.prisma.user.update({
            where: { id: user.id },
            data: {
              appleId,
              authProvider: 'APPLE',
              isEmailVerified: true, // Apple accounts are pre-verified
              firstName: user.firstName || providedFirstName || null,
              lastName: user.lastName || providedLastName || null,
              lastLoginAt: new Date()
            }
          });
          request.log.info(`[Apple Auth] Linked Apple account to existing email user: ${normalizedEmail}`);
        } else if (!user.appleId) {
          // Update user with appleId if not already set
          user = await fastify.prisma.user.update({
            where: { id: user.id },
            data: {
              appleId,
              lastLoginAt: new Date()
            }
          });
        } else {
          // Update last login
          user = await fastify.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
          });
        }
      } else if (normalizedEmail) {
        // Create new user with Apple
        const displayName = `${providedFirstName || 'User'}${Math.floor(Math.random() * 10000)}`;

        user = await fastify.prisma.user.create({
          data: {
            email: normalizedEmail,
            appleId,
            authProvider: 'APPLE',
            firstName: providedFirstName || null,
            lastName: providedLastName || null,
            displayName,
            isEmailVerified: true, // Apple accounts are pre-verified
          }
        });
        request.log.info(`[Apple Auth] Created new user via Apple: ${normalizedEmail}`);
      } else {
        return reply.code(400).send({
          error: 'Unable to create account without email',
          code: 'EMAIL_REQUIRED',
        });
      }

      // Check if account is active
      if (!user.isActive) {
        return reply.code(403).send({
          error: 'Account is disabled',
          code: 'ACCOUNT_DISABLED',
        });
      }

      // Generate tokens
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
      const accessToken = jwt.sign(
        { userId: user.id, email: user.email, isEmailVerified: user.isEmailVerified },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES }
      );

      const refreshToken = jwt.sign(
        { userId: user.id, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES }
      );

      // Store refresh token in database
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);

      await fastify.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt,
        }
      });

      return reply.code(200).send({
        message: 'Apple authentication successful',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified,
          isMedia: user.isMedia,
          points: user.points,
          level: user.level
        },
        tokens: {
          accessToken,
          refreshToken,
        }
      });

    } catch (error: any) {
      request.log.error('Apple auth error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Resend verification email endpoint
  // Rate limit: 3 attempts per hour to prevent email spam
  fastify.post('/resend-verification', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 hour',
      },
    },
    schema: {
      description: 'Resend email verification link',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email } = request.body as { email: string };

      if (!email) {
        return reply.code(400).send({
          error: 'Email is required',
          code: 'EMAIL_MISSING',
        });
      }

      request.log.info(`[Resend Verification] Request for email: ${email}`);

      const user = await fastify.prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      request.log.info(`[Resend Verification] User found: ${!!user}, isEmailVerified: ${user?.isEmailVerified}`);

      // IMPORTANT: Do all work BEFORE sending response
      // On serverless (Render), the function may terminate after response is sent
      if (user && !user.isEmailVerified) {
        // Generate new verification token
        const verificationToken = EmailService.generateVerificationToken();
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await fastify.prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerificationToken: verificationToken,
            emailVerificationExpires: verificationExpires
          }
        });

        try {
          await EmailService.sendVerificationEmail(email, verificationToken, user.firstName !== null ? user.firstName : undefined);
          request.log.info(`[Email] Resent verification email to ${email}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          request.log.error(`[Email] Failed to resend verification email: ${msg}`);
        }
      }

      // Always return success to prevent email enumeration (sent AFTER work is done)
      return reply.code(200).send({
        message: 'If an account with that email exists and is not yet verified, a new verification email has been sent.'
      });

    } catch (error: any) {
      request.log.error('Resend verification error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'RESEND_FAILED',
      });
    }
  });

  // Verify email endpoint
  fastify.get('/verify-email', {
    schema: {
      description: 'Verify email address with token',
      tags: ['auth'],
      querystring: {
        type: 'object',
        properties: {
          token: { type: 'string' },
        },
        required: ['token'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token } = request.query as { token: string };

      if (!token) {
        return reply.code(400).send({
          error: 'Verification token is required',
          code: 'TOKEN_MISSING',
        });
      }

      // Find user with valid token
      const user = await fastify.prisma.user.findFirst({
        where: {
          emailVerificationToken: token,
          emailVerificationExpires: {
            gt: new Date()
          }
        }
      });

      if (!user) {
        return reply.code(400).send({
          error: 'Invalid or expired verification token',
          code: 'TOKEN_INVALID',
        });
      }

      // Update user as verified
      await fastify.prisma.user.update({
        where: { id: user.id },
        data: {
          isEmailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null
        }
      });

      request.log.info(`[Email] Email verified for user: ${user.email}`);

      return reply.code(200).send({
        message: 'Email verified successfully! You can now access all features.'
      });

    } catch (error: any) {
      request.log.error('Email verification error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'VERIFICATION_FAILED',
      });
    }
  });

  // Request password reset endpoint
  // Rate limit: 3 attempts per hour to prevent abuse
  fastify.post('/request-password-reset', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 hour',
      },
    },
    schema: {
      description: 'Request password reset email',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email } = request.body as { email: string };

      if (!email) {
        return reply.code(400).send({
          error: 'Email is required',
          code: 'EMAIL_MISSING',
        });
      }

      const user = await fastify.prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      // IMPORTANT: Do all work BEFORE sending response
      // On serverless (Render), the function may terminate after response is sent
      if (user) {
        const resetToken = EmailService.generateVerificationToken();
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await fastify.prisma.user.update({
          where: { id: user.id },
          data: {
            passwordResetToken: resetToken,
            passwordResetExpires: resetExpires
          }
        });

        try {
          await EmailService.sendPasswordResetEmail(email, resetToken);
          request.log.info(`[Auth] Password reset email sent to ${email}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          request.log.error(`[Auth] Failed to send password reset email: ${msg}`);
        }
      }

      // Always return success to prevent email enumeration (sent AFTER work is done)
      return reply.code(200).send({
        message: 'If an account with that email exists, a password reset link has been sent.'
      });

    } catch (error: any) {
      request.log.error('Password reset request error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'RESET_REQUEST_FAILED',
      });
    }
  });

  // Reset password endpoint
  fastify.post('/reset-password', {
    schema: {
      description: 'Reset password with token',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string' },
          password: { type: 'string', minLength: 8 },
          newPassword: { type: 'string', minLength: 8 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'array' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token, password, newPassword } = request.body as { token: string; password?: string; newPassword?: string };

      // Accept either 'password' or 'newPassword' field
      const actualPassword = password || newPassword;

      if (!token || !actualPassword) {
        return reply.code(400).send({
          error: 'Token and password are required',
          code: 'MISSING_DATA',
        });
      }

      // Type narrowing - actualPassword is definitely a string after the check above
      const validPassword = actualPassword as string;

      // Validate password strength (8+ chars)
      if (validPassword.length < 8) {
        return reply.code(400).send({
          error: 'Password must be at least 8 characters',
          code: 'PASSWORD_WEAK',
        });
      }

      // Find user with valid reset token
      const user = await fastify.prisma.user.findFirst({
        where: {
          passwordResetToken: token,
          passwordResetExpires: {
            gt: new Date()
          }
        }
      });

      if (!user) {
        request.log.info(`[Reset Password] No user found with valid token`);
        return reply.code(400).send({
          error: 'Invalid or expired reset token',
          code: 'TOKEN_INVALID',
        });
      }

      request.log.info(`[Reset Password] Found user: ${user.email} (id: ${user.id}), updating password...`);
      request.log.info(`[Reset Password] OLD password hash: ${user.password?.substring(0, 30)}...`);

      // Hash new password
      const hashedPassword = await bcrypt.hash(validPassword, 12);
      request.log.info(`[Reset Password] NEW password hash: ${hashedPassword.substring(0, 30)}...`);

      // Update password, clear reset token, and verify email
      // (email is verified since user proved ownership via email link)
      const updatedUser = await fastify.prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
          isEmailVerified: true,
          emailVerified: true,
        }
      });

      request.log.info(`[Reset Password] Update returned - password hash: ${updatedUser.password?.substring(0, 30)}...`);

      // VERIFY: Re-read from database to confirm update persisted
      const verifyUser = await fastify.prisma.user.findUnique({
        where: { id: user.id },
        select: { password: true, passwordResetToken: true }
      });
      request.log.info(`[Reset Password] VERIFY after update - password hash: ${verifyUser?.password?.substring(0, 30)}..., token cleared: ${verifyUser?.passwordResetToken === null}`);

      // Invalidate all existing refresh tokens for security
      const deletedTokens = await fastify.prisma.refreshToken.deleteMany({
        where: { userId: user.id }
      });

      request.log.info(`[Reset Password] Deleted ${deletedTokens.count} refresh tokens for user: ${user.email}`);

      return reply.code(200).send({
        message: 'Password reset successful. Please log in with your new password.'
      });

    } catch (error: any) {
      request.log.error('Password reset error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'RESET_FAILED',
      });
    }
  });

  // Claim account endpoint for legacy migrated users
  // This sends an email to verify ownership and set a new password
  fastify.post('/claim-account', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 hour',
      },
    },
    schema: {
      description: 'Send account claim email to legacy migrated user',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email } = request.body as { email: string };

      if (!email) {
        return reply.code(400).send({
          error: 'Email is required',
          code: 'EMAIL_MISSING',
        });
      }

      const normalizedEmail = email.toLowerCase();

      // Find user
      const user = await fastify.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
          password: true,
          displayName: true,
          isActive: true,
        }
      });

      // Always return success message to prevent email enumeration
      // But only send email if user exists and is a legacy user (password is null)
      if (user && user.isActive && user.password === null) {
        // Generate claim token (using same fields as password reset)
        const claimToken = EmailService.generateVerificationToken();
        const claimExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await fastify.prisma.user.update({
          where: { id: user.id },
          data: {
            passwordResetToken: claimToken,
            passwordResetExpires: claimExpires
          }
        });

        try {
          await EmailService.sendAccountClaimEmail(user.email, claimToken, user.displayName || undefined);
          request.log.info(`[Claim Account] Email sent to legacy user: ${normalizedEmail}`);
        } catch (emailError) {
          const msg = emailError instanceof Error ? emailError.message : String(emailError);
          request.log.error(`[Claim Account] Failed to send email: ${msg}`);
        }
      } else if (user && user.password !== null) {
        // User exists but already has a password - they should use normal login or password reset
        request.log.info(`[Claim Account] User ${normalizedEmail} already has password, skipping`);
      } else {
        request.log.info(`[Claim Account] No legacy user found for: ${normalizedEmail}`);
      }

      // Always return success to prevent email enumeration
      return reply.code(200).send({
        message: 'If your account was migrated from fightingtomatoes.com, you will receive an email with instructions to set up your password.'
      });

    } catch (error: any) {
      request.log.error('Claim account error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'CLAIM_FAILED',
      });
    }
  });
}
