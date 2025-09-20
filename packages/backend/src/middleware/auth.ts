// packages/backend/src/middleware/auth.ts
import { Response, NextFunction } from 'express'
import { AuthRequest } from '../types/auth'
import { JWTService } from '../utils/jwt'

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'TOKEN_MISSING'
    })
  }

  const payload = JWTService.verifyAccessToken(token)
  
  if (!payload) {
    return res.status(401).json({ 
      error: 'Invalid or expired access token',
      code: 'TOKEN_INVALID'
    })
  }

  req.user = payload
  next()
}

export const requireEmailVerification = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.isEmailVerified) {
    return res.status(403).json({
      error: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED'
    })
  }
  next()
}

export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (token) {
    const payload = JWTService.verifyAccessToken(token)
    if (payload) {
      req.user = payload
    }
  }
  
  next()
}
