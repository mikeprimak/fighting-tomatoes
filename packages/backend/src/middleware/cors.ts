// packages/backend/src/middleware/cors.ts
import cors from 'cors'

const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true)
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8081', // Expo default
      'exp://localhost:19000', // Expo development
      'https://goodfights.app', // Landing pages for email verification/password reset
      process.env.FRONTEND_URL,
      process.env.MOBILE_APP_URL
    ].filter(Boolean)

    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}

export default cors(corsOptions)