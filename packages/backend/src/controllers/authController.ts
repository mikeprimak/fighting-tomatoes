// packages/backend/src/controllers/authController.ts
import { Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { AuthRequest } from '../types/auth'
import { JWTService } from '../utils/jwt'
import { EmailService } from '../utils/email'
import { OAuth2Client } from 'google-auth-library'

const prisma = new PrismaClient()

// Google OAuth client - initialized lazily
let googleClient: OAuth2Client | null = null
const getGoogleClient = () => {
  if (!googleClient) {
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  }
  return googleClient
}

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().min(3, 'Display name must be at least 3 characters').optional()
})

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
})

const updateProfileSchema = z.object({
  displayName: z.string().min(3, 'Display name must be at least 3 characters').optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  avatar: z.string().optional()
})

const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required')
})

export class AuthController {
  static async register(req: AuthRequest, res: Response) {
    try {
      const validatedData = registerSchema.parse(req.body)
      const { email, password, firstName, lastName, displayName } = validatedData

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      })

      if (existingUser) {
        return res.status(409).json({
          error: 'User already exists with this email',
          code: 'USER_EXISTS'
        })
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12)
      
      // Generate email verification token
      const verificationToken = EmailService.generateVerificationToken()
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

      // Create user
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          firstName,
          lastName,
          displayName: displayName || `${firstName || 'User'}${Math.floor(Math.random() * 1000)}`,
          emailVerificationToken: verificationToken,
          emailVerificationExpires: verificationExpires
        }
      })

      // Send verification email
      try {
        await EmailService.sendVerificationEmail(email, verificationToken, firstName)
        console.log(`[Email] Verification email sent to ${email}`)
      } catch (emailError) {
        console.error('[Email] Failed to send verification email:', emailError)
        // Don't fail registration if email fails - user can request resend
      }

      // Generate tokens (user can use app but with limited features until verified)
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        isEmailVerified: false
      }

      const tokens = JWTService.generateTokenPair(tokenPayload)

      // Store refresh token (90 days to match JWT expiry)
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        }
      })

      res.status(201).json({
        message: 'Registration successful. Please check your email to verify your account.',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
          isEmailVerified: user.isEmailVerified
        },
        tokens
      })

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        })
      }

      console.error('Registration error:', error)
      res.status(500).json({
        error: 'Internal server error',
        code: 'REGISTRATION_FAILED'
      })
    }
  }

  static async login(req: AuthRequest, res: Response) {
    try {
      const validatedData = loginSchema.parse(req.body)
      const { email, password } = validatedData

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      })

      if (!user || !user.password) {
        return res.status(401).json({
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS'
        })
      }

      // Check if account is active
      if (!user.isActive) {
        return res.status(403).json({
          error: 'Account is disabled',
          code: 'ACCOUNT_DISABLED'
        })
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password)
      
      if (!isValidPassword) {
        return res.status(401).json({
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS'
        })
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      })

      // Generate tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        isEmailVerified: user.isEmailVerified
      }

      const tokens = JWTService.generateTokenPair(tokenPayload)

      // Store refresh token (90 days to match JWT expiry)
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        }
      })

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
          isEmailVerified: user.isEmailVerified,
          isMedia: user.isMedia,
          points: user.points,
          level: user.level
        },
        tokens
      })

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        })
      }

      console.error('Login error:', error)
      res.status(500).json({
        error: 'Internal server error',
        code: 'LOGIN_FAILED'
      })
    }
  }

  static async googleAuth(req: AuthRequest, res: Response) {
    try {
      const validatedData = googleAuthSchema.parse(req.body)
      const { idToken } = validatedData

      // Verify the Google ID token
      const client = getGoogleClient()
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      })

      const payload = ticket.getPayload()
      if (!payload || !payload.email) {
        return res.status(400).json({
          error: 'Invalid Google token',
          code: 'INVALID_TOKEN'
        })
      }

      const { email, given_name, family_name, picture, sub: googleId } = payload

      // Check if user exists by email
      let user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      })

      if (user) {
        // User exists - check if they signed up with a different provider
        if (user.authProvider !== 'GOOGLE' && user.authProvider !== 'EMAIL') {
          return res.status(409).json({
            error: 'An account with this email already exists with a different sign-in method.',
            code: 'ACCOUNT_EXISTS_DIFFERENT_PROVIDER'
          })
        }

        // If user exists with EMAIL provider, update to GOOGLE (account linking)
        if (user.authProvider === 'EMAIL' && !user.googleId) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              googleId,
              authProvider: 'GOOGLE',
              isEmailVerified: true, // Google accounts are pre-verified
              avatar: user.avatar || picture, // Only update avatar if not already set
              lastLoginAt: new Date()
            }
          })
          console.log(`[Google Auth] Linked Google account to existing email user: ${email}`)
        } else {
          // Update last login
          user = await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
          })
        }
      } else {
        // Create new user with Google
        const displayName = `${given_name || 'User'}${Math.floor(Math.random() * 10000)}`

        user = await prisma.user.create({
          data: {
            email: email.toLowerCase(),
            googleId,
            authProvider: 'GOOGLE',
            firstName: given_name || null,
            lastName: family_name || null,
            displayName,
            avatar: picture || null,
            isEmailVerified: true, // Google accounts are pre-verified
          }
        })
        console.log(`[Google Auth] Created new user via Google: ${email}`)
      }

      // Check if account is active
      if (!user.isActive) {
        return res.status(403).json({
          error: 'Account is disabled',
          code: 'ACCOUNT_DISABLED'
        })
      }

      // Generate tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        isEmailVerified: user.isEmailVerified
      }

      const tokens = JWTService.generateTokenPair(tokenPayload)

      // Store refresh token (90 days to match JWT expiry)
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        }
      })

      res.json({
        message: 'Google authentication successful',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified,
          isMedia: user.isMedia,
          points: user.points,
          level: user.level
        },
        tokens
      })

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        })
      }

      console.error('Google auth error:', error)
      res.status(500).json({
        error: 'Google authentication failed',
        code: 'GOOGLE_AUTH_FAILED'
      })
    }
  }

  static async verifyEmail(req: AuthRequest, res: Response) {
    try {
      const { token } = req.query

      if (!token || typeof token !== 'string') {
        return res.status(400).json({
          error: 'Verification token is required',
          code: 'TOKEN_MISSING'
        })
      }

      // Find user with valid token
      const user = await prisma.user.findFirst({
        where: {
          emailVerificationToken: token,
          emailVerificationExpires: {
            gt: new Date()
          }
        }
      })

      if (!user) {
        return res.status(400).json({
          error: 'Invalid or expired verification token',
          code: 'TOKEN_INVALID'
        })
      }

      // Update user as verified
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isEmailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null
        }
      })

      res.json({
        message: 'Email verified successfully! You can now access all features.'
      })

    } catch (error) {
      console.error('Email verification error:', error)
      res.status(500).json({
        error: 'Internal server error',
        code: 'VERIFICATION_FAILED'
      })
    }
  }

  static async refreshToken(req: AuthRequest, res: Response) {
    try {
      const { refreshToken } = req.body

      if (!refreshToken) {
        return res.status(401).json({
          error: 'Refresh token is required',
          code: 'TOKEN_MISSING'
        })
      }

      // Verify refresh token
      const payload = JWTService.verifyRefreshToken(refreshToken)
      
      if (!payload) {
        return res.status(401).json({
          error: 'Invalid refresh token',
          code: 'TOKEN_INVALID'
        })
      }

      // Check if token exists in database
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true }
      })

      if (!storedToken || storedToken.expiresAt < new Date()) {
        return res.status(401).json({
          error: 'Refresh token expired or not found',
          code: 'TOKEN_EXPIRED'
        })
      }

      // Generate new token pair
      const newTokenPayload = {
        userId: storedToken.user.id,
        email: storedToken.user.email,
        isEmailVerified: storedToken.user.isEmailVerified
      }

      const tokens = JWTService.generateTokenPair(newTokenPayload)

      // Replace old refresh token with new one (extend to 90 days - sliding expiration)
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          token: tokens.refreshToken,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        }
      })

      res.json({
        message: 'Token refreshed successfully',
        tokens
      })

    } catch (error) {
      console.error('Token refresh error:', error)
      res.status(500).json({
        error: 'Internal server error',
        code: 'REFRESH_FAILED'
      })
    }
  }

  static async logout(req: AuthRequest, res: Response) {
    try {
      const { refreshToken } = req.body

      if (refreshToken) {
        // Remove refresh token from database
        await prisma.refreshToken.deleteMany({
          where: { token: refreshToken }
        })
      }

      res.json({
        message: 'Logout successful'
      })

    } catch (error) {
      console.error('Logout error:', error)
      res.status(500).json({
        error: 'Internal server error',
        code: 'LOGOUT_FAILED'
      })
    }
  }

  static async requestPasswordReset(req: AuthRequest, res: Response) {
    try {
      const { email } = req.body

      if (!email) {
        return res.status(400).json({
          error: 'Email is required',
          code: 'EMAIL_MISSING'
        })
      }

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      })

      // Always return success to prevent email enumeration
      res.json({
        message: 'If an account with that email exists, a password reset link has been sent.'
      })

      if (user) {
        const resetToken = EmailService.generateVerificationToken()
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

        await prisma.user.update({
          where: { id: user.id },
          data: {
            passwordResetToken: resetToken,
            passwordResetExpires: resetExpires
          }
        })

        await EmailService.sendPasswordResetEmail(email, resetToken)
      }

    } catch (error) {
      console.error('Password reset request error:', error)
      res.status(500).json({
        error: 'Internal server error',
        code: 'RESET_REQUEST_FAILED'
      })
    }
  }

  static async resetPassword(req: AuthRequest, res: Response) {
    try {
      const { token, password } = req.body

      if (!token || !password) {
        return res.status(400).json({
          error: 'Token and password are required',
          code: 'MISSING_DATA'
        })
      }

      // Validate password strength
      const passwordValidation = registerSchema.shape.password.safeParse(password)
      if (!passwordValidation.success) {
        return res.status(400).json({
          error: 'Password does not meet requirements',
          details: passwordValidation.error.errors
        })
      }

      // Find user with valid reset token
      const user = await prisma.user.findFirst({
        where: {
          passwordResetToken: token,
          passwordResetExpires: {
            gt: new Date()
          }
        }
      })

      if (!user) {
        return res.status(400).json({
          error: 'Invalid or expired reset token',
          code: 'TOKEN_INVALID'
        })
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 12)

      // Update password and clear reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null
        }
      })

      // Invalidate all existing refresh tokens for security
      await prisma.refreshToken.deleteMany({
        where: { userId: user.id }
      })

      res.json({
        message: 'Password reset successful. Please log in with your new password.'
      })

    } catch (error) {
      console.error('Password reset error:', error)
      res.status(500).json({
        error: 'Internal server error',
        code: 'RESET_FAILED'
      })
    }
  }

  static async resendVerificationEmail(req: AuthRequest, res: Response) {
    try {
      const { email } = req.body

      if (!email) {
        return res.status(400).json({
          error: 'Email is required',
          code: 'EMAIL_MISSING'
        })
      }

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      })

      // Always return success to prevent email enumeration
      res.json({
        message: 'If an account with that email exists and is not yet verified, a new verification email has been sent.'
      })

      if (user && !user.isEmailVerified) {
        // Generate new verification token
        const verificationToken = EmailService.generateVerificationToken()
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

        await prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerificationToken: verificationToken,
            emailVerificationExpires: verificationExpires
          }
        })

        try {
          await EmailService.sendVerificationEmail(email, verificationToken, user.firstName || undefined)
          console.log(`[Email] Resent verification email to ${email}`)
        } catch (emailError) {
          console.error('[Email] Failed to resend verification email:', emailError)
        }
      }

    } catch (error) {
      console.error('Resend verification error:', error)
      res.status(500).json({
        error: 'Internal server error',
        code: 'RESEND_FAILED'
      })
    }
  }

  static async getProfile(req: AuthRequest, res: Response) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          isEmailVerified: true,
          isMedia: true,
          mediaOrganization: true,
          mediaWebsite: true,
          points: true,
          level: true,
          totalRatings: true,
          totalReviews: true,
          upvotesReceived: true,
          downvotesReceived: true,
          accuracyScore: true,
          createdAt: true,
          lastLoginAt: true,
          ratings: {
            select: {
              rating: true
            }
          }
        }
      })

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        })
      }

      // Calculate average rating
      const averageRating = user.ratings.length > 0
        ? user.ratings.reduce((sum, r) => sum + r.rating, 0) / user.ratings.length
        : 0

      // Return user without ratings array, but with averageRating
      const { ratings, ...userWithoutRatings } = user
      res.json({
        user: {
          ...userWithoutRatings,
          averageRating: Number(averageRating.toFixed(1))
        }
      })

    } catch (error) {
      console.error('Get profile error:', error)
      res.status(500).json({
        error: 'Internal server error',
        code: 'PROFILE_FETCH_FAILED'
      })
    }
  }

  static async updateProfile(req: AuthRequest, res: Response) {
    try {
      const validatedData = updateProfileSchema.parse(req.body)
      const { displayName, firstName, lastName, avatar } = validatedData

      // Check if displayName is already taken by another user
      if (displayName) {
        const existingUser = await prisma.user.findFirst({
          where: {
            displayName: displayName,
            id: { not: req.user!.userId }
          }
        })

        if (existingUser) {
          return res.status(409).json({
            error: 'Display name is already taken',
            code: 'DISPLAY_NAME_TAKEN'
          })
        }
      }

      // Update user profile
      const updatedUser = await prisma.user.update({
        where: { id: req.user!.userId },
        data: {
          ...(displayName !== undefined && { displayName }),
          ...(firstName !== undefined && { firstName }),
          ...(lastName !== undefined && { lastName }),
          ...(avatar !== undefined && { avatar })
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          isEmailVerified: true,
          isMedia: true,
          mediaOrganization: true,
          mediaWebsite: true,
          points: true,
          level: true,
          totalRatings: true,
          totalReviews: true,
          upvotesReceived: true,
          downvotesReceived: true,
          accuracyScore: true,
          createdAt: true,
          lastLoginAt: true
        }
      })

      res.json({
        message: 'Profile updated successfully',
        user: updatedUser
      })

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        })
      }

      console.error('Update profile error:', error)
      res.status(500).json({
        error: 'Internal server error',
        code: 'PROFILE_UPDATE_FAILED'
      })
    }
  }


  /**
   * Delete user account - anonymizes user data but keeps their ratings, reviews, etc.
   * This satisfies Apple/Google requirements for account deletion while preserving content.
   */
  static async deleteAccount(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId
      const { confirmation } = req.body

      // Require user to confirm by typing "DELETE"
      if (confirmation !== 'DELETE') {
        return res.status(400).json({
          error: 'Please type DELETE to confirm account deletion',
          code: 'CONFIRMATION_REQUIRED'
        })
      }

      // Generate a random anonymous email to satisfy unique constraint
      const anonymousEmail = `deleted_${Date.now()}_${Math.random().toString(36).substring(7)}@deleted.local`

      // Anonymize user data (keep the record for content attribution)
      await prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymousEmail,
          password: null,
          firstName: null,
          lastName: null,
          displayName: 'Deleted User',
          avatar: null,
          googleId: null,
          appleId: null,
          emailVerificationToken: null,
          emailVerificationExpires: null,
          passwordResetToken: null,
          passwordResetExpires: null,
          pushToken: null,
          isActive: false,
          isEmailVerified: false,
          wantsEmails: false,
          isMedia: false,
          mediaOrganization: null,
          mediaWebsite: null,
        }
      })

      // Delete all refresh tokens (log out all sessions)
      await prisma.refreshToken.deleteMany({
        where: { userId }
      })

      // Delete notification rules and matches (user-specific settings)
      await prisma.fightNotificationMatch.deleteMany({
        where: { userId }
      })
      await prisma.userNotificationRule.deleteMany({
        where: { userId }
      })

      // Delete user notifications
      await prisma.userNotification.deleteMany({
        where: { userId }
      })

      // Note: We intentionally keep:
      // - FightRating (user's ratings)
      // - FightReview (user's reviews)
      // - PreFightComment (user's comments)
      // - FightPrediction (user's predictions)
      // - FightTag (user's tags)
      // - ReviewVote, PreFightCommentVote (user's votes)
      // These are anonymized by the user becoming "Deleted User"

      console.log(`[Auth] Account deleted and anonymized for user ${userId}`)

      res.json({
        message: 'Account deleted successfully. Your ratings and reviews have been anonymized.'
      })

    } catch (error) {
      console.error('Delete account error:', error)
      res.status(500).json({
        error: 'Failed to delete account',
        code: 'DELETE_FAILED'
      })
    }
  }

  /**
   * Get user's prediction accuracy grouped by event (last 3 months)
   * Returns correct/incorrect prediction counts per event for diverging bar chart
   */
  static async getPredictionAccuracyByEvent(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId

      // Get events from last 3 months that have completed fights
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

      // Get all predictions for this user where the fight has a result (winner is set)
      // and the event was in the last 3 months
      const predictions = await prisma.fightPrediction.findMany({
        where: {
          userId,
          predictedWinner: { not: null },
          fight: {
            winner: { not: null }, // Fight has a result
            event: {
              date: { gte: threeMonthsAgo }
            }
          }
        },
        include: {
          fight: {
            select: {
              id: true,
              winner: true,
              event: {
                select: {
                  id: true,
                  name: true,
                  date: true,
                  promotion: true
                }
              }
            }
          }
        },
        orderBy: {
          fight: {
            event: {
              date: 'asc'
            }
          }
        }
      })

      // Group predictions by event
      const eventMap = new Map<string, {
        eventId: string,
        eventName: string,
        eventDate: Date,
        promotion: string | null,
        correct: number,
        incorrect: number
      }>()

      for (const prediction of predictions) {
        const event = prediction.fight.event
        const isCorrect = prediction.predictedWinner === prediction.fight.winner

        if (!eventMap.has(event.id)) {
          eventMap.set(event.id, {
            eventId: event.id,
            eventName: event.name,
            eventDate: event.date,
            promotion: event.promotion,
            correct: 0,
            incorrect: 0
          })
        }

        const eventStats = eventMap.get(event.id)!
        if (isCorrect) {
          eventStats.correct++
        } else {
          eventStats.incorrect++
        }
      }

      // Convert to array and sort by date
      const accuracyByEvent = Array.from(eventMap.values())
        .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())

      res.json({
        accuracyByEvent,
        totalEvents: accuracyByEvent.length,
        totalPredictions: predictions.length,
        totalCorrect: accuracyByEvent.reduce((sum, e) => sum + e.correct, 0),
        totalIncorrect: accuracyByEvent.reduce((sum, e) => sum + e.incorrect, 0)
      })

    } catch (error) {
      console.error('Get prediction accuracy error:', error)
      res.status(500).json({
        error: 'Internal server error',
        code: 'PREDICTION_ACCURACY_FETCH_FAILED'
      })
    }
  }
}