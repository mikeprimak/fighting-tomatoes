// packages/backend/src/services/analytics.ts
import { PrismaClient } from '@prisma/client'
import { EventType } from '@prisma/client'

const prisma = new PrismaClient()

export interface AnalyticsEventData {
  eventName: string
  eventType: EventType
  userId?: string
  sessionId?: string
  properties?: Record<string, any>
  userAgent?: string
  platform?: 'ios' | 'android' | 'web'
  appVersion?: string
  ipAddress?: string
}

export interface SessionData {
  sessionId: string
  userId?: string
  platform?: string
  appVersion?: string
  deviceId?: string
}

export class AnalyticsService {
  // ============== EVENT TRACKING ==============

  /**
   * Track a single analytics event
   */
  static async trackEvent(eventData: AnalyticsEventData): Promise<void> {
    try {
      await prisma.analyticsEvent.create({
        data: {
          eventName: eventData.eventName,
          eventType: eventData.eventType,
          userId: eventData.userId,
          sessionId: eventData.sessionId,
          properties: eventData.properties ? JSON.stringify(eventData.properties) : null,
          userAgent: eventData.userAgent,
          platform: eventData.platform,
          appVersion: eventData.appVersion,
          ipAddress: eventData.ipAddress,
        },
      })

      // Update session event count if sessionId provided
      if (eventData.sessionId) {
        await this.incrementSessionEventCount(eventData.sessionId)
      }
    } catch (error) {
      console.error('Failed to track analytics event:', error)
      // Don't throw - analytics shouldn't break the app
    }
  }

  /**
   * Track multiple events in batch for performance
   */
  static async trackEventsBatch(events: AnalyticsEventData[]): Promise<void> {
    try {
      const eventData = events.map(event => ({
        eventName: event.eventName,
        eventType: event.eventType,
        userId: event.userId,
        sessionId: event.sessionId,
        properties: event.properties ? JSON.stringify(event.properties) : null,
        userAgent: event.userAgent,
        platform: event.platform,
        appVersion: event.appVersion,
        ipAddress: event.ipAddress,
      }))

      await prisma.analyticsEvent.createMany({
        data: eventData,
        skipDuplicates: true,
      })
    } catch (error) {
      console.error('Failed to track analytics events batch:', error)
    }
  }

  // ============== SESSION MANAGEMENT ==============

  /**
   * Start a new user session
   */
  static async startSession(sessionData: SessionData): Promise<void> {
    try {
      await prisma.userSession.create({
        data: {
          sessionId: sessionData.sessionId,
          userId: sessionData.userId,
          platform: sessionData.platform,
          appVersion: sessionData.appVersion,
          deviceId: sessionData.deviceId,
        },
      })

      // Track session start event
      await this.trackEvent({
        eventName: 'session_started',
        eventType: 'AUTH_SESSION',
        userId: sessionData.userId,
        sessionId: sessionData.sessionId,
        platform: sessionData.platform,
        properties: {
          platform: sessionData.platform,
          appVersion: sessionData.appVersion,
        },
      })
    } catch (error) {
      console.error('Failed to start session:', error)
    }
  }

  /**
   * End a user session
   */
  static async endSession(sessionId: string): Promise<void> {
    try {
      const session = await prisma.userSession.findUnique({
        where: { sessionId },
      })

      if (session && !session.endedAt) {
        const durationSeconds = Math.floor(
          (new Date().getTime() - session.startedAt.getTime()) / 1000
        )

        await prisma.userSession.update({
          where: { sessionId },
          data: {
            endedAt: new Date(),
            durationSeconds,
          },
        })

        // Track session end event
        await this.trackEvent({
          eventName: 'session_ended',
          eventType: 'AUTH_SESSION',
          userId: session.userId,
          sessionId,
          properties: {
            durationSeconds,
            screenViews: session.screenViewCount,
            eventCount: session.eventCount,
          },
        })
      }
    } catch (error) {
      console.error('Failed to end session:', error)
    }
  }

  /**
   * Update session metrics
   */
  static async updateSession(
    sessionId: string,
    updates: {
      screenViewCount?: number
      ratingsGiven?: number
      reviewsPosted?: number
      lastScreenName?: string
      wasConverted?: boolean
    }
  ): Promise<void> {
    try {
      await prisma.userSession.update({
        where: { sessionId },
        data: updates,
      })
    } catch (error) {
      console.error('Failed to update session:', error)
    }
  }

  private static async incrementSessionEventCount(sessionId: string): Promise<void> {
    try {
      await prisma.userSession.update({
        where: { sessionId },
        data: {
          eventCount: {
            increment: 1,
          },
        },
      })
    } catch (error) {
      console.error('Failed to increment session event count:', error)
    }
  }

  // ============== HELPER METHODS FOR COMMON EVENTS ==============

  /**
   * Track user registration
   */
  static async trackUserRegistration(userId: string, sessionId?: string, platform?: string): Promise<void> {
    await this.trackEvent({
      eventName: 'user_registered',
      eventType: 'USER_LIFECYCLE',
      userId,
      sessionId,
      platform: platform as any,
      properties: {
        registrationMethod: 'email', // Could be extended for OAuth
      },
    })
  }

  /**
   * Track user login
   */
  static async trackUserLogin(userId: string, sessionId?: string, platform?: string): Promise<void> {
    await this.trackEvent({
      eventName: 'user_logged_in',
      eventType: 'AUTH_SESSION',
      userId,
      sessionId,
      platform: platform as any,
    })
  }

  /**
   * Track fight rating
   */
  static async trackFightRating(
    userId: string,
    fightId: string,
    rating: number,
    sessionId?: string,
    platform?: string
  ): Promise<void> {
    await this.trackEvent({
      eventName: 'fight_rated',
      eventType: 'USER_ACTION',
      userId,
      sessionId,
      platform: platform as any,
      properties: {
        fightId,
        rating,
        isFirstRating: false, // This would need to be calculated
      },
    })

    // Update session metrics
    if (sessionId) {
      const session = await prisma.userSession.findUnique({ where: { sessionId } })
      if (session) {
        await this.updateSession(sessionId, {
          ratingsGiven: session.ratingsGiven + 1,
          wasConverted: true,
        })
      }
    }
  }

  /**
   * Track review posting
   */
  static async trackReviewPosted(
    userId: string,
    fightId: string,
    reviewLength: number,
    sessionId?: string,
    platform?: string
  ): Promise<void> {
    await this.trackEvent({
      eventName: 'review_posted',
      eventType: 'USER_ACTION',
      userId,
      sessionId,
      platform: platform as any,
      properties: {
        fightId,
        reviewLength,
        hasRating: true, // Reviews include ratings in your app
      },
    })

    // Update session metrics
    if (sessionId) {
      const session = await prisma.userSession.findUnique({ where: { sessionId } })
      if (session) {
        await this.updateSession(sessionId, {
          reviewsPosted: session.reviewsPosted + 1,
          wasConverted: true,
        })
      }
    }
  }

  /**
   * Track screen view
   */
  static async trackScreenView(
    screenName: string,
    userId?: string,
    sessionId?: string,
    platform?: string
  ): Promise<void> {
    await this.trackEvent({
      eventName: 'screen_viewed',
      eventType: 'NAVIGATION',
      userId,
      sessionId,
      platform: platform as any,
      properties: {
        screenName,
      },
    })

    // Update session screen count and last screen
    if (sessionId) {
      const session = await prisma.userSession.findUnique({ where: { sessionId } })
      if (session) {
        await this.updateSession(sessionId, {
          screenViewCount: session.screenViewCount + 1,
          lastScreenName: screenName,
        })
      }
    }
  }

  // ============== ANALYTICS QUERIES ==============

  /**
   * Get daily active users for a date range
   */
  static async getDailyActiveUsers(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const result = await prisma.$queryRaw`
        SELECT
          DATE(created_at) as date,
          COUNT(DISTINCT user_id) as active_users
        FROM analytics_events
        WHERE created_at >= ${startDate}
          AND created_at <= ${endDate}
          AND user_id IS NOT NULL
        GROUP BY DATE(created_at)
        ORDER BY date
      `
      return result as any[]
    } catch (error) {
      console.error('Failed to get daily active users:', error)
      return []
    }
  }

  /**
   * Get event counts by type for a date range
   */
  static async getEventCounts(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      return await prisma.analyticsEvent.groupBy({
        by: ['eventName'],
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
      })
    } catch (error) {
      console.error('Failed to get event counts:', error)
      return []
    }
  }

  /**
   * Get user retention data
   */
  static async getUserRetention(registrationDate: Date): Promise<any> {
    try {
      // This is a complex query - simplified version
      const result = await prisma.$queryRaw`
        WITH user_cohort AS (
          SELECT user_id
          FROM analytics_events
          WHERE event_name = 'user_registered'
            AND DATE(created_at) = DATE(${registrationDate})
        ),
        user_returns AS (
          SELECT
            uc.user_id,
            CASE WHEN ae.user_id IS NOT NULL THEN 1 ELSE 0 END as returned
          FROM user_cohort uc
          LEFT JOIN analytics_events ae ON uc.user_id = ae.user_id
            AND ae.created_at >= ${new Date(registrationDate.getTime() + 24 * 60 * 60 * 1000)}
            AND ae.created_at < ${new Date(registrationDate.getTime() + 8 * 24 * 60 * 60 * 1000)}
        )
        SELECT
          COUNT(*) as total_users,
          SUM(returned) as returned_users,
          ROUND(SUM(returned) * 100.0 / COUNT(*), 2) as retention_rate
        FROM user_returns
      `
      return result
    } catch (error) {
      console.error('Failed to get user retention:', error)
      return { total_users: 0, returned_users: 0, retention_rate: 0 }
    }
  }
}