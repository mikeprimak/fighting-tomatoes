# CLAUDE.md

Good Fights: React Native + Node.js combat sports fight rating app.

## Important Rules

- **Always ask before starting EAS builds** — build credits are limited
- **Never use local DB** — always use Render External URL unless explicitly asked
- **Document your work** — at end of every session, create or update `docs/daily/YYYY-MM-DD.md`. If you changed how an area works, update the relevant `docs/areas/*.md`. See `docs/README.md` for templates. Do this without being asked.
- **Vercel CLI is installed** — manage Vercel things yourself (deploys, env vars, project linking, logs). Don't make the user run Vercel commands. Projects: `packages/web` (Next.js at web-jet-gamma-12.vercel.app) and `packages/landing` (static at goodfights.app). Both auto-deploy from `main` — a `git push` usually suffices.
- **Log recurring tasks** — when a session surfaces a *recurring* operator task (weekly attribution review, quarterly trait refresh, scraper health audits, etc.), append it to `docs/operations/maintenance.md` under the right cadence section. One-offs don't belong there.

## Next Session

**→ `docs/HANDOFF-tag-aware-personality-2026-05-17.md`** — read first. Phase 1 Fan DNA is shipped + verified in prod (5 traits firing, peek endpoint, reveal modals stable). Next session builds the tag-aware copy layer — traits that read `Fight.aiTags` (populated by the AI enrichment pipeline) so lines can quote the fight's character: style clashes, rematches, stakes, pace. Start with `style-clash` as the pattern-validating trait. Prior peek-endpoint handoff at `docs/HANDOFF-next-session-2026-05-18.md` is done.

## Workstream Sessions

When Mike says "this is a [X] session", switch into focused mode on that workstream. Read the source-of-truth doc first, then follow the standard protocol: tell him what phase we're in, what's next, pick the highest-impact unblocked item, log to `docs/daily/YYYY-MM-DD.md` at session end.

| Trigger phrase | Source of truth | Mode notes |
|---|---|---|
| "marketing session" | `GOOD_FIGHTS_90_Day_Marketing_Plan.md` + `docs/marketing/buyer-pipeline.md` | Coach/cheerleader, not coder. Solo introvert; reframe in dev terms. $100/mo budget concentrated on fight weeks. Target cards: UFC 328 (May 9), MVP Netflix (May 16), UFC White House (Jun 15). Track installs, MAU, rating, CPI, Reddit engagement every 2wks. Don't push extrovert tactics (cold DMs, live video). |
| "AI enrichment session" | `docs/areas/ai-enrichment.md` | First-class field, not a feature. Template: broadcast discovery (`packages/backend/src/services/broadcastDiscovery/`). Default model: Claude Haiku 4.5 + prompt caching. Cost ceiling <$300/yr. Don't ship LLM outputs without a confidence floor. |
| "rewarding users session" | `docs/areas/rewarding-users.md` | Aesthetic: Letterboxd/Strava/Last.fm. Anti: Duolingo. **No leaderboards. No prizes.** Reward = closure + identity. Brainstorm new ideas each session and append to inventory. Don't ship Fan DNA before there's enough data (empty-room problem). |
| "follow-fighter session" | `docs/areas/follow-fighter.md` | **THE acquisition workstream.** Every decision: does this make the dataset more valuable to a buyer? Target: 100K users × 5+ avg follows. Quality > volume — engagement tracking on every new follow surface. **Never derive `followedAt`** — that column is load-bearing for the sale narrative. No gamification, no auto-follow-everyone. |
| "live trackers session" | `docs/areas/live-trackers.md` | The substrate every notification + rating-prompt compounds on. Goal: sub-5-min start/end signal for *every* org we list. Source ladder: official → aggregator → live blog → social → manual. **Don't fabricate timestamps** — null > guess. **Don't reverse COMPLETED→UPCOMING** ever. Log every source probed (even rejected ones) to the experiments log so future sessions don't redo dead research. Coverage gaps: MVP, Top Rank, Golden Boy, Gold Star. |

## Web App

- `packages/web` (Next.js 16.2 + Tailwind v4), prod: https://web-jet-gamma-12.vercel.app
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

## Reference

- **App icon update / IP switching**: `docs/playbooks/update-app-icon.md`
- **API endpoints**: `docs/API.md`
- **Doc system overview**: `docs/README.md`

## Current Store Versions (as of Feb 27, 2026)

| Platform | Version | Build # | Status |
|---|---|---|---|
| Android (Play Store) | 2.0.2 | versionCode 34 | Built, needs manual upload |
| iOS (App Store) | 2.0.1 | buildNumber 18 + OTA | Live |

- `app.json`: version `2.0.2`, iOS buildNumber `19`, Android versionCode `34`
- iOS OTA update ID: `562f0e34-83ef-4bdd-869e-39d6684ddfd1` (runtime 2.0.1)
- Android `eas submit` fails due to Google service account permissions — upload `.aab` manually
- iOS App Store Connect won't let you swap builds on an existing version — create a new version instead

## Test Accounts

- `avocadomike@hotmail.com` (1234 ratings, 72 reviews)
- `michaelsprimak@gmail.com`
- `applereview@goodfights.app` / `AppleTest2026!` (Apple Review)
- `testdev2@goodfights.app`, `test@goodfights.app` / `Testpass1!` (dev)
