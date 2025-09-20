// packages/backend/src/app.ts
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import corsMiddleware from './middleware/cors'
import { errorHandler } from './middleware/errorHandler'
import authRoutes from './routes/auth'

const app = express()

// Security middleware
app.use(helmet())
app.use(corsMiddleware)

// Logging
app.use(morgan('combined'))

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  })
})

// API routes
app.use('/api/auth', authRoutes)

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND'
  })
})

// Error handling
app.use(errorHandler)

export default app