// packages/backend/src/routes/analytics.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { AnalyticsService } from '../services/analytics'
import { EventType } from '@prisma/client'

// ============== VALIDATION SCHEMAS ==============

const trackEventSchema = z.object({
  eventName: z.string().min(1),
  eventType: z.nativeEnum(EventType),
  sessionId: z.string().optional(),
  properties: z.record(z.any()).optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
  appVersion: z.string().optional(),
})

const trackEventsBatchSchema = z.object({
  events: z.array(trackEventSchema).max(100), // Limit batch size
})

const startSessionSchema = z.object({
  sessionId: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']).optional(),
  appVersion: z.string().optional(),
  deviceId: z.string().optional(),
})

const endSessionSchema = z.object({
  sessionId: z.string().min(1),
})

const analyticsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// ============== ROUTE HANDLERS ==============

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string
    email: string
    isEmailVerified: boolean
  }
}

export default async function analyticsRoutes(fastify: FastifyInstance) {

  // ============== EVENT TRACKING ENDPOINTS ==============

  /**
   * Track a single analytics event
   * POST /api/analytics/track
   */
  fastify.post('/track', {
    preHandler: [fastify.authenticate], // Optional auth - can track anonymous events
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const body = trackEventSchema.parse(request.body)

      const userId = (request as any).user?.id
      const userAgent = request.headers['user-agent']
      const ipAddress = request.ip

      await AnalyticsService.trackEvent({
        ...body,
        userId,
        userAgent,
        ipAddress,
      })

      return reply.code(200).send({ success: true })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        })
      }

      console.error('Analytics tracking error:', error)
      return reply.code(500).send({
        error: 'Failed to track event',
        code: 'ANALYTICS_ERROR',
      })
    }
  })

  /**
   * Track multiple events in batch
   * POST /api/analytics/track-batch
   */
  fastify.post('/track-batch', {
    preHandler: [fastify.authenticate], // Optional auth
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const body = trackEventsBatchSchema.parse(request.body)

      const userId = (request as any).user?.id
      const userAgent = request.headers['user-agent']
      const ipAddress = request.ip

      const eventsWithContext = body.events.map(event => ({
        ...event,
        userId,
        userAgent,
        ipAddress,
      }))

      await AnalyticsService.trackEventsBatch(eventsWithContext)

      return reply.code(200).send({
        success: true,
        eventsTracked: body.events.length
      })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        })
      }

      console.error('Analytics batch tracking error:', error)
      return reply.code(500).send({
        error: 'Failed to track events',
        code: 'ANALYTICS_ERROR',
      })
    }
  })

  // ============== SESSION MANAGEMENT ENDPOINTS ==============

  /**
   * Start a new session
   * POST /api/analytics/session/start
   */
  fastify.post('/session/start', {
    preHandler: [fastify.authenticate], // Optional auth
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const body = startSessionSchema.parse(request.body)

      const userId = (request as any).user?.id

      await AnalyticsService.startSession({
        ...body,
        userId,
      })

      return reply.code(200).send({ success: true })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        })
      }

      console.error('Session start error:', error)
      return reply.code(500).send({
        error: 'Failed to start session',
        code: 'SESSION_ERROR',
      })
    }
  })

  /**
   * End a session
   * POST /api/analytics/session/end
   */
  fastify.post('/session/end', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = endSessionSchema.parse(request.body)

      await AnalyticsService.endSession(body.sessionId)

      return reply.code(200).send({ success: true })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        })
      }

      console.error('Session end error:', error)
      return reply.code(500).send({
        error: 'Failed to end session',
        code: 'SESSION_ERROR',
      })
    }
  })

  // ============== CONVENIENCE ENDPOINTS FOR COMMON EVENTS ==============

  /**
   * Track fight rating (convenience endpoint)
   * POST /api/analytics/fight-rated
   */
  fastify.post('/fight-rated', {
    preHandler: [fastify.authenticate],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const body = z.object({
        fightId: z.string(),
        rating: z.number().min(1).max(10),
        sessionId: z.string().optional(),
        platform: z.enum(['ios', 'android', 'web']).optional(),
      }).parse(request.body)

      const userId = (request as any).user!.id

      await AnalyticsService.trackFightRating(
        userId,
        body.fightId,
        body.rating,
        body.sessionId,
        body.platform
      )

      return reply.code(200).send({ success: true })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        })
      }

      console.error('Fight rating tracking error:', error)
      return reply.code(500).send({
        error: 'Failed to track fight rating',
        code: 'ANALYTICS_ERROR',
      })
    }
  })

  /**
   * Track review posted (convenience endpoint)
   * POST /api/analytics/review-posted
   */
  fastify.post('/review-posted', {
    preHandler: [fastify.authenticate],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const body = z.object({
        fightId: z.string(),
        reviewLength: z.number(),
        sessionId: z.string().optional(),
        platform: z.enum(['ios', 'android', 'web']).optional(),
      }).parse(request.body)

      const userId = (request as any).user!.id

      await AnalyticsService.trackReviewPosted(
        userId,
        body.fightId,
        body.reviewLength,
        body.sessionId,
        body.platform
      )

      return reply.code(200).send({ success: true })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        })
      }

      console.error('Review posting tracking error:', error)
      return reply.code(500).send({
        error: 'Failed to track review posting',
        code: 'ANALYTICS_ERROR',
      })
    }
  })

  /**
   * Track screen view (convenience endpoint)
   * POST /api/analytics/screen-view
   */
  fastify.post('/screen-view', {
    preHandler: [fastify.authenticate], // Optional auth
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const body = z.object({
        screenName: z.string(),
        sessionId: z.string().optional(),
        platform: z.enum(['ios', 'android', 'web']).optional(),
      }).parse(request.body)

      const userId = (request as any).user?.id

      await AnalyticsService.trackScreenView(
        body.screenName,
        userId,
        body.sessionId,
        body.platform
      )

      return reply.code(200).send({ success: true })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        })
      }

      console.error('Screen view tracking error:', error)
      return reply.code(500).send({
        error: 'Failed to track screen view',
        code: 'ANALYTICS_ERROR',
      })
    }
  })

  // ============== ANALYTICS DASHBOARD ENDPOINTS ==============
  // These require admin authentication in production

  /**
   * Get basic analytics dashboard data
   * GET /api/analytics/dashboard
   */
  fastify.get('/dashboard', {
    preHandler: [fastify.authenticate],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const query = analyticsQuerySchema.parse(request.query)

      // TODO: Add admin role check in production
      // if (!request.user.isAdmin) {
      //   return reply.code(403).send({ error: 'Admin access required' })
      // }

      const startDate = new Date(query.startDate)
      const endDate = new Date(query.endDate + 'T23:59:59.999Z')

      const [dailyActiveUsers, eventCounts] = await Promise.all([
        AnalyticsService.getDailyActiveUsers(startDate, endDate),
        AnalyticsService.getEventCounts(startDate, endDate),
      ])

      return reply.code(200).send({
        dateRange: {
          startDate: query.startDate,
          endDate: query.endDate,
        },
        dailyActiveUsers,
        eventCounts: eventCounts.slice(0, 20), // Top 20 events
      })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        })
      }

      console.error('Dashboard analytics error:', error)
      return reply.code(500).send({
        error: 'Failed to fetch analytics data',
        code: 'ANALYTICS_ERROR',
      })
    }
  })

  /**
   * Get user retention data
   * GET /api/analytics/retention
   */
  fastify.get('/retention', {
    preHandler: [fastify.authenticate],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const query = z.object({
        cohortDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }).parse(request.query)

      // TODO: Add admin role check in production

      const cohortDate = new Date(query.cohortDate)
      const retentionData = await AnalyticsService.getUserRetention(cohortDate)

      return reply.code(200).send({
        cohortDate: query.cohortDate,
        retention: retentionData,
      })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        })
      }

      console.error('Retention analytics error:', error)
      return reply.code(500).send({
        error: 'Failed to fetch retention data',
        code: 'ANALYTICS_ERROR',
      })
    }
  })
}