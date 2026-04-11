# Backend

## Overview
Fastify API server with Prisma ORM and PostgreSQL.

**Package:** `packages/backend/`
**Framework:** Fastify, Prisma, PostgreSQL
**Hosting:** Render (web service + managed Postgres)
**URL:** https://fightcrewapp-backend.onrender.com

## Database Stats (Apr 6, 2026)
| Table | Count |
|-------|-------|
| Fights | 13,598 |
| Fight ratings | 66,512 |
| Hype predictions | 1,531 |
| Events | 1,439 |
| Reviews | 777 |
| Comments | 54 |

## Key Systems

### Event Lifecycle (`services/eventLifecycle.ts`)
Runs every 5 minutes via Render cron:
1. UPCOMING -> LIVE when start time passes
2. Section-based fight completion (by cardType + section start times)
3. LIVE -> COMPLETED after estimated duration (numFights x 30min + 1hr, max 8hr)

### Scrapers
Events use `scraperType` field (null = no scraper, or `ufc`/`matchroom`/`oktagon`/`onefc`/`tapology`/`bkfc`).

All production scrapers are fully automatic — daily scrapers set `scraperType` and the lifecycle dispatches live trackers. The Tapology live tracker is generic and covers Zuffa Boxing, Karate Combat, Dirty Boxing, PFL, and RIZIN.

See `areas/scrapers.md` for details.

### Tapology Live Tracker — Safety Invariants (post Apr 10, 2026)
Two guards were added after the DBX 6 incident (see `daily/2026-04-10.md`), and any future changes to the tapology parser or runner must preserve them:

1. **`scrapeLooksValid` guard** in `services/tapologyLiveParser.ts`: the "missing from scraped data = CANCEL" sweep and the UPCOMING→LIVE flip only run if `scrapedData.fights.length > 0 && result.fightsMatched > 0`. An empty or unmatched scrape is logged and ignored — it must not cancel DB fights.
2. **`hasAnyCompleted` guard** in `scripts/runTapologyLiveTracker.ts` (`autoCompleteTapologyEvent`): auto-completion requires `allTerminal && hasAnyCompleted` — i.e. at least one fight must actually be COMPLETED, not just CANCELLED. An "all-cancelled" card is treated as a broken-scrape symptom and does not complete the event.

**Rule for adding new live trackers**: any "detect event state from absence in scrape" logic must first validate the scrape itself (non-empty, some matches). Never let an empty scrape cause destructive DB writes.

### Tapology Live Tracker — Added Capabilities (Apr 10, 2026)
See `areas/scrapers.md` for the long version. Highlights for backend work:
- Parser now **creates fighters + fight row on the fly** when a scraped fight has no DB match (uses `findOrCreateFighter` pattern from `ufcLiveParser.ts`). Fight gets `orderOnCard` from Tapology's card position (extracted via `boutOrder` on the scraped fight) or `maxOrder + 1`.
- Completion block is now **idempotent**: no longer gated on `fightStatus !== 'COMPLETED'`. Diffs each result field against the DB and writes differences. This lets the tracker backfill results onto lifecycle-prematurely-completed fights.
- **No Contest and Draw** results set `winner = 'nc'` / `'draw'` (sentinel strings per the `Fight.winner` schema comment). Do not break this — the mobile UI keys off these strings for the NC badge / "No Contest" text.
- `ParseResult` now has `fightsCreated` in addition to `fightsUpdated` / `fightsMatched` / `cancelledCount` / `unCancelledCount`.

### VPS scraper service (Hetzner) — deploy footgun
`scraperService.ts` runs on a Hetzner VPS (`178.156.231.241:3009`, systemd `scraper-service`) and is the **primary** execution path for all live trackers (PFL, BKFC, RIZIN, Zuffa Boxing, Karate Combat, Dirty Boxing). `eventLifecycle.ts` calls `POST {VPS_SCRAPER_URL}/track/check` every ~5 min; the VPS then runs its own 30-second scrape loop per active event. GitHub Actions workflows (`tapology-live-tracker.yml`, `ufc-live-tracker.yml`, etc.) are only a fallback for when the VPS is unreachable.

**The VPS does not auto-deploy from `main`.** Any fix that touches the scraper/parser/runner files requires:
```bash
ssh <user>@178.156.231.241
bash /opt/scraper-service/packages/backend/vps-update.sh   # git pull && pnpm install && pnpm build && systemctl restart scraper-service
```
If you push a fix, watch GH Actions for the tracker workflow, *and it never runs*, the reason is almost certainly that the VPS is handling the tracker and hasn't been updated. There's no webhook or CD pipeline for the VPS yet.

### Admin panel (`public/admin.html`)
Static file served by `@fastify/static` in `server.ts`. Ships with normal backend redeploys — no separate build step.

**Event start-time entry is always in Eastern Time.** The `saveEvent` form calls `etToUTC(dateStr, timeStr)` at line ~2307 to convert ET wall-clock input to a UTC ISO string for the DB. As of 2026-04-11 (commit `fb0f94e`) this helper probes both `-04:00` (EDT) and `-05:00` (EST) candidates, formats each back in `America/New_York`, and picks whichever reproduces the requested wall clock. It is **DST-aware and independent of the browser's local timezone** — critical because many admins run their browsers in ET themselves.

**Do not** "simplify" `etToUTC` to a round-trip through `toLocaleString` + `new Date(str)`. That approach silently returns a zero offset when the browser is already in ET (both sides of the round trip land on the same instant) and stores the entered wall clock as UTC verbatim, producing a consistent −4-hour (EDT) / −5-hour (EST) shift on reload and in the app. That exact bug lived in this file for months before being caught.

### Auth
JWT dual-token system (15min access / 7day refresh)

### Build & type-check (post Apr 11, 2026)
The backend `pnpm build` is now **honest** — type errors fail the build. Prior to the 2026-04-11 cleanup it ended with `|| true`, which silently swallowed 81 type errors for months while Render kept deploying (type-level errors, no runtime impact). That's fixed.

- Build script: `prisma generate && tsc --project tsconfig.production.json && { cp src/services/*.js dist/services/ 2>/dev/null || true; }`. The `|| true` is brace-scoped so it only protects the `cp` step (Windows/bash glob-empty compat), not the `tsc` step. **Do not move `|| true` back outside the braces** — that reintroduces the silent-fail bug.
- Main config: `tsconfig.json` extends to `tsconfig.production.json`. Base config has `"lib": ["ES2020", "DOM"]` — DOM is required so Puppeteer `page.evaluate()` callbacks (e.g. `oneFCLiveScraper.ts`) type-check. Don't accidentally use `document` in Node-only files; ESLint doesn't guard this.
- `tsconfig.production.json` excludes ~15 legacy route/middleware/controller files. Some may be ghosts from past refactors — verify before removing entries.
- `src/types/fastify.d.ts` augments both `fastify` (for `FastifyRequest.user`, `FastifyInstance.authenticate`) **and** `fastify/types/schema` (to re-add `description?`, `summary?`, `tags?` on `FastifySchema`). If you add another Fastify type extension, note the submodule — `FastifySchema` lives in `fastify/types/schema`, not the root `fastify` module, and augmenting the wrong module silently no-ops.
- **Pino 9 logging gotcha**: `request.log.error(msg, err)` does not work — the order is `log.error(err, msg)`. Pino 9's `LogFn` uses template-literal `ParseLogFnArgs<TMsg>`, and when the message has no `%s` placeholders, rest args type to `never`. The (msg, err) form both fails type-checking **and** silently drops the error object at runtime (no structured error serialization via `pino-std-serializers`). **Always call `log.error(err, msg)`.** 17 more `log.error(msg, err)` sites still exist in the excluded files `routes/crews.ts` and `routes/upload.ts` — type-check misses them, runtime drops the errors, cleanup pending.
- **Stale `.tsbuildinfo` footgun**: `incremental: true` in `tsconfig.json` means tsc caches to `tsconfig*.tsbuildinfo`. A stale cache can cause `tsc` to exit 0 without emitting anything. If CI ever ships a "successful build" with an empty `dist/`, check for stale tsbuildinfo first.

### Live tracker builds
As of 2026-04-11, all live trackers build under the normal `pnpm build`. The prior `tsconfig.tracker.json` workaround (a focused tsconfig scoped to live-tracker files) was deleted when the main build was fixed. `onefc-live-tracker.yml` uses `pnpm build` like any other workflow.

## Dev Setup
```bash
cd packages/backend
PORT=3008 pnpm dev
```

## API Notes
- `/api/events?includeFights=true` returns `userCommentCount` per fight (batch query on `preFightComment` table, requires auth)
- `/api/community/top-upcoming-fights` also returns `userCommentCount`, `commentCount`, `hypeCount`

## Known Issues
- Render free tier can cold-start slowly
- `eas submit` for Android fails due to Google service account permissions
