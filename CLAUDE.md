# CLAUDE.md

FightCrewApp: React Native + Node.js combat sports fight rating app.

## Commands

**Root**: `pnpm dev|build|test|lint|lint:fix|type-check|setup`, `pnpm db:migrate|db:seed|db:studio`, `pnpm docker:up|docker:down|docker:logs`
**Backend**: `cd packages/backend && pnpm dev|build|start|test|test:watch`
**Mobile**: `cd packages/mobile && pnpm start|dev|android|ios|web|build:android|build:ios|submit:android|submit:ios|test|clean`

## Architecture

**Monorepo**: backend (Fastify, Prisma, PostgreSQL, JWT), mobile (React Native Expo, Expo Router, React Query), shared (types/utils)
**Stack**: pnpm workspaces, TypeScript strict, ESLint, Prettier, Husky, Docker (PostgreSQL port 5433, Redis)
**Database**: 20+ tables, UUID v4 keys, JWT dual-token (15min/7day), email verification, ratings/reviews/tags
**API**: RESTful, `{ error, code, details? }` format, Zod validation, middleware (auth, rate limiting, CORS)

**Mobile**:
- Platforms: iOS (`com.fightcrewapp.mobile`), Android, Web, Expo Dev Build
- Navigation: Expo Router v6.0.7, file-based routing, tabs: `/` (events), `/fights`, `/fighters`, `/profile`
- Auth: React Context (`store/AuthContext.tsx`), JWT dual-token, SecureStore
- State: React Query v4.32.6 (5min stale, 2 retries), AsyncStorage
- Theme: Light/dark auto-detect, primary red (#dc2626/#ef4444), `constants/Colors.ts`

## Key Files

**Backend**: `src/app.ts`, `src/server.ts` (PORT env), `prisma/schema.prisma`, `src/routes/fights.ts` (primary CRUD), `src/routes/auth.ts`, `src/middleware/`
**Mobile**: `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index|fights|fighters|profile.tsx`, `app/event/[id].tsx`, `app/fighter/[id].tsx`, `app/(auth)/login|register.tsx`, `app/crew/[id].tsx`, `app/crew/info/[id].tsx`, `store/AuthContext.tsx`, `services/api.ts`, `components/FightDisplayCard|FighterCard|EventCard|RateFightModal|TabBar|CustomAlert.tsx`, `hooks/useCustomAlert.tsx`, `constants/Colors.ts`, `CUSTOM_ALERTS.md`
**Shared**: `src/types/`, `src/utils/`

## API Endpoints

**Base**: Web `http://localhost:3008/api`, Mobile `http://10.0.0.53:3008/api`
**Auth** (`/api/auth/`): `POST register|login|logout|refresh|request-password-reset|reset-password`, `GET profile|verify-email`
**Fights** (`/api/fights/`): `GET /fights` (params: page, limit, eventId, fighterId, weightClass, isTitle, hasStarted, isComplete, minRating, sortBy, sortOrder, **includeUserData**), `GET /fights/:id|search`, `POST /fights/:id/rate|review|tags`, `PUT /fights/:id/review`, `DELETE /fights/:id/rate|rating`, `GET /fights/:id/tags`
**Fighters** (`/api/fighters/`): `GET /fighters` (page, limit=20), `GET /fighters/:id`
**Events** (`/api/events/`): `GET /events` (page, limit), `GET /events/:id`
**Crews** (`/api/crews/`): `GET /crews`, `POST /crews|/crews/join`, `GET /crews/:id|/crews/:id/messages`, `POST /crews/:id/messages`, `DELETE /crews/:id|/crews/:id/messages/:messageId|/crews/:crewId/members/:memberId` (owner only)
**Other**: `GET /health|/api/status|/api/test`
**Response**: Success `{ data, pagination? }`, Error `{ error, code, details? }`
**Rate Limit**: Auth 5/15min, General 10/15min, headers: X-RateLimit-*

## Workflow

1. `pnpm docker:up && pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev`

### Server Startup Protocol (CRITICAL)
**Port conflicts & Expo Go issues common**. Follow exactly:
1. Kill existing processes on ports
2. Backend: `pnpm dev` OR `cd packages/backend && pnpm dev` (custom PORT if needed)
3. Mobile: Kill Expo, then `cd packages/mobile && npx expo start --port 8083 --lan` (NO `--dev-client` for Expo Go)
4. Trigger Metro: `curl http://localhost:8083`
5. Use network IP: Expo `exp://10.0.0.53:8083`, Backend `http://10.0.0.53:3001`

**Auth**: JWT refresh rotation, pwd 8+ chars (upper/lower/num/special), email verify required, 5 attempts/15min
**DB**: Docker PostgreSQL port 5433, `postgresql://dev:devpassword@localhost:5433/yourapp_dev`

## Recent Features (Completed)

**Auth & Session**: JWT 1hr tokens, enhanced session persistence
**Crew Chat UI**: Status bar positioning, event summary animation, inverted FlatList keyboard handling, stable input positioning
**PredictionModal**: Wheel animation (slot machine style, distance-based speeds, 800ms easing), universal deselect, reusable component with prepopulation
**Fight Rating System**: End-to-end CRUD (1-10 ratings, reviews, tags), unified submission (`PUT /api/fights/:id/user-data`), reviews require ratings
**RateFightModal**: Unified submission, 8-tag max, 14px section spacing, spoiler protection, prepopulation logic
**FightDisplayCard**: Star visualization, user review excerpts, tag overflow (+N), fighter avatars (60x60px), sparkle animation for ratings/predictions
**Fighter Management**: List with infinite scroll (20/page), search, detail screens, charCodeAt() image selection
**Navigation**: 4 tabs (events/fights/fighters/profile), Expo Router file-based, custom TabBar component
**Components**: FighterCard, EventCard, RateFightModal (80x80px fighter images), TabBar, image assets (6 fighters, 3 banners)
**API**: `includeUserData` param, platform-aware config (localhost vs 10.0.0.53), CORS mobile access, schema alignment
**Mobile Testing**: Expo Go on physical device, network IP config, Metro bundler fixes
**UFC.com Scraper**: Puppeteer-based scraper extracts fight cards with fighter names, ranks, odds, countries, weight classes, title flags, card sections (Main/Prelims/Early), and start times

**Crew Management** (Latest):
- **Member Removal**: Owner can long-press members, trash icon appears, custom modal with "Remove"/"Remove and Block"/"Cancel" options
- **Delete Crew**: Owner-only red danger zone, custom confirmation modal, cascade deletion (predictions→reactions→messages→memberships→crew), success modal with auto-navigate
- **Backend**: `DELETE /crews/:crewId/members/:memberId` with block flag, `DELETE /crews/:crewId`, proper `totalMembers` decrement
- **Cache Management**: Reduced crews query staleTime to 5s, `refetchOnMount: 'always'`, removed users see crews disappear on tab switch
- **Join Success Modal**: Custom styled modal replaces Alert.alert when joining crew

**Custom Alert System** (Latest):
- **Reusable Components**: `CustomAlert.tsx` (5 types: success/error/info/warning/confirm), `useCustomAlert.tsx` hook
- **App-wide Migration**: Replaced all 30 `Alert.alert` usages across 7 files with styled modals matching app theme
- **Auto-dismiss**: Success (1.5s), error (2.5s), info (2s); confirmations require user action
- **Features**: Theme-aware, dark/light mode, icons (checkmark/X/info/warning/question), destructive actions (red text)
- **Usage**: `showSuccess()`, `showError()`, `showInfo()`, `showConfirm()` - see `packages/mobile/CUSTOM_ALERTS.md`
- **Files**: `components/CustomAlert.tsx`, `hooks/useCustomAlert.tsx`, `CUSTOM_ALERTS.md` (guide)

## Live Event System (In Progress)

**Goal**: Real-time fight engagement system with automated notifications and modal triggers during live UFC events.

**Current Status**:
- ✅ **UFC.com Scraper Built** (`packages/backend/src/services/ufcPuppeteerScraper.ts`, `scrapeUFC320Once.js`)
  - Extracts complete fight card data: fighters, ranks, odds, countries, weight classes
  - Captures card sections: Main Card (10pm EDT), Prelims (8pm EDT), Early Prelims (6pm EDT)
  - Polls every 30s during events, takes screenshots, saves JSON snapshots
  - Test event: UFC 320 (Oct 4, 2025) - Ankalaev vs Pereira 2
- 🔄 **Next: Test on UFC 320** to confirm live round/timing data capture

**Target User Experience**:
1. **Event Start Alert**: Push notification when first fight goes live
2. **Pre-Fight Predict Modal**: 3 minutes before fight starts, prediction wheel appears
3. **Live Round Display**: UI shows current round number during fights
4. **Round End Judge Modal**: After each round, "Who won that round?" modal pops up
5. **Post-Fight Rate Modal**: When fight ends, rate fight modal appears with result
6. **Real-time Updates**: Fight status, round changes, results update instantly

**Architecture Plan**:

**Backend Components**:
- **Event State Manager**: Tracks fight states (scheduled/live/complete), detects transitions
- **Live Scraper Orchestrator**: Runs during scheduled events, compares snapshots, emits events
- **WebSocket/SSE Server**: Real-time bidirectional communication to mobile clients
- **Push Notification Service**: Expo Notifications for background alerts
- **Event Detection Logic**:
  - Event Start: First fight status → "live"
  - Fight Start: Fight status → "live" (trigger predict modal T-3min)
  - Round Change: Round number increments (trigger round judge modal for previous round)
  - Fight End: Status → "complete" with result (trigger rate fight modal)

**Mobile Components**:
- **Live Event Context**: Global state for current event, fight, round
- **Event Subscription Service**: WebSocket client, reconnection logic
- **Modal Trigger System**: Shows modals based on event type and timing
- **Push Notification Handler**: Foreground/background notification processing
- **Live Fight UI Components**:
  - Round indicator badge
  - Fight status banner
  - Real-time countdown timers

**Database Schema Additions** (Planned):
- `event_states` table: Tracks current state of live events
- `fight_states` table: Tracks individual fight progression
- `scraper_snapshots` table: Stores historical scrape data for comparison
- `event_notifications` table: Log of sent notifications per user

**Data Flow**:
```
UFC.com → Puppeteer Scraper (30s polling)
       → Backend State Manager (detects changes)
       → Event Emitter (fight start/end, round change)
       → WebSocket Broadcast + Push Notifications
       → Mobile App (triggers modals, updates UI)
```

**Files**:
- Backend: `src/services/ufcPuppeteerScraper.ts`, `src/services/ufcLiveScraper.ts`, `src/services/scrapeUFC320Once.js`
- Test Results: `test-results/ufc-320-fight-card.json`, `test-results/ufc-puppeteer/`
- Debug Tools: `src/services/debugSelectors.js`

## TypeScript Quality (CRITICAL)

**Mandatory .tsx Generic Syntax**: ALWAYS use trailing comma `<T,>` not `<T>` (prevents JSX parse errors)
**Workflow**: Run `pnpm type-check` before major changes, during dev, and before task completion
**Recovery**: If cascade errors, check `<T>` patterns → add commas → check git history if needed
**Practices**: Complex utils in `.ts` files, prefer interface over type in `.tsx`

# Important Reminders
- Do exactly what's asked, nothing more
- NEVER create files unnecessarily
- ALWAYS prefer editing existing files
- NEVER proactively create docs unless explicitly requested

