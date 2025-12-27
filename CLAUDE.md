# CLAUDE.md

FightCrewApp: React Native + Node.js combat sports fight rating app.

**📚 Archive**: See `CLAUDE-ARCHIVE.md` for detailed feature docs, setup guides, troubleshooting, and implementation history.

## Quick Start

**Commands**:
- Root: `pnpm dev|build|test|lint|type-check`
- Backend: `cd packages/backend && PORT=3008 pnpm dev`
- Mobile: `cd packages/mobile && npx expo start --port 8083 --lan`

**Critical Ports**: Backend 3008, Expo 8083, PostgreSQL 5433

## Switching Work Locations (IP Change)

When switching between work locations (different WiFi networks), update the dev IP in **2 files**:

1. **Get your new IP**: `ipconfig | findstr "IPv4"` (use the 192.168.x.x address)

2. **Update these files**:
   - `packages/mobile/services/api.ts` line ~20: `return 'http://<NEW_IP>:3008/api';`
   - `packages/mobile/store/AuthContext.tsx` line ~76: `return 'http://<NEW_IP>:3008/api';`

3. **After changing**: Reload the app (shake device → Reload, or `r` in Metro terminal)

4. **If logout doesn't work**: The old IP in AuthContext causes logout to hang. The fix with AbortController timeout ensures logout completes even if the API call fails.

**Known Work Location IPs**:
| Location | IP Address |
|----------|------------|
| Home | `10.0.0.53` |
| Work | `192.168.1.65` |

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

**Base**: `http://localhost:3008/api` (web) | `http://<YOUR_IP>:3008/api` (mobile - see "Switching Work Locations" above)
**Auth**: `POST register|login|logout|refresh`, `GET profile|verify-email`
**Fights**: `GET /fights`, `GET /fights/:id`, `POST /fights/:id/rate|review|tags|pre-fight-comment`
**Fighters**: `GET /fighters`, `GET /fighters/:id`, `POST /fighters/:id/follow`
**Events**: `GET /events`, `GET /events/:id`
**Crews**: `GET /crews`, `POST /crews|/crews/join`, `GET /crews/:id/messages`
**Notifications**: `POST /register-token`, `GET/PUT /preferences`
**Search**: `GET /search?q=query&limit=10`

## Core Systems (Summary)

| System | Status | Key Files |
|--------|--------|-----------|
| **Notifications** | ✅ Complete | `services/notificationRuleEngine.ts`, `routes/notifications.ts` |
| **Image Storage (R2)** | ✅ Complete | `services/imageStorage.ts` |
| **Live Event Tracker** | ✅ Complete | `services/liveEventTracker.ts`, `services/ufcLiveParser.ts` |
| **Time-Based Fallback** | ✅ Complete | `services/timeBasedFightStatusUpdater.ts`, `config/liveTrackerConfig.ts` |
| **Push Notifications** | ✅ Complete | FCM V1, EAS builds |
| **Pre-Event Scheduler** | ✅ Complete | `services/notificationScheduler.ts` |
| **UFC Scraper** | ✅ Complete | `services/scrapeAllUFCData.js` |
| **ONE FC Scraper** | ✅ Complete | `services/scrapeAllOneFCData.js` |
| **Promotion Logos** | ✅ Complete | `components/PromotionLogo.tsx` |

### Live Event Tracking Strategy

Promotions are handled differently based on whether they have a working live event tracker:

| Promotion | Strategy | How Fights Become Ratable |
|-----------|----------|---------------------------|
| UFC | 🔴 Live Tracker | Individually as each fight completes (real-time scraping) |
| Matchroom | 🔴 Live Tracker | Individually as each fight completes |
| OKTAGON | 🔴 Live Tracker | Individually as each fight completes |
| BKFC, PFL, ONE, etc. | ⏰ Time-Based | All fights in section become complete at section start time |

**Time-Based Fallback Logic:**
- At `earlyPrelimStartTime` → All "Early Prelims" fights marked complete
- At `prelimStartTime` → All "Prelims" fights marked complete
- At `mainStartTime` → All "Main Card" fights marked complete
- If no section times → All fights marked complete at `event.date`

**To promote a new org to live tracking:** Add it to `PROMOTION_TRACKER_CONFIG` in `config/liveTrackerConfig.ts`

## Recent Features (Summary)

| Feature | Status | Branch |
|---------|--------|--------|
| Google Sign-In | ✅ Working | `redesign-fight-card-components` |
| Apple Sign-In | ✅ Code Complete | `redesign-fight-card-components` |
| Email Verification | ✅ Complete | `redesign-fight-card-components` |
| Nested Comments | 🚧 Testing | `feature/nested-comments` |
| Performance Optimizations | ✅ Complete | `condensedevent1` |

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

**See CLAUDE-ARCHIVE.md for detailed troubleshooting, setup guides, and implementation details**

## COLOR REDESIGN PLAN (Branch: color-option2)

**Goal**: Implement semantic color system (Option D hybrid) for clarity

### New Color Scheme

| Category | Color Scale | Hex Range | Purpose |
|----------|-------------|-----------|---------|
| **HYPE** | Orange → Red | Grey → `#F97316` → `#EF4444` → `#B91C1C` | Warm, energetic excitement |
| **RATINGS** | Blue → Purple | Grey → `#3B82F6` → `#8B5CF6` → `#C026D3` | Cool, analytical judgment |
| **User ownership** | Gold border/badge | `#F5C518` | "This is yours" indicator |
| **Winners/Success** | Green | `#10b981` | Positive outcomes |
| **Community data** | Gray | `#808080` | Baseline/aggregate info |

### Files to Update

1. **`packages/mobile/utils/heatmap.ts`** - Create separate `getHypeHeatmapColor()` and `getRatingHeatmapColor()` functions with different color stops
2. **`packages/mobile/constants/Colors.ts`** - Add semantic color constants
3. **`packages/mobile/components/HypeDistributionChart.tsx`** - Already uses `getHypeHeatmapColor` (will auto-update)
4. **`packages/mobile/components/RatingDistributionChart.tsx`** - Change from `getHypeHeatmapColor` to `getRatingHeatmapColor`
5. **Fight card components** - Apply gold borders for user items

### New heatmap.ts Color Stops

**Hype (Orange→Red):**
```
score 1.0: rgb(128, 128, 128)  // Grey
score 3.0: rgb(180, 120, 80)   // Muted orange-brown
score 5.0: rgb(230, 130, 60)   // Orange
score 7.0: rgb(249, 115, 22)   // Bright orange #F97316
score 8.0: rgb(239, 68, 68)    // Red-orange #EF4444
score 9.0: rgb(220, 38, 38)    // Red #DC2626
score 10.0: rgb(185, 28, 28)   // Deep red #B91C1C
```

**Ratings (Blue→Purple):**
```
score 1.0: rgb(128, 128, 128)  // Grey
score 3.0: rgb(100, 130, 180)  // Muted blue
score 5.0: rgb(59, 130, 246)   // Blue #3B82F6
score 7.0: rgb(99, 102, 241)   // Indigo #6366F1
score 8.0: rgb(139, 92, 246)   // Violet #8B5CF6
score 9.0: rgb(168, 85, 247)   // Purple #A855F7
score 10.0: rgb(192, 38, 211)  // Magenta-purple #C026D3
```

### New Exports to Add to heatmap.ts

- `getRatingHeatmapColor(score)` - Blue→Purple scale for ratings
- `getRatingColorFromScore(score, bgColor)` - Mixed rating color for icons
