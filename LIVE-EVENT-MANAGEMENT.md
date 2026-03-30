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

| Value | Description | Status | Auto-setup? |
|-------|-------------|--------|-------------|
| `null` | No scraper — lifecycle service handles everything | Default | N/A |
| `ufc` | UFC live parser | **Production** | Yes — daily scraper sets it |
| `bkfc` | BKFC live parser (Puppeteer) | **Production** | Yes — daily scraper sets it |
| `matchroom` | Matchroom live parser (legacy) | Deprecated | Switched to `tapology` |
| `oktagon` | OKTAGON live parser | **Production** | Yes — daily scraper sets it |
| `onefc` | ONE FC live parser (Puppeteer) | **Production** | Yes — daily scraper sets it |
| `tapology` | Tapology live parser (generic) | **Production** | Yes — daily scrapers set it |
| `raf` | RAF live parser (cheerio) | **Production** | Yes — daily scraper sets it |

### Production Scrapers

The `PRODUCTION_SCRAPERS` array in `liveTrackerConfig.ts` controls which scrapers are trusted to auto-publish results.

**Current production scrapers: `['ufc', 'oktagon', 'tapology', 'bkfc', 'onefc', 'raf']`**

When a scraper is in this list:
1. Lifecycle Step 2 **skips** that event (no timer-based fight completion)
2. Scraper writes directly to **published fields** (auto-publish, no manual publish needed)
3. Shadow `tracker*` fields are also written for audit trail

**To promote a scraper to production:**
1. Test thoroughly during multiple live events
2. Add the scraper type to `PRODUCTION_SCRAPERS` in `src/config/liveTrackerConfig.ts`
3. The lifecycle service will skip events with that scraper type (the scraper handles everything)

### Per-Fight Notification Settings (Notify Me Bell)

Users can tap a bell icon on upcoming fights to get a push notification when that fight goes live. Two conditions must BOTH be true for the bell to appear:

**Condition 1 — `hasLiveTracking`:** The event's `scraperType` must be in the `PRODUCTION_SCRAPERS` list (code-level, in `liveTrackerConfig.ts`). This is already true for all scraped events.

**Condition 2 — `notificationsAllowed`:** The event's `promotion` string (e.g. `'UFC'`, `'BKFC'`, `'ONE'`) must be in the `notify_promotions` config stored in the `system_config` DB table. This is managed via the **admin panel → Operations tab → Fight Notification Settings** toggles.

```
notificationsAllowed = hasLiveTracking AND promotion is in notify_promotions
```

**To enable notifications for a new org (e.g. PFL):**
1. Ensure events have a `scraperType` that's in `PRODUCTION_SCRAPERS` (PFL already uses `tapology` — already in the list)
2. Go to admin panel → Operations tab → flip the toggle for that org

**To disable notifications for an org:** Just flip the toggle off in admin panel.

No code changes or app rebuilds needed — the mobile app reads `notificationsAllowed` from the API response.

**Current status (as of Mar 2026):** UFC, BKFC, ONE enabled. Tapology-based orgs (PFL, RIZIN, Karate Combat, etc.) have working scrapers but Tapology live results are not reliable enough yet (e.g. RAF event on 2026-03-22 did not show live results on Tapology).

**Implementation notes / gotchas:**
- Fastify response schemas act as serialization filters — any new field (like `notificationsAllowed`) must be added to the schema definition in the route or it gets silently stripped from the response
- Promotion string comparison is **case-insensitive** — DB has mixed casing (`'OKTAGON'` vs `'Rizin'`), admin panel values may differ, so all comparisons use `.toUpperCase()`
- The `getNotifyPromotions()` loader has a **60-second cache** to avoid hitting DB on every request. Cache is invalidated when admin updates the config. Users may need to pull-to-refresh in the app after a toggle change
- The admin panel toggle values should match the exact promotion strings in the DB (e.g. `'OKTAGON'` not `'Oktagon'`, `'Matchroom Boxing'` not `'Matchroom'`)

**Key files:**
- `src/config/liveTrackerConfig.ts` — `PRODUCTION_SCRAPERS` list + `getNotifyPromotions()` cached loader (60s TTL)
- `system_config` DB table — `notify_promotions` key stores the allowed promotions array
- `src/routes/index.ts` — events endpoint adds `notificationsAllowed` to response (must be in response schema)
- `src/routes/fights.ts` — fights endpoints add `notificationsAllowed` to event object (3 places)
- `src/routes/admin.ts` — GET/PUT `/admin/config/notify-promotions` endpoints
- Admin panel UI — Operations tab, "Fight Notification Settings" section
- Mobile — `events/index.tsx` and `live-events.tsx` check `event.notificationsAllowed`

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

The dispatch has a **per-workflow 4-minute cooldown** to avoid duplicate runs. The lifecycle triggers it both on UPCOMING→LIVE transition and on every subsequent cycle while a scraper event is LIVE. Multiple scrapers (e.g., UFC + Oktagon) can run simultaneously — each workflow has its own independent cooldown.

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

## Oktagon Live Tracker

The Oktagon live tracker polls the Oktagon REST API during live events and updates fight results in real time. Unlike UFC (which needs Puppeteer), Oktagon uses a direct REST API — no browser required, faster and more reliable.

### Architecture: Same as UFC (Render Triggers GitHub Actions)

1. **Render lifecycle service** detects LIVE Oktagon event → dispatches `oktagon-live-tracker.yml` every 5 min
2. **GitHub Actions** installs deps, builds, runs `runOktagonLiveTracker.ts`
3. **Scraper** (`oktagonLiveScraper.ts`) fetches `api.oktagonmma.com/v1/events/{id}/fightcard` (~300ms)
4. **Parser** (`oktagonLiveParser.ts`) matches fights by last name, updates DB
5. **Auto-publish** since oktagon is in `PRODUCTION_SCRAPERS`
6. **Auto-complete** when all fights are done

### Fully Automatic

Unlike UFC, Oktagon events require **no manual setup**. The daily scraper (`scrapeAllOktagonData.js`) imports events with `scraperType: 'oktagon'` and the event URL (stored in `ufcUrl` field). When the event goes LIVE, the lifecycle auto-dispatches the tracker.

### What the Scraper Detects

- Fight results: winner (FIGHTER_1_WIN / FIGHTER_2_WIN), method, round, time
- Fight status: upcoming / live / complete
- Cancellations: fights missing from API → marked CANCELLED
- Un-cancellations: cancelled fights reappearing → restored to UPCOMING
- Lifecycle damage: fights prematurely completed by lifecycle (COMPLETED with no winner) → reset to UPCOMING

### API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/events/{slug}` | Event details (ID, date, venue) |
| `GET /v1/events/{id}/fightcard` | Full fight card with live results |

### GitHub Actions Usage

Each run takes ~2 min (no Chromium needed). During an Oktagon event (~5 hours at 5-min intervals) = ~60 runs = **120 minutes**. Free tier allows 2,000 minutes/month.

### Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/oktagon-live-tracker.yml` | GitHub Actions workflow (dispatch trigger only) |
| `src/scripts/runOktagonLiveTracker.ts` | Entry point — finds event, extracts slug from `ufcUrl`, runs scraper+parser |
| `src/services/oktagonLiveScraper.ts` | REST API scraper — fetches fight card, detects changes |
| `src/services/oktagonLiveParser.ts` | Parser — matches fights, updates DB, handles cancellations |
| `src/services/oktagonDataParser.ts` | Daily importer — sets `scraperType: 'oktagon'` on all events |

## BKFC Live Tracker

The BKFC live tracker scrapes bkfc.com event pages during live events using Puppeteer and updates fight results in real time. Like UFC, it requires a headless browser because BKFC uses JavaScript to populate fight data on the page.

### Architecture: Same as UFC (Render Triggers GitHub Actions)

1. **Render lifecycle service** detects LIVE BKFC event → dispatches `bkfc-live-tracker.yml` every 5 min
2. **GitHub Actions** installs deps, builds, installs Chromium, runs `runBKFCLiveTracker.ts`
3. **Scraper** (`scrapeBKFCLiveEvent.js`) loads the BKFC event page with Puppeteer, waits for JS to populate fight data, extracts results from the DOM
4. **Parser** (`bkfcLiveParser.ts`) matches fights by last name, updates DB
5. **Auto-publish** since bkfc is in `PRODUCTION_SCRAPERS`
6. **Auto-complete** when all fights are done

### How It Works

The BKFC event page loads fight data from an external stats API (`xapi.mmareg.com`) via JavaScript, which populates `[data-render]` elements in the DOM. The scraper:

1. Loads the event page and waits 5 seconds for JS to execute
2. Finds fight containers by pairing `a[href*="/fighters/"]` links
3. Reads results from `[data-render="RedResult"]`, `[data-render="BlueResult"]`, `[data-render="Method"]`, `[data-render="Round"]`, `[data-render="Time"]` elements
4. Covers both "Main Card" and "Free Fights" tabs (all fights visible in DOM)

### Event Setup

For the tracker to pick up a BKFC event:
1. `scraperType` set to `bkfc` (set via admin panel)
2. `ufcUrl` set to the BKFC event page URL (e.g., `https://www.bkfc.com/events/bkfc-fight-night-newcastle-2`) — populated by the daily BKFC scraper
3. `eventStatus` not `COMPLETED`
4. `mainStartTime` or `date` within tracking window (12 hours ago to 6 hours from now)

**Note:** Unlike Oktagon, BKFC events require manual `scraperType` setup — the daily scraper does not auto-set `scraperType: 'bkfc'`.

### What the Scraper Detects

- Fight status: upcoming / live / complete (via `html[live-event]` attribute and result fields)
- Winner (by checking which corner has `RedResult="W"` or `BlueResult="W"`)
- Method, round, time (from `[data-render]` elements)
- Cancellations (fights missing from scraped data → marked CANCELLED)
- Un-cancellations (fights reappearing → restored to UPCOMING)

### Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/bkfc-live-tracker.yml` | GitHub Actions workflow (dispatch trigger) |
| `src/scripts/runBKFCLiveTracker.ts` | Entry point — finds event, spawns scraper, runs parser |
| `src/services/scrapeBKFCLiveEvent.js` | Puppeteer scraper — loads bkfc.com, extracts fight data from DOM |
| `src/services/bkfcLiveParser.ts` | Parser — matches fights, updates DB, handles cancellations |
| `src/services/bkfcLiveScraper.ts` | Type definitions for scraped data |

## ONE FC Live Tracker

The ONE FC live tracker scrapes onefc.com event pages during live events using Puppeteer and updates fight results in real time. ONE FC uses JavaScript to render fight data, so a headless browser is required.

### Architecture: Same as UFC (Render Triggers GitHub Actions)

1. **Render lifecycle service** detects LIVE ONE FC event → dispatches `onefc-live-tracker.yml` every 5 min
2. **GitHub Actions** installs deps, builds, installs Chromium, runs `runOneFCLiveTracker.ts`
3. **Scraper** (`oneFCLiveScraper.ts`) loads the ONE FC event page with Puppeteer, extracts fight data from the DOM (~1-3 second scrape times)
4. **Parser** (`oneFCLiveParser.ts`) matches fights by last name (handles single-name fighters), updates DB
5. **Auto-publish** since onefc is in `PRODUCTION_SCRAPERS`
6. **Auto-complete** when all fights are done

### Fully Automatic

Like Oktagon, ONE FC events require **no manual setup**. The daily scraper (`scrapeAllOneFCData.js`) imports events with `scraperType: 'onefc'` and the event URL (stored in `ufcUrl` field). When the event goes LIVE, the lifecycle auto-dispatches the tracker.

### What the Scraper Detects

- Fight status: upcoming / live / complete (via `.is-live` class and `.sticker.is-win` elements)
- Winner (by checking which fighter's container has the win sticker)
- Method, round, time (parsed from sticker text like "TKO (R2)")
- Sport type: MMA, Muay Thai, Kickboxing, Submission Grappling (from weight class text)
- Cancellations (fights missing from scraped data → marked CANCELLED)
- Un-cancellations (fights reappearing → restored to UPCOMING)
- Single-name fighters (e.g., "Superbon") — stored in lastName with empty firstName

### Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/onefc-live-tracker.yml` | GitHub Actions workflow (dispatch trigger) |
| `src/scripts/runOneFCLiveTracker.ts` | Entry point — finds event, runs scraper directly (same process), parses |
| `src/services/oneFCLiveScraper.ts` | Puppeteer scraper — loads onefc.com, extracts fight data from DOM |
| `src/services/oneFCLiveParser.ts` | Parser — matches fights, updates DB, handles cancellations |
| `src/services/oneFCLiveTracker.ts` | Render-based orchestrator (kept for manual/API use) |
| `src/routes/liveEvents.ts` | API endpoints for manual ONE FC tracker control |

## RAF Live Tracker

The RAF (Real American Freestyle) live tracker scrapes realamericanfreestyle.com event pages during live events using **cheerio** (no Puppeteer needed — the Webflow site is fully server-rendered). RAF is a freestyle wrestling promotion, not MMA — results are win/loss with round-by-round scores and takedown counts, no KO/submission methods.

### Architecture: Same as UFC (Render Triggers GitHub Actions)

1. **Render lifecycle service** detects LIVE RAF event → dispatches `raf-live-tracker.yml` every 5 min
2. **GitHub Actions** installs deps, builds, runs `runRAFLiveTracker.ts`
3. **Scraper** (`scrapeRAFLiveEvent.js`) fetches the RAF event page with cheerio, extracts fight data from server-rendered HTML (~1-2 second scrape times, no browser needed)
4. **Parser** (`rafLiveParser.ts`) matches fights by last name, updates DB
5. **Auto-publish** since raf is in `PRODUCTION_SCRAPERS`
6. **Auto-complete** when all fights are done

### Fully Automatic

Like Oktagon, RAF events require **no manual setup**. The daily scraper (`scrapeAllRAFData.js`) imports events with `scraperType: 'raf'` and the event URL (stored in `ufcUrl` field). When the event goes LIVE, the lifecycle auto-dispatches the tracker.

### How the Scraper Works

The RAF website is built on Webflow CMS. All fight data is server-rendered — no JavaScript execution needed. The scraper:

1. Fetches the event page HTML via HTTP
2. Parses fight cards from `div.matchups-list .w-dyn-item` elements
3. Detects winners via the `w-condition-invisible` CSS class on `.win-tag` / `.loss-tag` elements:
   - Winner: `.win-tag` visible (no `w-condition-invisible`)
   - Loser: `.loss-tag` visible (no `w-condition-invisible`)
   - No result: both tags have `w-condition-invisible`
4. Extracts scores from the "Score" section (total + per-round) and takedowns from the "Takedowns" section
5. Detects event completion via the `div.past-event-tag` visibility

### Wrestling-Specific Details

- **Sport type:** `WRESTLING` (new Prisma enum value)
- **Method format:** `Decision (score1-score2)` from the scores section (no KO/TKO/submission in wrestling)
- **Weight classes:** Featherweight, Lightweight, Welterweight, Middleweight, Cruiserweight, Light Heavyweight, Heavyweight, Unlimited
- **Weight class mapping:** Cruiserweight → `HEAVYWEIGHT`, Unlimited → `SUPER_HEAVYWEIGHT` (no MMA cruiserweight enum)
- **Scheduled rounds:** 3 (all RAF matches)
- **No card sections:** RAF has no main card / prelims — all fights listed in order

### What the Scraper Detects

- Fight results: winner (via win/loss tags), scores (total + per-round), takedowns
- Event status: upcoming / live / complete (via `past-event-tag` visibility and fight completion count)
- Cancellations (fights missing from scraped data → marked CANCELLED)
- Un-cancellations (fights reappearing → restored to UPCOMING)

### Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/raf-live-tracker.yml` | GitHub Actions workflow (dispatch trigger) |
| `.github/workflows/raf-scraper.yml` | Daily scraper workflow (4pm UTC / 12pm EST) |
| `src/scripts/runRAFLiveTracker.ts` | Entry point — finds event, spawns scraper, runs parser |
| `src/services/scrapeRAFLiveEvent.js` | Cheerio scraper — fetches realamericanfreestyle.com, extracts fight data |
| `src/services/scrapeAllRAFData.js` | Daily scraper — scrapes events gallery + individual event pages |
| `src/services/rafDataParser.ts` | Daily parser — imports events/fighters into DB |
| `src/services/rafLiveParser.ts` | Live parser — matches fights, updates DB, handles cancellations |

## Tapology-Based Live Tracking (Multi-Org)

The Tapology live tracker is **generic and promotion-agnostic** — it works for any organization whose events appear on Tapology. As of Mar 2026, these orgs use Tapology for live tracking:

| Org | Daily Scraper | Sets `scraperType`? | Sets `ufcUrl`? | Fully Automatic? |
|-----|---------------|:---:|:---:|:---:|
| **Zuffa Boxing** | `scrapeZuffaBoxingTapology.js` | Yes (`tapology`) | Yes (Tapology URL) | Yes |
| **Karate Combat** | `scrapeKarateCombatTapology.js` | Yes (`tapology`) | Yes (Tapology URL) | Yes |
| **Dirty Boxing** | `scrapeDirtyBoxingTapology.js` | Yes (`tapology`) | Yes (Tapology URL) | Yes |
| **Top Rank** | `scrapeTopRankTapology.js` | Yes (`tapology`) | Yes (toprank.com URL) | Yes* |
| **Golden Boy** | `scrapeGoldenBoyTapology.js` | Yes (`tapology`) | Yes (goldenboy.com URL) | Yes* |
| **Matchroom** | `scrapeAllMatchroomData.js` | Yes (`tapology`) | Yes (matchroomboxing.com URL) | Yes* |
| **PFL** | `scrapeAllPFLData.js` | Yes (`tapology`) | Yes (pflmma.com URL) | Yes* |
| **RIZIN** | `scrapeAllRizinData.js` | Yes (`tapology`) | Yes (Sherdog URL) | Yes* |
| **MVP** | `scrapeMVPTapology.js` | Yes (`tapology`) | Yes (Tapology URL) | Yes |

*Orgs marked with * store non-Tapology URLs in `ufcUrl`. The live tracker's auto-discovery finds the correct Tapology event URL via the promotion hub page mapping in `runTapologyLiveTracker.ts`.

### How It Works

1. Daily scraper creates events with `scraperType: 'tapology'`
2. Event goes LIVE → lifecycle dispatches `tapology-live-tracker.yml` every 5 min
3. `runTapologyLiveTracker.ts` finds the event, discovers its Tapology URL
4. `TapologyLiveScraper` scrapes fight results from the Tapology event page
5. `tapologyLiveParser.ts` matches fights by last name, updates DB
6. Auto-publishes (tapology is in `PRODUCTION_SCRAPERS`) and auto-completes when all fights are done

### URL Discovery Priority

1. `TAPOLOGY_URL` env var (manual override)
2. Event's `ufcUrl` field (if it contains `tapology.com`)
3. Auto-discover from the promotion's Tapology hub page using `TAPOLOGY_PROMOTION_HUBS` mapping:

```
Zuffa Boxing      → tapology.com/fightcenter/promotions/6299-zuffa-boxing-zb
Karate Combat     → tapology.com/fightcenter/promotions/3637-karate-combat-kc
Dirty Boxing      → tapology.com/fightcenter/promotions/5649-dirty-boxing-championship-dbc
PFL               → tapology.com/fightcenter/promotions/1969-professional-fighters-league-pfl
RIZIN             → tapology.com/fightcenter/promotions/1561-rizin-fighting-federation-rff
TOP_RANK          → tapology.com/fightcenter/promotions/2487-top-rank-tr
Golden Boy        → tapology.com/fightcenter/promotions/1979-golden-boy-promotions-gbp
Matchroom Boxing  → tapology.com/fightcenter/promotions/2484-matchroom-boxing-mb
MVP               → tapology.com/fightcenter/promotions/4040-most-valuable-promotions-mvp
```

### Adding a New Tapology-Based Org

To add live tracking for any org on Tapology:

1. Create a daily scraper (`scrape{Org}Tapology.js`) — copy from `scrapeZuffaBoxingTapology.js`, change hub URL and URL filter
2. Create a data parser (`{org}DataParser.ts`) — set `scraperType: 'tapology'` and store Tapology URL in `ufcUrl`
3. Create a GitHub Actions workflow (`{org}-scraper.yml`)
4. Add the promotion to `TAPOLOGY_PROMOTION_HUBS` in `runTapologyLiveTracker.ts`
5. No other changes needed — the lifecycle, live tracker workflow, scraper, and parser are all generic

### Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/tapology-live-tracker.yml` | GitHub Actions workflow (dispatch trigger) |
| `src/scripts/runTapologyLiveTracker.ts` | Entry point — finds event, discovers URL, runs scraper+parser |
| `src/services/tapologyLiveScraper.ts` | Cheerio scraper — fetches Tapology page, extracts fight data |
| `src/services/tapologyLiveParser.ts` | Parser — matches fights, updates DB |
| `src/services/scrapeZuffaBoxingTapology.js` | Template daily scraper (Zuffa Boxing) |
| `src/services/scrapeKarateCombatTapology.js` | Daily scraper (Karate Combat) |
| `src/services/scrapeDirtyBoxingTapology.js` | Daily scraper (Dirty Boxing) |
| `src/services/scrapeTopRankTapology.js` | Daily scraper (Top Rank) |
| `src/services/scrapeGoldenBoyTapology.js` | Daily scraper (Golden Boy) |
| `.github/workflows/karate-combat-scraper.yml` | Daily workflow (Karate Combat) |
| `.github/workflows/dirty-boxing-scraper.yml` | Daily workflow (Dirty Boxing) |
| `.github/workflows/toprank-tapology-scraper.yml` | Daily workflow (Top Rank) |
| `.github/workflows/goldenboy-tapology-scraper.yml` | Daily workflow (Golden Boy) |

## Start Time Coverage

As of Mar 2026, all organization scrapers populate `mainStartTime` when time data is available:

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
| Karate Combat | Yes | N/A | N/A | Time regex from Tapology (ET default) |
| RIZIN | Yes | N/A | N/A | ISO from Sherdog itemprop (midnight guard) |
| RAF | Yes | N/A | N/A | Parsed from event page date+time text (EST assumed) |

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
| `.github/workflows/oktagon-live-tracker.yml` | GitHub Actions workflow for Oktagon live scraping |
| `.github/workflows/bkfc-live-tracker.yml` | GitHub Actions workflow for BKFC live scraping |
| `.github/workflows/onefc-live-tracker.yml` | GitHub Actions workflow for ONE FC live scraping |
| `.github/workflows/tapology-live-tracker.yml` | GitHub Actions workflow for Tapology live scraping (all Tapology orgs) |
| `.github/workflows/raf-live-tracker.yml` | GitHub Actions workflow for RAF live scraping |
| `.github/workflows/raf-scraper.yml` | Daily RAF scraper workflow |
| `src/scripts/runUFCLiveTracker.ts` | Standalone script run by GitHub Actions (UFC) |
| `src/scripts/runOktagonLiveTracker.ts` | Standalone script run by GitHub Actions (Oktagon) |
| `src/scripts/runBKFCLiveTracker.ts` | Standalone script run by GitHub Actions (BKFC) |
| `src/scripts/runOneFCLiveTracker.ts` | Standalone script run by GitHub Actions (ONE FC) |
| `src/scripts/runTapologyLiveTracker.ts` | Standalone script run by GitHub Actions (Tapology — multi-org) |
| `src/scripts/runRAFLiveTracker.ts` | Standalone script run by GitHub Actions (RAF) |
| `public/admin.html` | Admin panel UI |

## Resolved: UFC Event Times Were Wrong (Double Timezone Conversion)

**Symptoms:** UFC events showed wrong start times (e.g., 1 AM instead of 8 PM for Moreno vs. Kavanagh). Initially misdiagnosed as a mobile app Hermes timezone display bug.

**Actual root cause:** The UFC scraper runs on GitHub Actions (UTC timezone). UFC.com displays times in the viewer's timezone via JavaScript, so the scraper was extracting **UTC times**. The parser (`ufcDataParser.ts`) then assumed those times were Eastern and converted again via `localTimeToUTC('America/New_York')` — adding an extra 5 hours.

**Fix (Feb 26, 2026):**
1. Set `TZ=America/New_York` in `.github/workflows/ufc-scraper.yml`
2. Added `page.emulateTimezone('America/New_York')` in Puppeteer pages in `scrapeAllUFCData.js`
3. Made `ufcDataParser.ts` event import resilient to unique constraint conflicts (P2002 fallback)
4. Hardened mobile `dateFormatters.ts` to use `getHours()`/`getMinutes()` instead of Intl (belt-and-suspenders)

**Lesson:** When scraping websites that adapt times to the viewer's timezone, always force the expected timezone in both the environment (`TZ` env var) and the browser (`page.emulateTimezone()`).

**Note on event dates:** `event.date` is stored at midnight UTC, typically one day ahead of the US local date (e.g., a Saturday night EST event stores as Sunday midnight UTC). `toLocaleDateString` in US timezones shifts this back to the correct day. Do NOT change dates to noon UTC — that breaks the display.

## Resolved: Oktagon Tracker Stopped When UFC Went Live (Mar 2026)

**Symptoms:** During a simultaneous Oktagon + UFC event, the Oktagon live tracker stopped receiving GitHub Actions dispatches after the UFC event went LIVE. Cancelled fights (e.g., Wagner vs Kalejaiye) were never detected.

**Root causes (two bugs):**

1. **`findFirst` in Step 1.5** — The lifecycle only dispatched one workflow at a time. When both UFC and Oktagon events were LIVE, only the first event found (typically UFC) got dispatched. Oktagon was silently dropped.

2. **Single global cooldown** — The 4-minute dispatch cooldown was shared across all workflows. After dispatching the UFC workflow, the Oktagon dispatch was blocked by the cooldown.

**Fix:**
1. Changed `findFirst` → `findMany` in Step 1.5, looping through all LIVE scraper events
2. Changed cooldown from a single `lastGitHubDispatchAt` timestamp to a per-workflow `lastGitHubDispatchByWorkflow` map

## Resolved: Oktagon Cancellation Detection Diacritics Mismatch (Mar 2026)

**Symptoms:** Cancelled fights (missing from Oktagon API) were not detected. Additionally, fights with diacritical characters (common in Czech/Slovak names like Kříž, Ďuriš) could be falsely cancelled.

**Root cause:** The cancellation detection compared fight signatures using `stripDiacritics()` for scraped data but **not** for DB data. Scraped signature `"kriz"` ≠ DB signature `"kříž"`, so:
- Fights with diacritics were falsely flagged as missing → incorrectly CANCELLED
- `autoCompleteOktagonEvent` could see all non-cancelled fights as complete → stopped the tracker early
- Genuinely cancelled fights (no diacritics) never got processed because the tracker had already stopped

**Fix:** Added `stripDiacritics()` to DB fight signature creation in `oktagonLiveParser.ts` (line ~279).

**Lesson:** When comparing fighter names across data sources (API vs DB), always normalize diacritics on BOTH sides of the comparison.

## Mobile App Live Refresh

The mobile app polls for updated fight data so users see status changes without restarting the app.

**Upcoming events screen** (`app/(tabs)/events/index.tsx`): `refetchInterval: 30000` (30s)
**Event detail screens** (`app/(tabs)/events/[id].tsx`, `app/event/[id].tsx`): `refetchInterval: 30000` (30s)
**Live event polling** (`hooks/useLiveEventPolling.ts`): Once event is detected as LIVE, polls every 10s

The 30s interval ensures the app picks up fight status changes (UPCOMING → LIVE → COMPLETED) from the scraper. Once the event shows as LIVE, the faster 10s polling takes over on the detail screen. These are JS-only changes, deployable via **EAS Update** (no rebuild needed).

## Admin Workflow During Events

### Before an event — required setup:
- **UFC:** Nothing. The daily scraper auto-sets `scraperType: 'ufc'` and stores the event URL. Fully automatic.
- **Oktagon:** Nothing. The daily scraper auto-sets `scraperType: 'oktagon'` and stores the event URL. Fully automatic.
- **ONE FC:** Nothing. The daily scraper auto-sets `scraperType: 'onefc'` and stores the event URL. Fully automatic.
- **BKFC:** Nothing. The daily scraper auto-sets `scraperType: 'bkfc'` and stores the event URL. Fully automatic.
- **Tapology orgs (Zuffa Boxing, Karate Combat, Dirty Boxing, PFL, RIZIN, MVP):** Nothing. Daily scrapers set `scraperType: 'tapology'` and store the Tapology URL. Fully automatic.
- **RAF:** Nothing. The daily scraper auto-sets `scraperType: 'raf'` and stores the event URL. Fully automatic.

### With any production scraper (automatic):
1. Verify event has correct `scraperType` set (daily scrapers do this automatically for all production orgs)
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

---

## Known Issues & Fixes

### Tapology Cookie Consent Banner (Fixed Mar 2026)

**Problem:** Tapology shows a cookie consent dialog with an `<h1>` tag. The Zuffa Boxing scraper (`scrapeZuffaBoxingTapology.js`) and Tapology live scraper (`tapologyLiveScraper.ts`) both used `querySelector('h1')` / `$('h1').first()` to get the event name, which grabbed the consent banner heading (e.g. "Consent Required to Continue") instead of the actual event title.

**Fix:** Both scrapers now:
- Try specific selectors first (`.eventPageHeaderTitles h1`, `#main h1`, etc.)
- Reject names containing "consent", "cookie", or "privacy"
- Fall back to the `<title>` tag as last resort
- The Puppeteer scraper also attempts to dismiss the consent banner before extracting data

### RIZIN Scraper Missing Main Event & Wrong Fights (Fixed Mar 2026)

**Problem:** The RIZIN scraper (`scrapeAllRizinData.js`) scraped from Sherdog, which displays the main event in a separate `div.fight_card` section (using `div.fighter.left_side` / `div.fighter.right_side`) rather than in the fight table. The scraper only parsed table rows (`<tr>` elements), so the main event was always missing. Additionally, Sherdog wraps fighter names in `<span itemprop="name">First<br>Last</span>` — `textContent` strips the `<br>`, producing concatenated names like "LuizGustavo".

**Reported as:** Rizin 52 listing included fights not on the card (Kolesnik vs Aimoto, Dautbek vs Fukuta) and the main event was missing (Kyoma Akimoto vs Patchy Mix).

**Fix:**
1. **Main event extraction (Strategy 0):** New parsing step before table rows — extracts fighters from `div.fight_card` with `.fighter.left_side`/`.right_side`, reads names from `h3 > a > span[itemprop="name"]`, weight class from `.versus .weight_class`, and winner from `.final_result`
2. **Fighter name spacing:** Replaces `<br>` tags with spaces in `innerHTML` before extracting text from `span[itemprop="name"]`
3. **Duplicate prevention:** Collects main event fighter URLs and skips matching table rows to avoid duplicates (Sherdog includes the main event in both the div and the table for upcoming events)
4. **Fight ordering:** Uses Sherdog's card position numbers (from first `<td>`) sorted descending, so orderOnCard 1 = main event (top of card in the app) and highest = opener. Main event from div gets order 9999 before sort, ensuring it becomes #1.

**Wrong fights cause:** The stale scraped data was from when Sherdog had a preliminary card listing. Re-scraping after the event was finalized returned the correct fights.

### BKFC Fighter Images Showing Opponent's Photo (Fixed Mar 2026)

**Problem:** Many BKFC fighters showed their opponent's profile image instead of their own. For example, on a Selmani vs Curtin fight, both fighters displayed Selmani's photo.

**Root causes (two bugs):**

1. **Fighter profile page scraper** (main cause): `scrapeFighterPage()` scanned all images on a fighter's profile page and picked the first BKFC CDN 400x400 image. BKFC profile pages show the opponent's image in a "next fight" section, and it often appeared first in the DOM. Fighters without their own profile image (Ghost McFarlane, Danny Wall, etc.) got their opponent's headshot.

2. **Event page image extraction**: `findBestImage()` searched parent/grandparent/fight containers using `querySelectorAll('img')` and returned the first match. In shared fight containers holding both fighters, fighter2 always got fighter1's image.

**Fix:**
1. **Profile page**: Now extracts the fighter's name from their URL slug and only accepts CDN images whose filename contains the fighter's name parts. Fighters without a matching image get `null` instead of an opponent's face.
2. **Event page**: Replaced `findBestImage()` with `findClosestImage()` for broader containers — uses `getBoundingClientRect()` to pick the image physically closest to each fighter's link element.
3. **Parser**: Added `avatar-template` to the image skip list in `bkfcDataParser.ts` so BKFC generic placeholder images don't get saved as profile pictures.

### BKFC Duplicate Events from Ticket Links (Fixed Mar 2026)

**Problem:** BKFC.com has ticket links with URLs like `/events/1308036/bkfc-fight-night-newcastle-tickets?skin=newcastle`. The scraper treated these as separate events, creating duplicates alongside the correctly scraped event. The slug extraction didn't strip query params, numeric ID prefixes, or `-tickets` suffixes, producing garbled names like "1308036/bkfc Fight Night Newcastle Tickets?skin=newcastle".

**Fix:** `scrapeAllBKFCData.js` slug extraction now strips query parameters, takes the last path segment (ignoring numeric IDs), and removes `-tickets` suffixes before generating event names.

### Tapology Live Scraper Missing Methods (Fixed Mar 2026)

**Problem:** The Tapology live scraper found winners but missed the fight method (KO, TKO, UD, etc.) for most fights. Only fights where "Decision, Unanimous" appeared in nearby text were captured.

**Root cause:** Tapology renders fighter links ~156 times on the page (mobile + desktop duplicates). The scraper paired links by index (`i += 2`), but URL deduplication caused the first 80 links (inside fight `<li>` containers with method text) to be skipped as duplicates. The scraper consumed links from indices 80+ which were in a separate section with no `<li>` wrapper and no method text.

**Fix:** Replaced the fighter-link-pairing approach with direct iteration of `<li class="border-b">` fight containers. Each `<li>` contains both fighters and a result row with method/round/time in a `<span class="uppercase">`. Winner is detected via green background gradient (`from-[#d1f7d2]`) or `.bg-green-500` W badge.

### Matchroom Switched to Tapology (Mar 2026)

Matchroom had a custom live scraper (`matchroomLiveScraper.ts`) using axios/cheerio, but it was never promoted to production. Switched to the generic Tapology live tracker (`scraperType: 'tapology'`). The custom scraper files are kept but no longer used.

### Live Tracking Expansion to All Orgs (Mar 2026)

Expanded live event tracking from 5 orgs (UFC, Oktagon, BKFC, ONE FC, Zuffa Boxing) to all 12+ orgs. New Tapology-based daily scrapers for Karate Combat, Top Rank, and Golden Boy. Existing parsers for PFL, RIZIN, Dirty Boxing, and Matchroom updated to set `scraperType: 'tapology'`. The Tapology live tracker's URL auto-discovery enhanced with `TAPOLOGY_PROMOTION_HUBS` mapping for all orgs. All orgs now have fully automatic live tracking — no manual setup required.

## VPS Scraper Service (Mar 2026)

Moved live event scrapers from GitHub Actions (5-min intervals) to a dedicated Hetzner VPS (30-second intervals) for near-real-time fight updates and notifications.

### Why

- GitHub Actions has ~2-3 min cold start per run, limiting scrape frequency to ~5 min
- VPS is always on — no cold starts, can reuse browser instances
- 30-second scrapes enable near-real-time push notifications

### Architecture

```
Render lifecycle (every 5 min) → POST /track/start → VPS (every 30s loop) → scrape → DB
                                                      ↑ also self-discovers active LIVE events
```

- **VPS:** Hetzner CPX11 (2 vCPU, 2GB RAM, $4.99/mo), IP `178.156.231.241`, Ubuntu 24.04
- **Service:** `scraperService.ts` — HTTP server on port 3009, runs as systemd `scraper-service`
- **Auth:** `SCRAPER_API_KEY` shared between Render and VPS
- **Render env vars:** `VPS_SCRAPER_URL=http://178.156.231.241:3009`, `VPS_SCRAPER_API_KEY=gf-scraper-2026-secret`

### How It Works

1. Render lifecycle detects event → LIVE, calls `POST /track/start` on VPS
2. VPS starts a 30-second interval loop for that event's scraper type
3. Each iteration runs the appropriate scraper + parser, updates DB directly
4. VPS auto-discovers active LIVE events every 5 min as a safety net
5. Tracker auto-stops when event completes or after 10 consecutive errors
6. If VPS is unreachable, Render falls back to GitHub Actions dispatch

### VPS Management

```bash
ssh root@178.156.231.241
systemctl status scraper-service
journalctl -u scraper-service -f          # live logs
bash /opt/scraper-service/packages/backend/vps-update.sh   # deploy latest code
```

### Key Files

| File | Purpose |
|------|---------|
| `src/scraperService.ts` | VPS HTTP service — starts/stops 30s scrape loops |
| `src/services/eventLifecycle.ts` | Render lifecycle — tries VPS first, falls back to GitHub Actions |
| `vps-setup.sh` | One-command VPS provisioning script |
| `vps-update.sh` | Quick deploy script (pull, build, restart) |

### Admin Workflow Update

With the VPS, the admin workflow (section above) is unchanged — all the same automation applies. The only difference is scrape frequency: 30 seconds instead of 5 minutes. To check VPS status:

```bash
curl -H "Authorization: Bearer gf-scraper-2026-secret" http://178.156.231.241:3009/status
curl -X POST -H "Authorization: Bearer gf-scraper-2026-secret" http://178.156.231.241:3009/track/check  # force re-discover
```

## Resolved: Tapology Parser Name Matching Failures (Mar 28, 2026)

**Symptoms:** During PFL Pittsburgh live tracking, 2 of 12 fights failed to match between Tapology scraped data and the database.

**Root cause:** The parser's `getLastName()` function extracted only the last word of a name. This failed for:
- Multi-word last names: "Ariane Lipski da Silva" → extracted "Silva", DB had "Lipskidasilva"
- Hyphenated names: "J. Al-Silawi" → extracted "Al-Silawi", DB had "Alsalawi"

**Fix:** Replaced single-strategy exact matching with 5-strategy progressive matching:
1. Exact last name match
2. Compact match (remove hyphens/spaces: "Al-Silawi" → "alsilawi" ≈ "alsalawi")
3. Full name compact vs DB lastName (handles "Lipski da Silva" → "lipskidasilva")
4. Partial/contains match
5. Similarity score fallback (Levenshtein, threshold ≥ 0.8)

Also added cancellation/un-cancellation detection and next-fight notifications to the Tapology parser, bringing it to parity with the BKFC parser.

## Resolved: BKFC Tab Detection Not Working (Mar 28, 2026)

**Symptoms:** All BKFC fights scraped as "Main Card" even though some are "Free Fights" (Prelims).

**Root cause:** The live scraper looked for `[data-custom-tab-items]` to detect tabs, but those are per-fight stats tabs (punch summaries by round). The actual card sections use Webflow tabs: `div[data-w-tab="Main Card"]` and `div[data-w-tab="Prelims"]`.

**Fix:** Changed tab detection to use `container.closest('[data-w-tab]')` and check the attribute value. Added fallback for `h3.fight-card_heading` with "Undercard" text.

## Resolved: BKFC Start Time Showed Main Card Instead of Prelims (Mar 28, 2026)

**Symptoms:** BKFC event "Mohegan Sun Porter vs Watson" had `mainStartTime` set to 10:00 PM ET (main card) instead of 6:00 PM ET (prelims/free fights). The lifecycle didn't transition the event to LIVE until 4 hours after the event actually started.

**Root cause:** The daily scraper's time extraction prioritized `[data-countdown-date]`, which shows the **main card** countdown time. The actual event start (prelims) is displayed in visible `div.text-color-gold` elements as "March 28, 2026 6:00 PM EDT".

**Fix:** Reordered time extraction strategies in `scrapeAllBKFCData.js`:
1. **(New, first)** Look for full date+time in visible page elements (`div.text-color-gold`, `<p>`) — shows prelim/event start
2. `[data-countdown-date]` — only if visible elements didn't have a time (countdown may show main card time)
3. `[data-event-date-est]` attribute
4. Page text search for time patterns
5. `[class*="time"]` fallback

**Lesson:** BKFC countdown timers count down to the main card, not the event start. The visible date text on the event page reflects the actual (earliest) start time.

## Resolved: UFC & BKFC Parsers Can't Handle Draws (Mar 28, 2026)

**Symptoms:** UFC Fight Night — Ricky Simon vs Adrian Yanez ended in a draw, but the app showed the fight as "Up Next" (still UPCOMING). Additionally, BKFC fights were oscillating between UPCOMING and COMPLETED between scraper runs, causing "Up Next" to jump between fights.

**Root causes (three bugs):**

### 1. UFC scraper didn't detect draws (`scrapeLiveEvent.js`)

The scraper only checked for `.c-listing-fight__outcome--win` to detect completed fights. Draws have no win indicator on UFC.com — there's no visible `--draw` or `--no-contest` CSS class, and the method/round/time result text is the only signal.

**Fix:** Added detection for `.c-listing-fight__outcome--draw` and `--no-contest` CSS classes. Also added a fallback: if a method result text string exists (e.g., "Decision", "Draw") with `length > 1` and no win indicator, the fight is treated as complete with no winner. Round/time text alone is NOT sufficient — those appear on live fights as round indicators.

### 2. UFC & BKFC parsers allowed status downgrades

Both `ufcLiveParser.ts` and `bkfcLiveParser.ts` would overwrite COMPLETED fights back to UPCOMING if the scraper reported them as not complete. This happened because:
- **UFC:** The scraper couldn't detect the draw, so it reported the fight as "upcoming" every cycle, and the parser dutifully reset it
- **BKFC:** The scraper inconsistently detected fight completion between 30-second runs (DOM timing / JS load race conditions), causing oscillation

**Fix:** Added a one-way guard in both parsers: **COMPLETED status is never downgraded**. Once a fight is COMPLETED (whether set by scraper or manually via admin), it stays COMPLETED. This protects:
- Manual fixes via admin panel
- Draws that the scraper can't detect
- Inconsistent scraper results from DOM race conditions

### 3. BKFC cancellation detection affected draws

`bkfcLiveParser.ts` skipped cancellation detection only for `COMPLETED && winner` fights. Draws (COMPLETED with no winner) could be falsely cancelled.

**Fix:** Changed to skip all `COMPLETED` fights in cancellation detection, regardless of whether they have a winner.

### Key principle established

**Fight status transitions should be one-way for COMPLETED.** Scrapers are unreliable for certain edge cases (draws, DOM timing), and the cost of a false downgrade (fight jumping back to "Up Next") is much higher than the cost of a fight staying COMPLETED when it shouldn't be. Admin panel provides manual override for any corrections.
