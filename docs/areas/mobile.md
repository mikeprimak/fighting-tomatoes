# Mobile App

## Overview
React Native (Expo) app for iOS and Android. Combat sports fight rating, hype scoring, and community discussion.

**Package:** `packages/mobile/`
**Framework:** Expo SDK, Expo Router, React Query
**Navigation:** Stack-inside-Tabs pattern

## Current Versions (Apr 18, 2026)
| Platform | Version | Build # | Status |
|----------|---------|---------|--------|
| Android (Play Store) | (prior) | (pre-versionCode 36) | Live — legacy build; new 2.0.2/36 `.aab` ready to upload |
| iOS (App Store) | 2.0.1 | buildNumber 18 + OTA | Live; 2.0.2/19 submitted, awaiting Apple processing + App Review |

- `app.json`: version `2.0.2`, iOS buildNumber `19`, Android versionCode `36`
- `build.gradle`: versionCode `36`, versionName `2.0.2`
- Android `eas submit` fails — upload `.aab` manually via Play Console
- iOS: create new version in App Store Connect (can't swap builds on existing version)

### Google Sign-In OAuth clients (as of 2026-04-25 — split intentionally across two GCP projects)

**Current setup** (in `hooks/useGoogleAuth.ts`):
- `webClientId` → `1082468109842-pehb...` (project **fight-app-ba5cd**) — used by Android for the on-device handshake
- `iosClientId` → `499367908516-j03p...` (project **good-fights-app**) — used by iOS

**Why the split:** Android Google Sign-In does a local handshake against `(package_name, SHA-1)` before any network call. The Android OAuth client registered with the Play Store **app signing key** SHA-1 (`D8:FA:1B:B6:EA:EA:64:0D:53:2A:C6:64:89:C0:77:AD:10:FC:DE:59`) lives in the old `fight-app-ba5cd` project. Google enforces `(package_name, SHA-1)` uniqueness globally across all GCP projects, so we can't duplicate it onto `good-fights-app` without deleting it from `fight-app-ba5cd` first — and that would break any user still on a pre-versionCode-36 app version. So Android stays on old project, iOS stays on new project. See `docs/decisions/0002-google-oauth-cross-project-split.md`.

**Backend audience config:** Render env `GOOGLE_CLIENT_ID` is a comma-separated list including BOTH `1082468109842-pehb...` (Android audience) AND `499367908516-j03p...` (iOS audience). **Do NOT remove the `1082468109842-pehb...` entry** — it's load-bearing for ALL Android sign-ins, not legacy. (Earlier docs said to drop it on 2026-05-10 — that was based on the pre-2026-04-25 understanding and is no longer correct.)

**iOS URL scheme:** `com.googleusercontent.apps.499367908516-j03poule51s7sfvpvdufna0upqa3oseg` in `app.json` `CFBundleURLTypes` **must match** the iOS client ID. A mismatch causes an instant native crash on tap of "Sign in with Google" on iOS (iOS Google Sign-In SDK hard-asserts on missing URL scheme).

**Push notifications (FCM)** still live on the old `fight-app-ba5cd` project — independent concern, no change.

**History:**
- Pre-4/18: both client IDs on old project. Worked everywhere.
- 4/18: flipped both to new project to fix an iOS native crash from URL-scheme/client-ID mismatch. Inadvertently broke Android (new project's Android OAuth client had the upload key SHA-1, not the app signing key). See `docs/daily/2026-04-18.md`.
- 4/25: split — `webClientId` back to old project (Android), `iosClientId` stays on new project. See `docs/daily/2026-04-25.md`.

## Key Features
- Hype upcoming fights (1-10 flame rating)
- Rate completed fights (1-10 star rating)
- Comment on upcoming and past fights
- Yellow comment badge on UpcomingFightCard when user has commented (bottom-right of hype flame)
- Spoiler-free mode (toggle in Edit Profile)
- Live event tracking with real-time updates
- Push notifications for events going live
- Follow fighters
- Search fighters, fights, events
- 14+ promotion support

## No Contest handling (added 2026-04-10)
When the backend sets `fight.winner = 'nc'` (the schema comment documents `winner` as `fighter1Id | fighter2Id | "draw" | "nc"`):
- **CompletedFightCard.tsx**: renders a centered blue `NC` badge (`#3B82F6`) between the two fighters, absolutely positioned at `bottom: -14` inside `fighterNamesContainer`, same vertical level as the green winner method text. Hidden by `!hideSpoilers`. Neither fighter gets the green winner border/method text because all per-fighter checks compare against fighter IDs and `'nc'` never matches. Appends round info if available (`NC R2`).
- **CompletedFightDetailScreen.tsx**: renders `"No Contest · R2 0:18"` in the same blue below the fighter images when `fight.winner === 'nc' && isOutcomeRevealed`. Gated on `isOutcomeRevealed` so spoiler-free mode still shows the Rate-to-reveal prompt first. The existing "Outcome unavailable" grey text is still shown for truly-null winners.
- **Not yet addressed**: the per-fighter prediction check/X indicator on the card still shows a red X for any predicted fighter when a fight ends NC, since `fight.winner !== fighter.id`. Arguably an NC prediction should be a push, not a wrong answer. Same consideration applies to detail screen prediction rings.

## Live/Upcoming tab filtering (post Apr 11, 2026)
Both `(tabs)/live-events.tsx` and `(tabs)/events/index.tsx` filter using a local `isEventLiveNow(event)` helper instead of a strict `eventStatus === 'LIVE'` check. An event is treated as live if `eventStatus === 'LIVE'` OR (start time has passed AND `eventStatus !== 'COMPLETED'`). Start time is the earliest non-null of `earlyPrelimStartTime`, `prelimStartTime`, `mainStartTime`, `date`.

This mirrors the fallback already in use on the event detail screen (`(tabs)/events/[id].tsx` — `isEventLive`) and exists because the backend `UPCOMING → LIVE` flip only runs every 5 minutes (`eventLifecycle.ts` on Render). Without the fallback the list tabs lagged up to 5 min behind the detail screen. The `COMPLETED` short-circuit is the safety valve — once the lifecycle eventually flips to COMPLETED, events drop off the Live tab even if their start-time is still in the past. Both tabs already poll every 30s via React Query, so the clock-crossing is picked up automatically.

**If you add a new event list screen**, use the same `isEventLiveNow` pattern. Do not filter by raw `eventStatus` alone — that reintroduces the 5-min lag.

## Pull-to-refresh (added 2026-04-24)
All five main tab screens (`live-events`, `events`, `past-events`, `top-fights`, `profile`) support pull-to-refresh via `RefreshControl`. Each screen owns an `isRefreshing` state and an async `onRefresh` that awaits the relevant React Query `refetch()` before dismissing the spinner. Profile fans out to `refreshUserData` + prediction accuracy + global standing + top reviews + top pre-flight comments in parallel.

Live Events additionally self-updates every 30s (`refetchInterval: 30000` on the `['upcomingEvents', ...]` query, `refetchIntervalInBackground: false`). The 30s cadence is shared with the Upcoming Events tab — both reuse the same query key so the cache is warm when switching tabs.

## Known Issues
- Notification deep links all go to Live Events tab (simplified in Apr 2026)
- OTA updates require 2 app restarts to apply
- `live-events.tsx` only autofetches 2 pages (10 events) of the upcoming query. If a now-live event is ranked beyond the first 10 upcoming events, it won't appear on the Live tab until the backend flips its `eventStatus` and sort promotes it. Latent edge case — backend ordering has always put imminent events first.

## Dev Setup
```bash
cd packages/mobile
npx expo start --port 8083 --lan
```
Update IP in `services/api.ts` line ~20 and `store/AuthContext.tsx` line ~76 when switching networks.
