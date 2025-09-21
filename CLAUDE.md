# Fighting Tomatoes - Combat Sports Rating App

## Project Overview
A React Native + Node.js application for rating combat sports fights (like Rotten Tomatoes for fights). Users can browse upcoming/past events and rate fights on a 1-10 scale.

## Business Goal
Create an enterprise-ready app suitable for acquisition by larger companies (UFC, ESPN, etc.).

## Current Focus
[UPDATE EACH CHAT SESSION]

Database architecture and setup completed. Moving to API development and authentication system implementation.
Recent Completion:

Modern PostgreSQL database with comprehensive schema
Eliminated legacy MD5 table structure
Implemented proper relationships and foreign keys
Added gamification, notifications, and analytics foundation
Complete data seeding with realistic scenarios

Next Priority:

JWT-based authentication system
RESTful API endpoints using new Prisma schema
User registration and email verification

## Quick Context for Claude
- Monorepo structure with backend, mobile, and shared packages
- Working auth system, event browsing, and fight rating features
- Need to add search, social features, analytics, and admin panel
- All core CRUD operations are functional

## Last Updated
[DATE] - [BRIEF SUMMARY OF LAST SESSION'S WORK]

Current Focus:
Authentication system completed and tested. Moving to core API development for fights, ratings, and user interactions.
Recent Completion:

Complete JWT-based authentication system with refresh tokens
User registration and login endpoints working
Email verification infrastructure (disabled for development)
Password reset functionality
Rate limiting and security middleware
Input validation with Zod schemas
Comprehensive error handling
Production-ready authentication tested and verified

Next Priority:

Core API endpoints for fights, fighters, events
User action APIs (ratings, reviews, follows)
Real-time features and WebSocket integration

# Fighting Tomatoes - Combat Sports Rating App

## Project Overview
A React Native + Node.js application for rating combat sports fights (like Rotten Tomatoes for fights). Users can browse upcoming/past events and rate fights on a 1-10 scale.

## Business Goal
Create an enterprise-ready app suitable for acquisition by larger companies (UFC, ESPN, etc.).

## Current Focus
**API Infrastructure Development - September 21, 2025**

**Recent Completion**:
- Basic Fastify API server successfully running on port 3001
- Health check and status endpoints operational
- Database connectivity verified with PostgreSQL
- TypeScript compilation issues resolved
- CORS configuration completed for mobile development
- Foundational route architecture established

**Current Status**:
- Database layer: COMPLETED (modern PostgreSQL with comprehensive schema)
- Authentication system: COMPLETED (JWT with email verification)
- API infrastructure: Basic server OPERATIONAL, comprehensive routes DESIGNED
- Mobile app: Existing UI ready for API integration

**Next Priority**:
- Implement comprehensive API routes (fights, events, fighters, users, reviews, tags)
- Connect mobile app to new API endpoints
- Integrate email verification flow

## Technical Architecture Status

**Backend API (Fastify + TypeScript)**:
- Server running stable with auto-restart
- Prisma ORM integration working
- Enhanced authentication middleware designed
- Comprehensive route structure planned and documented
- Email verification configurable (bypassed in dev)

**Database (PostgreSQL)**:
- Modern schema with UUID primary keys
- 20+ tables with proper relationships
- Gamification system (points, levels, activities)
- Tag categorization with rating-based logic
- Social features (follows, notifications, voting)
- Complete seed data for development

**Mobile App (React Native + Expo)**:
- Existing authentication and basic UI functional
- Ready for API integration
- TypeScript throughout
- React Query for state management

**Key Features Implemented**:
- JWT authentication with refresh tokens
- User registration and login flows
- Basic event browsing and fight rating
- Dark/light theme support
- Monorepo structure with pnpm workspaces

## API Implementation Plan

**Comprehensive Routes Designed**:
- **Fights API**: Rating (1-10), tagging, reviews, predictions, search
- **Events API**: CRUD operations, fight cards, upcoming/past filtering
- **Fighters API**: Profiles, following system, statistics, search
- **Users API**: Profiles, leaderboards, activity feeds, statistics
- **Reviews API**: Voting, reporting, moderation system
- **Tags API**: Rating-based categorization and management

**Key Business Logic**:
- Rating scale: User input 1-10, API aggregates as 0-100
- Tag system: Smart filtering based on user's fight rating
- Email verification: Required for all user actions
- Gamification: Points for ratings, reviews, predictions
- Social features: Following fighters, review voting

**Security Features**:
- Email verification enforcement for user actions
- Rate limiting on authentication endpoints
- Input validation with Zod schemas
- JWT tokens with proper expiration
- Admin-level permissions for content management

## Development Status

**Files Structure Established**:
```
packages/backend/src/
├── server.ts              # Main Fastify server (working)
├── routes/
│   ├── index.ts          # Basic routes (working)
│   ├── fights.ts         # Comprehensive fights API (designed)
│   ├── events.ts         # Event management (designed)
│   ├── fighters.ts       # Fighter profiles (designed)
│   ├── users.ts          # User management (designed)
│   ├── reviews.ts        # Review system (designed)
│   └── tags.ts           # Tag management (designed)
└── middleware/
    └── auth.ts           # Enhanced auth middleware (designed)
```

**Environment Configuration**:
```env
PORT=3001
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key
SKIP_EMAIL_VERIFICATION=true  # Development only
ADMIN_EMAILS=admin@example.com
```

**Verified Working Endpoints**:
- GET `/health` - Database connectivity test
- GET `/api/status` - API status with feature flags
- GET `/api/test` - Basic functionality verification

## Ready for Next Development Phase

**Immediate Implementation Path**:
1. Add comprehensive fights routes with all business logic
2. Integrate authentication middleware protection
3. Test with realistic data using existing seed data
4. Create API service layer in React Native
5. Update mobile UI for new tag selection system

**Success Criteria for Next Session**:
- Complete fights API with rating, tagging, and review functionality
- At least one mobile screen connected to new API
- Email verification flow working end-to-end

The project now has a solid foundation for rapid feature development with enterprise-ready patterns and is positioned well for potential acquisition by major sports organizations.

## Last Updated
September 21, 2025 - API infrastructure foundation completed, comprehensive route implementation ready to begin.