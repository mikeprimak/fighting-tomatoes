# Live Event Management

How events move through their lifecycle in Good Fights.

## Architecture: The 3-Step Lifecycle

One background job (`eventLifecycle.ts`) runs every 5 minutes with 3 steps:

### Step 1: UPCOMING → LIVE

Events whose earliest start time has passed get marked LIVE.

Start time = `earlyPrelimStartTime` || `prelimStartTime` || `mainStartTime` || `event.date`

### Step 2: Section-Based Fight Completion

For each LIVE event **not handled by a production scraper**:

- **If event has section times AND fights have `cardType`:** Complete fights by section as each section start time passes
- **Otherwise (fallback):** Complete ALL fights when the event start time passes

Only touches fights still in UPCOMING status. Uses case-insensitive `cardType` matching with trim. Maps "Undercard" → `prelimStartTime`.

**This does NOT auto-complete the event itself.** Events stay LIVE.

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
| `ufc` | UFC live parser | Development |
| `matchroom` | Matchroom live parser | Development |
| `oktagon` | OKTAGON live parser | Development |
| `onefc` | ONE FC live parser | Development |
| `tapology` | Tapology live parser | Development |

### Production Scrapers

The `PRODUCTION_SCRAPERS` array in `liveTrackerConfig.ts` controls which scrapers are trusted to auto-publish results. Currently empty — no scrapers are production-ready.

**To promote a scraper to production:**
1. Test thoroughly during multiple live events
2. Add the scraper type to `PRODUCTION_SCRAPERS` in `src/config/liveTrackerConfig.ts`
3. The lifecycle service will skip events with that scraper type (the scraper handles everything)

### Shadow Fields

All 5 live parsers write to shadow `tracker*` fields on every fight:
- `trackerFightStatus`, `trackerWinner`, `trackerMethod`, `trackerRound`, `trackerTime`
- Production scrapers also write to published fields (auto-publish)
- Non-production scrapers only write shadow fields; admin publishes manually

## Start Time Coverage

Only ~3% of events have `mainStartTime`/`prelimStartTime` set (mostly UFC and ONE FC). For section-based completion to work well, scrapers need to populate these fields.

**Until then:** The `event.date` fallback handles it by completing all fights at once when the event date passes. This is acceptable — it matches how most events work in practice.

## Key Files

| File | Purpose |
|------|---------|
| `src/services/eventLifecycle.ts` | The 3-step lifecycle job (runs every 5 min) |
| `src/config/liveTrackerConfig.ts` | `PRODUCTION_SCRAPERS`, `buildTrackerUpdateData()` |
| `src/services/backgroundJobs.ts` | Starts/stops the lifecycle job |
| `src/routes/admin.ts` | Admin endpoints (set-status, publish, publish-all) |
| `public/admin.html` | Admin panel UI |

## Admin Workflow During Events

1. Open admin panel → select event
2. As fights start, click **Live** on each fight
3. When a fight ends, click **Completed** and optionally enter winner/method/round/time
4. If a live scraper is running, you'll see tracker data alongside published data
5. Click **Publish** on individual fights to copy tracker data → published fields
6. Click **Publish All** to bulk-publish all tracker results for the event
