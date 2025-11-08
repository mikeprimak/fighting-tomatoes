import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticateUser } from '../middleware/auth';
import { notificationRuleEngine } from '../services/notificationRuleEngine';

const prisma = new PrismaClient();

// Validation schemas
const createRuleSchema = z.object({
  name: z.string().min(1).max(100),
  conditions: z.object({
    minHype: z.number().min(0).max(10).optional(),
    maxHype: z.number().min(0).max(10).optional(),
    fighterIds: z.array(z.string().uuid()).optional(),
    promotions: z.array(z.string()).optional(),
    daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
    notDaysOfWeek: z.array(z.number().min(0).max(6)).optional(),
    // Add more condition types here as needed - system is extensible
  }),
  priority: z.number().int().optional(),
  notifyMinutesBefore: z.number().int().min(1).max(1440).optional(), // Max 24 hours
});

const updateRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  conditions: z.object({
    minHype: z.number().min(0).max(10).optional(),
    maxHype: z.number().min(0).max(10).optional(),
    fighterIds: z.array(z.string().uuid()).optional(),
    promotions: z.array(z.string()).optional(),
    daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
    notDaysOfWeek: z.array(z.number().min(0).max(6)).optional(),
    // Add more condition types here as needed - system is extensible
  }).optional(),
  priority: z.number().int().optional(),
  notifyMinutesBefore: z.number().int().min(1).max(1440).optional(),
  isActive: z.boolean().optional(),
});

const notificationRulesRoutes: FastifyPluginAsync = async (fastify, opts) => {
  /**
   * Get all notification rules for current user
   * GET /api/notification-rules
   */
  fastify.get(
    '/',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const userId = request.user!.id;

      const rules = await prisma.userNotificationRule.findMany({
        where: { userId },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
      });

      return reply.send({ data: rules });
    }
  );

  /**
   * Get a specific notification rule
   * GET /api/notification-rules/:id
   */
  fastify.get(
    '/:id',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user!.id;

      const rule = await prisma.userNotificationRule.findFirst({
        where: {
          id,
          userId,
        },
        include: {
          matches: {
            where: {
              isActive: true,
            },
            take: 10, // Preview of matching fights
            select: {
              fightId: true,
              matchedAt: true,
            },
          },
        },
      });

      if (!rule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.send({ data: rule });
    }
  );

  /**
   * Create a new notification rule
   * POST /api/notification-rules
   */
  fastify.post(
    '/',
    { preHandler: authenticateUser },
    async (request, reply) => {
      try {
        const data = createRuleSchema.parse(request.body);
        const userId = request.user!.id;

        // Create the rule
        const rule = await prisma.userNotificationRule.create({
          data: {
            userId,
            name: data.name,
            conditions: data.conditions,
            priority: data.priority ?? 0,
            notifyMinutesBefore: data.notifyMinutesBefore ?? 15,
            isActive: true,
          },
        });

        // Asynchronously sync matches for this rule (don't wait for it)
        notificationRuleEngine.syncRuleMatches(rule.id).catch(err => {
          console.error('Error syncing rule matches:', err);
        });

        return reply.status(201).send({
          message: 'Notification rule created successfully',
          data: rule,
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
   * Update a notification rule
   * PUT /api/notification-rules/:id
   */
  fastify.put(
    '/:id',
    { preHandler: authenticateUser },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const data = updateRuleSchema.parse(request.body);
        const userId = request.user!.id;

        // Verify ownership
        const existingRule = await prisma.userNotificationRule.findFirst({
          where: { id, userId },
        });

        if (!existingRule) {
          return reply.status(404).send({ error: 'Rule not found' });
        }

        // Update the rule
        const updatedRule = await prisma.userNotificationRule.update({
          where: { id },
          data: {
            name: data.name,
            conditions: data.conditions,
            priority: data.priority,
            notifyMinutesBefore: data.notifyMinutesBefore,
            isActive: data.isActive,
          },
        });

        // If conditions changed, re-sync matches
        if (data.conditions !== undefined) {
          notificationRuleEngine.syncRuleMatches(id).catch(err => {
            console.error('Error syncing rule matches:', err);
          });
        }

        return reply.send({
          message: 'Notification rule updated successfully',
          data: updatedRule,
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
   * Delete a notification rule
   * DELETE /api/notification-rules/:id
   */
  fastify.delete(
    '/:id',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user!.id;

      // Verify ownership
      const existingRule = await prisma.userNotificationRule.findFirst({
        where: { id, userId },
      });

      if (!existingRule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      // Delete the rule (matches will cascade delete)
      await prisma.userNotificationRule.delete({
        where: { id },
      });

      return reply.send({
        message: 'Notification rule deleted successfully',
      });
    }
  );

  /**
   * Toggle a notification rule on/off
   * PATCH /api/notification-rules/:id/toggle
   */
  fastify.patch(
    '/:id/toggle',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user!.id;

      // Verify ownership
      const existingRule = await prisma.userNotificationRule.findFirst({
        where: { id, userId },
      });

      if (!existingRule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      // Toggle the rule
      const updatedRule = await prisma.userNotificationRule.update({
        where: { id },
        data: {
          isActive: !existingRule.isActive,
        },
      });

      return reply.send({
        message: `Notification rule ${updatedRule.isActive ? 'enabled' : 'disabled'}`,
        data: updatedRule,
      });
    }
  );

  /**
   * Sync matches for a specific rule
   * POST /api/notification-rules/:id/sync
   */
  fastify.post(
    '/:id/sync',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user!.id;

      // Verify ownership
      const existingRule = await prisma.userNotificationRule.findFirst({
        where: { id, userId },
      });

      if (!existingRule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      // Sync matches
      const matchCount = await notificationRuleEngine.syncRuleMatches(id);

      return reply.send({
        message: 'Rule matches synced successfully',
        matchCount,
      });
    }
  );

  /**
   * Get notification reasons for a specific fight
   * GET /api/notification-rules/fight/:fightId/reasons
   */
  fastify.get(
    '/fight/:fightId/reasons',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const { fightId } = request.params as { fightId: string };
      const userId = request.user!.id;

      const reasons = await notificationRuleEngine.getNotificationReasonsForFight(
        userId,
        fightId
      );

      return reply.send({ data: reasons });
    }
  );

  /**
   * Toggle notification for a specific fight (via rule match)
   * PATCH /api/notification-rules/fight/:fightId/toggle
   * Body: { ruleId: string }
   */
  fastify.patch(
    '/fight/:fightId/toggle',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const { fightId } = request.params as { fightId: string };
      const { ruleId } = request.body as { ruleId: string };
      const userId = request.user!.id;

      // Find the match
      const match = await prisma.fightNotificationMatch.findUnique({
        where: {
          userId_fightId_ruleId: {
            userId,
            fightId,
            ruleId,
          },
        },
      });

      if (!match) {
        return reply.status(404).send({ error: 'Notification match not found' });
      }

      // Toggle it
      const updatedMatch = await prisma.fightNotificationMatch.update({
        where: {
          userId_fightId_ruleId: {
            userId,
            fightId,
            ruleId,
          },
        },
        data: {
          isActive: !match.isActive,
        },
      });

      return reply.send({
        message: `Notification ${updatedMatch.isActive ? 'enabled' : 'disabled'} for this fight`,
        data: updatedMatch,
      });
    }
  );

};


export default notificationRulesRoutes;
