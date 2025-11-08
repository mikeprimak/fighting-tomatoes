import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticateUser } from '../middleware/auth';
import { notificationRuleEngine } from '../services/notificationRuleEngine';

const prisma = new PrismaClient();

const registerTokenSchema = z.object({
  pushToken: z.string(),
});

const updatePreferencesSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  notifyHypedFights: z.boolean().optional(),
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

      return reply.send({
        preferences: {
          ...user,
          notifyHypedFights: hypedFightsRule?.isActive ?? false,
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

        // Extract notifyHypedFights from preferences (handled via rules)
        const { notifyHypedFights, ...userPreferences } = preferences;

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

        // Get current state of Hyped Fights rule for response
        const hypedFightsRule = await prisma.userNotificationRule.findFirst({
          where: {
            userId,
            name: 'Hyped Fights',
          },
        });

        return reply.send({
          message: 'Preferences updated successfully',
          preferences: {
            ...updatedUser,
            notifyHypedFights: hypedFightsRule?.isActive ?? false,
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
