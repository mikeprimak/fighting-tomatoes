# Refactor: hasStarted/isComplete Booleans → fightStatus/eventStatus Enum

**Date:** 2026-02-19
**Status:** COMPLETED
**Branch:** `refactor/status-enum`
**Rollback tag:** `pre-status-enum-refactor` (on main)

---

## Why This Change

The Fight and Event models used two booleans (`hasStarted`, `isComplete`) to represent a three-state lifecycle (upcoming → live → completed). This created problems:

1. **Impossible state exists**: `isComplete=true, hasStarted=false` — a fight marked complete but never started
2. **No guards anywhere**: No database constraint, no app-level validation prevented this
3. **5+ production code paths actively created invalid states**:
   - `failsafeCleanup.ts` (runs hourly) — set `isComplete=true` without `hasStarted=true`
   - `eventCompletionChecker.ts` (runs hourly) — same issue
   - `admin.ts` event completion endpoint — same issue
   - `fixEventDates.ts` script — same issue
4. **Every read site derived a status anyway**: Code everywhere did `if (isComplete) 'completed' else if (hasStarted) 'live' else 'upcoming'`
5. **The admin endpoint already accepted a string enum** and decomposed it back to two booleans

## What Changed

### Database

**Fight model:**
- Removed: `hasStarted` (Boolean), `isComplete` (Boolean), `isCancelled` (Boolean)
- Removed: `trackerHasStarted` (Boolean?), `trackerIsComplete` (Boolean?)
- Added: `fightStatus` (FightStatus enum: `UPCOMING | LIVE | COMPLETED | CANCELLED`)
- Added: `trackerFightStatus` (FightStatus?, nullable)

**Event model:**
- Removed: `hasStarted` (Boolean), `isComplete` (Boolean)
- Added: `eventStatus` (EventStatus enum: `UPCOMING | LIVE | COMPLETED`)

**Migration:** `20260219000000_status_enum_refactor`
- Created PostgreSQL enums `FightStatus` and `EventStatus`
- Added new columns with defaults
- Migrated all existing data (cancelled first, then completed, then live; UPCOMING is default)
- Migrated tracker shadow fields
- Dropped all old boolean columns

### Data Migration Mapping

| Old State | New Value |
|-----------|-----------|
| `isCancelled=true` | `CANCELLED` |
| `isComplete=true` | `COMPLETED` |
| `hasStarted=true, isComplete=false` | `LIVE` |
| `hasStarted=false, isComplete=false` | `UPCOMING` |

### Code Transformation Patterns

| Old Pattern (Prisma WHERE) | New Pattern |
|---|---|
| `hasStarted: true, isComplete: false` | `fightStatus: 'LIVE'` |
| `isComplete: true` | `fightStatus: 'COMPLETED'` |
| `isCancelled: true` | `fightStatus: 'CANCELLED'` |
| `hasStarted: false, isComplete: false` | `fightStatus: 'UPCOMING'` |
| `isCancelled: false` | `fightStatus: { not: 'CANCELLED' }` |
| `isComplete: false` | `fightStatus: { in: ['UPCOMING', 'LIVE'] }` |

| Old Pattern (JS conditional) | New Pattern |
|---|---|
| `fight.isComplete` | `fight.fightStatus === 'COMPLETED'` |
| `fight.hasStarted && !fight.isComplete` | `fight.fightStatus === 'LIVE'` |
| `!fight.hasStarted && !fight.isComplete` | `fight.fightStatus === 'UPCOMING'` |
| `fight.hasStarted` (meaning "not upcoming") | `fight.fightStatus !== 'UPCOMING'` |
| `fight.isCancelled` | `fight.fightStatus === 'CANCELLED'` |
| `event.hasStarted && !event.isComplete` | `event.eventStatus === 'LIVE'` |
| `event.isComplete` | `event.eventStatus === 'COMPLETED'` |

## What Was Done (Step by Step)

### Phase 1: Safety & Schema
1. Created git tag `pre-status-enum-refactor` on main
2. Created branch `refactor/status-enum`
3. Added `FightStatus` and `EventStatus` enums to Prisma schema
4. Updated Fight model: removed `hasStarted`, `isComplete`, `isCancelled`, `trackerHasStarted`, `trackerIsComplete`; added `fightStatus`, `trackerFightStatus`
5. Updated Event model: removed `hasStarted`, `isComplete`; added `eventStatus`
6. Created migration `20260219000000_status_enum_refactor` with SQL data transform
7. Applied migration to Render PostgreSQL database via `prisma migrate deploy`
8. Regenerated Prisma client

### Phase 2: Backend Code (~60 files)
9. Updated `liveTrackerConfig.ts` — `buildTrackerUpdateData()` now accepts `fightStatus` and maps to `trackerFightStatus`
10. Updated 6 core services: `failsafeCleanup.ts`, `eventCompletionChecker.ts`, `timeBasedFightStatusUpdater.ts`, `eventBasedScheduler.ts`, `liveEventTracker.ts`, `liveEventScheduler.ts`
11. Updated 10 live tracker files (5 parsers + 5 scrapers) — parsers write `fightStatus`/`eventStatus` to Prisma; scrapers keep internal `hasStarted`/`isComplete` for their output format
12. Updated 11 data parsers — event creation uses `eventStatus`, fight creation uses `fightStatus`, cancellation uses `fightStatus: 'CANCELLED'`
13. Updated 6 other services: `mockLiveSimulator.ts`, `mockEventGenerator.ts`, `notificationRuleEngine.ts`, `preEventReportService.ts`, `importUFC320.ts`, `historical/matchingUtils.ts`
14. Updated 10 route files: `admin.ts`, `fights.ts`, `index.ts`, `community.ts`, `search.ts`, `auth.fastify.ts`, `liveEvents.ts`, `adminStats.ts`, `crews.ts`, plus `admin/index.ts`
15. Updated 2 controllers: `events.controller.ts`, `fights.controller.ts`
16. Updated seed files: `seed.ts`, `seed-events.ts`
17. Updated ~13 scripts in `src/scripts/`
18. Fixed `ufcLiveParser.ts` — imported `FightStatus` type from Prisma client for type safety

### Phase 3: Admin Panel
19. Updated `public/admin.html` — event/fight status derivation, form submissions, tracker data display, cancel/uncancel buttons

### Phase 4: Mobile App (~20 files)
20. Updated type definitions in `services/api.ts` and `components/fight-cards/shared/types.ts`
21. Updated 7 components: `EventCard.tsx`, `EventBannerCard.tsx`, `FightDisplayCardNew.tsx`, `FightDisplayCardMinimal.tsx`, `CompletedFightDetailScreen.tsx`, `UpcomingFightDetailScreen.tsx`, `LiveFightCard.tsx`
22. Updated 10 screens: `events/index.tsx`, `events/[id].tsx`, `past-events/index.tsx`, `profile.tsx`, `community.tsx`, `event/[id].tsx`, `fight/[id].tsx`, `fighter/[id].tsx`, `search-results.tsx`, `crew/[id].tsx`
23. Updated hook: `useHasLiveEvent.ts`

### Phase 5: Cleanup & Verification
24. Deleted 3 old BACKUP component files
25. Updated `CLAUDE.md` documentation
26. Ran TypeScript compilation — zero refactor-related errors in backend and mobile
27. Ran comprehensive grep — zero remaining Prisma field references to old columns
28. Confirmed scraper-internal `hasStarted`/`isComplete` variables (non-Prisma) correctly left as-is

## Files Changed

### Backend (~60 files)

**Schema & Migration:**
- `packages/backend/prisma/schema.prisma`
- `packages/backend/prisma/migrations/20260219000000_status_enum_refactor/migration.sql`

**Config:**
- `src/config/liveTrackerConfig.ts`

**Core Services (6):**
- `failsafeCleanup.ts`, `eventCompletionChecker.ts`, `timeBasedFightStatusUpdater.ts`, `eventBasedScheduler.ts`, `liveEventTracker.ts`, `liveEventScheduler.ts`

**Live Trackers (10):**
- `ufcLiveParser.ts`, `ufcLiveScraper.ts`, `oktagonLiveParser.ts`, `oktagonLiveScraper.ts`, `oneFCLiveParser.ts`, `oneFCLiveScraper.ts`, `matchroomLiveParser.ts`, `matchroomLiveScraper.ts`, `tapologyLiveParser.ts`, `tapologyLiveScraper.ts`

**Data Parsers (11):**
- `ufcDataParser.ts`, `bkfcDataParser.ts`, `matchroomDataParser.ts`, `oneFCDataParser.ts`, `topRankDataParser.ts`, `goldenBoyDataParser.ts`, `oktagonDataParser.ts`, `pflDataParser.ts`, `zuffaBoxingDataParser.ts`, `rizinDataParser.ts`, `dirtyBoxingDataParser.ts`

**Other Services (6):**
- `mockLiveSimulator.ts`, `mockEventGenerator.ts`, `notificationRuleEngine.ts`, `preEventReportService.ts`, `importUFC320.ts`, `historical/matchingUtils.ts`

**Routes (10):**
- `admin.ts`, `fights.ts`, `index.ts`, `community.ts`, `search.ts`, `auth.fastify.ts`, `liveEvents.ts`, `adminStats.ts`, `crews.ts`

**Controllers (2):** `events.controller.ts`, `fights.controller.ts`
**Admin (2):** `admin/index.ts`, `public/admin.html`
**Seeds (2):** `prisma/seed.ts`, `prisma/seed-events.ts`
**Scripts (~13):** Various in `src/scripts/`

### Mobile (~20 files)

**Types (2):** `services/api.ts`, `components/fight-cards/shared/types.ts`
**Components (7):** `EventCard.tsx`, `EventBannerCard.tsx`, `FightDisplayCardNew.tsx`, `FightDisplayCardMinimal.tsx`, `CompletedFightDetailScreen.tsx`, `UpcomingFightDetailScreen.tsx`, `LiveFightCard.tsx`
**Screens (10):** `events/index.tsx`, `events/[id].tsx`, `past-events/index.tsx`, `profile.tsx`, `community.tsx`, `event/[id].tsx`, `fight/[id].tsx`, `fighter/[id].tsx`, `search-results.tsx`, `crew/[id].tsx`
**Hooks (1):** `useHasLiveEvent.ts`

### Deleted
- `UpcomingFightCard.BACKUP-2025-11-24.tsx`
- `UpcomingFightCard.BACKUP-2025-10-28.tsx`
- `CompletedFightCard.BACKUP-2025-10-28.tsx`

## Rollback Plan

- **Git**: `git checkout main && git reset --hard pre-status-enum-refactor`
- **Database**: The migration dropped old columns. To rollback: restore from DB backup taken before migration, then re-run `prisma migrate deploy` to re-sync migration state.

## Notes

- Scraper output formats (e.g. `ufcLiveScraper.ts`, `oktagonLiveScraper.ts`) still use `hasStarted`/`isComplete` as internal interface properties for their scraped data. These are NOT Prisma fields — they're intermediate data that parsers read and translate to `fightStatus`/`eventStatus` when writing to the database.
- The `liveEventTracker.ts` `convertScrapedToLiveUpdate()` method returns `hasStarted`/`isComplete` in its output object — this is the generic scraper-to-parser format, not a Prisma model.
- The `search-results.tsx` file has a pre-existing TypeScript error about `totalReviews` missing from `FightData` — this is unrelated to this refactor.
