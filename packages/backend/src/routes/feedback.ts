import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateUser } from '../middleware/auth';

interface SubmitFeedbackBody {
  content: string;
  platform?: string;
  appVersion?: string;
}

export default async function feedbackRoutes(fastify: FastifyInstance) {
  // Submit feedback
  fastify.post('/feedback', {
    preHandler: [authenticateUser],
    schema: {
      description: 'Submit user feedback',
      tags: ['feedback'],
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 5000 },
          platform: { type: 'string' }, // "ios", "android", "web"
          appVersion: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            feedbackId: { type: 'string' },
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
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    console.log('=== FEEDBACK REQUEST ===');
    console.log('Request user:', (request as any).user);
    console.log('Request body:', request.body);
    console.log('Headers:', request.headers);

    const userId = (request as any).user?.userId || (request as any).user?.id;
    const { content, platform, appVersion } = request.body as SubmitFeedbackBody;

    console.log('Extracted userId:', userId);

    if (!userId) {
      console.log('ERROR: No userId found, returning 401');
      return reply.code(401).send({
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    if (!content || content.trim().length === 0) {
      return reply.code(400).send({
        error: 'Feedback content is required',
        code: 'INVALID_INPUT',
      });
    }

    if (content.length > 5000) {
      return reply.code(400).send({
        error: 'Feedback content must be 5000 characters or less',
        code: 'CONTENT_TOO_LONG',
      });
    }

    try {
      // Get user email for backup
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      const feedback = await fastify.prisma.userFeedback.create({
        data: {
          userId,
          content: content.trim(),
          userEmail: user?.email,
          platform,
          appVersion,
        },
      });

      // Log to console for immediate visibility
      console.log('=== NEW USER FEEDBACK ===');
      console.log(`Feedback ID: ${feedback.id}`);
      console.log(`User ID: ${userId}`);
      console.log(`Email: ${user?.email}`);
      console.log(`Platform: ${platform || 'unknown'}`);
      console.log(`App Version: ${appVersion || 'unknown'}`);
      console.log(`Content: ${content}`);
      console.log(`Timestamp: ${feedback.createdAt.toISOString()}`);
      console.log('========================');

      return reply.code(201).send({
        message: 'Feedback submitted successfully. Thank you!',
        feedbackId: feedback.id,
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
      return reply.code(500).send({
        error: 'Failed to submit feedback',
        code: 'INTERNAL_ERROR',
      });
    }
  });
}
 
