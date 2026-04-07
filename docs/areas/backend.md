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

### Auth
JWT dual-token system (15min access / 7day refresh)

## Dev Setup
```bash
cd packages/backend
PORT=3008 pnpm dev
```

## Known Issues
- Render free tier can cold-start slowly
- `eas submit` for Android fails due to Google service account permissions
