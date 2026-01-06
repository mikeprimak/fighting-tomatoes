# CLAUDE.md

FightCrewApp: React Native + Node.js combat sports fight rating app.

**📚 Archive**: See `CLAUDE-ARCHIVE.md` for detailed feature docs, setup guides, troubleshooting, and implementation history.

## Quick Start

**Commands**:
- Root: `pnpm dev|build|test|lint|type-check`
- Backend: `cd packages/backend && PORT=3008 pnpm dev`
- Mobile: `cd packages/mobile && npx expo start --port 8083 --lan`

**Critical Ports**: Backend 3008, Expo 8083, PostgreSQL 5433

## Installing Test Builds

**Android (EAS Build)**:
- JavaScript-only changes: Automatic via OTA updates when backend deploys
- Native changes (splash screen, app.json config, new native modules): Requires new APK install
  1. Go to https://expo.dev/accounts/mikeprimak/projects/fightcrewapp/builds
  2. Find latest Android build, scan QR code or download APK directly
  3. Install on device (may need to allow "Install from unknown sources")

**iOS (TestFlight)**:
- Requires `eas build --platform ios` then `eas submit --platform ios`
- Wait for Apple processing (~5-10 min), then update via TestFlight app

## 🚀 LAUNCH PREP TESTING (2026-01-04)

**Status**: Android testing in progress - Parts A & B complete

### ✅ Completed Tests (2026-01-04)
**PART A: Authentication & Onboarding** - ALL PASSED
- A1. New User Registration
- A2. Legacy User Claim Flow (email + Google Sign-In)
- A3. Google Sign-In
- A4. Password Reset
- A5. Logout

**PART B: Browsing & Navigation** - ALL PASSED
- B1-B5 all working

### 🔧 Fixes Applied (2026-01-04/05)
1. **Missing `pre_fight_comment_votes` table** - Created in production DB
2. **`totalRatings`/`totalReviews` out of sync** - Ran UPDATE for all 1937 migrated users
3. **Crowd Ratings not updating** - Backend now returns `aggregateStats` in PUT /user-data response (best practice pattern)
4. **ratingDistribution format** - Converted `{ratings1: x}` to `{1: x}` to match GET /aggregate-stats format
5. **reset-password.html** - Removed app store buttons
6. **Event names missing promotion prefix** - "200" → "UFC 200" for 981 events (both local + production)
7. **Relative banner image paths** - UFC 300, UFC 301, ONE Fight Night 38 banners now have full URLs

### 📋 Next Session - Continue Testing
- [ ] **C1. Rate a Fight** - verify crowd ratings + distribution chart update (fix deployed, needs testing)
- [ ] C2. Write a Review
- [ ] C3. Add Tags
- [ ] C4. Add Hype (Upcoming Fight)
- [ ] C5. Add Pre-Fight Comment
- [ ] Parts D, E, F, G, H

### 📝 Session Notes
- Current work IP: `10.0.0.53` (home)
- Mobile configured with `USE_PRODUCTION_FOR_TESTING = true`
- Test accounts: `avocadomike@hotmail.com` (1234 ratings, 72 reviews), `michaelsprimak@gmail.com`

---

## 🚧 WIP: CompletedFightDetailScreen Tags (Branch: upcomingfightdetailscreen-v3)

**Status**: Partially fixed, needs testing

**Issues being fixed:**
1. Tags showing "invalid request data" error when toggling
2. Tags not showing counters correctly
3. Tag order was randomizing on each render

**Changes made (2025-01-03):**
- Added `tagIdsToNames()` helper - converts frontend tag IDs (e.g., 'foty') to API names (e.g., 'FOTY')
- Simplified tag display logic from 70+ lines to ~15 lines
- Removed complex refs (`frozenTagsRef`, `lastNegativeStateRef`, `hadCommunityTagsRef`)
- Removed `shuffleArray` - tags now have deterministic order
- Added `tagCounts` state for optimistic count updates (+1/-1 deltas)
- Better error logging in mutation `onError` to show Zod validation details

**Still needs:**
- Test if "invalid request data" error is fixed
- Verify tag counts update correctly (up when selecting, down when deselecting)
- May need debounce to prevent rate limit errors on rapid tapping

**Key files:**
- `packages/mobile/components/CompletedFightDetailScreen.tsx` - tag logic around lines 520-535, 1201-1225
- `packages/backend/src/routes/fights.ts` - PUT `/fights/:id/user-data` endpoint, `UpdateUserDataSchema` at line 80

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

### Fight-Specific Notifications

Fight-specific notifications (notify when a specific fight starts) are **only available for orgs with live tracking**. This is because we can only know when a fight starts in real-time for orgs we actively scrape.

| Notification Type | Availability | Notes |
|-------------------|--------------|-------|
| Manual fight follow | Live orgs only | Bell icon + menu toggle |
| Fighter follow | Hidden | Re-enable when more orgs have live tracking |
| Hyped fights (8.5+) | Hidden | Re-enable when more orgs have live tracking |
| Hype Fights Report | All orgs | Before events, shows most hyped fights |

**How it works:**
- Backend adds `hasLiveTracking: boolean` to event objects in API responses
- UI conditionally shows notification controls based on this flag
- Hidden features use `false &&` pattern for easy re-enablement

**Files with hidden features (search for `false &&`):**
- `fighter/[id].tsx` - "Notify Me" button
- `settings.tsx` - Fighter Notifications section
- `settings.tsx` - Hyped Fights section

**Files with conditional display:**
- `fight/[id].tsx` - Bell icon in header (shows only if `hasLiveTracking`)
- `FightDetailsMenu.tsx` - Notification toggle section (shows only if `hasLiveTracking`)

## Recent Features (Summary)

| Feature | Status | Branch |
|---------|--------|--------|
| Google Sign-In | ✅ Working | `redesign-fight-card-components` |
| Apple Sign-In | ✅ Code Complete | `redesign-fight-card-components` |
| Email Verification | ✅ Complete | `redesign-fight-card-components` |
| Nested Comments | 🚧 Testing | `feature/nested-comments` |
| Performance Optimizations | ✅ Complete | `condensedevent1` |

## Fighter Deduplication System

Handles duplicate fighter entries caused by name variations (Alex vs Alexander, Jon vs Jonathan).

### Schema Additions

```prisma
model Fighter {
  // ... existing fields ...
  tapologyId    String?   @unique  // External ID for deduplication
  sherdogId     String?   @unique
  ufcId         String?   @unique
  aliases       FighterAlias[]
}

model FighterAlias {
  id          String   @id @default(uuid())
  fighterId   String
  fighter     Fighter  @relation(...)
  firstName   String
  lastName    String
  source      String?  // "legacy_migration", "scraper", "manual", "merge"
  @@unique([firstName, lastName])
}
```

### Scripts

```bash
# Detect potential duplicates (run before pre-launch migration)
npx ts-node packages/backend/scripts/fighter-dedup/detect-duplicates.ts
npx ts-node packages/backend/scripts/fighter-dedup/detect-duplicates.ts --output duplicates.json

# Merge two fighters (keep first, merge second into it)
npx ts-node packages/backend/scripts/fighter-dedup/merge-fighters.ts <keep-id> <merge-id>
npx ts-node packages/backend/scripts/fighter-dedup/merge-fighters.ts <keep-id> <merge-id> --dry-run
```

### Scraper Integration

Use `upsertFighterWithFuzzyMatch()` instead of `prisma.fighter.upsert()`:

```typescript
import { upsertFighterWithFuzzyMatch } from '../utils/fighterMatcher';

// Instead of prisma.fighter.upsert(...)
const fighter = await upsertFighterWithFuzzyMatch(prisma, {
  firstName, lastName, gender,
  profileImage, wins, losses, draws
}, { logMatches: true });
```

### How It Works

1. **Exact match**: Check `firstName + lastName` (case-insensitive)
2. **Alias lookup**: Check `fighter_aliases` table
3. **Fuzzy match**: Levenshtein distance + name variation detection (Alex↔Alexander)
4. **Create new**: Only if no match found; auto-creates alias for future

### Pre-Launch Checklist

1. Run `detect-duplicates.ts --output duplicates.json` after final migration
2. Review output, merge confirmed duplicates
3. Aliases created during merge prevent future duplicates

## Legacy Migration (fightingtomatoes.com → New App)

**Status: ✅ COMPLETE** (as of 2025-12-29, updated 2025-01-03)

### Migration Summary

| Data Type | Count | Notes |
|-----------|-------|-------|
| **Events** | ~1,300 | After deduplication; includes banner images |
| **Fighters** | ~6,800 | Includes profile images (1,093) |
| **Fights** | ~13,500 | Order corrected (main event = orderOnCard 1) |
| **Users** | 1,928 | All have `password: null` for claim flow |
| **Ratings** | ~65,000 | Synced from live MySQL |
| **Reviews** | ~770 | +10 synced on 2025-01-03 via live MySQL |
| **Tags** | ~594 | Migrated from SQL dumps |

### Fix Applied (2025-01-03): Missing Reviews

**Problem**: Original migration used September 2024 SQL dump files. Any reviews added after September (like Aspinall vs Gane in October) were missing.

**Solution**: Created `sync-all-from-live.js` script that connects directly to the live MySQL database instead of using outdated dump files.

**Result**: 10 missing reviews synced, including user reviews for fights added after September 2024.

### Pre-Launch Migration Checklist

**⚠️ RUN THIS 1-2 DAYS BEFORE LAUNCH** to get the latest data from fightingtomatoes.com.

#### 🚀 QUICK REFERENCE - Run Before Launch:
```bash
cd packages/backend/scripts/legacy-migration/mysql-export
node sync-all-from-live.js
```
This single command connects to the **live** fightingtomatoes.com MySQL database and syncs all missing reviews, ratings, and tags. Safe to run multiple times - it skips data that already exists.

#### How It Works

The `sync-all-from-live.js` script:
1. Connects directly to the live fightingtomatoes.com MySQL database
2. Compares legacy data with your new PostgreSQL database
3. Imports only what's missing (skips duplicates)
4. Works for reviews, ratings, and tags

**Options:**
```bash
# Sync everything (recommended)
node sync-all-from-live.js

# Sync specific data types only:
node sync-all-from-live.js --only=reviews   # Post-fight comments
node sync-all-from-live.js --only=ratings   # User ratings
node sync-all-from-live.js --only=tags      # User tags (FOTY, FOTN, etc.)
node sync-all-from-live.js --only=fights    # Check for missing fights

# Dry-run mode (preview without making changes):
node sync-all-from-live.js --dry-run
```

#### Step 2: Import Images
```bash
# Import fighter profile images
node import-images.js

# Import event banner images (improved matching)
node import-event-images-v2.js
```

#### Step 3: Fix Fight Order (CRITICAL)
```bash
# Sync fight order from legacy and invert (main event = order 1)
node sync-fight-order.js
```

#### Step 4: Fix Duplicates (CRITICAL)
```bash
# Fix events with multiple fights at orderOnCard=1
node fix-duplicate-orders.js

# Merge duplicate events (same promotion + date)
node merge-duplicate-events.js
```

#### Step 5: Manual Fixes
```bash
# Mark completed events that show as "LIVE"
# Use Prisma to update: hasStarted: true, isComplete: true
```

### Migration Scripts Reference

All scripts in `packages/backend/scripts/legacy-migration/`:

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `00-migrate-fights.ts` | Import events, fighters, fights from SQL dumps (auto-normalizes event names) | Initial migration only |
| `03-migrate-users.ts` | Import users with null passwords | Initial migration only |
| `04-migrate-ratings.ts` | Import ratings (uses fight-mapping.json) | Initial migration only |
| `05-migrate-reviews.ts` | Import reviews | Initial migration only |
| `06-migrate-tags.ts` | Import tags | Initial migration only |
| `07-verify-migration.ts` | Verify migration completeness | After any migration |

Scripts in `packages/backend/scripts/legacy-migration/mysql-export/`:

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `sync-all-ratings.js` | Sync ratings from LIVE MySQL | **Every pre-launch sync** |
| `sync-missing-data.js` | Sync newer fights from LIVE MySQL | **Every pre-launch sync** |
| `import-images.js` | Import fighter images | **Every pre-launch sync** |
| `import-event-images-v2.js` | Import event banners (flexible matching) | **Every pre-launch sync** |
| `sync-fight-order.js` | Sync & invert fight order from legacy | **Every pre-launch sync** |
| `fix-duplicate-orders.js` | Fix events with multiple order=1 fights | **Every pre-launch sync** |
| `merge-duplicate-events.js` | Merge duplicate events (same date/promo) | **Every pre-launch sync** |
| `normalize-event-names.js` | Add promotion prefix to event names ("200" → "UFC 200") | One-time fix (done 2026-01-05) |
| `fix-relative-banner-paths.js` | Convert relative image paths to full URLs | One-time fix (done 2026-01-05) |
| `check-ratings.js` | Compare ratings between legacy/new | Debugging only |

### Legacy MySQL Connection

```
Host: 216.69.165.113:3306
User: fotnadmin
Password: HungryMonkey12
Databases: fightdb, userfightratings, userfightreviews, userfighttags
```

**Note**: User rating/review/tag tables are named by MD5 hash of user email address.

### Known Issues & Fixes Applied

1. **Fight order inverted** - Legacy used high orderOnCard for main event; `sync-fight-order.js` inverts this
2. **Duplicate events** - Legacy + scraper both create events; `merge-duplicate-events.js` deduplicates
3. **Duplicate fights at order=1** - Some fights not matched in sync; `fix-duplicate-orders.js` re-numbers
4. **Truncated fighter names** - Some legacy names truncated (e.g., "Park Hy"); manually delete duplicates
5. **Events with bogus dates** - Some Bellator events have date 1899-11-30; script skips dates before 2000
6. **Images not matching** - Original script used exact name match; `import-event-images-v2.js` uses flexible matching
7. **Event names missing promotion prefix** - Legacy events named "200" instead of "UFC 200"; fixed with `normalize-event-names.js` (981 events fixed 2026-01-05)
8. **Relative image paths** - Some legacy banners had relative paths like `images/events/UFC300.jpg`; fixed with `fix-relative-banner-paths.js`

### Account Claim Flow (Ready)

Users with `password: null` will be prompted to:
1. Enter email → Backend detects legacy user
2. Receive verification email
3. Click link to set new password (12+ chars, complexity required)
4. Account activated with all legacy data intact

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
