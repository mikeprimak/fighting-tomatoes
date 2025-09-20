// packages/backend/src/server.ts
import app from './app'
import { PrismaClient } from '@prisma/client'

const PORT = process.env.PORT || 3001
const prisma = new PrismaClient()

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect()
    console.log('Database connected successfully')

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
      console.log(`API available at: http://localhost:${PORT}`)
      console.log('Available endpoints:')
      console.log('  POST /api/auth/register')
      console.log('  POST /api/auth/login')
      console.log('  GET  /api/auth/verify-email')
      console.log('  POST /api/auth/refresh-token')
      console.log('  GET  /api/auth/profile')
      console.log('  POST /api/auth/logout')
    })

  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...')
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('Shutting down server...')
  await prisma.$disconnect()
  process.exit(0)
})

startServer()