# CLAUDE.md

FightCrewApp: React Native + Node.js combat sports fight rating app.

**📚 Archive**: See `CLAUDE-ARCHIVE.md` for detailed setup guides, troubleshooting, and feature implementation details.

## Quick Start

**Commands**:
- Root: `pnpm dev|build|test|lint|type-check`
- Backend: `cd packages/backend && PORT=3008 pnpm dev`
- Mobile: `cd packages/mobile && npx expo start --port 8083 --lan`

**Critical Ports**: Backend 3008, Expo 8083, PostgreSQL 5433, Mobile API `http://10.0.0.53:3008/api`

**⚠️ STARTUP DEBUGGING CHECKLIST (Check FIRST)**:
1. **Network connectivity**: Ensure phone and computer are on the SAME WiFi network
2. **Zombie processes**: Check for stale Node processes blocking ports
3. **Firewall**: Windows Firewall may block Metro port 8083

**Killing Zombie Processes (Windows)**:
1. List all Node processes: `powershell -Command "Get-Process node | Select-Object Id, ProcessName, StartTime"`
2. Check port usage: `netstat -ano | findstr ":3008"` (backend) or `findstr ":8083"` (Expo)
3. Identify blocker: `powershell -Command "Get-CimInstance Win32_Process -Filter 'ProcessId = <PID>' | Select-Object CommandLine"`
4. Kill zombie (may need admin): `powershell -Command "Stop-Process -Id <PID> -Force"`
5. **IMPORTANT**: Verify it's a Node.js process before killing - DO NOT kill Claude Code (PID shown in process list)

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

### Automated Pre-Event Notification Scheduler
**Status**: ✅ Complete - Hourly cron job with deduplication tracking

**How It Works**:
1. **Hourly Check**: Cron job runs every hour at :00 minutes (e.g., 1:00, 2:00, 3:00)
2. **Time Window**: Looks for events starting between 5-6 hours from current time
3. **Deduplication**: Checks `SentPreEventNotification` table to prevent re-sending
4. **Send Reports**: For each qualifying event (not already sent):
   - Finds all users with active "Pre-Event Report" notification rules
   - Generates personalized report (hyped fights + followed fighters)
   - Sends push notification with deep link to events screen
   - Records send in database to prevent duplicates
5. **Lifecycle**: Initializes on server startup, stops gracefully on shutdown

**Database Schema**:
- `SentPreEventNotification`: Tracks sent notifications
  - `id` (UUID), `eventId` (unique), `sentAt` (timestamp)
  - Foreign key cascade: deletes when parent event is removed
  - Migration: `20251117000000_add_sent_pre_event_notifications`

**Key Implementation Details**:
- **Cron Pattern**: `'0 * * * *'` = At minute 0 of every hour
- **5-6 Hour Window**: Events between 5-6 hours qualify (ensures one send per event)
- **Deduplication**: `prisma.sentPreEventNotification.findUnique({ where: { eventId } })`
- **Recording Sends**: Only records if `result.sent > 0` (at least one notification sent)
- **Log Messages**:
  - Startup: `[Notification Scheduler] Initialized - will check for pre-event reports every hour`
  - Hourly: `[Pre-Event Report] Checking for events starting between [time1] and [time2]`
  - Skip: `[Pre-Event Report] Already sent notifications for event: [name], skipping`

**Key Files**:
- `services/notificationScheduler.ts`: Cron job management, initialization/shutdown
- `services/preEventReportService.ts:242-291`: `checkAndSendPreEventReports()` function
- `server.ts:246`: Scheduler initialization on startup
- `server.ts:46`: Scheduler shutdown on SIGTERM/SIGINT
- `prisma/schema.prisma:1152-1164`: SentPreEventNotification model

**Dependencies**: `node-cron` (^3.0.3), `@types/node-cron` (^3.0.11)

**Manual Testing**:
```javascript
// In server.ts or via API endpoint:
import { manualCheckPreEventReports } from './services/notificationScheduler';
await manualCheckPreEventReports();
```

**Monitoring**:
- Check server logs for hourly execution messages
- Query database: `SELECT * FROM sent_pre_event_notifications ORDER BY "sentAt" DESC;`
- Verify no duplicates: Each eventId should appear only once

## Data Scrapers

### UFC Scraper
**Status**: ✅ Complete - Daily automated scraper
**File**: `services/scrapeAllUFCData.js`

**Features**:
- Scrapes `ufc.com/events` for upcoming events
- Extracts fight cards with fighter details (names, ranks, countries, odds)
- Downloads event banners and fighter headshots
- Saves to `scraped-data/` (events, athletes JSON)
- Images stored in `public/images/events/` and `public/images/athletes/`

**Data Extracted**:
- Events: name, date, venue, location, banner image
- Fights: weight class, title status, card type (Main/Prelims/Early), start times
- Fighters: names, records, ranks, countries, headshot URLs, athlete page URLs

**Automation**: Runs daily at 12pm EST via cron job

### ONE FC Scraper
**Status**: ✅ Complete - Manual/automated scraper
**File**: `services/scrapeAllOneFCData.js`

**Features**:
- Scrapes `onefc.com/events` for upcoming events
- Extracts fight cards from event detail pages
- Downloads athlete images and event banners
- Saves to `scraped-data/onefc/` (events, athletes JSON)
- Images stored in `public/images/events/onefc/` and `public/images/athletes/onefc/`

**Data Extracted**:
- Events: name, date/timestamp, venue, city, country, banner image
- Fights: weight class, discipline (MMA/Muay Thai/Kickboxing/Grappling), championship status
- Fighters: names, records (W-L-D), profile images, athlete page URLs

**Key Differences from UFC**:
- Event selectors: `.simple-post-card.is-event` (vs `.l-listing__item`)
- Fight structure: `.event-matchup` with `.versus` text format
- No prelims split: All fights on "Main Card"
- Weight class includes discipline: "Bantamweight MMA", "Featherweight Muay Thai"
- Timestamp-based dates: Unix timestamps provided directly

**Usage**:
```bash
# Manual run
cd packages/backend && node src/services/scrapeAllOneFCData.js

# Automated mode (faster)
SCRAPER_MODE=automated node src/services/scrapeAllOneFCData.js
```

**Output Structure**:
- `scraped-data/onefc/events-{timestamp}.json`
- `scraped-data/onefc/athletes-{timestamp}.json`
- `scraped-data/onefc/latest-events.json` (always current)
- `scraped-data/onefc/latest-athletes.json` (always current)

**Test Results**: Successfully scraped 8 events, 10 fights, 20 athletes in 115s

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
