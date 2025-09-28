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

### Server Startup Troubleshooting
**IMPORTANT**: When starting servers, if Expo doesn't show the QR code immediately, open the development server directly with `curl http://localhost:8081` to trigger Metro bundler completion. This ensures the Expo development server fully initializes and displays the QR code for mobile device access.

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

### Authentication & Session Management (Completed - Point A)
✅ **Extended JWT Token Duration**
- Increased access token expiration from 15 minutes to 1 hour
- Updated all authentication services and routes
- Enhanced user session persistence for better UX
- Modified: `jwt.ts`, `auth.service.ts`, `auth.fastify.ts`, `.env.example`

### Crew Chat Screen UI/UX Improvements (Completed - Point A)
✅ **Status Bar Positioning & Animation Enhancements**
- Fixed vertical divider positioning with absolute coordinates (33.33%, 66.66%)
- Implemented dynamic content expansion for Event and Current Fight sections
- Added intelligent padding system to maintain title alignment across sections
- Refined status bar spacing with minimal top padding (2px) and optimized bottom padding (25px)
- Created stable slide animation for event summary with proper timing coordination
- Eliminated section movement issues during expand/collapse transitions

✅ **Enhanced Event Summary Animation**
- Smooth slide-down animation from -1000px with proper overflow clipping
- Coordinated timing between chat message visibility and event summary display
- Fixed animation positioning to eliminate content pop-in during transitions
- Improved chevron positioning and visual feedback

✅ **PredictionModal Enhancements**
- Removed question numbering for cleaner UI
- Added universal deselect functionality for all prediction options
- Enhanced gradient effects on scrolling number wheel with smooth transitions
- Reordered prediction methods: KO/TKO, Submission, Decision

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

### Modal Component Reusability & Prepopulation System (December 2024)
✅ **Reusable Modal Component Architecture**
- **PredictionModal**: Converted from inline crew chat modal to reusable component (`packages/mobile/components/PredictionModal.tsx`)
  - Full TypeScript interfaces with proper null safety
  - Comprehensive crew prediction integration with React Query
  - Automatic prepopulation of existing user predictions (hype level, predicted winner, method, round)
  - Handles both `existingPrediction` prop and fetched crew predictions
  - Intelligent form reset for new predictions vs existing data
- **RateFightModal**: Replaced inline crew chat rating modal with existing reusable component
  - Enhanced prepopulation logic for ratings, reviews, and tags
  - Handles different API response structures (rating as number vs object)
  - Smart data preference logic (review data over standalone ratings)
  - Maps existing backend tags to frontend tag structure
  - "Remove All My Data" functionality when user has existing data

✅ **Data Persistence & Query Management**
- **Fight Data Fetching**: Added real fight data queries to crew chat screen
  - Fetches actual fight data with user information via `apiService.getFight()`
  - Conditional query enabling only when modals are open for performance
  - Proper query invalidation after successful submissions for fresh data
  - Falls back to mock data when real API data unavailable
- **Query Cache Integration**:
  - Added `queryKey={['fight', fightId, 'withUserData']}` to RateFightModal
  - PredictionModal invalidates fight data queries in `onSuccess` callback
  - Ensures next modal open shows updated user data

🔄 **In Progress: Modal Prepopulation Debugging**
- Issue identified: Crew chat screen mock data lacks user-specific information
- Root cause: Mock fight object missing `userRating`, `userReview`, `userTags` properties
- Solution implemented: Added real API data fetching with user data inclusion
- Status: Implementation complete but requires testing to verify full functionality
- Next steps: Debug API response structure and ensure proper data mapping

### Recent Component Updates (December 2024)
- **packages/mobile/components/index.ts**: Updated exports for PredictionModal and RateFightModal
- **packages/mobile/app/crew/[id].tsx**:
  - Removed 200+ lines of inline prediction modal code
  - Removed inline fight rating modal code and old state management
  - Added fight data fetching query with user data
  - Updated modal opening functions to use actual API data
  - Added proper query invalidation for data refresh

### Crew Chat Keyboard & UX Improvements (December 2024)
✅ **Stable Keyboard Behavior Implementation**
- **Point A - Stable Keyboard Behavior**: Eliminated visual glitching on first message send
  - Removed KeyboardAvoidingView wrapper that caused layout conflicts
  - Implemented absolute positioning for input area with dynamic keyboard height detection
  - Used manual keyboard height tracking: `bottom: keyboardHeight > 0 ? keyboardHeight + 23 : (Platform.OS === 'ios' ? 34 : 0)`
  - Fixed chat container with `paddingBottom: 70` to prevent message overlap
  - Simplified scroll logic to prevent timing conflicts during initial load

- **Point B - Inverted FlatList with Instant Bottom Positioning**: Enhanced chat opening behavior
  - Implemented `inverted` prop on FlatList for natural bottom-up chat interface
  - Used reversed message data: `[...messages].reverse()` to maintain chronological order
  - Eliminated scroll animations and delays on chat open - instantly shows newest messages
  - Removed complex `initialScrollIndex` and `getItemLayout` calculations
  - Achieved immediate positioning without timeouts or scroll handling

✅ **Key Technical Solutions**:
- **Input Area Positioning**: Absolute positioning with keyboard-aware bottom calculation
- **Glitch Prevention**: Removed competing layout systems (KeyboardAvoidingView)
- **Chat Opening**: Inverted FlatList for instant bottom positioning
- **Keyboard Handling**: Manual keyboard height detection via Keyboard API listeners
- **Safe Area Support**: iOS safe area (34px) when keyboard hidden, dynamic when visible

**File Modified**: `packages/mobile/app/crew/[id].tsx`
- Keyboard height tracking with proper event listeners
- Absolute positioned input container with dynamic bottom positioning
- Inverted FlatList with reversed message data for instant bottom display
- Simplified message mutation without forced scroll handling

### PredictionModal Wheel Animation System (December 2024)
✅ **Advanced Animated Wheel Interface for Hype Level Selection**
- **Slot Machine-Style Animation**: Implemented vertical wheel animation with numbers 1-10 arranged top to bottom (10 at top, 1 at bottom)
- **Realistic Physics**: Distance-based animation speeds - short changes slow/gentle, long changes fast/forceful with dramatic slowdown
- **Smooth Easing**: `Easing.out(Easing.quad)` with 800ms duration for consistent smoothness
- **Visual Design**: 80px large gray star (#666666) with 52px centered numbers, 120px spacing between wheel numbers for clean visibility
- **Pre-existing Selection Detection**: Wheel initializes to show current user hype level on modal open
- **Performance Optimized**: Native driver animations with conflict prevention via `stopAnimation()`

✅ **Technical Implementation Details**:
- **Wheel Structure**: Numbers arranged in 120px increments with overflow hidden and subtle fade overlays
- **Position Calculation**: `(10 - targetNumber) * 120` for proper alignment with inverted number order
- **Smooth Transitions**: Users see intermediate numbers scroll smoothly through view during longer animations
- **State Management**: Immediate state updates with `setDisplayNumber()` to prevent animation conflicts
- **Initialization Logic**: `wheelAnimation.setValue()` for instant positioning without animation on modal open

**Files Modified**: `packages/mobile/components/PredictionModal.tsx`
- Added Image import and fighter image display (80x80px circular) in fighter selection buttons
- Implemented vertical wheel animation system with proper easing and spacing
- Enhanced modal overlay with `statusBarTranslucent={true}` for full screen coverage
- Simplified component styling for method buttons and removed visual clutter

## TypeScript & Code Quality Guidelines

### Critical TypeScript Rules for .tsx Files
**MANDATORY**: Always use trailing comma for generic functions in `.tsx` files to prevent JSX parsing conflicts:
```typescript
// ❌ NEVER do this in .tsx files - causes catastrophic parsing errors
const shuffleArray = <T>(array: T[]) => T[]

// ✅ ALWAYS do this in .tsx files
const shuffleArray = <T,>(array: T[]) => T[]
```

### Automated Code Quality Workflow
Claude Code should ALWAYS follow these steps when making significant changes:

1. **Before Major Changes**:
   - Run `pnpm type-check` to establish baseline
   - Consider creating git checkpoint: `git add . && git commit -m "Checkpoint before changes"`

2. **During Development**:
   - Run `pnpm type-check` after each significant code change
   - Pay special attention to generic syntax in `.tsx` files
   - Use trailing commas for all generics: `<T,>`, `<T extends Something,>`, `<T, U,>`

3. **After Code Changes**:
   - ALWAYS run `pnpm type-check` before completing the task
   - Fix any TypeScript errors before declaring task complete
   - If type-check fails, investigate and fix rather than ignoring

### File Organization Best Practices
- **Complex utility functions**: Move to `.ts` files (utils/) for cleaner generic syntax
- **React components**: Keep in `.tsx` files with proper generic syntax
- **Type definitions**: Prefer interface over type in `.tsx` files when possible

### Emergency Recovery Procedures
If TypeScript errors cascade (hundreds of errors from one file):
1. Check for generic syntax issues: look for `<T>` patterns in `.tsx` files
2. Add trailing commas to fix: `<T,>`
3. If errors persist, check git history: `git log --oneline -- path/to/file.tsx`
4. Use git restoration if needed: `git show COMMIT:path/to/file.tsx > temp_file.tsx`

## Next Session Priority
🔄 **Chat Messages Keyboard Integration**
When we start the next session, we'll begin by implementing keyboard-aware chat message positioning. The goal is to make all chat messages rise up with the keyboard and input area so that the most recent message remains visible while typing. This will require:
- Adjusting the chat container's bottom padding/margin dynamically with keyboard height
- Ensuring the inverted FlatList responds properly to keyboard changes
- Maintaining the stable keyboard behavior from Point B while adding message area responsiveness
- Testing that messages stay visible and scrollable during keyboard interaction


# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.

## TypeScript Quality Enforcement
CRITICAL: Always follow these TypeScript practices to prevent code corruption:
- Use trailing comma for ALL generics in .tsx files: `<T,>` not `<T>`
- Run `pnpm type-check` after significant changes
- Fix TypeScript errors before completing tasks
- Check for generic syntax issues if hundreds of errors appear from one file

