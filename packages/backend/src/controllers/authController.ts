// packages/backend/src/controllers/authController.ts
import { Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { AuthRequest } from '../types/auth'
import { JWTService } from '../utils/jwt'
import { EmailService } from '../utils/email'

const prisma = new PrismaClient()

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
    //   await EmailService.sendVerificationEmail(email, verificationToken, firstName)

      // Generate tokens (user can use app but with limited features until verified)
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        isEmailVerified: false
      }

      const tokens = JWTService.generateTokenPair(tokenPayload)

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
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

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
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

      // Replace old refresh token with new one
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          token: tokens.refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
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
          lastLoginAt: true
        }
      })

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        })
      }

      res.json({ user })

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
}