# Live Event Management

How events move through their lifecycle in Good Fights.

## Architecture: The 3-Step Lifecycle

One background job (`eventLifecycle.ts`) runs every 5 minutes with 3 steps:

### Step 1: UPCOMING → LIVE

Events whose earliest start time has passed get marked LIVE.

Start time = `earlyPrelimStartTime` || `prelimStartTime` || `mainStartTime` || `event.date`

**UFC auto-start:** When a UFC event transitions to LIVE, the lifecycle job triggers the GitHub Actions UFC live tracker workflow (see UFC Live Tracker section below).

### Step 2: Section-Based Fight Completion

For each LIVE event **not handled by a production scraper**:

- **If event has section times AND fights have `cardType`:** Complete fights by section as each section start time passes
- **Otherwise (fallback):** Complete ALL fights when the event start time passes

Only touches fights still in UPCOMING status. Uses case-insensitive `cardType` matching with trim. Maps "Undercard" → `prelimStartTime`.

**This does NOT auto-complete the event itself.** Events stay LIVE.

**Production scrapers are skipped** — Step 2 does not touch events whose `scraperType` is in `PRODUCTION_SCRAPERS`. The scraper handles fight completion with real results instead.

### Step 3: LIVE → COMPLETED (Estimated End Time)

```
Estimated end = startTime + (numFights x 30min) + 1 hour
Hard cap      = startTime + 8 hours
Completion at = whichever comes FIRST
```

Examples:
- ONE Friday Fights (6 fights): 3h + 1h = **4 hours** after start
- UFC Fight Night (14 fights): 7h + 1h = 8h → **hard cap at 8 hours**
- Small boxing card (5 fights): 2.5h + 1h = **3.5 hours** after start

Admin can also manually mark events COMPLETED via the admin panel at any time.

## Why Events Stay LIVE Until Estimated End

Fights go COMPLETED at section start times so users can rate them immediately. But the **event stays on the "upcoming fights" screen** throughout the evening so users can see all fights from the current event in one place. It moves to "completed fights" based on the estimated duration formula above.

## Scraper Types

The `scraperType` field on events determines which scraper (if any) handles live tracking:

| Value | Description | Status |
|-------|-------------|--------|
| `null` | No scraper — lifecycle service handles everything | Default |
| `ufc` | UFC live parser | **Production** |
| `matchroom` | Matchroom live parser | Development |
| `oktagon` | OKTAGON live parser | Development |
| `onefc` | ONE FC live parser | Development |
| `tapology` | Tapology live parser | Development |

### Production Scrapers

The `PRODUCTION_SCRAPERS` array in `liveTrackerConfig.ts` controls which scrapers are trusted to auto-publish results.

**Current production scrapers: `['ufc']`**

When a scraper is in this list:
1. Lifecycle Step 2 **skips** that event (no timer-based fight completion)
2. Scraper writes directly to **published fields** (auto-publish, no manual publish needed)
3. Shadow `tracker*` fields are also written for audit trail

**To promote a scraper to production:**
1. Test thoroughly during multiple live events
2. Add the scraper type to `PRODUCTION_SCRAPERS` in `src/config/liveTrackerConfig.ts`
3. The lifecycle service will skip events with that scraper type (the scraper handles everything)

### Shadow Fields

All 5 live parsers write to shadow `tracker*` fields on every fight:
- `trackerFightStatus`, `trackerWinner`, `trackerMethod`, `trackerRound`, `trackerTime`
- Production scrapers also write to published fields (auto-publish)
- Non-production scrapers only write shadow fields; admin publishes manually

## UFC Live Tracker

The UFC live tracker scrapes UFC.com during live events and updates fight results in real time. It runs on **GitHub Actions** (not Render) because UFC.com blocks traffic from Render's IPs and also blocks lightweight HTTP clients (axios/cheerio returns 403). Puppeteer on a fresh GitHub Actions runner is the only reliable approach.

### Architecture: Render Triggers GitHub Actions

UFC.com requires a full headless browser and blocks Render IPs. GitHub Actions cron (`*/5 * * * *`) is unreliable — runs had 15-35 minute gaps in practice. The solution:

1. **Render lifecycle service** (reliable every 5 min) calls the GitHub API to dispatch the workflow
2. **GitHub Actions** spins up within ~30 seconds, runs Puppeteer, scrapes UFC.com
3. **The script** updates the database directly via `DATABASE_URL` (no Render involvement)
4. **GitHub cron** (`*/5`) still runs as a backup, but Render-triggered dispatches are the primary mechanism

The dispatch has a **4-minute cooldown** to avoid duplicate runs. The lifecycle triggers it both on UPCOMING→LIVE transition and on every subsequent cycle while a UFC event is LIVE.

**Requirements:**
- `GITHUB_TOKEN` env var on Render with `actions:write` permission on the repo
- Event must have `scraperType: 'ufc'` set (admin must opt in via admin panel)
- Event must have `ufcUrl` set (populated by the daily UFC scraper)

### How It Works

1. **Auto-trigger:** Render lifecycle detects LIVE UFC event → dispatches GitHub Actions workflow via API
2. **GitHub Actions** (`ufc-live-tracker.yml`): Installs Chromium, runs `runUFCLiveTracker.ts`
3. **Scraper** (`scrapeLiveEvent.js`): Puppeteer loads UFC.com event page, extracts fight data from DOM
4. **Parser** (`ufcLiveParser.ts`): Matches scraped fights to DB fights, updates results
5. **Auto-publish:** Since UFC is a production scraper, results go directly to published fields
6. **Auto-complete:** When all fights are done, the event is marked COMPLETED
7. **Frequency:** Every ~5 minutes (Render lifecycle interval)

### GitHub Actions Usage

Each run takes ~1 minute. During a UFC event (~5 hours at 5-min intervals) = ~60 runs = **60 minutes**. With ~4 UFC events/month = ~240 minutes. Free tier allows 2,000 minutes/month — well within limits.

### Event Setup for Live Tracking

For the tracker to pick up an event, it needs:
1. `scraperType` set to `ufc` (set via admin panel or database)
2. `ufcUrl` set (usually populated by the daily scraper)
3. `eventStatus` not `COMPLETED`
4. A start time within the tracking window (12 hours ago to 6 hours from now)

The `runUFCLiveTracker.ts` script auto-detects the active event based on these criteria.

### Fight Matching

The parser matches scraped fights to DB fights using:
1. `ufcFightId` (UFC's `data-fmid` attribute) — preferred, most reliable
2. Last name matching (bidirectional) — fallback

### What the Scraper Detects

- Fight status: upcoming / live / complete
- Winner (by checking which corner has the win indicator)
- Method, round, time (from result elements)
- Current round for live fights (by expanding the fight card)
- New fights added during the event (creates fighter + fight records)
- Cancelled fights (missing from scraped data → marked CANCELLED)
- Fight un-cancellations (fight reappears after being removed)

### Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/ufc-live-tracker.yml` | GitHub Actions workflow — cron + dispatch trigger |
| `src/scripts/runUFCLiveTracker.ts` | GitHub Actions entry point — finds event, runs scraper, parses |
| `src/services/scrapeLiveEvent.js` | Puppeteer scraper — loads UFC.com, extracts fight data |
| `src/services/ufcLiveParser.ts` | Parser — matches fights, updates DB, handles cancellations |
| `src/services/eventLifecycle.ts` | Lifecycle service — triggers GitHub dispatch (Step 1.5) |
| `src/services/liveEventTracker.ts` | Legacy Render-based orchestrator (kept for manual/API use) |
| `src/services/ufcLiveScraper.ts` | Axios/cheerio scraper (does NOT work — UFC.com returns 403) |

### Manual Control

Even with the tracker running, you have full manual override:

| Endpoint | What it does |
|----------|-------------|
| `POST /api/live-events/start` | Manually start Render-based tracker (legacy, blocked by UFC.com) |
| `POST /api/live-events/auto-start` | Auto-find current live UFC event and start Render tracker (legacy) |
| `POST /api/live-events/stop` | Stop Render-based tracker |
| `GET /api/live-events/status` | Check if Render tracker is running |
| `POST /api/admin/fights/:id/set-status` | Override any fight's status |
| `PUT /api/admin/fights/:id` | Update fight result data |
| `PUT /api/admin/events/:id/status` | Override event status |

**To manually trigger the GitHub Actions tracker:** Go to GitHub → Actions → "UFC Live Tracker" → "Run workflow". Or dispatch via API/CLI: `gh workflow run ufc-live-tracker.yml`

## Start Time Coverage

As of Feb 2026, all organization scrapers populate `mainStartTime` when time data is available:

| Org | `mainStartTime` | `prelimStartTime` | `earlyPrelimStartTime` | How |
|-----|:---:|:---:|:---:|-----|
| UFC | Yes | Yes | Yes | Scraped from UFC.com |
| PFL | Yes | Yes | N/A | ISO from scripts + prelim regex |
| BKFC | Yes | N/A | N/A | Countdown timer |
| ONE FC | Yes | N/A | N/A | Scraped from onefc.com |
| Matchroom | Yes | N/A | N/A | Scraped from matchroomboxing.com |
| Golden Boy | Yes | N/A | N/A | Scraped from goldenboy.com |
| OKTAGON | Yes | N/A | N/A | ISO datetime from API (midnight guard) |
| Top Rank | Yes | N/A | N/A | Time+timezone regex from page text |
| Zuffa Boxing | Yes | N/A | N/A | Time regex from Tapology (ET default) |
| Dirty Boxing | Yes | N/A | N/A | Time regex from Tapology (ET default) |
| RIZIN | Yes | N/A | N/A | ISO from Sherdog itemprop (midnight guard) |

**Design rules:**
1. Never write midnight UTC as a start time — leave undefined if no real time found
2. All times stored in UTC — use `eventTimeToUTC()` or `new Date(isoString)`
3. Use `undefined` (not `null`) on updates — Prisma skips undefined fields, preserving admin-set times
4. OKTAGON and RIZIN use a "midnight guard": if the parsed date has `hours === 0 && minutes === 0` UTC, no `mainStartTime` is set (midnight = no real time data)

**Fallback:** Events without any start time fields still work — `event.date` is used as the fallback for lifecycle transitions.

## Key Files

| File | Purpose |
|------|---------|
| `src/services/eventLifecycle.ts` | The 3-step lifecycle job (runs every 5 min) + GitHub Actions dispatch |
| `src/config/liveTrackerConfig.ts` | `PRODUCTION_SCRAPERS`, `buildTrackerUpdateData()` |
| `src/services/backgroundJobs.ts` | Starts/stops the lifecycle job |
| `src/routes/admin.ts` | Admin endpoints (set-status, publish, publish-all) |
| `src/routes/liveEvents.ts` | Live tracker API (start/stop/status/auto-start) |
| `.github/workflows/ufc-live-tracker.yml` | GitHub Actions workflow for UFC live scraping |
| `src/scripts/runUFCLiveTracker.ts` | Standalone script run by GitHub Actions |
| `public/admin.html` | Admin panel UI |

## Known Issue: Event Times Display as UTC in Mobile App

The mobile app shows event times in UTC instead of the user's local timezone. For example, an 8 PM EST main card shows as "1 AM" (which is the UTC hour). This is because `formatTime` in several components uses `getHours()` which returns UTC hours on React Native/Hermes.

**Root cause:** `getHours()` returns UTC hours on Hermes engine. Fix is to use `toLocaleTimeString()` instead — a shared utility (`utils/dateFormatters.ts`) was created with the fix, but the app needs to be rebuilt for users to see the corrected times.

**Note on event dates:** `event.date` is stored at midnight UTC, typically one day ahead of the US local date (e.g., a Saturday night EST event stores as Sunday midnight UTC). `toLocaleDateString` in US timezones shifts this back to the correct day. Do NOT change dates to noon UTC — that breaks the display.

## Mobile App Live Refresh

The mobile app polls for updated fight data so users see status changes without restarting the app.

**Upcoming events screen** (`app/(tabs)/events/index.tsx`): `refetchInterval: 30000` (30s)
**Event detail screens** (`app/(tabs)/events/[id].tsx`, `app/event/[id].tsx`): `refetchInterval: 30000` (30s)
**Live event polling** (`hooks/useLiveEventPolling.ts`): Once event is detected as LIVE, polls every 10s

The 30s interval ensures the app picks up fight status changes (UPCOMING → LIVE → COMPLETED) from the scraper. Once the event shows as LIVE, the faster 10s polling takes over on the detail screen. These are JS-only changes, deployable via **EAS Update** (no rebuild needed).

## Admin Workflow During Events

### Before an event — required setup:
1. Set `scraperType` to `ufc` on the event in the admin panel (daily scraper creates events with `scraperType: null` by default)
2. Verify `ufcUrl` is set (usually populated by the daily scraper)
3. That's it — the rest is automatic

### With UFC live tracker (automatic):
1. Ensure event has `scraperType: 'ufc'` set in admin panel
2. Event goes LIVE → Render lifecycle triggers GitHub Actions workflow every ~5 min
3. Monitor via Render logs (`[Lifecycle] Triggered GitHub Actions UFC live tracker`) and GitHub Actions tab
4. Results auto-publish to the app in real time — users see updates within 30 seconds
5. If scraper gets something wrong, override via admin panel
6. To stop: set `scraperType` to null in admin panel, or set event to COMPLETED

### Without a production scraper (manual):
1. Open admin panel → select event
2. As fights start, click **Live** on each fight
3. When a fight ends, click **Completed** and optionally enter winner/method/round/time
4. If a live scraper is running, you'll see tracker data alongside published data
5. Click **Publish** on individual fights to copy tracker data → published fields
6. Click **Publish All** to bulk-publish all tracker results for the event
