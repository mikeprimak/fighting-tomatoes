# Mobile App

## Overview
React Native (Expo) app for iOS and Android. Combat sports fight rating, hype scoring, and community discussion.

**Package:** `packages/mobile/`
**Framework:** Expo SDK, Expo Router, React Query
**Navigation:** Stack-inside-Tabs pattern

## Current Versions (Apr 6, 2026)
| Platform | Version | Build # | Status |
|----------|---------|---------|--------|
| Android (Play Store) | 2.0.2 | versionCode 34 | Built, needs manual upload |
| iOS (App Store) | 2.0.1 | buildNumber 18 + OTA | Live |

- `app.json`: version `2.0.2`, iOS buildNumber `19`, Android versionCode `34`
- `build.gradle`: versionCode `34`, versionName `2.0.2`
- Android `eas submit` fails — upload `.aab` manually via Play Console
- iOS: create new version in App Store Connect (can't swap builds on existing version)

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

## Known Issues
- Notification deep links all go to Live Events tab (simplified in Apr 2026)
- OTA updates require 2 app restarts to apply

## Dev Setup
```bash
cd packages/mobile
npx expo start --port 8083 --lan
```
Update IP in `services/api.ts` line ~20 and `store/AuthContext.tsx` line ~76 when switching networks.
