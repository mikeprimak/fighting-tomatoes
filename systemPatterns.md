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