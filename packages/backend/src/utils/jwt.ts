// packages/backend/src/utils/jwt.ts
import jwt from 'jsonwebtoken'
import { JWTPayload } from '../types/auth'

const JWT_SECRET = process.env.JWT_SECRET!
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!

// Token expiry configuration
// Access token: Short-lived for security (15 minutes)
// Refresh token: Long-lived for "stay logged in" experience (90 days)
// Refresh tokens are renewed on each use (sliding expiration)
export const ACCESS_TOKEN_EXPIRES = '15m'
export const REFRESH_TOKEN_EXPIRES = '90d'

export class JWTService {
  static generateAccessToken(payload: JWTPayload): string {
    return jwt.sign(payload, JWT_SECRET, { 
      expiresIn: ACCESS_TOKEN_EXPIRES,
      issuer: 'fightcrewapp'
    })
  }

  static generateRefreshToken(payload: JWTPayload): string {
    return jwt.sign(payload, JWT_REFRESH_SECRET, { 
      expiresIn: REFRESH_TOKEN_EXPIRES,
      issuer: 'fightcrewapp'
    })
  }

  static verifyAccessToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as JWTPayload
    } catch (error) {
      return null
    }
  }

  static verifyRefreshToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, JWT_REFRESH_SECRET) as JWTPayload
    } catch (error) {
      return null
    }
  }

  static generateTokenPair(payload: JWTPayload) {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload)
    }
  }
}
