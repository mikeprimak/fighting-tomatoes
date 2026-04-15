# Support Tooling

## Overview
Tools and systems that make customer-reported issues easier to diagnose and resolve. Started 2026-04-14 after a user reported an unreproducible Google login crash with no stack trace, no device info, no way to tell what version they were on.

**Guiding principle:** when a user says "the app crashed," we should be able to look them up and see exactly what happened without asking them to reproduce it.

## Roadmap

Ranked by ROI. Check off as we complete.

- [x] **1. Sentry (crash + error reporting)** — mobile app ✅ 2026-04-14 (backend + web still to do)
- [ ] **2. App version + device headers on all API calls** — so Render logs show which client every request came from
- [ ] **3. In-app "Report a problem" with auto-attached diagnostics** — attach version, OS, device, user ID, recent logs to every feedback submission
- [ ] **4. Hidden dev menu** — tap version number 7 times to reveal user ID, tokens, API URL, push token, device ID for screenshots
- [ ] **5. Remote kill switches / feature flags** — `GET /api/config` returns flags the app checks on launch, so we can disable broken features without shipping a build
- [ ] **6. Force-update mechanism** — minimum-version gate on launch so critical fixes actually reach users
- [ ] **7. Structured backend logging** — pino with userId/requestId/endpoint fields, filterable in Render
- [ ] **8. Status page / incident banner** — `GET /api/status` returning incident text, shown as banner in app
- [ ] Sentry Session Replay (optional, costs extra) — video-like replay of user actions before a crash

## 1. Sentry

**Status:** mobile done 2026-04-14. Backend + web TODO.

**Verified:** test exception fired from Edit Profile screen appeared in Sentry dashboard with user ID/email tag, device info, release `2.0.1+18`, and readable stack trace.

**Org:** `good-fights` · **Project:** `react-native` · **DSN** in EAS + local `.env` as `EXPO_PUBLIC_SENTRY_DSN` · **Auth token** (`org:ci` scope) in EAS as `SENTRY_AUTH_TOKEN`, org/project as `SENTRY_ORG`/`SENTRY_PROJECT`. All three EAS envs (dev/preview/prod) carry the vars.

**Sentry free Developer plan:** 5k errors/month, 1 user. Fine for current scale.

**Backend + web TODO (next Sentry pass):**
- `packages/backend`: `@sentry/node` + Fastify integration, capture all unhandled errors, tag `userId` via auth middleware
- `packages/web`: `@sentry/nextjs` via `npx @sentry/wizard` — it patches `next.config.js`, adds `sentry.client.config.ts` / `sentry.server.config.ts`, and uploads source maps via the Vercel integration

**Why:** No crash reports right now. "App crashed on Google login" has no stack trace, no device, no affected-user count. Sentry solves this.

**Plan:**
- Add `@sentry/react-native` to `packages/mobile`
- Initialize in `App.tsx` / root layout with DSN from env
- Auto-upload source maps via EAS build hook
- Tag user on login (`Sentry.setUser`) in `AuthContext` so crashes are linkable to accounts
- Wrap Google/Apple sign-in catch blocks with `Sentry.captureException` for non-fatal visibility
- Later: add to `packages/backend` (`@sentry/node`) and `packages/web` (`@sentry/nextjs`)

**Free tier:** 5k errors/month. Plenty for current scale.

**Known issues / gotchas:**
- Source maps must be uploaded per build or stack traces are unreadable minified JS
- Sentry DSN is public by design (like a Google client ID) — safe to ship in the app bundle

## 2. App version + device headers

**Status:** not started

**Plan:**
- Add `X-App-Version`, `X-App-Build`, `X-Platform`, `X-OS-Version` headers to the axios/fetch client in `packages/mobile/services/api.ts`
- Log these fields in the backend request logger so we can grep Render logs by email + see client version

## 3. In-app feedback with diagnostics

**Status:** not started. Existing feedback system needs audit.

**Plan:**
- Audit current feedback form — does it capture app version, OS, device model, user ID?
- If not, attach them automatically on submit
- Include last ~50 console log lines if feasible

## 4. Hidden dev menu

**Status:** not started

**Plan:**
- On Settings/About screen, make version number tappable
- 7 taps → navigate to hidden `DiagnosticsScreen`
- Show: user ID, email, truncated access token, API URL, app version/build, OS/device, Expo push token, device ID
- "Copy all" button to paste into support chat

## 5. Remote kill switches

**Status:** not started

**Plan:**
- `GET /api/config` endpoint returns `{ googleLoginEnabled, appleLoginEnabled, hypeEnabled, ... }` with sensible defaults
- App fetches on launch, caches for session
- Flip via admin panel or DB row

## 6. Force-update

**Status:** not started

**Plan:**
- `GET /api/config` also returns `minVersion.ios` / `minVersion.android`
- If app version < minVersion → blocking "Update required" screen with store link
- Use for critical security/auth fixes only

## 7. Structured backend logging

**Status:** not started

**Plan:**
- Add pino (Fastify-native) or upgrade existing logger
- Required fields per request: `userId`, `requestId`, `endpoint`, `appVersion`, `platform`
- Verify Render shows these as searchable fields

## 8. Status banner

**Status:** not started

**Plan:**
- `GET /api/status` returns `{ incident: null | { message, severity } }`
- App fetches on launch, shows banner in a persistent header slot if incident is active
- Manual toggle via admin panel
