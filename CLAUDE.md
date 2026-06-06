# CLAUDE.md

Good Fights: React Native + Node.js combat sports fight rating app.

## Important Rules

- **Always ask before starting EAS builds** — build credits are limited
- **Never use local DB** — always use Render External URL unless explicitly asked
- **🚨 NEVER run `prisma migrate dev`, `db push`, `migrate diff`, or `migrate reset` against the DB.** Because `DATABASE_URL` always points at the **production** Render Postgres (rule above), these run against **prod** — and `migrate dev`/`diff`/`db push` create a `prisma_migrate_shadow_db_*` (a `CREATE DATABASE` + full replay of every migration). On the 256 MB instance this OOM-crashes Postgres; doing it repeatedly while iterating crash-loops the whole app. This caused the **2026-06-06 DB outage** (9 orphaned shadow DBs). To **apply** a migration use `prisma migrate deploy` (or `pnpm db:migrate:deploy`) only — it never creates a shadow DB. To **author** a new migration, point `DATABASE_URL`/`SHADOW_DATABASE_URL` at a throwaway LOCAL Postgres, generate the SQL there, then `migrate deploy` to prod. The `db:migrate` script (`= migrate dev`) and `db:reset` are footguns — do not run them. See `docs/daily/2026-06-06.md` + memory `prisma-never-migrate-dev-on-prod`.
- **Document your work** — at end of every session, create or update `docs/daily/YYYY-MM-DD.md`. If you changed how an area works, update the relevant `docs/areas/*.md`. See `docs/README.md` for templates. Do this without being asked.
- **Vercel CLI is installed** — manage Vercel things yourself (deploys, env vars, project linking, logs). Don't make the user run Vercel commands. Projects: `packages/web` (Next.js, **prod at goodfights.app**) and `packages/landing` (static). Both auto-deploy from `main` — a `git push` usually suffices. **`web-jet-gamma-12.vercel.app` is the old `packages/web` URL and is now an unused dev area — use goodfights.app, never web-jet-gamma-12.**
- **Log recurring tasks** — when a session surfaces a *recurring* operator task (weekly attribution review, quarterly trait refresh, scraper health audits, etc.), append it to `docs/operations/maintenance.md` under the right cadence section. One-offs don't belong there.

## Next Session

**→ `docs/HANDOFF-web-qa-evening-2026-05-22.md`** — read first. Eight web app commits shipped 2026-05-22 evening (modal/cache parity sweep, nullify hype/rating, event detail layout + fights-load fix, search auth race). **Nothing tested live yet.** Handoff has the 8-step test plan. Backend + Vercel deploys were in flight when the session ended.

Also fresh (2026-05-30):
- **BKFC duplicate-fight root cause: `docs/HANDOFF-bkfc-duplicate-fight-root-cause-2026-05-30.md`** — BKFC 90 had a duplicate "Phillips vs Barrett" fight; investigation done, **fix not started**. Narrowed to a check-then-act race past the order-sensitive Fight unique constraint (live tracker exonerated). Next step: read-only scan for existing swap-order dupes, then an order-insensitive unique index + P2002-safe `upsertFightSwapAware`.

Earlier handoffs still active:
- Follow-fighter notifications: `docs/HANDOFF-follow-fighter-notifications-test-2026-05-20.md` — booked / 3-day / morning-of / walkout lanes shipped 2026-05-20 but not exercised end-to-end.
- AI enrichment: `docs/HANDOFF-ai-enrichment-mvp-2026-05-17.md` (cron is live; BKFC editorial gap fix shipped 2026-05-20 — re-audit coverage after a couple cron cycles).
- Tag-aware Fan DNA: `docs/HANDOFF-tag-aware-personality-2026-05-17.md`.

## Workstream Sessions

When Mike says "this is a [X] session", switch into focused mode on that workstream. Read the source-of-truth doc first, then follow the standard protocol: tell him what phase we're in, what's next, pick the highest-impact unblocked item, log to `docs/daily/YYYY-MM-DD.md` at session end.

| Trigger phrase | Source of truth | Mode notes |
|---|---|---|
| "marketing session" | `GOOD_FIGHTS_90_Day_Marketing_Plan.md` + `docs/marketing/buyer-pipeline.md` | Coach/cheerleader, not coder. Solo introvert; reframe in dev terms. $100/mo budget concentrated on fight weeks. Target cards: UFC 328 (May 9), MVP Netflix (May 16), UFC White House (Jun 15). Track installs, MAU, rating, CPI, Reddit engagement every 2wks. Don't push extrovert tactics (cold DMs, live video). |
| "AI enrichment session" | `docs/areas/ai-enrichment.md` | First-class field, not a feature. Template: broadcast discovery (`packages/backend/src/services/broadcastDiscovery/`). Default model: Claude Haiku 4.5 + prompt caching. Cost ceiling <$300/yr. Don't ship LLM outputs without a confidence floor. |
| "rewarding users session" | `docs/areas/rewarding-users.md` | Aesthetic: Letterboxd/Strava/Last.fm. Anti: Duolingo. **No leaderboards. No prizes.** Reward = closure + identity. Brainstorm new ideas each session and append to inventory. Don't ship Fan DNA before there's enough data (empty-room problem). |
| "follow-fighter session" | `docs/areas/follow-fighter.md` | **THE acquisition workstream.** Every decision: does this make the dataset more valuable to a buyer? Target: 100K users × 5+ avg follows. Quality > volume — engagement tracking on every new follow surface. **Never derive `followedAt`** — that column is load-bearing for the sale narrative. No gamification, no auto-follow-everyone. |
| "live trackers session" | `docs/areas/live-trackers.md` | The substrate every notification + rating-prompt compounds on. Goal: sub-5-min start/end signal for *every* org we list. Source ladder: official → aggregator → live blog → social → manual. **Don't fabricate timestamps** — null > guess. **Don't reverse COMPLETED→UPCOMING** ever. Log every source probed (even rejected ones) to the experiments log so future sessions don't redo dead research. Coverage gaps: MVP, Top Rank, Golden Boy, Gold Star. |
| "sale value session" / "let's talk about building the sale value" / "selling the app" | `docs/areas/sale-value.md` | **Open thinking mode, not plan-following.** Persistent context for the acquisition thesis. Every session is a reassessment — don't push a plan, let Mike lead. The doc is context to load, not a checklist to execute. Honesty over optimism (200 users is small, don't dress up). Push back on overreach. Update the doc when the framework shifts; save new roadmap items as project memories. At current scale almost nothing executes today — purpose is to shape decisions now so assets exist with history when scale lands. |

## Web App

- `packages/web` (Next.js 16.2 + Tailwind v4), prod: https://goodfights.app (blog at `/blog/<slug>`)
- `web-jet-gamma-12.vercel.app` = old URL, now unused dev area — don't reference it
- Vercel project: `michael-primaks-projects/web`, 29 routes, SSR, dark-only
- Env vars in Vercel: `API_URL` + `NEXT_PUBLIC_API_URL` → Render backend
- Dev: `cd packages/web && pnpm dev` (port 3000)

## Quick Start

- Root: `pnpm dev|build|test|lint|type-check`
- Backend: `cd packages/backend && PORT=3008 pnpm dev`
- Mobile: `cd packages/mobile && npx expo start --port 8083 --lan`
- **Critical ports**: backend 3008, Expo 8083, Postgres 5433

## Stack

Monorepo: backend (Fastify + Prisma + PostgreSQL), mobile (Expo + Expo Router + React Query), web (Next.js 16.2 + Tailwind v4 + React Query). 20+ tables, UUID v4 keys, JWT dual-token (15min/7day). Mobile = iOS/Android/Web, Stack-inside-Tabs pattern.

## Live Event Management

One background job (`services/eventLifecycle.ts`) runs every 5 min:
1. UPCOMING → LIVE when start time passes
2. Section-based fight completion (by cardType + section start times)
3. LIVE → COMPLETED after estimated duration (`numFights × 30min + 1hr`, max 8hr)

Events use `scraperType` (null/`ufc`/`matchroom`/`oktagon`/`onefc`/`tapology`/`bkfc`). All production scrapers are fully automatic — daily scrapers set `scraperType` and the lifecycle dispatches live trackers. Tapology live tracker is generic (covers Zuffa Boxing, Karate Combat, Dirty Boxing, PFL, RIZIN).

Full docs: `archive/LIVE-EVENT-MANAGEMENT.md`. Admin panel: `https://<backend-host>/admin.html` (any email in `ADMIN_EMAILS`).

## Key Systems

| System | Files |
|---|---|
| Event Lifecycle | `services/eventLifecycle.ts` |
| Live Event Tracker | `services/liveEventTracker.ts`, `services/ufcLiveParser.ts` |
| Tapology Live Tracker | `scripts/runTapologyLiveTracker.ts` |
| Image Storage (R2) | `services/imageStorage.ts` |
| UFC Scraper | `services/scrapeAllUFCData.js` (requires `TZ=America/New_York`) |
| ONE FC Scraper | `services/scrapeAllOneFCData.js` |
| Karate Combat | `services/scrapeKarateCombatTapology.js` + `services/karateCombatDataParser.ts` |
| Dirty Boxing | `services/scrapeDirtyBoxingTapology.js` + `services/dirtyBoxingDataParser.ts` |

## Development Guidelines

- **TypeScript**: trailing comma `<T,>` in .tsx files
- **Debugging**: config audit first → add logging → check for multiple PrismaClient instances
- **Rule**: if 3+ fixes fail → STOP → audit all config files
- **File ops**: prefer editing existing files over creating new ones
- **DB connections — NEVER `new PrismaClient()` in backend code.** Always
  `import { prisma } from '../lib/prisma'` (the process-wide singleton with a
  bounded `connection_limit`). Each `new PrismaClient()` opens its OWN pool;
  ~50 of them across route/service/parser modules exhausted Render Postgres's
  `max_connections` (103) and crash-looped the DB on a fight night (2026-06-06).
  This applies to scripts too. See `docs/daily/2026-06-06.md` and the
  `prisma-single-client-rule` memory.

## Reference

- **App icon update / IP switching**: `docs/playbooks/update-app-icon.md`
- **API endpoints**: `docs/API.md`
- **Doc system overview**: `docs/README.md`

## Current Store Versions (as of May 30, 2026)

| Platform | Version | Build # | Status |
|---|---|---|---|
| Android (Play Store) | 2.1.0 | versionCode 38 | In review (uploaded 2026-06-01) |
| iOS (App Store) | 2.1.1 | buildNumber 21 | In TestFlight (submitted 2026-06-01); not yet submitted for App Store review |

- **Android prod was versionCode 36 (2.0.x); 2.1.0 shipped as vc 37 then vc 38** (2026-06-01, profile redesign + biometric native build). Always check the live Play Console versionCode before bumping — `build.gradle` governs (bare `android/` dir), not `app.json`.
- `build.gradle`: Android versionCode `38`, versionName `2.1.0`. `app.json`: version `2.1.1`, iOS buildNumber `21`. **Note iOS marketing version (2.1.1) is ahead of Android versionName (2.1.0)** — they diverged because the iOS 2.1.0 train was sealed (see below).
- **iOS 2.1.0 train is CLOSED** — an approved build sealed it, so ASC rejects new 2.1.0 builds (ITMS-90186 + 90062). Bump `app.json` version (e.g. 2.1.1) for any new iOS build. iOS `runtimeVersion` uses the `appVersion` policy, so the version bump also moves the iOS OTA runtime (now `2.1.1`).
- Android `eas submit` fails due to Google service account permissions — download `.aab` and upload manually in Play Console.
- iOS App Store Connect won't let you swap builds on an existing version — create a new version instead.
- **`eas build` needs eas-cli >= 20** (eas.json constraint); the global install is a stale 16.28.0, so use `npx eas-cli@latest ...`. `eas update` works on the old one.
- To read an ASC submission's real error (eas-cli only prints "something went wrong"): query `api.expo.dev/graphql` with the `expo-session` header from `~/.expo/state.json` `auth.sessionSecret`.
- iOS OTA update ID (legacy 2.0.1): `562f0e34-83ef-4bdd-869e-39d6684ddfd1`.

## Test Accounts

- `avocadomike@hotmail.com` (1234 ratings, 72 reviews)
- `michaelsprimak@gmail.com`
- `applereview@goodfights.app` / `AppleTest2026!` (Apple Review)
- `testdev2@goodfights.app`, `test@goodfights.app` / `Testpass1!` (dev)
