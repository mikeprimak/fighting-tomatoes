import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { prisma } from '../db';

const registerTokenSchema = z.object({
  pushToken: z.string(),
});

const updatePreferencesSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  notifyEventStart: z.boolean().optional(),
  notifyFightStart: z.boolean().optional(),
  notifyMainCardOnly: z.boolean().optional(),
  notifyUFCOnly: z.boolean().optional(),
  notifyCrewMessages: z.boolean().optional(),
  notifyCrewInvites: z.boolean().optional(),
  notifyRoundChanges: z.boolean().optional(),
  notifyFightResults: z.boolean().optional(),
});

const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Register push notification token
   * POST /api/notifications/register-token
   */
  fastify.post(
    '/register-token',
    { preHandler: authenticateToken },
    async (request, reply) => {
      try {
        const { pushToken } = registerTokenSchema.parse(request.body);
        const userId = request.user!.userId;

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
    { preHandler: authenticateToken },
    async (request, reply) => {
      const userId = request.user!.userId;

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
    { preHandler: authenticateToken },
    async (request, reply) => {
      const userId = request.user!.userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          notificationsEnabled: true,
          notifyEventStart: true,
          notifyFightStart: true,
          notifyMainCardOnly: true,
          notifyUFCOnly: true,
          notifyCrewMessages: true,
          notifyCrewInvites: true,
          notifyRoundChanges: true,
          notifyFightResults: true,
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
    { preHandler: authenticateToken },
    async (request, reply) => {
      try {
        const preferences = updatePreferencesSchema.parse(request.body);
        const userId = request.user!.userId;

        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: preferences,
          select: {
            notificationsEnabled: true,
            notifyEventStart: true,
            notifyFightStart: true,
            notifyMainCardOnly: true,
            notifyUFCOnly: true,
            notifyCrewMessages: true,
            notifyCrewInvites: true,
            notifyRoundChanges: true,
            notifyFightResults: true,
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
    { preHandler: authenticateToken },
    async (request, reply) => {
      const userId = request.user!.userId;

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
