// packages/backend/src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express'
import { Prisma } from '@prisma/client'

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', error)

  // Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return res.status(409).json({
          error: 'A record with this information already exists',
          code: 'DUPLICATE_RECORD'
        })
      case 'P2025':
        return res.status(404).json({
          error: 'Record not found',
          code: 'RECORD_NOT_FOUND'
        })
      default:
        return res.status(500).json({
          error: 'Database error',
          code: 'DATABASE_ERROR'
        })
    }
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
      code: 'TOKEN_INVALID'
    })
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired',
      code: 'TOKEN_EXPIRED'
    })
  }

  // Default error
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    code: 'INTERNAL_ERROR'
  })
}