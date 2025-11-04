# CLAUDE.md

FightCrewApp: React Native + Node.js combat sports fight rating app.

**📚 Archive**: Detailed troubleshooting, historical features, and verbose documentation moved to `CLAUDE-ARCHIVE.md`

## Commands

**Root**: `pnpm dev|build|test|lint|type-check|setup`, `pnpm db:migrate|db:seed`, `pnpm docker:up|down|logs`
**Backend**: `cd packages/backend && PORT=3008 pnpm dev|build|start`
**Mobile**: `cd packages/mobile && npx expo start --port 8083 --lan`

## Architecture

**Monorepo**: backend (Fastify, Prisma, PostgreSQL), mobile (React Native Expo, Expo Router, React Query), shared (types/utils)
**Stack**: pnpm workspaces, TypeScript strict, Docker (PostgreSQL port 5433, Redis)
**Database**: 20+ tables, UUID v4 keys, JWT dual-token (15min/7day)
**Mobile**: iOS/Android/Web, Expo Router v6.0.7, Stack-inside-Tabs pattern, React Query v4.32.6

## Key Files

**Backend**: `src/server.ts`, `prisma/schema.prisma`, `src/routes/fights.ts`, `src/routes/auth.ts`, `src/middleware/`
**Mobile**: `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `store/AuthContext.tsx`, `services/api.ts`, `components/`, `hooks/`

## API Endpoints

**Base**: Web `http://localhost:3008/api`, Mobile `http://10.0.0.53:3008/api`
**Auth**: `POST register|login|logout|refresh`, `GET profile|verify-email`
**Fights**: `GET /fights` (includeUserData param), `GET /fights/:id`, `POST /fights/:id/rate|review|tags|pre-fight-comment`, `GET /fights/:id/pre-fight-comments`
**Fighters**: `GET /fighters` (page, limit=20), `GET /fighters/:id`
**Events**: `GET /events`, `GET /events/:id`
**Crews**: `GET /crews`, `POST /crews|/crews/join`, `GET /crews/:id/messages`, `DELETE /crews/:id`
**Notifications**: `POST /register-token`, `GET/PUT /preferences`
**Search**: `GET /search?q=query&limit=10` (fighters, fights, events, promotions)
**Response**: Success `{ data, pagination? }`, Error `{ error, code, details? }`

## 🚀 Server Startup (Quick Reference)

**CRITICAL PORTS**:
- Backend: **PORT 3008** (NOT 3001!)
- Expo/Metro: **PORT 8083** (NOT 8081!)
- Docker PostgreSQL: **PORT 5433** (NOT 5432!)
- Mobile API: `http://10.0.0.53:3008/api`

**Startup Procedure**:
```bash
# 1. Start Docker
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
# Wait 30 seconds, then verify: docker ps

# 2. Start Backend
cd packages/backend && PORT=3008 pnpm dev
# Wait for: "Server listening at http://10.0.0.53:3008"

# 3. Start Expo (NO --dev-client flag!)
cd packages/mobile && npx expo start --port 8083 --lan
# Scan QR code in Expo Go app

# 4. Verify
curl http://localhost:3008/health
```

**Quick Fixes**:
- Port in use: `netstat -ano | findstr ":3008"` → `powershell Stop-Process -Id <PID> -Force`
- Nuclear option: `taskkill /F /IM node.exe` then restart all
- See `CLAUDE-ARCHIVE.md` for detailed troubleshooting

---

## Recent Features

### Bug Fixes and Code Cleanup (2025-11-04)
- **Winner Prediction Bug Fix**:
  - Fixed issue where users couldn't save winner prediction without also selecting a method
  - Changed `saveWinnerMutation` in UpcomingFightDetailScreen to use `selectedMethod` instead of `fight.userPredictedMethod`
  - Users can now independently save winner, method, and hype predictions
  - File: `components/UpcomingFightDetailScreen.tsx:207`

- **Keyboard Handling Improvement**:
  - Added `KeyboardAvoidingView` to UpcomingFightDetailScreen
  - Pre-fight comment textarea now remains visible when phone keyboard appears
  - Behavior: 'padding' for iOS, 'height' for Android
  - Added bottom padding to ScrollView content for better UX
  - File: `components/UpcomingFightDetailScreen.tsx:611-621`

- **Removed Legacy Modal System** (354 lines deleted):
  - Removed old modal-based prediction/rating system that was replaced by full-screen navigation
  - Cleaned up 5 files: `app/(tabs)/events/index.tsx`, `app/(tabs)/events/[id].tsx`, `app/event/[id].tsx`, `app/crew/[id].tsx`, `app/activity/ratings.tsx`
  - Removed: `RateFightModal`, `PredictionModal` components and all associated state/handlers
  - Removed: `recentlyRatedFightId`, `recentlyPredictedFightId` animation tracking (was only working for modal flow, not navigation flow)
  - Removed: `animateRating`, `animatePrediction` props from fight cards
  - All prediction/rating functionality now uses navigation to UpcomingFightDetailScreen and CompletedFightDetailScreen

- **Animation System Notes** (for future implementation):
  - Existing sparkle animation infrastructure still exists in fight cards (flame1-8, fighterSparkle1-4, methodSparkle1-4)
  - Animations currently only triggered by `animatePrediction` prop, which was only set by modal system
  - For navigation-based flow, need global state solution (context/redux) or data-change detection
  - Challenge: React Query caching means data doesn't always re-render on navigation back
  - Solution attempted: Change detection with refs, pathname detection - both had timing/reliability issues
  - Recommended approach for future: Simple data comparison on component focus/mount

### Fight Notification System (2025-11-03)
- **Feature**: Comprehensive fight notification system with fighter-based and fight-based alerts
- **Backend**:
  - Added `isFollowingFighter1` and `isFollowingFighter2` fields to fight responses (both list and detail endpoints)
  - Checks `UserFighterFollow.startOfFightNotification` flag to determine if user gets notified
  - New endpoint: `PATCH /api/fighters/:id/notification-preferences` to update notification settings
  - Allows disabling notifications for a specific fight without unfollowing the fighter
  - Existing endpoints: `POST /api/fights/:id/follow`, `DELETE /api/fights/:id/unfollow`
- **Mobile UI**:
  - **FightDetailsMenu Component**: New three-dots menu (vertical ellipsis icon using Ionicons) at top-right of fight detail screens
    - Replaces inline "Fight Details" section with modal submenu
    - Shows "Notify when fight starts" toggle for direct fight follows
    - Shows "Following [Fighter Name]" sections for each followed fighter with notification toggle
    - Toggle allows disabling fight notification without unfollowing fighter
  - **Bell Icon Indicators**: Yellow bell icon (`#F5C518`) appears when notifications are active
    - UpcomingFightCard: Bell replaces "vs" text when user follows fight OR either fighter
    - UpcomingFightDetailScreen: Bell appears in header (left of three-dots) when following fight or either fighter
  - **Toast Notifications**: Replaced modal alerts with toast (slides up from bottom, 2s auto-dismiss)
    - Green bell icon with "You will be notified before this fight." message
    - Matches fighter screen notification pattern for consistency
  - **Query Invalidation**: Properly refreshes all fight lists when notification status changes
- **User Flow**:
  - Follow fighter → Enable notifications → Bell appears on all their fights
  - Open fight detail → Three-dots menu → Toggle specific fight notifications
  - Follow fight directly → Get notified 15 minutes before
  - Follow fighter (with notifications) → Get notified before ALL their fights
- **Files**: `routes/fights.ts:244-278,474-513`, `routes/index.ts:1098-1192`, `services/api.ts:709-730`, `FightDetailsMenu.tsx`, `UpcomingFightDetailScreen.tsx`, `UpcomingFightCard.tsx`

### Search Functionality (Updated 2025-11-03)
- **Feature**: Global search across fighters, fights, events, and promotions with intelligent multi-word matching
- **Backend**:
  - API: `GET /api/search?q=query&limit=10` with unified search
  - **Intelligent Multi-Word Search** (Added 2025-11-03):
    - Fighter search: "Jon Jones" matches firstName + lastName combinations (both orders)
    - Fight search: "Jon UFC" finds fights where one term matches fighter AND another matches event/promotion
    - Maintains backward compatibility with single-term searches
    - Examples: "Jon Jones" → first+last match, "Jon UFC" → Jon Jones fights at UFC events
  - **Event Sorting** (Added 2025-11-03): Results ordered by upcoming events first (soonest first), then past events (most recent first)
  - Database: Case-insensitive search across Fighter names/nicknames, Event names, and Promotion names
  - Returns fighters (with records, rankings, champion status), fights (with event context), events (with stats), and promotions (with aggregated stats)
  - Validation: Minimum 2 character query, max 50 results per category
- **Mobile UI**:
  - Search bar at top of Community (Good Fights) screen, scrollable with content
  - Placeholder: "Search", dark button text on yellow background
  - Dedicated search results screen at `/search-results` with 4 sections
  - Uses reusable components: FighterCard, UpcomingFightCard, CompletedFightCard, SmallEventCard
  - Column headers matching Community screen style (ALL HYPE/MY HYPE, ALL RATINGS/MY RATING)
  - **SmallEventCard** (Added 2025-11-03): Compact horizontal layout with banner (33% width), event name, date, and yellow badge showing relative time for upcoming events ("IN 2 WEEKS", "TOMORROW", etc.)
  - Always shows all section headers even with 0 results
- **Technical Notes**:
  - Fixed TypeScript compilation errors using explicit `any` type annotations for complex Prisma queries
  - Used `AND` array structure for combining search conditions with `isActive` filter
- **Files**: `routes/search.ts`, `routes/index.ts:1307`, `services/api.ts:968-1056`, `app/search-results.tsx`, `app/(tabs)/community.tsx:467-485`, `components/SmallEventCard.tsx`
- **Commits**: `b17bf6a`, `9e98472`, `487408c`, `2ff789d`, `56f10ea`

### Pre-Fight Comments
- **Feature**: Users can comment on why they're hyped for upcoming fights
- **Backend**:
  - Database: `PreFightComment` model with unique constraint (one comment per user per fight)
  - API: `POST /api/fights/:id/pre-fight-comment` (create/update), `GET /api/fights/:id/pre-fight-comments` (fetch all)
  - Validation: Requires auth + email verification, max 500 chars, prevents comments on started fights
  - Upsert pattern: Updates existing comment if user already commented on that fight
- **Mobile UI**:
  - Section in `UpcomingFightDetailScreen` with multi-line input and character counter
  - Auto-populates user's existing comment, optimistic UI updates via React Query
- **Files**: `prisma/schema.prisma:417`, `routes/fights.ts`, `services/api.ts:888-946`, `UpcomingFightDetailScreen.tsx:464-547`
- **Commits**: `26bf243`, `0bd687f`

### Performance Optimizations
- **API Call Reduction**: Combined `getFightPredictionStats` + `getFightAggregateStats` using `Promise.all`
- **Impact**: 50% fewer requests (160→80 calls on list views, 2→1 on detail screens)
- **Files**: `hooks/useFightStats.ts`, fight cards, detail screens
- **Commits**: `16e67fe`, `8972ea4`

### Navigation Improvements (Latest)
- **Root-Level Event Route**: Fixed back button navigation from fight details
  - Problem: Fight Detail → Event Detail → Back skipped to Past Events
  - Solution: Created `/event/[id].tsx` route at root level (matches `/fighter` pattern)
- **Fight Card Navigation**: Changed event screens to navigate to detail screens instead of modals
  - UpcomingFightCard → UpcomingFightDetailScreen
  - CompletedFightCard → CompletedFightDetailScreen
- **Files**: `app/event/[id].tsx`, `app/_layout.tsx`, `components/FightDetailsSection.tsx`
- **Commits**: `2797e48`, `394bc01`, `1db2b4f`, `f4a90e4`

### UI/UX Features (Latest)
- **Fighter Cards (Community Screen)**: Removed borders, streamlined design
  - No border on card or fighter image
  - Replaced WLD record with fighter rating (average of last 3 fights)
  - Shows "Avg Score (last N fights): X.X/10" with dynamic fight count
  - Backend already calculates `avgRating` from last 3 completed fights
  - Files: `components/FighterCard.tsx`, `app/(tabs)/community.tsx`
- **Fight Cards**: Heatmap squares (40x40px) for hype/rating scores, yellow underline for user predictions, compact height (40px min)
- **Detail Screens**: Large animated wheels (80px), auto-save, contextual tags, inline rating system
- **Navigation**: Stack-inside-Tabs pattern, persistent native tab bar, smart highlighting
- **Custom Alerts**: App-wide styled modals replacing Alert.alert (5 types, theme-aware, auto-dismiss)
- **Crew Management**: Member removal, crew deletion with cascade, join success modal
- **Contact Invitations**: WhatsApp-style UX with SMS sending
- **Push Notifications**: 9 preference fields, Expo SDK integration, deep linking

### Backend Systems
- **Live Event System**: Puppeteer scraper, 30s polling, change detection, round tracking
  - Files: `src/services/scrapeLiveEvent.js`, `ufcLiveParser.ts`, `liveEventTracker.ts`
  - API: `POST /api/live-events/start|stop`, `GET /api/live-events/status`
- **Mock Event Testing**: Compressed timescales for rapid testing (90s rounds, presets: default/fast/ultra-fast)
  - Files: `src/services/mockEventGenerator.ts`, `mockLiveSimulator.ts`
  - API: `POST /api/mock-live-events/quick-start|pause|resume|reset`
- **News Scraper**: 6 MMA sources, 5x daily cron (IN PROGRESS - awaiting Docker deployment)

---

## TypeScript Quality (CRITICAL)

**Mandatory .tsx Generic Syntax**: ALWAYS use trailing comma `<T,>` not `<T>` (prevents JSX parse errors)
**Workflow**: Run `pnpm type-check` before major changes and before task completion

## Debugging Protocol (CRITICAL)

**When encountering bugs, ALWAYS follow this approach FIRST:**

1. **Configuration Audit**: `grep -r "USE_PRODUCTION_API\|API_BASE_URL\|DATABASE_URL" packages/`
   - Verify mobile config files match (api.ts, AuthContext.tsx)
   - Check environment variables in Render dashboard

2. **Request Flow Tracing**: Add logging at EVERY step (Mobile → Backend → Database)

3. **Database Verification**: Check for multiple Prisma instances: `grep -r "new PrismaClient()" packages/backend/src`

4. **Evidence-Based Debugging**: Add logs, check Render logs, test with curl - NEVER guess

5. **Common Gotchas**:
   - Multiple auth middleware files?
   - Mismatched `USE_PRODUCTION_API` settings?
   - Multiple `PrismaClient()` instances?
   - Metro cache stale? (restart with `--clear`)

**If 3+ fixes fail without investigation: STOP. Go back to step 1. Audit ALL config files.**

See `CLAUDE-ARCHIVE.md` for detailed debugging examples and procedures.

---

## Important Reminders
- Do exactly what's asked, nothing more
- ALWAYS prefer editing existing files over creating new ones
- NEVER proactively create docs unless requested
- **Update CLAUDE.md first, then commit both code and docs together**
- FOLLOW DEBUGGING PROTOCOL - Don't skip to random fixes
