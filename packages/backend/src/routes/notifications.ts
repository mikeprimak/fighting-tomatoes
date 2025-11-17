import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticateUser } from '../middleware/auth';
import { notificationRuleEngine } from '../services/notificationRuleEngine';
import { managePreEventReportRule, hasPreEventReportRule } from '../services/notificationRuleHelpers';

const prisma = new PrismaClient();

const registerTokenSchema = z.object({
  pushToken: z.string(),
});

const updatePreferencesSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  notifyHypedFights: z.boolean().optional(),
  notifyPreEventReport: z.boolean().optional(),
  // Legacy fields removed - all notifications now managed via rules
});

/**
 * Manages the "Hyped Fights" notification rule for a user
 * Creates/activates or deactivates the rule based on the enabled flag
 */
async function manageHypedFightsRule(userId: string, enabled: boolean): Promise<void> {
  const RULE_NAME = 'Hyped Fights';
  const RULE_CONDITIONS = { minHype: 8.5 };
  const NOTIFY_MINUTES_BEFORE = 15;

  // Check if rule already exists
  const existingRule = await prisma.userNotificationRule.findFirst({
    where: {
      userId,
      name: RULE_NAME,
    },
  });

  if (existingRule) {
    // Update existing rule
    await prisma.userNotificationRule.update({
      where: { id: existingRule.id },
      data: { isActive: enabled },
    });

    if (enabled) {
      // If enabled, sync matches
      notificationRuleEngine.syncRuleMatches(existingRule.id).catch(err => {
        console.error('Error syncing Hyped Fights rule matches:', err);
      });
    } else {
      // If disabled, deactivate all matches for this rule
      await prisma.fightNotificationMatch.updateMany({
        where: {
          ruleId: existingRule.id,
        },
        data: {
          isActive: false,
        },
      });
    }
  } else if (enabled) {
    // Create new rule (only if enabled)
    const newRule = await prisma.userNotificationRule.create({
      data: {
        userId,
        name: RULE_NAME,
        conditions: RULE_CONDITIONS,
        notifyMinutesBefore: NOTIFY_MINUTES_BEFORE,
        priority: 0,
        isActive: true,
      },
    });

    // Sync matches for new rule
    notificationRuleEngine.syncRuleMatches(newRule.id).catch(err => {
      console.error('Error syncing Hyped Fights rule matches:', err);
    });
  }
  // If !enabled and no existing rule, nothing to do
}

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
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Check if user has the "Hyped Fights" notification rule active
      const hypedFightsRule = await prisma.userNotificationRule.findFirst({
        where: {
          userId,
          name: 'Hyped Fights',
        },
      });

      // Check if user has the "Pre-Event Report" notification rule active
      const preEventReportRule = await prisma.userNotificationRule.findFirst({
        where: {
          userId,
          name: 'Pre-Event Report',
        },
      });

      return reply.send({
        preferences: {
          ...user,
          notifyHypedFights: hypedFightsRule?.isActive ?? false,
          notifyPreEventReport: preEventReportRule?.isActive ?? false,
          // Legacy fields removed - all notifications now managed via rules
        },
      });
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

        // Extract rule-based preferences from user preferences
        const { notifyHypedFights, notifyPreEventReport, ...userPreferences } = preferences;

        // Update basic user preferences
        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: userPreferences,
          select: {
            notificationsEnabled: true,
          },
        });

        // Handle Hyped Fights notification rule
        if (notifyHypedFights !== undefined) {
          await manageHypedFightsRule(userId, notifyHypedFights);
        }

        // Handle Pre-Event Report notification rule
        if (notifyPreEventReport !== undefined) {
          await managePreEventReportRule(userId, notifyPreEventReport);
        }

        // Get current state of notification rules for response
        const hypedFightsRule = await prisma.userNotificationRule.findFirst({
          where: {
            userId,
            name: 'Hyped Fights',
          },
        });

        const preEventReportRule = await prisma.userNotificationRule.findFirst({
          where: {
            userId,
            name: 'Pre-Event Report',
          },
        });

        return reply.send({
          message: 'Preferences updated successfully',
          preferences: {
            ...updatedUser,
            notifyHypedFights: hypedFightsRule?.isActive ?? false,
            notifyPreEventReport: preEventReportRule?.isActive ?? false,
          },
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
};

export default notificationsRoutes;
