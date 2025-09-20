// packages/backend/src/types/auth.ts
import { Request } from 'express'

export interface JWTPayload {
  userId: string
  email: string
  isEmailVerified: boolean
  tokenVersion?: number
}

// Extend Express Request type instead of creating conflicting interface
export interface AuthRequest extends Request {
  user?: JWTPayload
}

export interface RegisterRequest {
  email: string
  password: string
  firstName?: string
  lastName?: string
  displayName?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RefreshTokenRequest {
  refreshToken: string
}