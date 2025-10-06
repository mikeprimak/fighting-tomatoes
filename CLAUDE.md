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
- Navigation: Expo Router v6.0.7, Stack-inside-Tabs pattern, 5 tabs (crews/events/fights/fighters/profile)
- Auth: React Context (`store/AuthContext.tsx`), JWT dual-token, SecureStore
- State: React Query v4.32.6 (5min stale, 2 retries), AsyncStorage
- Theme: Light/dark auto-detect, primary red (#dc2626/#ef4444), `constants/Colors.ts`

## Key Files

**Backend**: `src/app.ts`, `src/server.ts` (PORT env), `prisma/schema.prisma`, `src/routes/fights.ts` (primary CRUD), `src/routes/auth.ts`, `src/middleware/`
**Mobile**: `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index|fights|profile.tsx`, `app/(tabs)/events/_layout.tsx|index.tsx|[id].tsx`, `app/(tabs)/fighters/_layout.tsx|index.tsx|[id].tsx`, `app/(auth)/login|register.tsx`, `app/crew/[id].tsx`, `app/crew/info/[id].tsx`, `store/AuthContext.tsx`, `services/api.ts`, `components/FightDisplayCard|FighterCard|EventCard|RateFightModal|TabBar|CustomAlert.tsx`, `hooks/useCustomAlert.tsx`, `constants/Colors.ts`, `CUSTOM_ALERTS.md`
**Shared**: `src/types/`, `src/utils/`

## API Endpoints

**Base**: Web `http://localhost:3008/api`, Mobile `http://10.0.0.53:3008/api`
**Auth** (`/api/auth/`): `POST register|login|logout|refresh|request-password-reset|reset-password`, `GET profile|verify-email`
**Fights** (`/api/fights/`): `GET /fights` (params: page, limit, eventId, fighterId, weightClass, isTitle, hasStarted, isComplete, minRating, sortBy, sortOrder, **includeUserData**), `GET /fights/:id|search`, `POST /fights/:id/rate|review|tags`, `PUT /fights/:id/review`, `DELETE /fights/:id/rate|rating`, `GET /fights/:id/tags`
**Fighters** (`/api/fighters/`): `GET /fighters` (page, limit=20), `GET /fighters/:id`
**Events** (`/api/events/`): `GET /events` (page, limit), `GET /events/:id`
**Crews** (`/api/crews/`): `GET /crews`, `POST /crews|/crews/join`, `GET /crews/:id|/crews/:id/messages`, `POST /crews/:id/messages`, `DELETE /crews/:id|/crews/:id/messages/:messageId|/crews/:crewId/members/:memberId` (owner only)
**Notifications** (`/api/notifications/`): `POST /register-token`, `DELETE /register-token`, `GET /preferences`, `PUT /preferences`, `POST /test`
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

**Custom Alert System**:
- **Reusable Components**: `CustomAlert.tsx` (5 types: success/error/info/warning/confirm), `useCustomAlert.tsx` hook
- **App-wide Migration**: Replaced all 30 `Alert.alert` usages across 7 files with styled modals matching app theme
- **Auto-dismiss**: Success (1.5s), error (2.5s), info (2s); confirmations require user action
- **Features**: Theme-aware, dark/light mode, icons (checkmark/X/info/warning/question), destructive actions (red text)
- **Usage**: `showSuccess()`, `showError()`, `showInfo()`, `showConfirm()` - see `packages/mobile/CUSTOM_ALERTS.md`
- **Files**: `components/CustomAlert.tsx`, `hooks/useCustomAlert.tsx`, `CUSTOM_ALERTS.md` (guide)

**Stack-inside-Tabs Navigation**:
- **Architecture**: Implemented industry-standard Stack-inside-Tabs pattern for consistent navigation
- **Tab Stacks**: Events and Fighters tabs now contain stack navigators with index and detail screens
- **Folder Structure**:
  - `app/(tabs)/events/` → `_layout.tsx` (Stack), `index.tsx` (Events list), `[id].tsx` (Event detail)
  - `app/(tabs)/fighters/` → `_layout.tsx` (Stack), `index.tsx` (Fighters list), `[id].tsx` (Fighter detail)
- **Native Tab Bar**: Persistent native tab bar on ALL screens (list and detail pages) with identical styling
- **Smart Highlighting**: Tab only highlights when on index page, not detail pages (Events/Fighters tabs inactive on detail screens)
- **Tab Press Behavior**: Tapping active tab navigates to index (standard iOS/Android pattern) - always returns to list
- **Route Cleanup**: Removed old `app/event/` and `app/fighter/` folders, updated all navigation calls
- **Component Updates**: EventCard and FighterCard now route to `/(tabs)/events/[id]` and `/(tabs)/fighters/[id]`
- **Benefits**: 100% consistent tab bar, proper navigation stack per tab, better UX alignment with platform conventions

**Contact Invitations**:
- **WhatsApp-style UX**: Select multiple contacts, send SMS invites with crew invite code
- **Components**: `app/crew/invite-contacts.tsx` with contact selection UI
- **Native Integration**: Uses `expo-contacts` for contact access, `expo-sms` for SMS sending
- **Selection Flow**: Checkbox selection → floating count banner → SMS composer with pre-filled message
- **Message Template**: "Join my crew '[Crew Name]' on FightCrewApp! Use invite code: [CODE] [App URL]"

**Push Notifications** (Latest):
- **Backend**:
  - **Database Schema**: 9 notification preference fields in User model (notificationsEnabled, notifyEventStart, notifyFightStart, notifyMainCardOnly, notifyUFCOnly, notifyCrewMessages, notifyCrewInvites, notifyRoundChanges, notifyFightResults)
  - **Notification Service** (`src/services/notificationService.ts`): Expo server SDK integration, batch sending (100/chunk), user filtering by preferences
  - **API Routes** (`src/routes/notifications.ts`): `POST /register-token`, `GET/PUT /preferences`, `POST /test`
  - **Functions**: notifyEventStart, notifyFightStart, notifyRoundChange, notifyFightResult, notifyCrewMessage
- **Mobile**:
  - **Notification Service** (`services/notificationService.ts`): Permission handling, token registration, foreground/background listeners
  - **Settings Screen** (`app/settings.tsx`): Master toggle, 3 sections (Events, Fights, Crews), optimistic UI updates, test notification button
  - **AuthContext Integration**: Auto-register push token on login/register/app launch, notification tap deep linking
  - **Deep Linking**: Handles eventId, fightId, crewId, generic screen navigation from notification data
- **Files**: Backend: `routes/notifications.ts`, `services/notificationService.ts`; Mobile: `app/settings.tsx`, `services/notificationService.ts`, `store/AuthContext.tsx`

## Live Event System

**Goal**: Real-time fight engagement system with automated notifications and modal triggers during live UFC events.

**Phase 1 - Backend Foundation (COMPLETED)**:
- ✅ **Database Schema** - Added `currentRound` (Int?) and `completedRounds` (Int?) to Fight model
- ✅ **Live Event Scraper** (`src/services/scrapeLiveEvent.js`)
  - Puppeteer-based scraper accepts eventUrl and outputDir as CLI arguments
  - Extracts event name, image, fight card (14 fights for UFC 320)
  - Detects event status (hasStarted, isComplete) and fight status
  - Detects current round, completed rounds, and fight results (winner/method/round/time)
  - Saves timestamped JSON snapshots every scrape
- ✅ **Live Data Parser** (`src/services/ufcLiveParser.ts`)
  - Fuzzy event/fighter matching by name (handles "UFC 320" vs "UFC 320: Ankalaev vs Pereira")
  - Change detection - only updates database when changes occur
  - Tracks round progression and fight results
  - Auto-completes events when all fights finish
  - Detailed status logging for monitoring
- ✅ **Live Event Tracker** (`src/services/liveEventTracker.ts`)
  - Orchestrates scraping on 30-second intervals (configurable)
  - Converts scraped data to parser format
  - Updates database with detected changes
  - Tracks scraping status, errors, total scrapes
  - Graceful shutdown handling (SIGINT/SIGTERM)
- ✅ **API Endpoints** (`src/routes/liveEvents.ts`)
  - `POST /api/live-events/start` - Start tracking (eventUrl, eventName, intervalSeconds)
  - `POST /api/live-events/stop` - Stop active tracking
  - `GET /api/live-events/status` - Get current tracker status
  - `GET /api/live-events/event-status/:eventName` - Get detailed event info
  - `POST /api/live-events/quick-start-ufc320` - Quick start for UFC 320
- ✅ **Tested on UFC 320** - Successfully scraped all 14 fights with correct data

**Phase 2 - Mobile & Notifications (PENDING)**:
- **Live Event Context**: Global state for current event, fight, round
- **Event Subscription Service**: WebSocket client, reconnection logic
- **Modal Trigger System**: Shows modals based on event type and timing
- **Push Notification Handler**: Foreground/background notification processing
- **Live Fight UI Components**: Round indicator badge, fight status banner, real-time countdown timers

**Usage** (Start tracking before UFC 320):
```bash
# Quick start for UFC 320
curl -X POST http://localhost:3001/api/live-events/quick-start-ufc320

# Or generic endpoint
curl -X POST http://localhost:3001/api/live-events/start \
  -H "Content-Type: application/json" \
  -d '{"eventUrl": "https://www.ufc.com/event/ufc-320", "eventName": "UFC 320", "intervalSeconds": 30}'

# Check status
curl http://localhost:3001/api/live-events/status

# Stop tracking
curl -X POST http://localhost:3001/api/live-events/stop
```

**Data Flow**:
```
UFC.com → scrapeLiveEvent.js (Puppeteer, 30s polling)
       → JSON snapshots (live-event-data/)
       → ufcLiveParser.ts (change detection)
       → Database (Event/Fight updates)
       → [Future: WebSocket → Mobile App]
```

**Files**:
- Backend: `src/services/scrapeLiveEvent.js`, `src/services/ufcLiveParser.ts`, `src/services/liveEventTracker.ts`, `src/routes/liveEvents.ts`
- Data: `live-event-data/` (timestamped JSON snapshots)
- Schema: `prisma/schema.prisma` (Fight.currentRound, Fight.completedRounds)

## Mock Live Event Testing System

**Goal**: Simulate real-time UFC events with compressed timescales for rapid testing of live event workflows without waiting for actual events.

**Architecture**:
- **Mock Event Generator** (`src/services/mockEventGenerator.ts`): Creates fake UFC events with 1-20 fights, realistic fighter data
- **Mock Outcome Generator** (`src/services/mockOutcomeGenerator.ts`): Generates realistic fight outcomes (KO/TKO/Sub/Decision) with weighted round selection
- **Mock Live Simulator** (`src/services/mockLiveSimulator.ts`): State machine that simulates event progression (rounds, fights, outcomes) with configurable timescales
- **API Routes** (`src/routes/mockLiveEvents.ts`): REST endpoints for controlling simulations

**Default Timescales** (compressed for testing):
- **Round Duration**: 90 seconds (vs real 5 minutes)
- **Between Rounds**: 60 seconds (vs real 60 seconds)
- **Between Fights**: 120 seconds / 2 minutes (vs real 5-10 minutes)
- **Event Duration**: ~96 minutes for 10-fight card (vs real 3-4 hours)

**Presets**:
- `default`: 90s rounds, 60s breaks, 120s between fights (~1.6 hours for 10 fights)
- `fast`: 45s rounds, 30s breaks, 60s between fights (~48 minutes)
- `ultra-fast`: 20s rounds, 10s breaks, 30s between fights (~20 minutes)

**API Endpoints** (Base: `/api/mock-live-events/`):
```bash
POST /generate            # Create mock event (fightCount, eventName, includeTitle)
POST /start               # Start simulation (eventId, timeScale, autoGenerateOutcomes)
POST /pause               # Pause active simulation
POST /resume              # Resume paused simulation
POST /skip-to-next        # Skip to next state (debugging)
POST /stop                # Stop simulation
GET  /status              # Get current status (state, progress, next transition)
POST /reset               # Reset event to initial state (clearUserData options)
POST /quick-start         # One-click: generate + start (preset: default|fast|ultra-fast)
DELETE /events/:eventId   # Delete mock event
```

**State Machine Flow**:
```
EVENT_PENDING → EVENT_STARTED → FIGHT_STARTING → FIGHT_IN_PROGRESS (Round 1)
→ ROUND_END → FIGHT_IN_PROGRESS (Round 2) → ... → FIGHT_COMPLETE
→ BETWEEN_FIGHTS → FIGHT_STARTING → ... → EVENT_COMPLETE
```

**Reset Options**:
- `clearUserData`: Wipe all user engagement (predictions, ratings, reviews, round scores)
- `clearPredictions`: Only clear predictions (test prediction flow multiple times)
- `clearRatings`: Only clear ratings (test rating flow)
- `clearRoundScores`: Only clear round scoring
- `clearReviews`: Only clear reviews

**Usage Example**:
```bash
# Quick start with default timescale
curl -X POST http://localhost:3001/api/mock-live-events/quick-start

# Returns: { eventId, eventName, fightCount, simulation: {...} }

# Check status
curl http://localhost:3001/api/mock-live-events/status

# Pause for testing
curl -X POST http://localhost:3001/api/mock-live-events/pause

# Resume
curl -X POST http://localhost:3001/api/mock-live-events/resume

# Reset event (keep predictions, clear ratings)
curl -X POST http://localhost:3001/api/mock-live-events/reset \
  -H "Content-Type: application/json" \
  -d '{"eventId": "abc-123", "clearRatings": true}'

# Restart from beginning
curl -X POST http://localhost:3001/api/mock-live-events/start \
  -H "Content-Type: application/json" \
  -d '{"eventId": "abc-123"}'
```

**Database Updates** (same as real tracker):
- `Event.hasStarted`, `Event.isComplete`
- `Fight.hasStarted`, `Fight.currentRound`, `Fight.completedRounds`, `Fight.isComplete`
- `Fight.winner`, `Fight.method`, `Fight.round`, `Fight.time`

**Mobile App Integration**:
- No changes required - polls `/api/events/{id}` and `/api/fights/{id}` as usual
- React Query detects database changes automatically
- Optional: Dev mode banner showing "🧪 Mock Event Active"

**Files**:
- Backend: `src/services/mockEventGenerator.ts`, `src/services/mockOutcomeGenerator.ts`, `src/services/mockLiveSimulator.ts`, `src/routes/mockLiveEvents.ts`
- Shared: `packages/shared/src/types/mockEvent.ts`
- Routes: Registered in `src/routes/index.ts` under `/api/mock-live-events`

**Easy Removal** (when no longer needed):
1. Delete 4 files: `src/services/mockEventGenerator.ts`, `src/services/mockOutcomeGenerator.ts`, `src/services/mockLiveSimulator.ts`, `src/routes/mockLiveEvents.ts`
2. Delete shared types: `packages/shared/src/types/mockEvent.ts`
3. Remove from `packages/shared/src/types/index.ts`: `export * from './mockEvent';`
4. Remove from `src/routes/index.ts`:
   - Import: `import mockLiveEventsRoutes from './mockLiveEvents';`
   - Registration block (lines ~531-534)
5. No database changes required (uses existing schema)

## Engagement Strategies (Future Implementation)

**Goal**: Balance discoverability of key features (predictions, ratings, round scoring, hype scores) with non-intrusive UX.

**Notification Tiers** (User Settings):
- **Minimal**: Badges only, no auto-modals/sounds
- **Moderate** (DEFAULT): Context-aware modals, push for main events, subtle indicators
- **Engaged**: Auto-modals, sounds, all notifications enabled

**Pre-Fight Predictions** (Fighter pick, method, round, hype score):
- **Timing**: 24-48hrs before event → gentle in-app banner; 15min before → push notification (if enabled)
- **Modal Trigger**: Auto-show ONLY when user opens fight detail within 2hrs of start time
- **Sound**: NO sound, just haptic feedback
- **Indicator**: Pulse animation on "Predict" button (blue 🔮 badge) on FightDisplayCard

**Round Scoring** ("Who won that round?"):
- **Timing**: Between rounds (~60sec UFC breaks)
- **Modal Trigger**: Auto-show ONLY if user is viewing fight detail page when round ends
- **Otherwise**: Persistent badge "Score Round 1" on FightDisplayCard (dismissable, red 🥊 badge)
- **Sound**: Subtle chime (default OFF, opt-in in settings)
- **Batch Option**: "Score all 5 rounds for this fight" (single modal, multiple inputs)

**Post-Fight Rating** (1-10 stars, review, tags):
- **Timing**: Immediately after fight ends
- **Modal Trigger**: Auto-show ONLY if user viewing that fight when it ends
- **Otherwise**: Gold star badge (⭐) with sparkle animation on FightDisplayCard showing "Rate this fight"
- **Sound**: Victory chime (opt-in only)
- **Batch Prompt**: "You rated 8/12 fights on this card - rate the rest?"

**Context-Aware Logic**:
```
User on Events tab → gentle in-app banner at top
User on specific Fight detail → auto-show modal
User elsewhere → push notification + persistent badge on cards
```

**Visual Indicators** (Non-Intrusive):
- Color-coded badges on FightDisplayCard: 🔮 Predict (blue), ⭐ Rate (gold), 🥊 Score Rounds (red)
- Sparkle animation when action available (already implemented)
- Progress tracking on Event cards: "You've engaged with 5/12 fights"
- Show crew engagement: "8 crew members predicted this fight"

**Progressive Disclosure**:
- First-time users: Onboarding explaining features
- Badge indicators persist until action taken (like unread messages)
- Long-press or swipe on fight cards for "Quick actions" menu

**Community FOMO**:
- Show aggregate hype scores: "Community hype: 8.5/10"
- Display crew prediction counts to encourage participation

**Implementation Priority** (When Ready):
1. Badge system on FightDisplayCard (3 action types)
2. Context-aware modal trigger service
3. Notification preference tiers in settings
4. Smart timing service (fight start detection, round breaks)
5. Batch engagement prompts

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

