// packages/backend/src/routes/analytics.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
// import { AnalyticsService } from '../services/analytics' // TEMPORARILY DISABLED
import { z } from 'zod'

// ============== VALIDATION SCHEMAS ==============

const trackEventSchema = z.object({
  eventType: z.string().min(1),
  properties: z.record(z.any()).optional(),
  sessionId: z.string().optional(),
})

const batchTrackSchema = z.object({
  events: z.array(trackEventSchema).max(100), // Limit batch size
})

const sessionStartSchema = z.object({
  deviceId: z.string().min(1),
  platform: z.string().min(1),
  appVersion: z.string().min(1),
  userAgent: z.string().optional(),
})

const sessionEndSchema = z.object({
  sessionId: z.string().min(1),
})

const analyticsQuerySchema = z.object({
  startDate: z.string().regex(new RegExp('^\\d{4}-\\d{2}-\\d{2}$')),
  endDate: z.string().regex(new RegExp('^\\d{4}-\\d{2}-\\d{2}$')),
})

// ============== ROUTE HANDLERS ==============

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string
    email: string
    displayName?: string
    isEmailVerified: boolean
  }
}

export default async function analyticsRoutes(fastify: FastifyInstance) {
  // TEMPORARILY DISABLED - Analytics service has TypeScript compilation errors
  // Remove this return statement to re-enable analytics routes
  return;

  // Analytics routes would go here when re-enabled
}