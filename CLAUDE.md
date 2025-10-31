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
**Fights**: `GET /fights` (includeUserData param), `GET /fights/:id`, `POST /fights/:id/rate|review|tags`
**Fighters**: `GET /fighters` (page, limit=20), `GET /fighters/:id`
**Events**: `GET /events`, `GET /events/:id`
**Crews**: `GET /crews`, `POST /crews|/crews/join`, `GET /crews/:id/messages`, `DELETE /crews/:id`
**Notifications**: `POST /register-token`, `GET/PUT /preferences`
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

### Performance Optimizations (Latest)
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
