# Live Event Management

How events move through their lifecycle in Good Fights.

## Architecture: The 3-Step Lifecycle

One background job (`eventLifecycle.ts`) runs every 5 minutes with 3 steps:

### Step 1: UPCOMING → LIVE

Events whose earliest start time has passed get marked LIVE.

Start time = `earlyPrelimStartTime` || `prelimStartTime` || `mainStartTime` || `event.date`

**UFC auto-start:** When a UFC event transitions to LIVE, the lifecycle job also auto-starts the live tracker (see UFC Live Tracker section below).

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

The UFC live tracker scrapes UFC.com during live events and updates fight results in real time.

### How It Works

1. **Auto-start:** When lifecycle transitions a UFC event to LIVE, it calls `startLiveTracking()` automatically
2. **Scraper** (`scrapeLiveEvent.js`): Uses Puppeteer to load the UFC.com event page, extracts fight data from the DOM (status, winner, method, round, time)
3. **Parser** (`ufcLiveParser.ts`): Matches scraped fights to DB fights (by `ufcFightId` or last name), updates results
4. **Polling:** Every 30 seconds
5. **Auto-publish:** Since UFC is a production scraper, results go directly to published fields
6. **Auto-complete:** When all fights are done, the event is marked COMPLETED

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

### Key Files

| File | Purpose |
|------|---------|
| `src/services/liveEventTracker.ts` | Orchestrator — runs scraper on interval, feeds data to parser |
| `src/services/scrapeLiveEvent.js` | Puppeteer scraper — loads UFC.com, extracts fight data |
| `src/services/ufcLiveParser.ts` | Parser — matches fights, updates DB, handles cancellations |
| `src/services/ufcLiveScraper.ts` | Alternative axios/cheerio scraper (lighter weight, less accurate) |

### Manual Control

Even with the tracker running, you have full manual override:

| Endpoint | What it does |
|----------|-------------|
| `POST /api/live-events/start` | Manually start tracker with eventId/eventUrl/eventName |
| `POST /api/live-events/auto-start` | Auto-find current live UFC event and start |
| `POST /api/live-events/stop` | Stop the tracker |
| `GET /api/live-events/status` | Check if tracker is running |
| `POST /api/admin/fights/:id/set-status` | Override any fight's status |
| `PUT /api/admin/fights/:id` | Update fight result data |
| `PUT /api/admin/events/:id/status` | Override event status |

## Start Time Coverage

Only ~3% of events have `mainStartTime`/`prelimStartTime` set (mostly UFC and ONE FC). For section-based completion to work well, scrapers need to populate these fields.

**Until then:** The `event.date` fallback handles it by completing all fights at once when the event date passes. This is acceptable — it matches how most events work in practice.

## Key Files

| File | Purpose |
|------|---------|
| `src/services/eventLifecycle.ts` | The 3-step lifecycle job (runs every 5 min) + UFC auto-start |
| `src/config/liveTrackerConfig.ts` | `PRODUCTION_SCRAPERS`, `buildTrackerUpdateData()` |
| `src/services/backgroundJobs.ts` | Starts/stops the lifecycle job |
| `src/routes/admin.ts` | Admin endpoints (set-status, publish, publish-all) |
| `src/routes/liveEvents.ts` | Live tracker API (start/stop/status/auto-start) |
| `public/admin.html` | Admin panel UI |

## Admin Workflow During Events

### With UFC live tracker (automatic):
1. Event goes LIVE → tracker auto-starts
2. Monitor via `GET /api/live-events/status` or server logs
3. Results auto-publish to the app in real time
4. If scraper gets something wrong, override via admin panel
5. Stop tracker manually if needed: `POST /api/live-events/stop`

### Without a production scraper (manual):
1. Open admin panel → select event
2. As fights start, click **Live** on each fight
3. When a fight ends, click **Completed** and optionally enter winner/method/round/time
4. If a live scraper is running, you'll see tracker data alongside published data
5. Click **Publish** on individual fights to copy tracker data → published fields
6. Click **Publish All** to bulk-publish all tracker results for the event
