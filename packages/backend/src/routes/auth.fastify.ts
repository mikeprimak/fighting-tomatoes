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
        }
      });

      if (!user) {
        return reply.code(404).send({
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
      }

      request.log.info('[GET /profile] Returning user avatar: ' + user.avatar);
      return reply.code(200).send({ user });

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
            displayName: displayName,
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
}