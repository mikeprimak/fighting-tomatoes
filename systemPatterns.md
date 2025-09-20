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