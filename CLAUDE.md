# CLAUDE.md

FightCrewApp: React Native + Node.js combat sports fight rating app.

**📚 Archive**: See `CLAUDE-ARCHIVE.md` for detailed setup guides, troubleshooting, and feature implementation details.

## Quick Start

**Commands**:
- Root: `pnpm dev|build|test|lint|type-check`
- Backend: `cd packages/backend && PORT=3008 pnpm dev`
- Mobile: `cd packages/mobile && npx expo start --port 8083 --lan`

**Critical Ports**: Backend 3008, Expo 8083, PostgreSQL 5433, Mobile API `http://10.0.0.53:3008/api`

## Stack

**Monorepo**: backend (Fastify, Prisma, PostgreSQL), mobile (React Native Expo, Expo Router, React Query)
**Database**: 20+ tables, UUID v4 keys, JWT dual-token (15min/7day)
**Mobile**: iOS/Android/Web, Stack-inside-Tabs pattern

## API Endpoints

**Base**: `http://localhost:3008/api` (web) | `http://10.0.0.53:3008/api` (mobile)
**Auth**: `POST register|login|logout|refresh`, `GET profile|verify-email`
**Fights**: `GET /fights`, `GET /fights/:id`, `POST /fights/:id/rate|review|tags|pre-fight-comment`
**Fighters**: `GET /fighters`, `GET /fighters/:id`, `POST /fighters/:id/follow`
**Events**: `GET /events`, `GET /events/:id`
**Crews**: `GET /crews`, `POST /crews|/crews/join`, `GET /crews/:id/messages`
**Notifications**: `POST /register-token`, `GET/PUT /preferences`
**Search**: `GET /search?q=query&limit=10`

## Core Systems

### Notification System (Rule-Based)
**Status**: ✅ Complete - Unified system for all fight notifications

**Architecture**:
- `UserNotificationRule`: Stores rules with JSON conditions, priority, timing
- `FightNotificationMatch`: Caches fight-rule matches, allows per-fight overrides
- Rule Engine (`notificationRuleEngine.ts`): Evaluates fights against conditions

**Three Notification Types**:
1. **Manual Fight Follows**: User follows specific fight → 15min before notification
2. **Fighter Follows**: User follows fighter → notified for all their fights
3. **Hyped Fights**: User opts into high-hype fights (≥8.5 hype score)

**Key Files**: `services/notificationRuleEngine.ts`, `services/notificationRuleHelpers.ts`, `routes/notifications.ts`

### Image Storage (Cloudflare R2)
**Status**: ✅ Complete - Free CDN storage for all images

**Implementation**:
- R2 bucket: `fightcrewapp-images` (fighters/, events/, news/)
- Daily scraper auto-uploads images, fallback to UFC.com URLs
- SEO-friendly filenames with collision prevention
- Free tier: 10GB storage, 1M reads/month, unlimited egress

**Key Files**: `services/imageStorage.ts`, `services/ufcDataParser.ts`

### Live Event Tracker
**Status**: ✅ Complete - Real-time fight tracking with daily scraper parity

**Features**:
- Shared utilities: parseFighterName, mapWeightClass, inferGenderFromWeightClass
- Upsert pattern prevents duplicates, preserves existing data
- Dynamic fight card changes: new fights, cancellations, replacements
- 30s polling during active events

**Key Files**: `services/ufcLiveParser.ts`, `services/liveEventTracker.ts`, `services/scrapeLiveEvent.js`

### Push Notifications (FCM V1)
**Status**: ✅ Complete - Working in EAS development builds

**Setup Summary**:
- Firebase project: `fight-app-ba5cd`
- Bare workflow: google-services.json in `android/app/`
- EAS credentials uploaded per build profile (development/production)
- Deep linking support for fight/event notifications

**Files**: `android/app/build.gradle`, `android/build.gradle`, `routes/notifications.ts`

## Recent Features

### Search (Nov 2025)
- Global search: fighters, fights, events, promotions
- Multi-word matching: "Jon Jones", "Jon UFC"
- Event sorting: upcoming first, then past (most recent)
- Dedicated `/search-results` screen with reusable components

### Pre-Fight Comments (Nov 2025)
- Users comment on upcoming fights (max 500 chars)
- Upsert pattern: one comment per user per fight
- API: `POST /api/fights/:id/pre-fight-comment`, `GET /api/fights/:id/pre-fight-comments`

### Performance Optimizations (Nov 2025)
- Combined stats API calls using `Promise.all`
- 50% fewer requests: 160→80 on lists, 2→1 on details

### UI Improvements (Nov 2025)
- Fighter cards: replaced W-L-D with avg rating
- Fight cards: heatmap squares, yellow underline for predictions
- Navigation: Stack-inside-Tabs, root-level event route
- Custom alerts: styled modals with auto-dismiss

## Development Guidelines

### TypeScript
- **Generic syntax in .tsx**: Use trailing comma `<T,>` not `<T>`
- **Type-check**: Run `pnpm type-check` before major changes

### Debugging Protocol
1. **Config audit**: Check `USE_PRODUCTION_API`, `API_BASE_URL`, `DATABASE_URL`
2. **Add logging**: Mobile → Backend → Database
3. **Verify DB**: Check for multiple `PrismaClient()` instances
4. **Evidence-based**: Test with curl, check Render logs - don't guess
5. **Common issues**: Multiple auth middleware, mismatched API settings, stale Metro cache

**Rule**: If 3+ fixes fail → STOP → Audit all config files

### Code Quality
- **Comments required**: Function headers, complex logic (WHY not WHAT), section markers
- **Commit process**: Update CLAUDE.md first, commit code + docs together
- **File operations**: Prefer editing existing files over creating new ones

**See CLAUDE-ARCHIVE.md for detailed troubleshooting and setup guides**
