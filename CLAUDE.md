# CLAUDE.md

Good Fights: React Native + Node.js combat sports fight rating app.

## Important Rules

- **🔓 The GitHub repo is PUBLIC** (required: free unlimited Actions minutes for the ~30 scheduled scraper workflows). Never commit credentials, test-account passwords, or business-sensitive docs (marketing plans, pitch contacts, sale/acquisition material) — those live in the gitignored `private/` folder. History was purged of secrets 2026-07-18.

- **Always ask before starting EAS builds** — build credits are limited
- **Never use local DB** — always use Render External URL unless explicitly asked
- **🚨 NEVER run `prisma migrate dev`, `db push`, `migrate diff`, or `migrate reset` against the DB.** Because `DATABASE_URL` always points at the **production** Render Postgres (rule above), these run against **prod** — and `migrate dev`/`diff`/`db push` create a `prisma_migrate_shadow_db_*` (a `CREATE DATABASE` + full replay of every migration). On the 256 MB instance this OOM-crashes Postgres; doing it repeatedly while iterating crash-loops the whole app. This caused the **2026-06-06 DB outage** (9 orphaned shadow DBs). To **apply** a migration use `prisma migrate deploy` (or `pnpm db:migrate:deploy`) only — it never creates a shadow DB. To **author** a new migration, point `DATABASE_URL`/`SHADOW_DATABASE_URL` at a throwaway LOCAL Postgres, generate the SQL there, then `migrate deploy` to prod. The `db:migrate`/`db:seed`/`db:reset` footgun scripts were **removed from package.json 2026-07-17** — never re-add them. See `docs/daily/2026-06-06.md` + memory `prisma-never-migrate-dev-on-prod`.
- **Document your work** — at end of every session, create or update `docs/daily/YYYY-MM-DD.md`. If you changed how an area works, update the relevant `docs/areas/*.md`. See `docs/README.md` for templates. Do this without being asked.
- **Vercel CLI is installed** — manage Vercel things yourself (deploys, env vars, project linking, logs). Don't make the user run Vercel commands. Projects: `packages/web` (Next.js, **prod at goodfights.app**) and `packages/landing` (static). Both auto-deploy from `main` — a `git push` usually suffices. **`web-jet-gamma-12.vercel.app` is the old `packages/web` URL and is now an unused dev area — use goodfights.app, never web-jet-gamma-12.**
- **Log recurring tasks** — when a session surfaces a *recurring* operator task (weekly attribution review, quarterly trait refresh, scraper health audits, etc.), append it to `docs/operations/maintenance.md` under the right cadence section. One-offs don't belong there.

## Next Session

**→ PICK UP HERE. Round Numbers #1 is PUBLISHED; the pitch send is blocked on two Mike-only tasks.** The letdowns article is live and verified at `https://goodfights.app/blog/biggest-fight-letdowns-2026`, through 5 banner rounds + a clickable TOC (latest `0c4e5a1e`).

**Blocking Monday's journalist send:**
1. ~~Create `mikeprimak@goodfights.app`~~ **DONE 2026-07-21** — created as an **alias on `contact@goodfights.app`**, not a separate user. Zoho refused a new user ("not enough licenses" — the org has 1 seat, the free 5-user tier wasn't in effect), and aliases don't consume a license. The Zoho user's login is `avocadomike@hotmail.com`; `contact@goodfights.app` is the mailbox on it, so aliases are added under that user, not a user named contact@. Alias sends authenticate on the domain's own DKIM/SPF, verified healthy 2026-07-20. **Pick the alias in the From dropdown on every send** — the default is still contact@. Replies land in the main inbox (no filter folder set up).
2. **Fill the `email` column** in `private/marketing/pitches/mma-media-list.csv` (41 rows, ordered by fit not fame). It is deliberately empty: MMA outlets are Cloudflare-blocked and search obfuscates addresses, and **no address was ever pattern-guessed**. Verify current outlet from a recent byline first — Bloody Elbow split in 2026 (GRV Media owns the site; the old team runs The MMA Draw).

Then send the pitches personally (one per email, no BCC, **NO Reddit**), offer custom data pulls to repliers, and watch GA4/PostHog for `utm_campaign=round-numbers-letdowns`.

**Lessons that must carry to #2:** re-run the "no superlative outruns the table" check over *derivative* copy (pitches/social), not just the article body — two overstated claims were caught in the pitch drafts. Pull the live distribution from prod before drawing any graphic; every tile is a factual claim. Score text on heatmap colours is **always white with a dark shadow**. **Voice: `docs/marketing/round-numbers-voice.md`.** Full detail: `docs/daily/2026-07-20.md`. Series is quarterly (next ~October); engine `packages/backend/scripts/hype-vs-reality.ts`, banner `packages/backend/scripts/generateLetdownsBanner.js`.

**→ PICK UP HERE (SEO workstream, after 2026-07-17/18 sessions).** The 2026-07-17 design session locked the SEO plan (`docs/plans/operation-own-the-serps.md`: P6 links pillar — quarterly data articles pitched by Mike directly to journalists, NO Reddit; explainers demoted to last; success metric = **catalog tier-1 clicks**, auto-computed in the Monday GSC report's "Compounding baseline" section, starting line ~6/week). The front-load is now **fully shipped and verified in prod**: internal-linking pass (`a49737f2`), `/orgs/[org]` hubs (`eab70028`; `packages/web/src/lib/orgs.ts` must mirror backend `promotionRegistry` on shelve/unshelve), best-of engine expansion (`a28e54f1`+`b6e01ba1`; 12 facet URLs confirmed in the live sitemap 2026-07-18, GSC resubmitted), and **fighter next/last-fight SSR answer blocks** (`a6fd9113`, 2026-07-18: spoiler-safe "who is X fighting next / when did X last fight" cards + next-fight-first meta description on `/fighters/[id]`). GSC coverage triage done 2026-07-18 (all buckets intended behavior; `gsc.js` gained an `inspect` command; org hubs indexed within a day). **Next in line:** (1) UFC 330 how-to-watch at **T-14 = Aug 1** with per-country sections CA/UK/IE/AU (event Aug 15; extend `ufc-330-makhachev-garry-preview`, don't duplicate), (2) ~~P6 data article~~ **DONE — shipped 2026-07-20 as Round Numbers #1**; next installment is quarterly, (3) watch Monday's GSC report Compounding-baseline number, (4) GSC UI re-check of the 19 dup-no-canonical bucket ~Aug 1. See `docs/daily/2026-07-18.md`.

**✅ DONE (2026-07-17 late evening, sessions 4–5) — backlog continuation + seed-data/dead-code sweep.** Shipped: web PostHog `identify()` on login; the §7 comment edit/delete bug (4 root causes incl. a **silent review-deletion** on rating-only changes); post-fight deletion of own pre-fight comments; OTA published (iOS `b9adc86e` / Android `55d6edba`). Then the §13 sweep: **backend tsc 67 → 0 errors**, ~50 dead files deleted (Express era, .routes.ts era, AdminJS, an **unauthenticated `/api/mock-live-events` API that was live in prod** — security fix), 25 seed users + 1,117 fake hype predictions deleted from prod, `db:migrate`/`db:seed`/`db:reset` footguns removed from package.json. Deploy note: dep changes MUST commit root `pnpm-lock.yaml` in the same push (`47b28d7e` fixed the frozen-lockfile deploy failure — verify it went green). Remaining sweep work (false&&-gated JSX blocks) is logged on the §13 backlog item. See `docs/daily/2026-07-17.md` sessions 4–5.

**✅ DONE (2026-07-17 evening) — backlog intake + 11 quick wins shipped + 3 production OTAs.** ~17 new items added to `docs/BACKLOG.md` (triage there). Shipped: web review self-upvote (backend POST /review), "(me)" comment labels, sidebar rec rated-fight filter, tab-bar spacing, profile notifications-row removal, delete-account restyle, home-comment content filter (`utils/contentFilter.ts`, both platforms), fighter hype-modal bell, inline See more, section-aware "Main @"/"Event @" home card labels. OTAs delivered taste engine + all mobile fixes (latest groups: iOS `502a78f2`, Android `6ff106fc`). See `docs/daily/2026-07-17.md`.

**✅ DONE (2026-07-17) — GA4 conversion tracking fully live.** Key events
marked, MP API secret created and set on Render, and the root cause of the
zero-events mystery fixed: gtag batches ~5s and drops queued events on
navigation, so click-then-navigate conversions never sent. Now relayed via
sendBeacon → `/api/track/ga` → GA4 Measurement Protocol. Verified end-to-end
in GA4 Realtime. See `docs/daily/2026-07-17.md`. Remaining analytics TODOs:
GA4↔Search Console link, import conversions into Google Ads, web
`identify()` on login.

**✅ DONE (2026-06-30) — Home-reorder OTA published.** The held OTA for the Home-screen reorder (`d4095d05`) was published after the 2.1.3 store builds went live: iOS runtime `2.1.3` (group `bca2b1d2…`), Android runtime `1.0.0` (group `54a94c8d…`). The 2.1.3 native builds were cut *before* the reorder commit, so this OTA is what delivers the reorder to them. See `docs/daily/2026-06-30.md`.

**→ `docs/HANDOFF-web-qa-evening-2026-05-22.md`** — read first. Eight web app commits shipped 2026-05-22 evening (modal/cache parity sweep, nullify hype/rating, event detail layout + fights-load fix, search auth race). **Nothing tested live yet.** Handoff has the 8-step test plan. Backend + Vercel deploys were in flight when the session ended.

**TODO next session — web analytics follow-ups (2026-06-06):** GA4 (`G-WV5RKCMJSB`) + PostHog now live on goodfights.app (see `docs/daily/2026-06-06.md`). Still to do: (1) link GA4 → Search Console, (2) import GA4 conversions into Google Ads, (3) define conversion events (rating submitted, app-download click) in PostHog and/or GA. Web `identify()` on login not yet wired (pageviews only).

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
| "marketing session" | `private/GOOD_FIGHTS_90_Day_Marketing_Plan.md` + `private/marketing/buyer-pipeline.md` | Coach/cheerleader, not coder. Solo introvert; reframe in dev terms. $100/mo budget concentrated on fight weeks. Target cards: UFC 328 (May 9), MVP Netflix (May 16), UFC White House (Jun 15). Track installs, MAU, rating, CPI, Reddit engagement every 2wks. Don't push extrovert tactics (cold DMs, live video). |
| "AI enrichment session" | `docs/areas/ai-enrichment.md` | First-class field, not a feature. Template: broadcast discovery (`packages/backend/src/services/broadcastDiscovery/`). Default model: Claude Haiku 4.5 + prompt caching. Cost ceiling <$300/yr. Don't ship LLM outputs without a confidence floor. |
| "rewarding users session" | `docs/areas/rewarding-users.md` | Aesthetic: Letterboxd/Strava/Last.fm. Anti: Duolingo. **No leaderboards. No prizes.** Reward = closure + identity. Brainstorm new ideas each session and append to inventory. Don't ship Fan DNA before there's enough data (empty-room problem). |
| "follow-fighter session" | `docs/areas/follow-fighter.md` | **THE acquisition workstream.** Every decision: does this make the dataset more valuable to a buyer? Target: 100K users × 5+ avg follows. Quality > volume — engagement tracking on every new follow surface. **Never derive `followedAt`** — that column is load-bearing for the sale narrative. No gamification, no auto-follow-everyone. |
| "live trackers session" | `docs/areas/live-trackers.md` | The substrate every notification + rating-prompt compounds on. Goal: sub-5-min start/end signal for *every* org we list. Source ladder: official → aggregator → live blog → social → manual. **Don't fabricate timestamps** — null > guess. **Don't reverse COMPLETED→UPCOMING** ever. Log every source probed (even rejected ones) to the experiments log so future sessions don't redo dead research. Coverage gaps: MVP, Top Rank, Golden Boy, Gold Star. |
| "sale value session" / "let's talk about building the sale value" / "selling the app" | `private/sale-value.md` | **Open thinking mode, not plan-following.** Persistent context for the acquisition thesis. Every session is a reassessment — don't push a plan, let Mike lead. The doc is context to load, not a checklist to execute. Honesty over optimism (200 users is small, don't dress up). Push back on overreach. Update the doc when the framework shifts; save new roadmap items as project memories. At current scale almost nothing executes today — purpose is to shape decisions now so assets exist with history when scale lands. |

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

## Current Store Versions (as of July 4, 2026)

| Platform | Version | Build # | Status |
|---|---|---|---|
| Android (Play Store) | 2.1.3 | versionCode 40 | **LIVE** (image-share + open-in-app build, cut 2026-06-29) |
| iOS (App Store) | 2.1.3 | buildNumber 23 | **LIVE** (same 2.1.3 train) |

- **Both store builds are live**, so production OTAs reach the full user base. OTA runtime targeting: **Android = `1.0.0`** (hardcoded `app.json` android `runtimeVersion`), **iOS = `2.1.3`** (`appVersion` policy). `eas update --branch production` auto-targets both. Verify the live runtime empirically with `eas update:list --branch production` before publishing — confirmed 2026-07-04 that the latest production OTA (2026-06-30 home-reorder) targets iOS `2.1.3` / Android `1.0.0`.
- **Android notification tray icon fix (`f112c5c1`) SHIPPED in vc40** — the fix predates the 2.1.3 bump commit (`13ba1be5`), so the white-glove icon is live. No pending native changes.
- **Android prod history: vc 36 (2.0.x) → vc 37/38 (2.1.0, 2026-06-01) → vc 40 (2.1.3)**. Always check the live Play Console versionCode before bumping — `build.gradle` governs (bare `android/` dir), not `app.json`.
- `build.gradle`: Android versionCode `40`, versionName `2.1.3`. `app.json`: version `2.1.3`, iOS buildNumber `23`. iOS and Android marketing versions are re-aligned at 2.1.3.
- **Old iOS version trains are CLOSED once a build is approved** — ASC rejects new builds on a sealed version (ITMS-90186 + 90062). Bump `app.json` version for any new iOS build. iOS `runtimeVersion` uses the `appVersion` policy, so the version bump also moves the iOS OTA runtime (now `2.1.3`).
- Android `eas submit` fails due to Google service account permissions — download `.aab` and upload manually in Play Console.
- iOS App Store Connect won't let you swap builds on an existing version — create a new version instead.
- **`eas build` needs eas-cli >= 20** (eas.json constraint); the global install is a stale 16.28.0, so use `npx eas-cli@latest ...`. `eas update` works on the old one.
- To read an ASC submission's real error (eas-cli only prints "something went wrong"): query `api.expo.dev/graphql` with the `expo-session` header from `~/.expo/state.json` `auth.sessionSecret`.
- iOS OTA update ID (legacy 2.0.1): `562f0e34-83ef-4bdd-869e-39d6684ddfd1`.

## Test Accounts

See `private/test-accounts.md` (gitignored — repo is public, never commit credentials here).
