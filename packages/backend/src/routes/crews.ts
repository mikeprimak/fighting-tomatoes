// packages/backend/src/routes/crews.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

// Validation schemas
const createCrewSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  maxMembers: z.number().int().min(2).max(50).default(20),
  allowPredictions: z.boolean().default(true),
  allowRoundVoting: z.boolean().default(true),
  allowReactions: z.boolean().default(true),
});

const joinCrewSchema = z.object({
  inviteCode: z.string().length(6),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(500),
  fightId: z.string().optional(),
});

const createPredictionSchema = z.object({
  hypeLevel: z.number().int().min(1).max(10).optional(),
  predictedWinner: z.string().optional(),
  predictedMethod: z.enum(['DECISION', 'KO_TKO', 'SUBMISSION']).optional(),
  predictedRound: z.number().int().min(1).max(5).optional(),
});

// Generate a random invite code
function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function crewRoutes(fastify: FastifyInstance) {
  // Create a new crew
  fastify.post('/crews', {
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    const userId = request.user!.id;
    const validation = createCrewSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: 'Invalid input data',
        code: 'VALIDATION_ERROR',
        details: validation.error.errors,
      });
    }

    const data = validation.data;

    try {
      // Generate unique invite code
      let inviteCode: string;
      let isUnique = false;
      let attempts = 0;

      do {
        inviteCode = generateInviteCode();
        const existing = await fastify.prisma.crew.findUnique({
          where: { inviteCode },
        });
        isUnique = !existing;
        attempts++;
      } while (!isUnique && attempts < 10);

      if (!isUnique) {
        return reply.status(500).send({
          error: 'Unable to generate unique invite code',
          code: 'INVITE_CODE_GENERATION_FAILED',
        });
      }

      // Create crew and add creator as owner
      const crew = await fastify.prisma.crew.create({
        data: {
          name: data.name,
          description: data.description,
          inviteCode: inviteCode!,
          maxMembers: data.maxMembers,
          allowPredictions: data.allowPredictions,
          allowRoundVoting: data.allowRoundVoting,
          allowReactions: data.allowReactions,
          createdBy: userId,
          members: {
            create: {
              userId,
              role: 'OWNER',
            },
          },
        },
        select: {
          id: true,
          name: true,
          description: true,
          inviteCode: true,
          totalMembers: true,
          createdBy: true,
          createdAt: true,
        },
      });

      return reply.status(201).send({ crew });
    } catch (error: any) {
      request.log.error('Crew creation error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Get user's crews
  fastify.get('/crews', {
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    const userId = request.user!.id;

    try {
      const crewMemberships = await fastify.prisma.crewMember.findMany({
        where: {
          userId,
          isActive: true,
        },
        include: {
          crew: {
            select: {
              id: true,
              name: true,
              description: true,
              totalMembers: true,
              totalMessages: true,
              updatedAt: true,
              messages: {
                orderBy: {
                  createdAt: 'desc',
                },
                take: 1,
                select: {
                  content: true,
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          lastActiveAt: 'desc',
        },
      });

      const crews = crewMemberships.map(membership => {
        const lastMessage = membership.crew.messages[0];
        const lastMessagePreview = lastMessage
          ? `${lastMessage.user.firstName || 'User'}: ${lastMessage.content}`
          : 'No messages yet';

        return {
          id: membership.crew.id,
          name: membership.crew.name,
          description: membership.crew.description,
          totalMembers: membership.crew.totalMembers,
          totalMessages: membership.crew.totalMessages,
          lastMessageAt: membership.crew.updatedAt.toISOString(),
          lastMessagePreview,
          role: membership.role,
          joinedAt: membership.joinedAt.toISOString(),
        };
      });

      return reply.status(200).send({ crews });
    } catch (error: any) {
      request.log.error('Crews fetch error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Join a crew by invite code
  fastify.post('/crews/join', {
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    const userId = request.user!.id;
    const validation = joinCrewSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: 'Invalid invite code',
        code: 'VALIDATION_ERROR',
      });
    }

    const { inviteCode } = validation.data;

    try {
      // Find crew by invite code
      const crew = await fastify.prisma.crew.findUnique({
        where: { inviteCode: inviteCode.toUpperCase() },
        include: {
          members: {
            where: { userId },
          },
        },
      });

      if (!crew) {
        return reply.status(404).send({
          error: 'Invalid invite code',
          code: 'CREW_NOT_FOUND',
        });
      }

      if (!crew.isActive) {
        return reply.status(400).send({
          error: 'This crew is no longer active',
          code: 'CREW_INACTIVE',
        });
      }

      // Check if user is already a member
      if (crew.members.length > 0) {
        return reply.status(400).send({
          error: 'You are already a member of this crew',
          code: 'ALREADY_MEMBER',
        });
      }

      // Check if crew is full
      if (crew.totalMembers >= crew.maxMembers) {
        return reply.status(400).send({
          error: 'This crew is full',
          code: 'CREW_FULL',
        });
      }

      // Add user to crew
      await fastify.prisma.$transaction([
        fastify.prisma.crewMember.create({
          data: {
            userId,
            crewId: crew.id,
            role: 'MEMBER',
          },
        }),
        fastify.prisma.crew.update({
          where: { id: crew.id },
          data: {
            totalMembers: { increment: 1 },
          },
        }),
      ]);

      return reply.status(200).send({
        crew: {
          id: crew.id,
          name: crew.name,
          description: crew.description,
          totalMembers: crew.totalMembers + 1,
        },
      });
    } catch (error: any) {
      request.log.error('Crew join error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Get crew details
  fastify.get('/crews/:id', {
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };

    try {
      // Check if user is a member
      const membership = await fastify.prisma.crewMember.findUnique({
        where: {
          userId_crewId: {
            userId,
            crewId: id,
          },
        },
        include: {
          crew: {
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      displayName: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
                where: { isActive: true },
                orderBy: { joinedAt: 'asc' },
              },
            },
          },
        },
      });

      if (!membership || !membership.isActive) {
        return reply.status(404).send({
          error: 'Crew not found or access denied',
          code: 'CREW_NOT_FOUND',
        });
      }

      const crew = membership.crew;

      // Check if the 8-hour mute has expired
      const now = new Date();
      const isCurrentlyMuted = membership.isMuted &&
        (!membership.mutedUntil || membership.mutedUntil > now);

      return reply.status(200).send({
        crew: {
          id: crew.id,
          name: crew.name,
          description: crew.description,
          inviteCode: crew.inviteCode,
          totalMembers: crew.totalMembers,
          totalMessages: crew.totalMessages,
          allowPredictions: crew.allowPredictions,
          allowRoundVoting: crew.allowRoundVoting,
          allowReactions: crew.allowReactions,
          userRole: membership.role,
          isMuted: isCurrentlyMuted,
          mutedUntil: membership.mutedUntil,
          members: crew.members.map(member => ({
            id: member.id, // membershipId for removal
            userId: member.user.id,
            name: member.user.displayName || `${member.user.firstName} ${member.user.lastName}`,
            role: member.role,
            joinedAt: member.joinedAt,
            messagesCount: member.messagesCount,
          })),
          createdAt: crew.createdAt,
        },
      });
    } catch (error: any) {
      request.log.error('Crew details fetch error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Get crew messages
  fastify.get('/crews/:id/messages', {
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const { limit = 50, before } = request.query as any;

    try {
      // Verify membership
      const membership = await fastify.prisma.crewMember.findUnique({
        where: {
          userId_crewId: {
            userId,
            crewId: id,
          },
        },
      });

      if (!membership || !membership.isActive) {
        return reply.status(404).send({
          error: 'Crew not found or access denied',
          code: 'CREW_NOT_FOUND',
        });
      }

      // Get messages
      const messages = await fastify.prisma.crewMessage.findMany({
        where: {
          crewId: id,
          isDeleted: false,
          ...(before && { createdAt: { lt: new Date(before) } }),
        },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              firstName: true,
              lastName: true,
            },
          },
          fight: {
            select: {
              id: true,
              fighter1: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
              fighter2: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return reply.status(200).send({
        messages: messages.reverse().map(message => ({
          id: message.id,
          content: message.content,
          messageType: message.messageType,
          structuredData: message.structuredData,
          user: {
            id: message.user.id,
            name: message.user.displayName || `${message.user.firstName} ${message.user.lastName}`,
          },
          fight: message.fight ? {
            id: message.fight.id,
            matchup: `${message.fight.fighter1.firstName} ${message.fight.fighter1.lastName} vs ${message.fight.fighter2.firstName} ${message.fight.fighter2.lastName}`,
          } : null,
          createdAt: message.createdAt,
          isEdited: message.isEdited,
        })),
      });
    } catch (error: any) {
      request.log.error('Crew messages fetch error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Send a message to crew
  fastify.post('/crews/:id/messages', {
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const validation = sendMessageSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: 'Invalid message data',
        code: 'VALIDATION_ERROR',
        details: validation.error.errors,
      });
    }

    const { content, fightId } = validation.data;

    try {
      // Verify membership
      const membership = await fastify.prisma.crewMember.findUnique({
        where: {
          userId_crewId: {
            userId,
            crewId: id,
          },
        },
      });

      if (!membership || !membership.isActive) {
        return reply.status(404).send({
          error: 'Crew not found or access denied',
          code: 'CREW_NOT_FOUND',
        });
      }

      if (membership.isMuted) {
        return reply.status(403).send({
          error: 'You are muted in this crew',
          code: 'USER_MUTED',
        });
      }

      // Create message and update stats
      const message = await fastify.prisma.$transaction(async (tx) => {
        const newMessage = await tx.crewMessage.create({
          data: {
            crewId: id,
            userId,
            content,
            fightId,
            messageType: 'TEXT',
          },
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        // Update member and crew message counts
        await tx.crewMember.update({
          where: {
            userId_crewId: {
              userId,
              crewId: id,
            },
          },
          data: {
            messagesCount: { increment: 1 },
            lastActiveAt: new Date(),
          },
        });

        await tx.crew.update({
          where: { id },
          data: {
            totalMessages: { increment: 1 },
            updatedAt: new Date(),
          },
        });

        return newMessage;
      });

      return reply.status(201).send({
        message: {
          id: message.id,
          content: message.content,
          messageType: message.messageType,
          user: {
            id: message.user.id,
            name: message.user.displayName || `${message.user.firstName} ${message.user.lastName}`,
          },
          createdAt: message.createdAt,
        },
      });
    } catch (error: any) {
      request.log.error('Message send error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Delete a message
  fastify.delete('/crews/:crewId/messages/:messageId', {
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    const userId = request.user!.id;
    const { crewId, messageId } = request.params as { crewId: string; messageId: string };

    try {
      // Verify the message exists and belongs to the user
      const message = await fastify.prisma.crewMessage.findUnique({
        where: { id: messageId },
      });

      if (!message) {
        return reply.status(404).send({
          error: 'Message not found',
          code: 'MESSAGE_NOT_FOUND',
        });
      }

      if (message.userId !== userId) {
        return reply.status(403).send({
          error: 'You can only delete your own messages',
          code: 'FORBIDDEN',
        });
      }

      if (message.crewId !== crewId) {
        return reply.status(400).send({
          error: 'Message does not belong to this crew',
          code: 'INVALID_REQUEST',
        });
      }

      // Mark message as deleted by updating content
      await fastify.prisma.crewMessage.update({
        where: { id: messageId },
        data: {
          content: '[deleted]',
          messageType: 'DELETED',
        },
      });

      return reply.status(200).send({ success: true });
    } catch (error: any) {
      request.log.error('Message delete error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Create a prediction for a fight in a crew
  fastify.post('/crews/:crewId/predictions/:fightId', {
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    const userId = request.user!.id;
    const { crewId, fightId } = request.params as { crewId: string; fightId: string };
    const validation = createPredictionSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: 'Invalid prediction data',
        code: 'VALIDATION_ERROR',
        details: validation.error.errors,
      });
    }

    const { hypeLevel, predictedWinner, predictedMethod, predictedRound } = validation.data;

    console.log('✅ Received prediction data:', {
      hypeLevel,
      predictedWinner,
      predictedMethod,
      predictedRound,
      fightId,
      crewId
    });

    // Ensure at least one prediction field is provided (check for undefined/null, not falsy)
    const hasAnyPrediction =
      hypeLevel !== undefined ||
      predictedWinner !== undefined ||
      predictedMethod !== undefined ||
      predictedRound !== undefined;
    if (!hasAnyPrediction) {
      return reply.status(400).send({
        error: 'At least one prediction field must be provided',
        code: 'NO_PREDICTION_DATA',
      });
    }

    try {
      // Verify crew membership
      const membership = await fastify.prisma.crewMember.findUnique({
        where: {
          userId_crewId: {
            userId,
            crewId,
          },
        },
        include: {
          crew: true,
        },
      });

      if (!membership || !membership.isActive) {
        return reply.status(404).send({
          error: 'Crew not found or access denied',
          code: 'CREW_NOT_FOUND',
        });
      }

      if (!membership.crew.allowPredictions) {
        return reply.status(403).send({
          error: 'Predictions are not allowed in this crew',
          code: 'PREDICTIONS_DISABLED',
        });
      }

      // Verify fight exists and hasn't started yet
      const fight = await fastify.prisma.fight.findUnique({
        where: { id: fightId },
        include: {
          fighter1: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          fighter2: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!fight) {
        return reply.status(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      if (fight.hasStarted) {
        return reply.status(400).send({
          error: 'Cannot make predictions after fight has started',
          code: 'FIGHT_ALREADY_STARTED',
        });
      }

      // Validate predicted winner is one of the fighters
      if (predictedWinner && predictedWinner !== fight.fighter1.id && predictedWinner !== fight.fighter2.id) {
        console.log('❌ Invalid predicted winner:', {
          predictedWinner,
          fighter1Id: fight.fighter1.id,
          fighter2Id: fight.fighter2.id,
          fightId: fight.id
        });
        return reply.status(400).send({
          error: 'Invalid predicted winner',
          code: 'INVALID_PREDICTED_WINNER',
        });
      }

      // Create or update prediction
      const prediction = await fastify.prisma.crewPrediction.upsert({
        where: {
          crewId_userId_fightId: {
            crewId,
            userId,
            fightId,
          },
        },
        update: {
          hypeLevel,
          predictedWinner,
          predictedMethod,
          predictedRound,
        },
        create: {
          crewId,
          userId,
          fightId,
          hypeLevel,
          predictedWinner,
          predictedMethod,
          predictedRound,
        },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Create a crew message about the prediction
      const fighterNames = `${fight.fighter1.lastName} vs ${fight.fighter2.lastName}`;
      const winnerName = predictedWinner === fight.fighter1.id
        ? fight.fighter1.lastName
        : predictedWinner === fight.fighter2.id
        ? fight.fighter2.lastName
        : 'Unknown';

      const predictionMessage = `Predicted ${fighterNames}: ${winnerName} by ${predictedMethod} in Round ${predictedRound} (Hype: ${hypeLevel}/10)`;

      await fastify.prisma.crewMessage.create({
        data: {
          crewId,
          userId,
          content: predictionMessage,
          messageType: 'PREDICTION',
          fightId,
          structuredData: {
            predictionId: prediction.id,
            hypeLevel,
            predictedWinner,
            predictedMethod,
            predictedRound,
          },
        },
      });

      // Update crew and member stats
      await fastify.prisma.$transaction([
        fastify.prisma.crew.update({
          where: { id: crewId },
          data: {
            totalMessages: { increment: 1 },
            updatedAt: new Date(),
          },
        }),
        fastify.prisma.crewMember.update({
          where: {
            userId_crewId: {
              userId,
              crewId,
            },
          },
          data: {
            predictionsCount: { increment: 1 },
            lastActiveAt: new Date(),
          },
        }),
      ]);

      return reply.status(201).send({
        prediction: {
          id: prediction.id,
          hypeLevel: prediction.hypeLevel,
          predictedWinner: prediction.predictedWinner,
          predictedMethod: prediction.predictedMethod,
          predictedRound: prediction.predictedRound,
          createdAt: prediction.createdAt,
          user: {
            id: prediction.user.id,
            name: prediction.user.displayName || `${prediction.user.firstName} ${prediction.user.lastName}`,
          },
        },
      });
    } catch (error: any) {
      request.log.error('Prediction creation error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Get predictions for a fight in a crew
  fastify.get('/crews/:crewId/predictions/:fightId', {
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    const userId = request.user!.id;
    const { crewId, fightId } = request.params as { crewId: string; fightId: string };

    try {
      // Verify crew membership
      const membership = await fastify.prisma.crewMember.findUnique({
        where: {
          userId_crewId: {
            userId,
            crewId,
          },
        },
      });

      if (!membership || !membership.isActive) {
        return reply.status(404).send({
          error: 'Crew not found or access denied',
          code: 'CREW_NOT_FOUND',
        });
      }

      // Get all predictions for this fight in the crew
      const predictions = await fastify.prisma.crewPrediction.findMany({
        where: {
          crewId,
          fightId,
        },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return reply.status(200).send({
        predictions: predictions.map(prediction => ({
          id: prediction.id,
          hypeLevel: prediction.hypeLevel,
          predictedWinner: prediction.predictedWinner,
          predictedMethod: prediction.predictedMethod,
          predictedRound: prediction.predictedRound,
          createdAt: prediction.createdAt,
          user: {
            id: prediction.user.id,
            name: prediction.user.displayName || `${prediction.user.firstName} ${prediction.user.lastName}`,
          },
        })),
      });
    } catch (error: any) {
      request.log.error('Predictions fetch error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Delete a crew (Owner only)
  fastify.delete('/crews/:crewId', {
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    const userId = request.user!.id;
    const { crewId } = request.params;

    try {
      // Check if crew exists
      const crew = await fastify.prisma.crew.findUnique({
        where: { id: crewId },
        include: {
          members: {
            where: { userId },
          },
        },
      });

      if (!crew) {
        return reply.status(404).send({
          error: 'Crew not found',
          code: 'CREW_NOT_FOUND',
        });
      }

      // Check if user is the owner
      const membership = crew.members[0];
      if (!membership || membership.role !== 'OWNER') {
        return reply.status(403).send({
          error: 'Only the crew owner can delete the crew',
          code: 'FORBIDDEN',
        });
      }

      // Delete all related data in the correct order (due to foreign key constraints)
      // 1. Delete crew predictions
      await fastify.prisma.crewPrediction.deleteMany({
        where: { crewId },
      });

      // 2. Delete crew reactions
      await fastify.prisma.crewReaction.deleteMany({
        where: { crewId },
      });

      // 3. Delete crew messages
      await fastify.prisma.crewMessage.deleteMany({
        where: { crewId },
      });

      // 4. Delete crew memberships
      await fastify.prisma.crewMember.deleteMany({
        where: { crewId },
      });

      // 5. Finally delete the crew
      await fastify.prisma.crew.delete({
        where: { id: crewId },
      });

      return reply.status(200).send({
        message: 'Crew deleted successfully',
      });
    } catch (error: any) {
      request.log.error('Crew deletion error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Remove a member from crew (Owner only)
  fastify.delete('/crews/:crewId/members/:memberId', {
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    const userId = request.user!.id;
    const { crewId, memberId } = request.params;
    const { block } = request.body as { block: boolean };

    try {
      // Check if crew exists and user is owner
      const crew = await fastify.prisma.crew.findUnique({
        where: { id: crewId },
        include: {
          members: true,
        },
      });

      if (!crew) {
        return reply.status(404).send({
          error: 'Crew not found',
          code: 'CREW_NOT_FOUND',
        });
      }

      // Check if requester is owner
      const requesterMembership = crew.members.find(m => m.userId === userId);
      if (!requesterMembership || requesterMembership.role !== 'OWNER') {
        return reply.status(403).send({
          error: 'Only the crew owner can remove members',
          code: 'FORBIDDEN',
        });
      }

      // Check if target member exists
      const targetMembership = crew.members.find(m => m.id === memberId);
      if (!targetMembership) {
        return reply.status(404).send({
          error: 'Member not found in this crew',
          code: 'MEMBER_NOT_FOUND',
        });
      }

      // Cannot remove owner
      if (targetMembership.role === 'OWNER') {
        return reply.status(403).send({
          error: 'Cannot remove the crew owner',
          code: 'FORBIDDEN',
        });
      }

      // Delete member's data in correct order
      // 1. Delete predictions
      await fastify.prisma.crewPrediction.deleteMany({
        where: {
          crewId,
          userId: targetMembership.userId,
        },
      });

      // 2. Delete reactions
      await fastify.prisma.crewReaction.deleteMany({
        where: {
          crewId,
          userId: targetMembership.userId,
        },
      });

      // 3. Mark messages as deleted
      await fastify.prisma.crewMessage.updateMany({
        where: {
          crewId,
          userId: targetMembership.userId,
        },
        data: {
          content: '[deleted]',
          messageType: 'DELETED',
        },
      });

      // 4. Delete membership and update crew member count
      await fastify.prisma.$transaction([
        fastify.prisma.crewMember.delete({
          where: { id: memberId },
        }),
        fastify.prisma.crew.update({
          where: { id: crewId },
          data: {
            totalMembers: { decrement: 1 },
          },
        }),
      ]);

      // 5. If block is true, create a block record (optional future feature)
      // TODO: Implement block functionality with a CrewBlock table

      return reply.status(200).send({
        message: block ? 'Member removed and blocked successfully' : 'Member removed successfully',
        removedUserId: targetMembership.userId, // Return the removed user's ID so frontend can handle their cache
      });
    } catch (error: any) {
      request.log.error('Remove member error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Mute/Unmute crew chat
  fastify.post('/crews/:crewId/mute', {
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    const userId = request.user!.id;
    const { crewId } = request.params;
    const { duration } = request.body as { duration: '8hours' | 'forever' };

    try {
      // Check if user is a member
      const membership = await fastify.prisma.crewMember.findUnique({
        where: {
          userId_crewId: {
            userId,
            crewId,
          },
        },
      });

      if (!membership || !membership.isActive) {
        return reply.status(404).send({
          error: 'Crew not found or access denied',
          code: 'CREW_NOT_FOUND',
        });
      }

      // Calculate mutedUntil timestamp
      const mutedUntil = duration === '8hours'
        ? new Date(Date.now() + 8 * 60 * 60 * 1000) // 8 hours from now
        : null; // null = muted forever

      // Update membership
      await fastify.prisma.crewMember.update({
        where: {
          userId_crewId: {
            userId,
            crewId,
          },
        },
        data: {
          isMuted: true,
          mutedUntil,
        },
      });

      return reply.status(200).send({
        message: duration === '8hours' ? 'Chat muted for 8 hours' : 'Chat muted forever',
        mutedUntil,
      });
    } catch (error: any) {
      request.log.error('Mute crew error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  fastify.post('/crews/:crewId/unmute', {
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    const userId = request.user!.id;
    const { crewId } = request.params;

    try {
      // Check if user is a member
      const membership = await fastify.prisma.crewMember.findUnique({
        where: {
          userId_crewId: {
            userId,
            crewId,
          },
        },
      });

      if (!membership || !membership.isActive) {
        return reply.status(404).send({
          error: 'Crew not found or access denied',
          code: 'CREW_NOT_FOUND',
        });
      }

      // Update membership
      await fastify.prisma.crewMember.update({
        where: {
          userId_crewId: {
            userId,
            crewId,
          },
        },
        data: {
          isMuted: false,
          mutedUntil: null,
        },
      });

      return reply.status(200).send({
        message: 'Chat unmuted successfully',
      });
    } catch (error: any) {
      request.log.error('Unmute crew error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });
}// trigger restart
