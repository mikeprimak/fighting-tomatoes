import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticateUser } from '../middleware/auth';

const prisma = new PrismaClient();

const registerTokenSchema = z.object({
  pushToken: z.string(),
});

const updatePreferencesSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  notifyFollowedFighterFights: z.boolean().optional(),
  notifyPreEventReport: z.boolean().optional(),
  notifyHypedFights: z.boolean().optional(),
});

const notificationsRoutes: FastifyPluginAsync = async (fastify, opts) => {
  /**
   * Register push notification token
   * POST /api/notifications/register-token
   */
  fastify.post(
    '/register-token',
    { preHandler: authenticateUser },
    async (request, reply) => {
      try {
        const { pushToken } = registerTokenSchema.parse(request.body);
        const userId = request.user!.id;

        // Update user's push token
        await prisma.user.update({
          where: { id: userId },
          data: { pushToken },
        });

        return reply.send({
          message: 'Push token registered successfully',
          pushToken,
        });
      } catch (error: any) {
        if (error.name === 'ZodError') {
          return reply.status(400).send({
            error: 'Invalid request body',
            details: error.errors,
          });
        }
        throw error;
      }
    }
  );

  /**
   * Unregister push notification token
   * DELETE /api/notifications/register-token
   */
  fastify.delete(
    '/register-token',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const userId = request.user!.id;

      await prisma.user.update({
        where: { id: userId },
        data: { pushToken: null },
      });

      return reply.send({
        message: 'Push token unregistered successfully',
      });
    }
  );

  /**
   * Get notification preferences
   * GET /api/notifications/preferences
   */
  fastify.get(
    '/preferences',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const userId = request.user!.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          notificationsEnabled: true,
          notifyFollowedFighterFights: true,
          notifyPreEventReport: true,
          notifyHypedFights: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({ preferences: user });
    }
  );

  /**
   * Update notification preferences
   * PUT /api/notifications/preferences
   */
  fastify.put(
    '/preferences',
    { preHandler: authenticateUser },
    async (request, reply) => {
      try {
        const preferences = updatePreferencesSchema.parse(request.body);
        const userId = request.user!.id;

        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: preferences,
          select: {
            notificationsEnabled: true,
            notifyFollowedFighterFights: true,
            notifyPreEventReport: true,
            notifyHypedFights: true,
          },
        });

        return reply.send({
          message: 'Preferences updated successfully',
          preferences: updatedUser,
        });
      } catch (error: any) {
        if (error.name === 'ZodError') {
          return reply.status(400).send({
            error: 'Invalid request body',
            details: error.errors,
          });
        }
        throw error;
      }
    }
  );

  /**
   * Test notification (development only)
   * POST /api/notifications/test
   */
  fastify.post(
    '/test',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const userId = request.user!.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { pushToken: true, displayName: true },
      });

      if (!user?.pushToken) {
        return reply.status(400).send({
          error: 'No push token registered for this user',
        });
      }

      const { notificationService } = await import('../services/notificationService');

      const result = await notificationService.sendPushNotifications(
        [userId],
        {
          title: 'Test Notification',
          body: `Hello ${user.displayName || 'there'}! Notifications are working.`,
          data: { test: true },
        }
      );

      return reply.send({
        message: 'Test notification sent',
        result,
      });
    }
  );
};

export default notificationsRoutes;
