# FightCrewApp Technical Overview

**Combat sports fight rating app** | React Native + Node.js | Monorepo

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INFRASTRUCTURE                                  │
├─────────────────┬─────────────────┬─────────────────┬───────────────────────┤
│   Vercel        │   Render        │  Cloudflare R2  │   SMTP Provider       │
│   (Landing)     │   (Backend+DB)  │  (Images CDN)   │   (Emails)            │
│   goodfights.app│   API + Postgres│  Image storage  │   Verification/Reset  │
└─────────────────┴─────────────────┴─────────────────┴───────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                               MONOREPO                                       │
│  pnpm workspaces: packages/backend | packages/mobile | packages/landing     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Mobile App (React Native + Expo)

**Location:** `packages/mobile/`
**Stack:** React Native 0.81, Expo 54, Expo Router, React Query, Zustand

### Key Concepts
| Concept | Location | Notes |
|---------|----------|-------|
| **Routing** | `app/` directory | File-based (Expo Router). Stack-inside-Tabs pattern |
| **API Client** | `services/api.ts` | All REST calls, auto token refresh on 401 |
| **Auth State** | `store/AuthContext.tsx` | JWT tokens in SecureStore, social auth |
| **Server State** | React Query | 5min stale time, aggressive caching |
| **Local State** | Zustand + Context | Auth, notifications, org filters, search |

### Navigation Structure
```
app/
├── (auth)/          # Login, Register, Forgot Password
├── (tabs)/          # Main tabs: Home, Community, News, Profile
├── fight/[id]       # Fight details, ratings, reviews
├── fighter/[id]     # Fighter profile
├── event/[id]       # Event details
├── crew/[id]        # Private crew chat/predictions
└── search-results   # Global search
```

### Dev IP Configuration
When switching networks, update IP in **two files**:
- `packages/mobile/services/api.ts` ~line 20
- `packages/mobile/store/AuthContext.tsx` ~line 76

---

## 2. Backend (Fastify + Prisma)

**Location:** `packages/backend/`
**Stack:** Fastify 5.6, Prisma 5, PostgreSQL 15, JWT auth

### Server Entry Points
| File | Purpose |
|------|---------|
| `src/server.ts` | Fastify setup, plugins, middleware, startup |
| `src/routes/index.ts` | Route registration hub |
| `prisma/schema.prisma` | Database schema (20+ tables) |

### Route Organization
| Route File | Endpoints |
|------------|-----------|
| `routes/auth.fastify.ts` | `/api/auth/*` - register, login, refresh, OAuth |
| `routes/fights.ts` | `/api/fights/*` - CRUD, ratings, reviews, predictions |
| `routes/community.ts` | `/api/community/*` - trending, hot comments |
| `routes/crews.ts` | `/api/crews/*` - group messaging, predictions |
| `routes/notifications.ts` | `/api/notifications/*` - rules, preferences |
| `routes/search.ts` | `/api/search` - global search |

### Key Services
| Service | File | Purpose |
|---------|------|---------|
| **Email** | `src/utils/email.ts` | Nodemailer SMTP - verification, password reset |
| **Image Storage** | `services/imageStorage.ts` | Cloudflare R2 uploads |
| **Scrapers** | `services/scrapeAll*.js` | UFC, ONE FC, PFL, BKFC data import |
| **Live Tracking** | `services/liveEventTracker.ts` | Real-time event status |
| **Notifications** | `services/notificationRuleEngine.ts` | Rule-based push notifications |

### Authentication Flow
```
Register → Email sent → User clicks link → verify-email.html → API verifies → Login enabled
                                                    ↓
Password Reset → Email sent → reset-password.html → API validates → New password set
```

**Tokens:** Access (15min JWT) + Refresh (7 days, stored in DB)

---

## 3. Database (PostgreSQL + Prisma)

**Schema:** `packages/backend/prisma/schema.prisma`

### Core Tables
| Table | Purpose |
|-------|---------|
| `User` | Accounts, profiles, gamification stats |
| `Fighter` | MMA/boxing profiles with records |
| `Event` | Promotion events (UFC, ONE, etc.) |
| `Fight` | Individual matchups |
| `FightRating` | 1-10 user ratings |
| `FightReview` | Post-fight reviews with replies |
| `FightPrediction` | User predictions (winner/method/round) |
| `Crew`, `CrewMessage` | Private group chat |

### Commands
```bash
pnpm db:migrate        # Create migration
pnpm db:migrate:deploy # Apply to production
pnpm db:studio         # Visual DB explorer
pnpm db:seed           # Populate test data
```

---

## 4. Email System

**Provider:** SMTP via Nodemailer
**Config:** Environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS, etc.)

### Email Types
| Type | Validity | Template Location |
|------|----------|-------------------|
| Email Verification | 24 hours | `src/utils/email.ts` |
| Password Reset | 1 hour | `src/utils/email.ts` |
| Account Claim | 24 hours | For migrated users |

### Verification URLs
- `https://goodfights.app/verify-email?token={token}`
- `https://goodfights.app/reset-password?token={token}`

These pages are static HTML in `packages/landing/` that call the backend API.

---

## 5. Web/Landing & Deployment

### Landing Page (Vercel)
**Location:** `packages/landing/`
**Domain:** goodfights.app

| File | Purpose |
|------|---------|
| `index.html` | App store links, marketing |
| `verify-email.html` | Processes email verification tokens |
| `reset-password.html` | Password reset form |

### Backend (Render)
**URL:** `https://fightcrewapp-backend.onrender.com/api`
**Config:** `render.yaml` - Docker deployment, PostgreSQL managed DB

### Image CDN (Cloudflare R2)
**Bucket:** `fightcrewapp-images`
**Usage:** Profile photos, crew images, fighter photos

---

## 6. Development Quick Start

### Commands
```bash
# Root level
pnpm install           # Install all dependencies
pnpm dev               # Start all packages
pnpm build             # Build everything
pnpm lint              # Lint all packages

# Backend
cd packages/backend
PORT=3008 pnpm dev     # Start API server

# Mobile
cd packages/mobile
npx expo start --port 8083 --lan   # Start Expo

# Database
docker-compose up -d   # Start local PostgreSQL (port 5433)
```

### Critical Ports
| Service | Port |
|---------|------|
| Backend API | 3008 |
| Expo Dev Server | 8083 |
| PostgreSQL (local) | 5433 |

### Test Accounts
- `avocadomike@hotmail.com` - Primary test account
- `michaelsprimak@gmail.com` - Secondary test

---

## 7. Key Patterns to Know

### Mobile API Calls
```typescript
// All API calls go through services/api.ts
import { fightService, authService } from '@/services/api';

const fights = await fightService.getFights();
const user = await authService.login(email, password);
```

### Backend Route Pattern
```typescript
// Fastify route with auth
fastify.get('/api/fights', { preHandler: [authenticate] }, async (req, reply) => {
  const fights = await prisma.fight.findMany();
  return fights;
});
```

### Database Queries
```typescript
// Prisma ORM
const user = await prisma.user.findUnique({ where: { id } });
const fights = await prisma.fight.findMany({ include: { event: true } });
```

---

## 8. Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret
SMTP_HOST=smtp.provider.com
SMTP_USER=noreply@goodfights.app
SMTP_PASS=password
R2_ENDPOINT=https://...r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=key
R2_SECRET_ACCESS_KEY=secret
FRONTEND_URL=https://goodfights.app
```

### Mobile
Dev IP configured directly in source files (see Section 1).

---

## 9. When Working On...

| System | Start Here |
|--------|------------|
| **New API endpoint** | `packages/backend/src/routes/` - add route, register in index.ts |
| **New mobile screen** | `packages/mobile/app/` - create file, Expo Router auto-registers |
| **Database changes** | `prisma/schema.prisma` → `pnpm db:migrate` |
| **Email templates** | `packages/backend/src/utils/email.ts` |
| **Fight scraping** | `packages/backend/src/services/scrapeAll*.js` |
| **Push notifications** | `services/notificationRuleEngine.ts`, `routes/notifications.ts` |
| **Landing page** | `packages/landing/*.html` (static) |

---

## 10. Architecture Decisions

- **Monorepo:** Shared code, single versioning, atomic changes
- **Expo:** Cross-platform (iOS/Android/Web) from single codebase
- **Fastify:** High performance, plugin ecosystem, TypeScript native
- **Prisma:** Type-safe DB access, migration management
- **React Query:** Server state caching, reduces network calls
- **JWT dual-token:** Short-lived access (security) + long-lived refresh (UX)
- **Cloudflare R2:** S3-compatible, no egress fees, global CDN

---

*Last updated: January 2026 | See CLAUDE.md for troubleshooting and CLAUDE-ARCHIVE.md for detailed history*
