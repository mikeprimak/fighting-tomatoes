// packages/mobile/services/analytics.ts
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ⚙️ DEVELOPMENT CONFIG: Set to true to test production API while developing
const USE_PRODUCTION_API = false;

// Get API base URL
const getApiBaseUrl = () => {
  const isDevelopment = (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.NODE_ENV === 'development';

  // Allow forcing production API during development for testing
  if (USE_PRODUCTION_API || !isDevelopment) {
    return 'https://fightcrewapp-backend.onrender.com/api';
  }

  if (Platform.OS === 'web') {
    return 'http://localhost:3001/api';
  } else {
    return 'http://10.0.0.53:3001/api';
  }
};

const API_BASE_URL = getApiBaseUrl();

// ============== TYPES ==============

export type EventType =
  | 'USER_LIFECYCLE'
  | 'AUTH_SESSION'
  | 'CONTENT_INTERACTION'
  | 'USER_ACTION'
  | 'NAVIGATION'
  | 'ENGAGEMENT'
  | 'CONVERSION'
  | 'PERFORMANCE'

export interface AnalyticsEvent {
  eventName: string
  eventType: EventType
  properties?: Record<string, any>
  platform?: 'ios' | 'android' | 'web'
  appVersion?: string
}

export interface SessionData {
  sessionId: string
  platform?: string
  appVersion?: string
  deviceId?: string
}

// ============== ANALYTICS SERVICE ==============

class AnalyticsServiceClass {
  private isInitialized = false
  private sessionId: string | null = null
  private userId: string | null = null
  private eventQueue: AnalyticsEvent[] = []
  private batchTimer: ReturnType<typeof setTimeout> | null = null
  private readonly BATCH_SIZE = 10
  private readonly BATCH_TIMEOUT = 30000 // 30 seconds

  // ============== INITIALIZATION ==============

  /**
   * Initialize analytics service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Generate or retrieve device/session ID
      this.sessionId = await this.generateSessionId()

      // Get user ID if available
      this.userId = await this.getUserId()

      // Start session tracking
      await this.startSession()

      this.isInitialized = true
      console.log('Analytics service initialized')
    } catch (error) {
      // Silently handle analytics initialization errors
      // console.error('Failed to initialize analytics service:', error)
    }
  }

  /**
   * Set user ID when user logs in
   */
  async setUserId(userId: string): Promise<void> {
    this.userId = userId
    await AsyncStorage.setItem('@analytics_user_id', userId)
  }

  /**
   * Clear user ID when user logs out
   */
  async clearUserId(): Promise<void> {
    this.userId = null
    await AsyncStorage.removeItem('@analytics_user_id')
  }

  // ============== EVENT TRACKING ==============

  /**
   * Track a single event
   */
  async track(eventName: string, eventType: EventType, properties?: Record<string, any>): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const event: AnalyticsEvent = {
      eventName,
      eventType,
      properties: {
        ...properties,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
      },
      platform: Platform.OS as 'ios' | 'android',
      appVersion: '1.0.0', // You might want to get this from app.json
    }

    // Add to queue for batching
    this.eventQueue.push(event)

    // Send immediately for critical events, otherwise batch
    if (this.isCriticalEvent(eventName)) {
      await this.sendEvent(event)
    } else {
      this.scheduleBatchSend()
    }
  }

  /**
   * Track multiple events at once
   */
  async trackBatch(events: Array<{ eventName: string, eventType: EventType, properties?: Record<string, any> }>): Promise<void> {
    const analyticsEvents = events.map(event => ({
      ...event,
      properties: {
        ...event.properties,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
      },
      platform: Platform.OS as 'ios' | 'android',
      appVersion: '1.0.0',
    }))

    this.eventQueue.push(...analyticsEvents)
    this.scheduleBatchSend()
  }

  // ============== CONVENIENCE METHODS ==============

  /**
   * Track screen view
   */
  async trackScreenView(screenName: string, additionalProperties?: Record<string, any>): Promise<void> {
    await this.track('screen_viewed', 'NAVIGATION', {
      screenName,
      ...additionalProperties,
    })
  }

  /**
   * Track user registration
   */
  async trackUserRegistration(registrationMethod = 'email'): Promise<void> {
    await this.track('user_registered', 'USER_LIFECYCLE', {
      registrationMethod,
    })
  }

  /**
   * Track user login
   */
  async trackUserLogin(loginMethod = 'email'): Promise<void> {
    await this.track('user_logged_in', 'AUTH_SESSION', {
      loginMethod,
    })
  }

  /**
   * Track fight rating
   */
  async trackFightRating(fightId: string, rating: number, additionalData?: Record<string, any>): Promise<void> {
    await this.track('fight_rated', 'USER_ACTION', {
      fightId,
      rating,
      ...additionalData,
    })

    // Also use the convenience endpoint for server-side processing
    try {
      const authToken = await AsyncStorage.getItem('@auth_token')
      if (authToken) {
        await fetch(`${API_BASE_URL}/analytics/fight-rated`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fightId,
            rating,
            sessionId: this.sessionId,
            platform: Platform.OS,
          }),
        })
      }
    } catch (error) {
      console.error('Failed to track fight rating on server:', error)
    }
  }

  /**
   * Track review posting
   */
  async trackReviewPosted(fightId: string, reviewLength: number, additionalData?: Record<string, any>): Promise<void> {
    await this.track('review_posted', 'USER_ACTION', {
      fightId,
      reviewLength,
      ...additionalData,
    })

    // Also use the convenience endpoint
    try {
      const authToken = await AsyncStorage.getItem('@auth_token')
      if (authToken) {
        await fetch(`${API_BASE_URL}/analytics/review-posted`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fightId,
            reviewLength,
            sessionId: this.sessionId,
            platform: Platform.OS,
          }),
        })
      }
    } catch (error) {
      console.error('Failed to track review posting on server:', error)
    }
  }

  /**
   * Track app lifecycle events
   */
  async trackAppOpened(): Promise<void> {
    await this.track('app_opened', 'ENGAGEMENT')
  }

  async trackAppBackgrounded(): Promise<void> {
    await this.track('app_backgrounded', 'ENGAGEMENT')
  }

  /**
   * Track conversion events
   */
  async trackFirstRating(): Promise<void> {
    await this.track('first_rating', 'CONVERSION')
  }

  async trackFirstReview(): Promise<void> {
    await this.track('first_review', 'CONVERSION')
  }

  // ============== SESSION MANAGEMENT ==============

  private async startSession(): Promise<void> {
    if (!this.sessionId) return

    try {
      const sessionData: SessionData = {
        sessionId: this.sessionId,
        platform: Platform.OS,
        appVersion: '1.0.0',
        deviceId: await this.getDeviceId(),
      }

      const authToken = await AsyncStorage.getItem('@auth_token')
      const headers: any = {
        'Content-Type': 'application/json',
      }

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`
      }

      await fetch(`${API_BASE_URL}/analytics/session/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sessionData),
      })
    } catch (error) {
      // Silently handle analytics session start errors
      // console.error('Failed to start analytics session:', error)
    }
  }

  async endSession(): Promise<void> {
    if (!this.sessionId) return

    try {
      // Send any remaining events
      await this.flushEventQueue()

      // End session on server
      await fetch(`${API_BASE_URL}/analytics/session/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
        }),
      })

      // Reset session
      this.sessionId = null
    } catch (error) {
      console.error('Failed to end analytics session:', error)
    }
  }

  // ============== PRIVATE METHODS ==============

  private async generateSessionId(): Promise<string> {
    // Try to get existing session ID
    let sessionId = await AsyncStorage.getItem('@analytics_session_id')

    if (!sessionId) {
      // Generate new session ID
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      await AsyncStorage.setItem('@analytics_session_id', sessionId)
    }

    return sessionId
  }

  private async getUserId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('@analytics_user_id')
    } catch {
      return null
    }
  }

  private async getDeviceId(): Promise<string> {
    let deviceId = await AsyncStorage.getItem('@analytics_device_id')

    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      await AsyncStorage.setItem('@analytics_device_id', deviceId)
    }

    return deviceId
  }

  private isCriticalEvent(eventName: string): boolean {
    const criticalEvents = [
      'user_registered',
      'user_logged_in',
      'app_crashed',
      'error_occurred',
    ]
    return criticalEvents.includes(eventName)
  }

  private scheduleBatchSend(): void {
    // Clear existing timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
    }

    // Send immediately if batch is full
    if (this.eventQueue.length >= this.BATCH_SIZE) {
      this.flushEventQueue()
      return
    }

    // Otherwise, schedule batch send
    this.batchTimer = setTimeout(() => {
      this.flushEventQueue()
    }, this.BATCH_TIMEOUT)
  }

  private async sendEvent(event: AnalyticsEvent): Promise<void> {
    try {
      const authToken = await AsyncStorage.getItem('@auth_token')
      const headers: any = {
        'Content-Type': 'application/json',
      }

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`
      }

      await fetch(`${API_BASE_URL}/analytics/track`, {
        method: 'POST',
        headers,
        body: JSON.stringify(event),
      })
    } catch (error) {
      console.error('Failed to send analytics event:', error)
      // Don't throw - analytics shouldn't break the app
    }
  }

  private async flushEventQueue(): Promise<void> {
    if (this.eventQueue.length === 0) return

    try {
      const eventsToSend = [...this.eventQueue]
      this.eventQueue = [] // Clear queue

      const authToken = await AsyncStorage.getItem('@auth_token')
      const headers: any = {
        'Content-Type': 'application/json',
      }

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`
      }

      await fetch(`${API_BASE_URL}/analytics/track-batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ events: eventsToSend }),
      })
    } catch (error) {
      console.error('Failed to flush analytics event queue:', error)
    }

    // Clear batch timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
  }
}

// Export singleton instance
export const AnalyticsService = new AnalyticsServiceClass()

// ============== REACT HOOK ==============

import { useEffect, useRef } from 'react'

/**
 * React hook for tracking screen views automatically
 */
export function useScreenTracking(screenName: string, additionalProperties?: Record<string, any>) {
  const hasTracked = useRef(false)

  useEffect(() => {
    if (!hasTracked.current) {
      AnalyticsService.trackScreenView(screenName, additionalProperties)
      hasTracked.current = true
    }
  }, [screenName, additionalProperties])
}