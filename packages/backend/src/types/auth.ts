// packages/backend/src/types/auth.ts

export interface JWTPayload {
  userId: string
  email: string
  isEmailVerified: boolean
  tokenVersion?: number
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