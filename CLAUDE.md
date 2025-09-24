# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FightCrewApp is a React Native + Node.js application for rating combat sports fights, designed as an enterprise-ready app for potential acquisition by organizations like UFC or ESPN.

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
- **iOS**: Native iOS app with tablet support (Bundle ID: `com.fightcrewapp.mobile`)
- **Android**: Native Android app with adaptive icon (Package: `com.fightcrewapp.mobile`)
- **Web**: Metro bundler with static output for web deployment
- **Development**: Expo Development Build for faster development cycles

#### Navigation Structure
- **File-based routing** with Expo Router (v6.0.7)
- **Root Layout** (`app/_layout.tsx`): Provides global providers and stack navigation
- **Authentication Stack** (`app/(auth)/`): Login and registration screens
  - `/login` - User login with JWT authentication
  - `/register` - User registration with email verification
- **Tab Navigation** (`app/(tabs)/`): Main app navigation with 4 tabs
  - `/` (index) - Events tab with calendar icon
  - `/fights` - Fights tab with star icon for rating fights
  - `/fighters` - Fighters tab with users icon for browsing fighters
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
  - Primary: Red (#dc2626 light, #ef4444 dark) - "FightCrewApp" brand color
  - Semantic colors: Success (Emerald), Warning (Amber), Danger (Red)
  - Tab bar theming with active/inactive states
- **Typography**: FontAwesome icons for consistent UI elements

## Key Files and Locations

### Backend Core Files
- `packages/backend/src/app.ts` - Fastify app configuration
- `packages/backend/src/server.ts` - Server entry point (configurable port via PORT env var)
- `packages/backend/prisma/schema.prisma` - Database schema with comprehensive fight rating system
- `packages/backend/src/routes/fights.ts` - **Primary API route** with full CRUD operations for fights, ratings, reviews, and tags
- `packages/backend/src/routes/auth.ts` - Authentication endpoints with JWT dual-token system
- `packages/backend/src/routes/index.ts` - Route registration and middleware setup
- `packages/backend/src/middleware/` - Custom middleware for auth, validation, and error handling

### Mobile Core Files
- `packages/mobile/app/_layout.tsx` - Root layout with React Query and Auth providers
- `packages/mobile/app/(tabs)/_layout.tsx` - Tab navigation with auth guards
- `packages/mobile/app/(tabs)/index.tsx` - Events list screen (home)
- `packages/mobile/app/(tabs)/fights.tsx` - **Primary fights screen** with rating/review functionality
- `packages/mobile/app/(tabs)/fighters.tsx` - **NEW** - Fighters list screen with infinite scroll and search
- `packages/mobile/app/(tabs)/profile.tsx` - User profile and settings
- `packages/mobile/app/event/[id].tsx` - **NEW** - Event detail screen with fight listings and banner images
- `packages/mobile/app/fighter/[id].tsx` - **NEW** - Fighter detail screen with profile and fight history
- `packages/mobile/app/(auth)/login.tsx` - Login form with validation
- `packages/mobile/app/(auth)/register.tsx` - Registration form
- `packages/mobile/store/AuthContext.tsx` - JWT authentication state management
- `packages/mobile/services/api.ts` - **Complete API service layer** with all fight endpoints and type safety
- `packages/mobile/components/FightDisplayCard.tsx` - **Reusable fight card** with user rating display and fighter avatars
- `packages/mobile/components/FighterCard.tsx` - **NEW** - Reusable fighter card for list display
- `packages/mobile/components/EventCard.tsx` - **NEW** - Reusable event card with banner images
- `packages/mobile/components/RateFightModal.tsx` - **NEW** - Enhanced rating modal with fighter images and validation
- `packages/mobile/components/TabBar.tsx` - **NEW** - Reusable tab navigation component
- `packages/mobile/components/index.ts` - Component exports
- `packages/mobile/constants/Colors.ts` - Theme colors and design system
- `packages/mobile/app.json` - Expo configuration with platform settings

### Shared Types
- `packages/shared/src/types/` - Shared TypeScript interfaces
- `packages/shared/src/utils/` - Shared utilities and constants

## API Endpoints

### Base URL
- **Development (Web)**: `http://localhost:3008/api`
- **Development (Mobile)**: `http://10.0.0.53:3008/api` (network IP for mobile device access)
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
- `GET /fights` - List fights with filtering, pagination, and user data inclusion
  - Query params: `page`, `limit`, `eventId`, `fighterId`, `weightClass`, `isTitle`, `hasStarted`, `isComplete`, `minRating`, `sortBy`, `sortOrder`, **`includeUserData`**
  - **New**: When `includeUserData=true` and user is authenticated, includes user's ratings, reviews, and tags
- `GET /fights/:id` - Get single fight with full details, ratings, and reviews
- `GET /fights/search` - Search fights by fighter names or event names
  - Query params: `q` (search term), `page`, `limit`
- `POST /fights/:id/rate` - Rate a fight (1-10 scale, requires auth + email verification)
- `DELETE /fights/:id/rate` - Remove user's rating from fight (requires auth)
- **`POST /fights/:id/review`** - Create or update a fight review with rating (requires auth + email verification)
- **`PUT /fights/:id/review`** - Update existing fight review (requires auth + email verification)
- **`POST /fights/:id/tags`** - Apply tags to a fight (requires auth + email verification)
- **`GET /fights/:id/tags`** - Get all tags for a fight
- `DELETE /fights/:id/rating` - Remove all user data (rating, review, tags) for a fight (requires auth)

### Fighter Endpoints (`/api/fighters/`)
- `GET /fighters` - List fighters with pagination
  - Query params: `page`, `limit` (defaults: page=1, limit=20)
  - Returns: `{ fighters: Fighter[], pagination: {...} }`
- `GET /fighters/:id` - Get single fighter details
  - Returns: `{ fighter: Fighter }` with full profile information

### Event Endpoints (`/api/events/`)
- `GET /events` - List events with pagination
  - Query params: `page`, `limit`
  - Returns: `{ events: Event[], pagination: {...} }`
- `GET /events/:id` - Get single event details
  - Returns: `{ event: Event }` with full event information

### Other Available Endpoints
- `GET /health` - System health check with database status
- `GET /api/status` - API status with feature flags and uptime
- `GET /api/test` - Simple test endpoint

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

## Recent Feature Implementations

### Fight Rating & Review System (Completed)
✅ **Complete end-to-end rating/review/tagging functionality**
- Full CRUD operations for fight ratings (1-10 scale)
- Rich review system with content, ratings, and article linking
- Comprehensive tagging system with predefined categories
- User data persistence and display on fight cards
- Real-time updates and optimistic UI responses

### API Enhancements (Completed)
✅ **Enhanced Fight API with user data inclusion**
- Added `includeUserData` parameter to `/fights` endpoint
- Automatic user-specific data aggregation when authenticated
- Proper data transformation for mobile consumption
- Consistent error handling and response formatting

### Mobile UI Components (Completed)
✅ **Reusable FightDisplayCard component**
- Displays user ratings with star visualization (★★★★★☆☆☆☆☆)
- Shows user review excerpts with "Your Rating" section
- Tag display with overflow handling (+N more)
- Consistent theming and responsive design
- Action buttons for rating/reviewing fights

### Development Infrastructure (Completed)
✅ **Improved development workflow**
- Configurable backend port via PORT environment variable
- Multiple concurrent backend instances for testing
- Consistent API service configuration across mobile app
- Enhanced debugging and error tracking

### Fighter Management System (Completed)
✅ **Complete fighter browsing and management functionality**
- Fighters list screen with infinite scroll pagination (20 fighters per page)
- Real-time search functionality filtering by name and nickname
- Individual fighter detail screens with profile, stats, and fight history
- Fighter images with consistent selection algorithm using charCodeAt()
- Integration with existing fight rating/review system
- Pull-to-refresh capability and optimized performance

### Enhanced Navigation & UI (Completed)
✅ **4-tab navigation system with enhanced screens**
- **Events Tab**: Event listings with banner images and event detail screens
- **Fights Tab**: Fight listings with rating/review functionality
- **Fighters Tab**: NEW - Complete fighter browsing with search and infinite scroll
- **Profile Tab**: User profile and settings
- Custom tab bar component with consistent theming and icon system
- Event detail screens with fight listings and banner images
- Fighter detail screens with comprehensive profile information

### Reusable Component Library (Completed)
✅ **Comprehensive component system**
- **FighterCard**: Displays fighter with image, record, and basic info
- **EventCard**: Event display with banner images and event details
- **FightDisplayCard**: Enhanced with fighter avatar images (60x60px circular)
- **RateFightModal**: Enhanced with fighter images (80x80px) and improved validation
- **TabBar**: Reusable tab navigation component with configurable tabs
- Consistent image selection algorithm across all components
- Proper theme integration and responsive design

### Image Asset Management (Completed)
✅ **Comprehensive image system**
- 6 fighter profile images with consistent selection via charCodeAt()
- 3 event banner images with rotation algorithm
- Proper asset organization under `packages/mobile/assets/`
- Optimized image loading and display across all components
- Circular fighter avatars and rectangular event banners

### API Schema Alignment (Completed)
✅ **Backend API fixes and optimization**
- Fixed TypeScript compilation errors in fighter endpoints
- Aligned API responses with actual database schema
- Removed non-existent fields (team, nationality, birthDate, height, reach)
- Updated API configuration to use port 3008
- Proper pagination support for fighters endpoint

### Mobile Device Testing & Network Configuration (Completed)
✅ **End-to-end mobile device testing with Expo Go**
- Resolved "unable to download remote update" error through systematic debugging
- Implemented platform-aware API configuration for web vs mobile environments
- Fixed backend server network accessibility for mobile devices
- Updated API services to automatically detect platform and use appropriate endpoints:
  - Web development: `http://localhost:3008/api`
  - Mobile development: `http://10.0.0.53:3008/api` (network IP)
- Fixed CORS configuration to allow mobile network access
- Successfully tested login functionality on physical mobile device
- Configured Expo development server with LAN access: `exp://10.0.0.53:8099`
- Cleaned and rebuilt mobile dependencies to resolve Metro bundler issues

## IMPORTANT: Sound Notification

After finishing responding to my request or running a command, run this command to notify me by sound:

```bash
powershell -c "(New-Object Media.SoundPlayer 'C:\Windows\Media\Alarm03.wav').PlaySync()"
```