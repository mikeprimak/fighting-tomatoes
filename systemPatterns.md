Database: PostgreSQL (local development)
API runs on: http://localhost:3001
Mobile dev server: Expo CLI


## Step 4: Create systemPatterns.md
```markdown
# Architecture & Design Patterns

## Project Structure
packages/
├── backend/     # Express API with Prisma
├── mobile/      # React Native Expo app
└── shared/      # Shared TypeScript types

## Database Design
- **Users** → **Sessions** (1:many for refresh tokens)
- **Organizations** → **Events** → **Fights** (hierarchical)
- **Fights** ↔ **Fighters** (many-to-many)
- **Users** → **FightRatings** ← **Fights** (ratings junction)

## API Patterns
- RESTful endpoints with consistent response structure
- JWT authentication middleware on protected routes
- Error handling with standardized error responses
- React Query for client-side caching and state

## Mobile Architecture
- File-based routing with Expo Router
- Screen-level components in app/ directory
- Shared UI components in components/ directory
- Auth state managed via React Context
- Type-safe API calls with shared TypeScript interfaces

## Code Standards
- TypeScript everywhere with strict mode
- Functional React components with hooks
- Consistent error handling and loading states
- ESLint + Prettier for code formatting

New Architectural Decisions:
Database Architecture Pattern:

Decision: Single PostgreSQL database with proper relationships
Rationale: Eliminates legacy multi-database, MD5-table approach that was inefficient and hard to maintain
Impact: Enables complex queries, proper ACID transactions, and enterprise scalability

Primary Key Strategy:

Decision: UUID primary keys throughout the system
Rationale: Supports horizontal scaling, eliminates sequential ID vulnerabilities, enables distributed systems
Implementation: All tables use UUID v4 with Prisma's @default(uuid())

Authentication Pattern:

Decision: JWT-based authentication with refresh tokens
Rationale: Stateless, scalable, supports mobile and web clients
Security: Separate access and refresh tokens with proper expiration

Data Relationships Pattern:

Decision: Proper foreign key constraints with cascade behaviors
Rationale: Ensures data integrity, simplifies queries, prevents orphaned records
Implementation: All relationships use Prisma's relation decorators

Gamification Architecture:

Decision: Built-in points and activity tracking system
Rationale: Encourages user engagement, provides foundation for advanced features
Extensibility: Activity types enum allows easy addition of new gamification features

Tag System Pattern:

Decision: Categorized tags with rating-based display logic
Rationale: Provides contextual tagging experience based on user's fight rating
Implementation: Tags have category and rating range flags for smart UI display

Social Features Pattern:

Decision: Voting and moderation system for user-generated content
Rationale: Enables community-driven quality control
Scalability: Separate vote tracking allows for complex reputation algorithms

Analytics Foundation:

Decision: Recommendation table with scoring system
Rationale: Prepares for ML-based recommendation engine
Data Structure: Flexible scoring with reason tracking for algorithm transparency

Migration Strategy:

Decision: Fresh start with manual legacy data import
Rationale: Legacy system too different to warrant automated migration complexity
Benefit: Clean data, proper validation, elimination of legacy inconsistencies

These architectural decisions position the system for enterprise acquisition by companies like UFC or ESPN, providing scalable foundation for millions of users and advanced analytics capabilities.

System Patterns and Architectural Decisions
Authentication Architecture Patterns
JWT Token Strategy

Decision: Dual-token system with short-lived access tokens and longer refresh tokens
Implementation: Access tokens (15min), refresh tokens (7 days) with database storage
Rationale: Balances security with user experience, enables token revocation
Security: Separate secrets for access and refresh tokens, automatic rotation

Password Security Pattern

Decision: bcrypt with 12 rounds, strong password requirements
Implementation: Regex validation for complexity, secure hashing on registration
Rationale: Industry standard protection against rainbow table and brute force attacks
Compliance: Meets enterprise security requirements for password handling

Rate Limiting Strategy

Decision: Express-rate-limit with sliding window approach
Implementation: 5 auth attempts per 15-minute window per IP
Rationale: Prevents brute force attacks while allowing legitimate retries
Scalability: Can be enhanced with Redis for distributed rate limiting

Input Validation Pattern

Decision: Zod schemas for runtime type checking and validation
Implementation: Schema validation middleware with detailed error messages
Rationale: Type safety at runtime, prevents injection attacks, improves UX
Maintainability: Single source of truth for validation rules

API Design Patterns
Error Handling Strategy

Decision: Consistent error response format with HTTP status codes
Implementation: Centralized error handler with structured responses
Format: { error: string, code: string, details?: any }
Security: No sensitive information leakage in production errors

Middleware Architecture

Decision: Layered middleware approach with single responsibility
Implementation: Auth, validation, rate limiting, CORS as separate middleware
Benefits: Composable, testable, reusable across endpoints
Extensibility: Easy to add new middleware without modifying existing code

Database Interaction Pattern

Decision: Prisma ORM with TypeScript for type-safe database access
Implementation: Generated types, migration management, connection pooling
Benefits: Type safety, excellent developer experience, automatic migrations
Performance: Built-in query optimization and connection management

Security Implementation Patterns
CORS Configuration

Decision: Strict origin validation with environment-based allowlists
Implementation: Dynamic origin checking for development and production
Security: Prevents unauthorized cross-origin requests
Flexibility: Supports both web and mobile client origins

Email Verification Strategy

Decision: Token-based verification with time limits
Implementation: Crypto-generated tokens with 24-hour expiration
User Experience: Optional verification for development, required for production
Scalability: Template-based emails with environment-specific URLs

Session Management

Decision: Stateless authentication with database-tracked refresh tokens
Benefits: Horizontally scalable, enables token revocation
Implementation: Refresh token rotation with automatic cleanup
Security: Immediate revocation capability for compromised accounts

Development and Testing Patterns
Environment Configuration

Decision: Environment-based configuration with validation
Implementation: dotenv with required variable checking
Security: Separate secrets for development and production
Deployment: Easy configuration management across environments

API Testing Strategy

Decision: Manual testing with Postman during development
Implementation: Structured endpoint testing with realistic data
Documentation: Self-documenting through working examples
Future: Foundation for automated testing suite

Migration Management

Decision: Prisma migrate for schema version control
Benefits: Reproducible database changes, rollback capability
Team Collaboration: Shared schema changes through version control
Production Safety: Tested migrations before deployment

Scalability Considerations
Horizontal Scaling Readiness

Stateless Design: JWT tokens enable multi-server deployment
Database Connection: Prisma connection pooling supports load balancing
Rate Limiting: Redis integration ready for distributed limiting
Session Storage: Refresh tokens in database support server scaling

Performance Optimization Patterns

Database Queries: Prisma query optimization and selective field loading
Token Verification: Efficient JWT verification with proper caching
Middleware Ordering: Optimized middleware chain for performance
Error Handling: Fast-fail validation to reduce processing overhead

Enterprise Integration Patterns
Monitoring and Logging

Implementation: Structured console logging with request correlation
Scalability: Ready for integration with enterprise logging solutions
Security Events: Authentication events logged for audit trails
Performance: Request timing and error rate tracking foundation

OAuth Integration Readiness

Architecture: Provider-agnostic authentication structure
Implementation: AuthProvider enum supports multiple OAuth providers
User Experience: Unified user object regardless of authentication method
Future: Google and Apple OAuth integration planned

These patterns establish Fighting Tomatoes as an enterprise-ready application with proper security, scalability, and maintainability considerations built into the foundation.