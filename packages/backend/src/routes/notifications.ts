import { prisma } from '../lib/prisma';
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticateUser } from '../middleware/auth';
import { hasPreEventReportRule } from '../services/notificationRuleHelpers';


const registerTokenSchema = z.object({
  pushToken: z.string(),
});

const markReadSchema = z.object({
  // Omit to mark ALL unread read; provide ids to mark a specific subset.
  ids: z.array(z.string()).optional(),
});

const snoozeSchema = z.object({
  // Hours to silence all push notifications. 0 (or omitted) clears the snooze.
  hours: z.number().min(0).max(48).optional(),
});

const updatePreferencesSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  // Followed-fighter per-lane toggles
  notifyFollowedBooked: z.boolean().optional(),
  notifyFollowed3DayWarn: z.boolean().optional(),
  notifyFollowedMorningOf: z.boolean().optional(),
  notifyFollowedWalkout: z.boolean().optional(),
  // IANA timezone string. Validated loosely — if Intl can't resolve it, we fall
  // back to America/New_York in the cron rather than rejecting the write.
  timezone: z.string().min(1).max(64).optional(),
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
          notifyFollowedBooked: true,
          notifyFollowed3DayWarn: true,
          notifyFollowedMorningOf: true,
          notifyFollowedWalkout: true,
          timezone: true,
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
        const userPreferences = updatePreferencesSchema.parse(request.body);
        const userId = request.user!.id;

        // Update basic user preferences (includes lane toggles + timezone)
        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: userPreferences,
          select: {
            notificationsEnabled: true,
            notifyFollowedBooked: true,
            notifyFollowed3DayWarn: true,
            notifyFollowedMorningOf: true,
            notifyFollowedWalkout: true,
            timezone: true,
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

      console.log(`[Test Notification] Request from user: ${userId}`);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { pushToken: true, displayName: true, notificationsEnabled: true },
      });

      console.log(`[Test Notification] User found:`, {
        displayName: user?.displayName,
        hasPushToken: !!user?.pushToken,
        pushToken: user?.pushToken?.substring(0, 20) + '...',
        notificationsEnabled: user?.notificationsEnabled
      });

      if (!user?.pushToken) {
        console.log(`[Test Notification] ERROR: No push token for user ${userId}`);
        return reply.status(400).send({
          error: 'No push token registered for this user',
        });
      }

      const { notificationService } = await import('../services/notificationService');

      console.log(`[Test Notification] Sending notification to user ${userId}...`);

      const result = await notificationService.sendPushNotifications(
        [userId],
        {
          title: 'Test Notification',
          body: 'kooky butt butt',
          data: {
            test: true,
            url: 'fightcrewapp://community',
            screen: 'community'
          },
        }
      );

      console.log(`[Test Notification] Result:`, result);

      return reply.send({
        message: 'Test notification sent',
        result,
      });
    }
  );

  /**
   * Test pre-event report notification (development only)
   * POST /api/notifications/test-pre-event-report
   * Body: { eventId: string }
   */
  fastify.post(
    '/test-pre-event-report',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const userId = request.user!.id;
      const body = request.body as any;
      const eventId = body?.eventId;

      if (!eventId) {
        return reply.status(400).send({
          error: 'eventId is required in request body',
        });
      }

      console.log(`[Test Pre-Event Report] Request from user ${userId} for event ${eventId}`);

      // Check if user has pre-event report rule enabled
      const hasRule = await hasPreEventReportRule(userId);
      if (!hasRule) {
        return reply.status(400).send({
          error: 'User does not have pre-event report notifications enabled',
          hint: 'Enable it in notification settings first',
        });
      }

      const { sendPreEventReports } = await import('../services/preEventReportService');

      try {
        const result = await sendPreEventReports(eventId);

        return reply.send({
          message: 'Pre-event report sent',
          result,
        });
      } catch (error: any) {
        console.error('[Test Pre-Event Report] Error:', error);
        return reply.status(500).send({
          error: 'Failed to send pre-event report',
          details: error.message,
        });
      }
    }
  );

  // Quick test endpoint - send notification to all users with push tokens (for testing only)
  fastify.post('/test-broadcast', async (request, reply) => {
    try {
      const { notificationService } = await import('../services/notificationService');

      // Parse optional custom message from request body
      const body = request.body as any;
      const customTitle = body?.title || '🥊 Test Notification';
      const customBody = body?.body || 'This is a test from FightCrewApp!';

      // Get all users with push tokens
      const users = await prisma.user.findMany({
        where: {
          pushToken: { not: null },
          notificationsEnabled: true,
        },
        select: { id: true, displayName: true, pushToken: true },
      });

      if (users.length === 0) {
        return reply.send({
          message: 'No users with push tokens found',
          result: { success: 0, failed: 0 },
        });
      }

      const result = await notificationService.sendPushNotifications(
        users.map(u => u.id),
        {
          title: customTitle,
          body: customBody,
          data: { test: true },
        }
      );

      return reply.send({
        message: `Test broadcast sent to ${users.length} user(s)`,
        users: users.map(u => ({ id: u.id, displayName: u.displayName })),
        result,
      });
    } catch (error: any) {
      console.error('Test broadcast error:', error);
      return reply.status(500).send({
        error: 'Failed to send test broadcast',
        details: error.message,
      });
    }
  });

  // ============== Notification Center (in-app inbox) ==============

  // List the current user's recent notifications (last 7 days) + unread count.
  fastify.get(
    '/',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const userId = request.user!.id;
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [notifications, unreadCount, user] = await Promise.all([
        prisma.userNotification.findMany({
          where: { userId, createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            title: true,
            message: true,
            type: true,
            isRead: true,
            linkType: true,
            linkId: true,
            createdAt: true,
          },
        }),
        prisma.userNotification.count({
          where: { userId, isRead: false, createdAt: { gte: since } },
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { notificationsSnoozedUntil: true },
        }),
      ]);

      // Only report an active (future) snooze; a past timestamp reads as cleared.
      const snoozedUntil =
        user?.notificationsSnoozedUntil && user.notificationsSnoozedUntil > new Date()
          ? user.notificationsSnoozedUntil
          : null;

      return reply.send({ notifications, unreadCount, snoozedUntil });
    },
  );

  // Set or clear the "Silence for N hours" snooze. { hours: 8 } snoozes;
  // { hours: 0 } or {} clears it. Honored centrally in sendPushNotifications.
  fastify.post(
    '/snooze',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const userId = request.user!.id;
      const parsed = snoozeSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
      }
      const hours = parsed.data.hours ?? 0;
      const snoozedUntil = hours > 0 ? new Date(Date.now() + hours * 60 * 60 * 1000) : null;

      await prisma.user.update({
        where: { id: userId },
        data: { notificationsSnoozedUntil: snoozedUntil },
      });

      return reply.send({ snoozedUntil });
    },
  );

  // Lightweight unread-count for the nav-bar badge poll.
  fastify.get(
    '/unread-count',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const userId = request.user!.id;
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const unreadCount = await prisma.userNotification.count({
        where: { userId, isRead: false, createdAt: { gte: since } },
      });
      return reply.send({ unreadCount });
    },
  );

  // Mark notifications read. Body { ids: string[] } marks those rows; omit `ids`
  // to mark ALL of the user's unread notifications read (e.g. on screen open).
  fastify.post(
    '/mark-read',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const userId = request.user!.id;
      const parsed = markReadSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
      }
      const { ids } = parsed.data;

      const result = await prisma.userNotification.updateMany({
        where: {
          userId,
          isRead: false,
          ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
        },
        data: { isRead: true, readAt: new Date() },
      });

      return reply.send({ updated: result.count });
    },
  );
};

export default notificationsRoutes;
