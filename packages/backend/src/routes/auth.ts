// packages/backend/src/routes/auth.ts
import { Router } from 'express'
import { AuthController } from '../controllers/authController'
import { authenticateToken, requireEmailVerification } from '../middleware/auth'
import { rateLimit } from 'express-rate-limit'

const router = Router()

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many authentication attempts, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
})

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: {
    error: 'Too many requests, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// Public routes
router.post('/register', authLimiter, AuthController.register)
router.post('/login', authLimiter, AuthController.login)
router.get('/verify-email', generalLimiter, AuthController.verifyEmail)
router.post('/request-password-reset', authLimiter, AuthController.requestPasswordReset)
router.post('/reset-password', authLimiter, AuthController.resetPassword)
router.post('/refresh-token', generalLimiter, AuthController.refreshToken)

// Protected routes
router.get('/profile', authenticateToken, AuthController.getProfile)
router.put('/profile', authenticateToken, generalLimiter, AuthController.updateProfile)
router.post('/logout', authenticateToken, AuthController.logout)

// Email verification required routes (examples for later)
router.get('/protected-example', authenticateToken, requireEmailVerification, (req, res) => {
  res.json({ message: 'This endpoint requires email verification' })
})

export default router