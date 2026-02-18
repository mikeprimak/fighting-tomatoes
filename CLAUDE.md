# CLAUDE.md

## Apple Review Issues - RESOLVED

1. ~~**Delete Account** - Add option to delete account from within the app~~ **DONE**
2. ~~**Guest Access** - Allow users to browse without logging in~~ **DONE**

See `LAUNCH-DOC.md` for full status and checklists.

### Important Rules

- **Always ask before starting EAS builds** - Build credits are limited (91% used as of Jan 19)
- **Never use local DB** - Always use Render External URL unless explicitly asked

### Other TODOs

3. ~~**Test New Homescreen Icon**~~ **DONE** - versionCode 28 has correct icon (thick stroke, no fill)

4. **Fix Reset Password 404** - `https://goodfights.app/reset-password?token=...` returns 404. The `FRONTEND_URL` env var on Render points to `goodfights.app` but the Vercel web frontend has no `/reset-password` route. Options:
   - A) Create reset-password page on web frontend (Vercel)
   - B) Change `FRONTEND_URL` to a deep link that opens the mobile app
   - C) Build a simple web page that redirects to the app

5. **Fix Email SPF/DKIM** - Emails from goodfights.app show "unverified" warning in recipients' inboxes ("We can't verify that this email came from the sender"). Need to configure SPF, DKIM, and DMARC records for the goodfights.app domain to authenticate outgoing emails from the SMTP provider.

---

## Live Tracker & Event Management (IMPLEMENTED)

All events default to **manual mode**. The admin controls fight statuses by hand. Live trackers can be enabled per-promotion or per-event when you're confident they work.

### Tracker Modes

| Mode | What happens | Who controls |
|------|-------------|--------------|
| `manual` | Nothing automatic. Admin sets each fight to upcoming/live/completed. | Admin only |
| `time-based` | Fights auto-flip to "live" at their `scheduledStartTime`. Section-based auto-complete at section start times. | Timer + admin |
| `live` | Tracker scrapes + auto-publishes results to what users see. | Tracker |
| `ufc` / `matchroom` / `oktagon` | Same as `live` but uses promotion-specific scraper. | Tracker |

### Default: Everything is Manual

`liveTrackerConfig.ts` sets every promotion to `manual`. Nothing happens automatically until you change it.

### How to Enable a Tracker

**Per-event** (recommended): In the admin panel, edit the event and set Tracker Mode dropdown to `live`, `time-based`, etc. This overrides the promotion default for that one event.

**Per-promotion** (global): Edit `PROMOTION_TRACKER_CONFIG` in `src/config/liveTrackerConfig.ts` to change the default for all events of that promotion.

### Shadow Fields

All 5 live trackers (UFC, Matchroom, OKTAGON, ONE FC, Tapology) write to shadow `tracker*` fields on every fight:

```
tracker*  = draft data (what the scraper found)
published = what users see (hasStarted, isComplete, winner, method, round, time)
```

- In `manual`/`time-based` mode: Trackers ONLY write to `tracker*` fields. Users see nothing until admin publishes.
- In `live`/`ufc`/`matchroom`/`oktagon` mode: Trackers write to BOTH `tracker*` and published fields (auto-publish).

### Admin Workflow During Events (Manual Mode)

1. Open admin panel → select event
2. As fights start, click **Live** button on each fight
3. When a fight ends, click **Completed** and optionally enter winner/method/round/time
4. If a live tracker is also running, you'll see "TRACKER: ..." data alongside published data
5. Click **Publish** on individual fights to copy tracker data → published fields
6. Click **Publish All** to bulk-publish all tracker results for the event

### Per-Fight Scheduled Start Times

For `time-based` events, you can set a `scheduledStartTime` on individual fights via the admin panel. A background checker (60s interval) auto-flips fights to "live" when their time arrives. You still manually mark them completed.

### Key Files

| File | Purpose |
|------|---------|
| `src/config/liveTrackerConfig.ts` | Promotion defaults, `buildTrackerUpdateData()` helper |
| `src/services/timeBasedFightStatusUpdater.ts` | Section-based + per-fight scheduled time auto-flip |
| `src/services/eventBasedScheduler.ts` | Starts/stops live trackers for events |
| `src/routes/admin.ts` | Admin endpoints: set-status, publish, publish-all |
| `src/routes/fights.ts` | Strips `tracker*` fields from public API responses |
| `public/admin.html` | Admin panel UI with fight controls + tracker display |

### Admin Panel Access

- URL: `https://<backend-host>/admin.html`
- Login: Use any email in the `ADMIN_EMAILS` env var
- Currently: `michaelsprimak@gmail.com`, `avocadomike@hotmail.com`

---

FightCrewApp: React Native + Node.js combat sports fight rating app.

**Archive**: See `CLAUDE-ARCHIVE.md` for detailed setup guides, troubleshooting, feature implementations, and history.

## Quick Start

**Commands**:
- Root: `pnpm dev|build|test|lint|type-check`
- Backend: `cd packages/backend && PORT=3008 pnpm dev`
- Mobile: `cd packages/mobile && npx expo start --port 8083 --lan`

**Critical Ports**: Backend 3008, Expo 8083, PostgreSQL 5433

## Stack

**Monorepo**: backend (Fastify, Prisma, PostgreSQL), mobile (React Native Expo, Expo Router, React Query)
**Database**: 20+ tables, UUID v4 keys, JWT dual-token (15min/7day)
**Mobile**: iOS/Android/Web, Stack-inside-Tabs pattern

## How to Update App Icon

**Icon files** (in project root):
- `GOOD-FIGHTS-ICON-HAND-THICKER-GREY-BG.png` - thick stroke, NO fill (current)
- `GOOD-FIGHTS-ICON-HAND-THICKER-FINGER.png` - thick stroke, WITH fill

**Steps to change icon:**

1. Copy new icon to assets:
   ```bash
   cp "GOOD-FIGHTS-ICON-HAND-THICKER-GREY-BG.png" "packages/mobile/assets/homescreen-icon.png"
   cp "GOOD-FIGHTS-ICON-HAND-THICKER-GREY-BG.png" "packages/mobile/assets/adaptive-icon-foreground-new.png"
   ```

2. Clear ALL caches and regenerate native files:
   ```bash
   cd packages/mobile && rm -rf .expo dist && npx expo prebuild --clean --platform android
   ```

3. Update versionCode in BOTH files:
   - `packages/mobile/app.json` (line ~56)
   - `packages/mobile/android/app/build.gradle` (line ~95)

4. Build: `eas build --platform android --profile production`

5. **After installing on device**: If icon doesn't update, clear Android launcher cache:
   - Settings > Apps > [Your Launcher] > Storage > Clear Cache
   - Or Force Stop the launcher

## Switching Work Locations (IP Change)

When switching WiFi networks, update the dev IP in **2 files**:

1. Get your new IP: `ipconfig | findstr "IPv4"`
2. Update:
   - `packages/mobile/services/api.ts` line ~20
   - `packages/mobile/store/AuthContext.tsx` line ~76
3. Reload the app

**Known IPs**: Home `10.0.0.53` | Work `192.168.1.65`

## API Endpoints

**Base**: `http://localhost:3008/api` (web) | `http://<YOUR_IP>:3008/api` (mobile)
- **Auth**: `POST register|login|logout|refresh`, `GET profile|verify-email`
- **Fights**: `GET /fights`, `GET /fights/:id`, `POST /fights/:id/rate|review|tags`
- **Fighters**: `GET /fighters`, `GET /fighters/:id`, `POST /fighters/:id/follow`
- **Events**: `GET /events`, `GET /events/:id`
- **Search**: `GET /search?q=query&limit=10`

## Development Guidelines

- **TypeScript**: Use trailing comma `<T,>` in .tsx files
- **Debugging**: Config audit first → Add logging → Check for multiple PrismaClient instances
- **Rule**: If 3+ fixes fail → STOP → Audit all config files
- **File ops**: Prefer editing existing files over creating new ones

## Key Systems

| System | Key Files |
|--------|-----------|
| Live Event Tracker | `services/liveEventTracker.ts`, `services/ufcLiveParser.ts` |
| Image Storage (R2) | `services/imageStorage.ts` |
| UFC Scraper | `services/scrapeAllUFCData.js` |
| ONE FC Scraper | `services/scrapeAllOneFCData.js` |

## Test Accounts

- `avocadomike@hotmail.com` (1234 ratings, 72 reviews)
- `michaelsprimak@gmail.com`
