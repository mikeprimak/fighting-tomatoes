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

### Google Sign-In OAuth clients (as of 2026-04-18)
All Google Sign-In references are aligned to the **good-fights-app** Google Cloud project (project number `499367908516`). The older `fight-app-ba5cd` project (`1082468109842`) still hosts FCM push notifications — that's a separate concern and is fine to keep split. Backend `GOOGLE_CLIENT_ID` env var accepts a comma-separated list of audiences so old builds (legacy `1082468109842-pehb...` audience) keep working until adoption of 2.0.2/36+ is high; drop the legacy value afterward.

iOS URL scheme `com.googleusercontent.apps.499367908516-j03poule51s7sfvpvdufna0upqa3oseg` in `app.json` `CFBundleURLTypes` **must match** the iOS client ID in `hooks/useGoogleAuth.ts`. A mismatch causes an instant native crash on tap of "Sign in with Google" on iOS (iOS Google Sign-In SDK hard-asserts on missing URL scheme). See `docs/daily/2026-04-18.md` for full incident notes.

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
