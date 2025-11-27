import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

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
  fastify.post('/register', {
    schema: {
      description: 'Register a new user',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
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

      // Create user
      const user = await fastify.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          displayName: firstName ? `${firstName} ${lastName || ''}`.trim() : email.split('@')[0],
          authProvider: 'EMAIL',
          isEmailVerified: process.env.SKIP_EMAIL_VERIFICATION === 'true',
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

      // Generate tokens
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
      const accessToken = jwt.sign(
        { userId: user.id },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const refreshToken = jwt.sign(
        { userId: user.id, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Store refresh token in database
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await fastify.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt,
        }
      });

      return reply.code(201).send({
        message: 'User registered successfully',
        user,
        accessToken,
        refreshToken,
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
  fastify.post('/login', {
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

      // Verify password
      if (!user.password) {
        return reply.code(401).send({
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS',
        });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return reply.code(401).send({
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS',
        });
      }

      // Update last login
      await fastify.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      // Generate tokens
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
      const accessToken = jwt.sign(
        { userId: user.id },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const refreshToken = jwt.sign(
        { userId: user.id, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Store refresh token in database
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

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
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
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
        { expiresIn: '1h' }
      );

      const newRefreshToken = jwt.sign(
        { userId: decoded.userId, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Update refresh token in database
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

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
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

      const decoded = jwt.verify(token, JWT_SECRET) as any;

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
              rating: true
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
                  method: true
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

      // Calculate average rating
      request.log.info('[GET /profile] User ratings count: ' + user.ratings.length);
      request.log.info('[GET /profile] User ratings: ' + JSON.stringify(user.ratings.slice(0, 3)));

      const averageRating = user.ratings.length > 0
        ? user.ratings.reduce((sum, r) => sum + r.rating, 0) / user.ratings.length
        : 0;

      // Calculate rating distribution
      const ratingDistribution: Record<string, number> = {};
      user.ratings.forEach((r) => {
        const rating = Math.round(r.rating);
        ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
      });

      request.log.info('[GET /profile] Rating distribution keys: ' + Object.keys(ratingDistribution).length);

      // Calculate average hype (from predictions)
      const predictionsWithRating = user.predictions.filter(p => p.predictedRating !== null && p.predictedRating > 0);
      const averageHype = predictionsWithRating.length > 0
        ? predictionsWithRating.reduce((sum, p) => sum + (p.predictedRating || 0), 0) / predictionsWithRating.length
        : 0;

      // Calculate hype distribution
      const hypeDistribution: Record<string, number> = {};
      predictionsWithRating.forEach((p) => {
        const rating = Math.round(p.predictedRating || 0);
        hypeDistribution[rating] = (hypeDistribution[rating] || 0) + 1;
      });

      // Calculate prediction statistics
      const predictionsWithWinner = user.predictions.filter(p => p.predictedWinner);
      // Only count fights that are complete and have a decisive winner (not draw/nc)
      const completedPredictions = predictionsWithWinner.filter(p =>
        p.fight.isComplete &&
        p.fight.winner &&
        p.fight.winner !== 'draw' &&
        p.fight.winner !== 'nc'
      );
      const correctWinnerPredictions = completedPredictions.filter(p => p.predictedWinner === p.fight.winner);

      const predictionsWithMethod = user.predictions.filter(p => p.predictedWinner && p.predictedMethod);
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
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const userId = decoded.userId;

      // Get timeFilter from query params (default: 3months)
      const { timeFilter = '3months' } = request.query as { timeFilter?: string };

      // Calculate date filter based on timeFilter
      let dateFilter: Date | null = null;
      let lastEventOnly = false;

      if (timeFilter === 'lastEvent') {
        lastEventOnly = true;
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
      // 'allTime' = no date filter (dateFilter stays null)

      // Build the where clause
      const whereClause: any = {
        userId,
        predictedWinner: { not: null },
        fight: {
          winner: { not: null },
        }
      };

      if (dateFilter) {
        whereClause.fight.event = { date: { gte: dateFilter } };
      }

      // Get all predictions for this user where the fight has a result
      const predictions = await fastify.prisma.fightPrediction.findMany({
        where: whereClause,
        include: {
          fight: {
            select: {
              id: true,
              winner: true,
              event: {
                select: {
                  id: true,
                  name: true,
                  date: true
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

      // Group predictions by event
      const eventMap = new Map<string, {
        eventId: string,
        eventName: string,
        eventDate: Date,
        correct: number,
        incorrect: number
      }>();

      for (const prediction of predictions) {
        const event = prediction.fight.event;
        const isCorrect = prediction.predictedWinner === prediction.fight.winner;

        if (!eventMap.has(event.id)) {
          eventMap.set(event.id, {
            eventId: event.id,
            eventName: event.name,
            eventDate: event.date,
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

      // If lastEventOnly, only keep the most recent event
      if (lastEventOnly && accuracyByEvent.length > 0) {
        accuracyByEvent = [accuracyByEvent[accuracyByEvent.length - 1]];
      }

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
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const userId = decoded.userId;

      // Get timeFilter from query params (default: 3months)
      const { timeFilter = '3months' } = request.query as { timeFilter?: string };

      // Calculate date filter based on timeFilter
      let dateFilter: Date | null = null;
      let lastEventId: string | null = null;

      if (timeFilter === 'lastEvent') {
        // Find the most recent completed event
        const lastEvent = await fastify.prisma.event.findFirst({
          where: {
            fights: {
              some: { winner: { not: null } }
            }
          },
          orderBy: { date: 'desc' },
          select: { id: true }
        });
        lastEventId = lastEvent?.id || null;
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
      // 'allTime' = no date filter

      // Build where clause
      const whereClause: any = {
        predictedWinner: { not: null },
        fight: { winner: { not: null } }
      };

      if (lastEventId) {
        whereClause.fight.eventId = lastEventId;
      } else if (dateFilter) {
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
          const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
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
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
      const accessToken = jwt.sign(
        { userId: user.id, email: user.email, isEmailVerified: user.isEmailVerified },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const refreshToken = jwt.sign(
        { userId: user.id, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Store refresh token in database
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

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
}
