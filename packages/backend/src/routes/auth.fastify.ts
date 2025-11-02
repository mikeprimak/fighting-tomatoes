import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
}
