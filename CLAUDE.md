# CLAUDE.md

### Important Rules

- **Always ask before starting EAS builds** - Build credits are limited
- **Never use local DB** - Always use Render External URL unless explicitly asked
- **Document your work** - At the end of every session, create or update `docs/daily/YYYY-MM-DD.md` with what was done. If you changed how an area works, update the relevant `docs/areas/*.md` file. See `docs/README.md` for templates and process. Do this without being asked.

---

## Live Event Management

See `archive/LIVE-EVENT-MANAGEMENT.md` for full documentation.

**TL;DR:** One background job (`eventLifecycle.ts`) runs every 5 minutes:
1. **UPCOMING → LIVE** when start time passes
2. **Section-based fight completion** (by cardType + section start times)
3. **LIVE → COMPLETED** after estimated duration (`numFights x 30min + 1hr`, max 8hr)

Events use `scraperType` field (null = no scraper, or `ufc`/`matchroom`/`oktagon`/`onefc`/`tapology`/`bkfc`).

**All production scrapers are fully automatic** — daily scrapers set `scraperType` and the lifecycle dispatches live trackers. The Tapology live tracker is generic and covers Zuffa Boxing, Karate Combat, Dirty Boxing, PFL, and RIZIN.

### Key Files

| File | Purpose |
|------|---------|
| `src/services/eventLifecycle.ts` | The 3-step lifecycle job (runs every 5 min) |
| `src/config/liveTrackerConfig.ts` | `PRODUCTION_SCRAPERS`, `buildTrackerUpdateData()` |
| `src/routes/admin.ts` | Admin endpoints: set-status, publish, publish-all |
| `public/admin.html` | Admin panel UI with fight controls + tracker display |

### Admin Panel Access

- URL: `https://<backend-host>/admin.html`
- Login: Use any email in the `ADMIN_EMAILS` env var
- Currently: `michaelsprimak@gmail.com`, `avocadomike@hotmail.com`

---

Good Fights: React Native + Node.js combat sports fight rating app.

**Archive**: See `archive/` folder for historical docs, work session logs, and implementation records.

## Web App

- **Package**: `packages/web` (Next.js 16.2 + Tailwind v4)
- **Production URL**: https://web-jet-gamma-12.vercel.app
- **Vercel project**: `michael-primaks-projects/web`
- **29 routes**, SSR with SEO metadata, dark-only theme
- **Env vars** (set in Vercel): `API_URL` and `NEXT_PUBLIC_API_URL` → Render backend
- **Dev**: `cd packages/web && pnpm dev` (port 3000)
- **Deploy**: `cd packages/web && vercel --prod`
- See `archive/WORK-SESSION-WEB-APP.md` for full build log

## Quick Start

**Commands**:
- Root: `pnpm dev|build|test|lint|type-check`
- Backend: `cd packages/backend && PORT=3008 pnpm dev`
- Mobile: `cd packages/mobile && npx expo start --port 8083 --lan`

**Critical Ports**: Backend 3008, Expo 8083, PostgreSQL 5433

## Stack

**Monorepo**: backend (Fastify, Prisma, PostgreSQL), mobile (React Native Expo, Expo Router, React Query), web (Next.js 16.2, Tailwind v4, React Query)
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
| Event Lifecycle | `services/eventLifecycle.ts` (3-step lifecycle, dispatches all live trackers) |
| Live Event Tracker | `services/liveEventTracker.ts`, `services/ufcLiveParser.ts` |
| Tapology Live Tracker | `scripts/runTapologyLiveTracker.ts` (generic — Zuffa, KC, DBX, PFL, RIZIN) |
| Image Storage (R2) | `services/imageStorage.ts` |
| UFC Scraper | `services/scrapeAllUFCData.js` (requires `TZ=America/New_York` — UFC.com adapts times to viewer timezone) |
| ONE FC Scraper | `services/scrapeAllOneFCData.js` |
| Karate Combat Scraper | `services/scrapeKarateCombatTapology.js` + `services/karateCombatDataParser.ts` |
| Dirty Boxing Scraper | `services/scrapeDirtyBoxingTapology.js` + `services/dirtyBoxingDataParser.ts` |

## Current Store Versions (as of Feb 27, 2026)

| Platform | Version | Build # | Status |
|----------|---------|---------|--------|
| **Android (Play Store)** | 2.0.2 | versionCode 34 | Built, needs manual upload to Play Console |
| **iOS (App Store)** | 2.0.1 | buildNumber 18 + OTA update | Live (OTA pushed Feb 27) |

- **app.json**: version `2.0.2`, iOS buildNumber `19`, Android versionCode `34`
- **build.gradle**: versionCode `34`, versionName `2.0.2`
- **iOS OTA update ID**: `562f0e34-83ef-4bdd-869e-39d6684ddfd1` (runtime 2.0.1)
- **Note**: Android `eas submit` fails due to Google service account permissions — upload `.aab` manually via Play Console
- **Note**: iOS App Store Connect UI won't let you swap builds on an existing version — create a new version instead

## Test Accounts

- `avocadomike@hotmail.com` (1234 ratings, 72 reviews)
- `michaelsprimak@gmail.com`
- `applereview@goodfights.app` / `AppleTest2026!` (Apple Review test account)
- `testdev2@goodfights.app` (dev testing account)
- `test@goodfights.app` / `Testpass1!` (dev testing account)
