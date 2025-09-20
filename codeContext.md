# Critical Code Context

## Database Schema (Key Models)
```prisma
// From packages/backend/prisma/schema.prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  username  String   @unique
  // ... rest of User model
}

model Fight {
  id          String    @id @default(cuid())
  fightOrder  Int
  isTitle     Boolean   @default(false)
  // ... rest of Fight model
}


## API Patterns (Example Routes)

typescript// From packages/backend/src/routes/fights.routes.ts
router.post('/:id/rate', authenticateToken, rateFight);
router.get('/', getFights);


## Mobile Screen Patterns

typescript// From packages/mobile/app/(tabs)/fights.tsx
const { data: fights } = useQuery({
  queryKey: ['fights'],
  queryFn: async () => { /* ... */ }
});

**apiReference.md** - Your actual API endpoints:
```markdown
# API Reference

## Authentication
- POST /api/auth/register
- POST /api/auth/login  
- POST /api/auth/refresh
- GET /api/auth/profile

## Fights
- GET /api/fights (with query params)
- GET /api/fights/:id
- POST /api/fights/:id/rate
- PUT /api/fights/:id/rate

## Events  
- GET /api/events
- GET /api/events/:id

# Key Files to Reference

## Backend Core
- packages/backend/prisma/schema.prisma (complete data model)
- packages/backend/src/routes/fights.routes.ts (fight endpoints)
- packages/backend/src/controllers/fights.controller.ts (business logic)

## Frontend Core  
- packages/mobile/app/(tabs)/fights.tsx (main rating screen)
- packages/mobile/store/AuthContext.tsx (auth state)
- packages/shared/src/types/index.ts (shared types)

## When sharing code with Claude:
Copy the full contents of these files when discussing related features.