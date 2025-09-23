# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fighting Tomatoes is a React Native + Node.js application for rating combat sports fights, designed as an enterprise-ready app for potential acquisition by organizations like UFC or ESPN.

## Development Commands

### Root Level Commands
- `pnpm dev` - Start all services in development mode (parallel)
- `pnpm build` - Build all packages
- `pnpm test` - Run tests across all packages
- `pnpm lint` - Run linting across all packages
- `pnpm lint:fix` - Fix lint issues across all packages
- `pnpm type-check` - Type check all packages
- `pnpm setup` - Full setup: install deps, migrate DB, seed data

### Database Commands
- `pnpm db:migrate` - Run Prisma migrations
- `pnpm db:seed` - Seed database with test data
- `pnpm db:studio` - Open Prisma Studio

### Docker Commands
- `pnpm docker:up` - Start PostgreSQL and Redis containers
- `pnpm docker:down` - Stop containers
- `pnpm docker:logs` - View container logs

### Backend-Specific Commands
```bash
cd packages/backend
pnpm dev          # Start backend in development mode
pnpm build        # Build TypeScript
pnpm start        # Start production server
pnpm test         # Run Jest tests
pnpm test:watch   # Run tests in watch mode
```

### Mobile-Specific Commands
```bash
cd packages/mobile
# Development
pnpm start        # Start Expo development server
pnpm dev          # Start with development client
pnpm android      # Run on Android device/emulator
pnpm ios          # Run on iOS device/simulator
pnpm web          # Run in web browser

# Building & Deployment
pnpm build:android    # Build Android app with EAS
pnpm build:ios        # Build iOS app with EAS
pnpm submit:android   # Submit to Google Play Store
pnpm submit:ios       # Submit to Apple App Store

# Maintenance
pnpm test         # Run Jest tests
pnpm clean        # Clean Expo and node_modules cache
```

## Architecture

### Monorepo Structure
- **packages/backend** - Fastify API server with TypeScript, Prisma ORM, PostgreSQL
- **packages/mobile** - React Native (Expo) app with Expo Router
- **packages/shared** - Shared TypeScript types and utilities

### Key Technologies
- **Package Manager**: pnpm with workspaces
- **Backend**: Node.js, Fastify, TypeScript, Prisma, PostgreSQL, JWT auth
- **Mobile**: React Native (Expo), Expo Router, React Query, Zustand
- **Database**: PostgreSQL with Docker, Redis for caching
- **Development**: ESLint, Prettier, Husky, TypeScript strict mode

### Database Architecture
- Single PostgreSQL database with 20+ interconnected tables
- UUID v4 primary keys via Prisma
- JWT dual-token authentication (15min access, 7-day refresh)
- Email verification with crypto-based tokens
- Comprehensive user ratings, reviews, and tagging system

### API Patterns
- RESTful endpoints with consistent `{ error, code, details? }` response format
- Centralized error handling with machine-readable codes
- Zod schemas for input validation
- Layered middleware (auth, validation, rate limiting, CORS)

### Mobile Architecture

#### Target Platforms
- **iOS**: Native iOS app with tablet support (Bundle ID: `com.fightingtomatoes.mobile`)
- **Android**: Native Android app with adaptive icon (Package: `com.fightingtomatoes.mobile`)
- **Web**: Metro bundler with static output for web deployment
- **Development**: Expo Development Build for faster development cycles

#### Navigation Structure
- **File-based routing** with Expo Router (v6.0.7)
- **Root Layout** (`app/_layout.tsx`): Provides global providers and stack navigation
- **Authentication Stack** (`app/(auth)/`): Login and registration screens
  - `/login` - User login with JWT authentication
  - `/register` - User registration with email verification
- **Tab Navigation** (`app/(tabs)/`): Main app navigation with 3 tabs
  - `/` (index) - Events tab with calendar icon
  - `/fights` - Fights tab with star icon for rating fights
  - `/profile` - User profile tab with user icon
- **404 Handling**: Custom not-found page (`app/+not-found.tsx`)

#### State Management
- **Authentication**: React Context (`store/AuthContext.tsx`) with JWT dual-token system
  - Access token storage with 15-minute expiration
  - Refresh token with 7-day rotation
  - Automatic token refresh and secure storage via Expo SecureStore
  - User profile state management with real-time auth status
- **API State**: TanStack React Query (v4.32.6) for server state management
  - 5-minute stale time for cached data
  - Retry logic with 2 attempts
  - Background refetching and optimistic updates
- **Local Storage**: AsyncStorage for non-sensitive data, SecureStore for tokens

#### Theme System
- **Automatic theme detection**: Light/dark mode support with system preference detection
- **Custom color scheme** (`constants/Colors.ts`): Combat sports inspired design
  - Primary: Red (#dc2626 light, #ef4444 dark) - "Fighting Tomatoes" brand color
  - Semantic colors: Success (Emerald), Warning (Amber), Danger (Red)
  - Tab bar theming with active/inactive states
- **Typography**: FontAwesome icons for consistent UI elements

## Key Files and Locations

### Backend Core Files
- `packages/backend/src/app.ts` - Express app configuration
- `packages/backend/src/server.ts` - Server entry point
- `packages/backend/prisma/schema.prisma` - Database schema
- `packages/backend/src/routes/` - API route handlers
- `packages/backend/src/middleware/` - Custom middleware

### Mobile Core Files
- `packages/mobile/app/_layout.tsx` - Root layout with React Query and Auth providers
- `packages/mobile/app/(tabs)/_layout.tsx` - Tab navigation with auth guards
- `packages/mobile/app/(tabs)/index.tsx` - Events list screen (home)
- `packages/mobile/app/(tabs)/fights.tsx` - Fights rating screen
- `packages/mobile/app/(tabs)/profile.tsx` - User profile and settings
- `packages/mobile/app/(auth)/login.tsx` - Login form with validation
- `packages/mobile/app/(auth)/register.tsx` - Registration form
- `packages/mobile/store/AuthContext.tsx` - JWT authentication state management
- `packages/mobile/services/api.ts` - API service layer with type-safe endpoints
- `packages/mobile/constants/Colors.ts` - Theme colors and design system
- `packages/mobile/app.json` - Expo configuration with platform settings

### Shared Types
- `packages/shared/src/types/` - Shared TypeScript interfaces
- `packages/shared/src/utils/` - Shared utilities and constants

## API Endpoints

### Base URL
- **Development**: `http://10.0.0.53:3001/api` (matches mobile API service)
- **Production**: `https://your-production-api.com/api`

### Authentication Endpoints (`/api/auth/`)
- `POST /register` - User registration with email verification
- `POST /login` - User login with JWT token response
- `POST /logout` - Revoke refresh token and logout
- `POST /refresh` - Refresh access token using refresh token
- `GET /profile` - Get authenticated user profile (requires auth)
- `GET /verify-email` - Email verification via token
- `POST /request-password-reset` - Request password reset email
- `POST /reset-password` - Reset password with token

### Fight Endpoints (`/api/fights/`)
- `GET /fights` - List fights with filtering, pagination, and sorting
  - Query params: `page`, `limit`, `eventId`, `fighterId`, `weightClass`, `isTitle`, `hasStarted`, `isComplete`, `minRating`, `sortBy`, `sortOrder`
- `GET /fights/:id` - Get single fight with full details, ratings, and reviews
- `GET /fights/search` - Search fights by fighter names or event names
  - Query params: `q` (search term), `page`, `limit`
- `POST /fights/:id/rate` - Rate a fight (1-10 scale, requires auth + email verification)
- `DELETE /fights/:id/rate` - Remove user's rating from fight (requires auth)

### Other Available Endpoints
- `GET /health` - System health check with database status
- `GET /api/status` - API status with feature flags and uptime
- `GET /api/test` - Simple test endpoint
- **Additional routes**: Events, Fighters, Users, Reviews, Tags (available but not yet implemented in mobile)

### Response Format
All API responses follow consistent format:
```typescript
// Success responses return data directly
{ fights: Fight[], pagination: {...} }

// Error responses
{
  error: string,           // Human-readable error message
  code: string,            // Machine-readable error code
  details?: any            // Optional validation details
}
```

### Rate Limiting
- **Auth endpoints**: 5 requests per 15 minutes
- **General endpoints**: 10 requests per 15 minutes
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Development Workflow

1. Start Docker services: `pnpm docker:up`
2. Install dependencies: `pnpm install`
3. Run database migrations: `pnpm db:migrate`
4. Seed database: `pnpm db:seed`
5. Start development: `pnpm dev`

## Authentication Flow
- JWT-based with refresh token rotation
- Password requirements: 8+ chars, uppercase, lowercase, number, special char
- Email verification required for new accounts
- Rate limiting: 5 attempts per 15 minutes

## Database Connection
- Local development uses Docker PostgreSQL on port 5433
- Connection string format: `postgresql://dev:devpassword@localhost:5433/yourapp_dev`
- Prisma handles connection pooling and migrations