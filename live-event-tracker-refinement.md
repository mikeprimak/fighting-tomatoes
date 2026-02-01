# Live Event Tracker Refinement

**Related doc:** See `scraper-refinement.md` for daily scraper status and fixes.

## Goal
Build and refine live event trackers for each promotion so users can watch fight statuses update in real-time during events.

---

## Current Status (Feb 1, 2026)

| Promotion | Live Tracker | Status | Cancellation Detection | Notes |
|-----------|--------------|--------|------------------------|-------|
| UFC | ✅ Working | GitHub Actions | ✅ Yes | Moved to GitHub Actions (Render IPs blocked by UFC.com) |
| OKTAGON | ✅ Working | Production | ✅ Yes | Uses api.oktagonmma.com REST API |
| Matchroom | ⚠️ Exists | Untested | ❌ Missing | Needs live event testing + ADD cancellation logic |
| BKFC | ❌ None | Planned | - | |
| PFL | ❌ None | Planned | - | |
| ONE FC | ❌ None | Planned | - | |
| Top Rank | ❌ None | Planned | - | |
| Golden Boy | ❌ None | Planned | - | |

### Time-Based Fallback
Promotions without live trackers use time-based completion:
- At `earlyPrelimStartTime` → All "Early Prelims" fights marked complete
- At `prelimStartTime` → All "Prelims" fights marked complete
- At `mainStartTime` → All "Main Card" fights marked complete

---

## Process for Building a New Live Tracker

### Phase 1: Research (During Live Event)

1. **Open the promotion's event page** during a live event
2. **Monitor what changes** in the page as each fight:
   - Starts (fight goes "live")
   - Ends (winner announced, method, round, time)
3. **Identify data source:**
   - Is there a REST API? (Best - like Oktagon)
   - Is there `__NEXT_DATA__` JSON in the page? (Good - Next.js sites)
   - Is data rendered in HTML? (OK - requires Puppeteer)
   - Is data loaded via JavaScript only? (Hard - requires Puppeteer + waiting)
4. **Document the data structure:**
   - What fields indicate fight status?
   - What fields contain result data (winner, method, round, time)?
   - How are fighters identified (ID, name)?

### Phase 2: Build Scraper

1. Create `{org}LiveScraper.ts` in `packages/backend/src/services/`
2. Implement:
   - `fetchEventData()` - Get raw data from source
   - `parseEventData()` - Convert to standard `OrgEventData` format
   - `detectChanges()` - Compare current vs previous state
   - `scrape()` - Main entry point
3. Export types: `{Org}EventData`, `{Org}FightData`, `{Org}FightResult`

### Phase 3: Build Parser

1. Create `{org}LiveParser.ts` in `packages/backend/src/services/`
2. Implement:
   - Match scraped fighters to database fighters (by name)
   - Match scraped fights to database fights (by fighter pairing)
   - Update fight records: `hasStarted`, `isComplete`, `winner`, `method`, `round`, `time`
3. **CRITICAL: Implement cancellation detection** (see below)
4. Handle edge cases:
   - Fighter name mismatches (accents, nicknames)
   - No-contests, draws

#### Cancellation Detection (REQUIRED)

Every live parser MUST include cancellation detection logic. This catches fights that were scheduled but later removed from the card.

**How it works:**
1. Track which fights appear in the scraped data (using a Set of fight signatures)
2. After processing scraped fights, iterate through DB fights for the event
3. If a DB fight is NOT in the scraped data AND event has started → mark as `isCancelled: true`
4. If a previously cancelled fight reappears in scraped data → set `isCancelled: false`

**Reference implementation:** See `ufcLiveParser.ts` lines 550-614 or `oktagonLiveParser.ts` lines 251-307

**Why this matters:** Without this, cancelled fights remain visible in the app even though they're not happening. Discovered during Oktagon 82 when Doussis vs Orlov was cancelled but still showing in the app.

### Phase 4: Build Tracker

1. Create `{org}LiveTracker.ts` in `packages/backend/src/services/`
2. Implement:
   - `startTracking(config)` - Begin polling loop
   - `stopTracking()` - End polling loop
   - `getStatus()` - Return current tracking state
3. Export functions for admin API

### Phase 5: Add Admin API Endpoints

Add to `packages/backend/src/routes/admin.ts`:
- `POST /admin/live-tracker/{org}/start` - Start tracking an event
- `POST /admin/live-tracker/{org}/stop` - Stop tracking
- `GET /admin/live-tracker/{org}/status` - Check current status

### Phase 6: Test During Live Event

1. Start tracker before event begins
2. Monitor throughout event
3. Verify:
   - Fights transition: upcoming → live → complete
   - Results populate correctly (winner, method, round, time)
   - Mobile app updates reflect changes
4. Fix any issues discovered

---

## Oktagon Live Tracker (Jan 17, 2026)

### Session Summary

Successfully built and deployed Oktagon live tracker during Oktagon 82.

### Data Source Discovery

**Initial approach:** HTML scraping with `__NEXT_DATA__` JSON
- Problem: Data structure changed, query format different

**Better approach discovered:** Direct REST API at `api.oktagonmma.com`
- `GET /v1/events/{slug}` - Event details
- `GET /v1/events/{id}/fightcard` - Full fight card with results
- `GET /v1/fights/{id}` - Individual fight details

### Key Findings

**Result format:**
```javascript
{
  result: "FIGHTER_1_WIN" | "FIGHTER_2_WIN" | null,
  resultType: "TKO" | "DEC" | "SUB" | "KO" | null,
  time: "2:44",      // Time in round
  numRounds: 2       // Round number when ended
}
```

**Live fight inference:**
- API doesn't have explicit "live" status
- Infer from: some fights complete + some not complete = event is live
- The highest-order incomplete fight is likely currently happening

### Files Modified

| File | Changes |
|------|---------|
| `oktagonLiveScraper.ts` | Switched from HTML to REST API |
| `oktagonLiveParser.ts` | Existing - matches fighters by lastName |
| `oktagonLiveTracker.ts` | Existing - orchestrates scraper + parser |
| `routes/admin.ts` | Added start/stop/status endpoints |
| `routes/index.ts` | Fixed event categorization for live events |

### Bug Fixed: Event Categorization

**Problem:** Live events showed in "completed" instead of "upcoming"

**Cause:** Upcoming filter used `date >= now`, but live events have dates in the past

**Fix:** Changed to: `isComplete = false AND (date >= now OR hasStarted = true)`

### Commands

```bash
# Start tracker
curl -X POST "https://fightcrewapp-backend.onrender.com/api/admin/live-tracker/oktagon/start?key=fightcrew-test-2026" \
  -H "Content-Type: application/json" \
  -d '{"eventId":"EVENT_UUID", "eventUrl":"https://oktagonmma.com/en/events/...", "eventName":"OKTAGON 82"}'

# Check status
curl "https://fightcrewapp-backend.onrender.com/api/admin/live-tracker/oktagon/status?key=fightcrew-test-2026"

# Stop tracker
curl -X POST "https://fightcrewapp-backend.onrender.com/api/admin/live-tracker/oktagon/stop?key=fightcrew-test-2026"
```

---

## UFC Live Tracker

### Status
Production - running on GitHub Actions (every 5 minutes)

### Why GitHub Actions?
UFC.com blocks Render's IP addresses via Cloudflare. GitHub Actions uses different IPs that aren't blocked.

### Data Source
- Scrapes ufc.com event pages using Puppeteer
- Uses `scrapeLiveEvent.js` for scraping
- Uses `ufcLiveParser.ts` for database updates

### Key Files
- `.github/workflows/ufc-live-tracker.yml` - GitHub Actions workflow (every 5 min)
- `scripts/runUFCLiveTracker.ts` - Standalone script for GitHub Actions
- `services/scrapeLiveEvent.js` - Puppeteer scraper
- `services/ufcLiveParser.ts` - Database parser/updater
- `config/liveTrackerConfig.ts` - Set to `'time-based'` on Render (GitHub Actions handles live)

### Fight Matching
1. **Primary:** Match by `ufcFightId` (UFC's `data-fmid` attribute)
2. **Fallback:** Match by full name (firstName + lastName)

### Features
- Detects fight cancellations (missing from scraped data)
- Un-cancels fights that reappear
- Updates/corrects results if UFC.com changes them
- Auto-completes event when all fights done

---

## Matchroom Live Tracker

### Status
Exists but untested during live event

### Key Files
- `services/matchroomLiveParser.ts`
- `services/matchroomLiveTracker.ts`

### Next Steps
1. Wait for next Matchroom event
2. Test tracker during event
3. Document findings

---

## Data Source Research Notes

### API-based (Best)
| Promotion | API Found | Notes |
|-----------|-----------|-------|
| OKTAGON | ✅ api.oktagonmma.com | REST API, no auth needed |
| UFC | ❌ | No public API found |
| PFL | ❓ | Needs investigation |
| ONE FC | ❓ | Needs investigation |

### Testing During Live Events

To test data sources during a live event, see `packages/backend/README-LIVE-TEST.md` for the multi-source testing approach used during UFC 320.

**Sources to check:**
1. Promotion's official website (HTML/JSON)
2. SerpAPI (Google knowledge panel)
3. api-sports.io (MMA API)
4. ESPN MMA live tracker

---

## Architecture

### How Live Tracking Works

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Admin API      │────▶│  Tracker     │────▶│  Scraper    │
│  /start /stop   │     │  (polling)   │     │  (fetch)    │
└─────────────────┘     └──────────────┘     └─────────────┘
                               │                    │
                               ▼                    ▼
                        ┌──────────────┐     ┌─────────────┐
                        │  Parser      │◀────│  Event Data │
                        │  (DB update) │     │  (JSON)     │
                        └──────────────┘     └─────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  Database    │
                        │  (fights)    │
                        └──────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  Mobile App  │
                        │  (React Q)   │
                        └──────────────┘
```

### Polling Intervals

| Promotion | Interval | Platform | Reason |
|-----------|----------|----------|--------|
| UFC | 5 min | GitHub Actions | Minimum GitHub schedule interval; avoids IP blocking |
| OKTAGON | 60s | Render | API is fast (~300ms) |
| Matchroom | 60s | Render | Standard polling |
| Default | 60s | Render | Standard for most |

### Failsafe System

If live tracker fails, the failsafe cleanup job ensures events/fights eventually complete:
- Fights: Auto-complete 6+ hours after event start
- Events: Force-complete 8+ hours after start

See `IMPLEMENTATION_COMPLETE.md` for details.

---

## Promotion-Specific Notes

### BKFC
- Website: bkfc.com
- Data format: Unknown - needs investigation
- Priority: Medium

### PFL
- Website: pflmma.com
- Data format: Unknown - needs investigation
- Priority: Medium

### ONE FC
- Website: onefc.com
- Data format: Complex - record parsing was tricky for daily scraper
- Priority: Low (fewer US viewers)

### Top Rank
- Website: toprank.com
- Data format: Limited event data on daily scraper
- Priority: Low

### Golden Boy
- Website: goldenboy.com
- Data format: Has fight card pages
- Priority: Medium

---

## Progress Log

### Feb 1, 2026 - UFC 325 Live Tracking & GitHub Actions Migration

**Event:** UFC 325: Volkanovski vs. Lopes
**Result:** Multiple fixes deployed during live event

#### Problem: Render IP Block

UFC.com blocks Render's IP addresses via Cloudflare protection, causing the live tracker to fail when running on Render. The daily UFC scraper already ran successfully on GitHub Actions.

#### Solution: Move UFC Live Tracker to GitHub Actions

**Files Created:**
- `packages/backend/src/scripts/runUFCLiveTracker.ts` - Standalone script for GitHub Actions
- `.github/workflows/ufc-live-tracker.yml` - Workflow running every 5 minutes

**Files Modified:**
- `packages/backend/src/config/liveTrackerConfig.ts` - Changed UFC from `'ufc'` to `'time-based'` on Render

#### Bugs Fixed During UFC 325

**1. Class Detection Bug**
- **Issue:** Scraper used `section.className === 'main-card'` (exact match)
- **Problem:** If section had multiple classes like `main-card active`, it wouldn't match
- **Fix:** Changed to `section.classList.contains('main-card')`

**2. Fight Signature Mismatch (Cancellation Detection)**
- **Issue:** Scraped fights used full names (`"dustin jacoby|jimmy crute"`), DB used last names only (`"crute|jacoby"`)
- **Result:** Signatures never matched, causing false cancellations
- **Fix:** Changed both to use full names (firstName + lastName), matching daily scraper approach

**3. Multi-word Last Names**
- **Issue:** Fighters like "Benoit Saint Denis" - last word extraction gave "denis" but DB had "Saint Denis"
- **Fix:** Use full name matching instead of last-name-only matching

**4. Result Correction Detection**
- **Issue:** If UFC.com posted wrong winner then corrected it, our tracker wouldn't update
- **Cause:** Code only set winner if `!dbFight.winner` (empty)
- **Fix:** Now updates if scraped value differs from DB value, logs as "CORRECTED"

**5. Added `ufcFightId` for Reliable Matching**
- **Issue:** Name matching has too many edge cases (nicknames, multi-word names, accents)
- **Solution:** Store UFC's `data-fmid` attribute in database
- **Schema change:** Added `ufcFightId String?` to Fight model
- **Matching:** First try `ufcFightId`, fall back to name matching
- **Note:** Existing fights won't have ID until daily scraper runs again

#### Debug Logging Added

Added comprehensive logging to diagnose issues:
- `[SCRAPER] Sections found in fight-card:` - Shows all sections and fight counts
- `📋 Scraped ufcFightIds:` - Lists all UFC fight IDs found
- `📋 Scraped fight signatures:` - Lists all name signatures
- `🔎 DB fight "..." matched by ufcFightId/name:` - Shows matching method used
- `🔄 ... CORRECTED →` - Shows when a value is being corrected

#### Key Commits

1. `Move UFC live tracker to GitHub Actions`
2. `Fix live scraper to capture fight finish time`
3. `Fix scraper class detection and disable auto-cancellation`
4. `Re-enable cancellation detection for missing fights`
5. `Fix cancellation detection signature mismatch`
6. `Fix signature matching for multi-word last names`
7. `Use full names for fight matching (same as daily scraper)`
8. `Add ufcFightId for reliable fight matching in live tracker`
9. `Allow live tracker to update/correct fight results`

#### Lessons Learned

1. **Name matching is fragile** - Use unique IDs whenever possible
2. **Test cancellation detection carefully** - False positives remove valid fights from display
3. **UFC.com corrections happen** - Tracker must be able to update, not just insert
4. **GitHub Actions for blocked sites** - Works around IP-based blocking
5. **Log everything during development** - Essential for debugging live events

---

### Jan 17, 2026 - Oktagon 82 Live Test

**Event:** OKTAGON 82: ENGIZEK VS. JOTKO
**Result:** Success

1. Discovered Oktagon has a direct REST API
2. Updated scraper to use API instead of HTML parsing
3. Fixed event categorization bug (live events in wrong tab)
4. Deployed and ran tracker throughout event
5. Verified mobile app updates in real-time
6. **Added cancellation detection** - matches UFC live tracker behavior

**Stats:**
- Scrape time: ~300ms per poll
- Fights updated: 4+ (3 complete by end of session)
- Issues found: Event categorization (fixed), Missing cancellation detection (fixed)

**Cancellation Detection (added during Oktagon 82):**
- Issue: Fight "Marc Doussis vs Yevhenii Orlov" was in app but not on Oktagon website (cancelled)
- Fix: Added cancellation detection logic to `oktagonLiveParser.ts` (same as UFC parser)
- Behavior: If a fight is in DB but not in scraped data AND event has started → mark as `isCancelled: true`
- Also handles un-cancelling if fight reappears in scraped data

---

## Admin Dashboard Integration (Jan 17, 2026)

Added Operations tab to the admin panel (`/admin.html`) for monitoring live trackers. See `ADMIN-DASHBOARD-IMPLEMENTATION.md` for details.

### When Adding a New Live Tracker

After building a new live tracker for an organization, update the admin dashboard to manage it:

**1. Add tracker status card in `admin.html`**

Update `loadTrackerStatus()` function (~line 2532) to include the new tracker:
```javascript
async function loadTrackerStatus() {
  const container = document.getElementById('trackerList');

  try {
    // Get existing tracker statuses...

    // Add new tracker status fetch
    const newOrgRes = await authFetch(`${API_BASE}/admin/live-tracker/neworg/status?key=${getScraperKey()}`);
    const newOrgData = await newOrgRes.json();
    const newOrg = newOrgData.tracker || {};

    container.innerHTML = `
      <!-- existing tracker cards... -->

      <div class="tracker-card">
        <div class="tracker-info">
          <div class="scraper-status ${newOrg.isRunning ? 'running' : 'idle'}"></div>
          <div>
            <div class="scraper-name">NEW ORG</div>
            <div class="scraper-meta">${newOrg.isRunning ? `Tracking: ${newOrg.eventName || 'Unknown'}` : 'Idle'}</div>
          </div>
        </div>
        ${newOrg.isRunning
          ? `<button class="btn btn-danger btn-sm" onclick="stopTracker('neworg')">Stop</button>`
          : `<button class="btn btn-success btn-sm" onclick="showStartTrackerModal('neworg')">Start</button>`
        }
      </div>
    `;
  } catch (err) {
    // error handling...
  }
}
```

**2. Add admin API endpoints in `admin.ts`**

Add start/stop/status endpoints for the new tracker:
```typescript
// Start tracker
fastify.post('/admin/live-tracker/neworg/start', async (request, reply) => {
  const { key } = request.query as { key?: string };
  if (key !== TEST_SCRAPER_KEY) {
    return reply.code(401).send({ error: 'Invalid key' });
  }

  const { eventId, eventUrl, eventName } = request.body as any;
  // Start your tracker
  await newOrgLiveTracker.startTracking({ eventId, eventUrl, eventName });
  return reply.send({ success: true, message: 'Tracker started' });
});

// Stop tracker
fastify.post('/admin/live-tracker/neworg/stop', async (request, reply) => {
  // Stop your tracker
});

// Status
fastify.get('/admin/live-tracker/neworg/status', async (request, reply) => {
  const status = newOrgLiveTracker.getStatus();
  return reply.send({ tracker: status });
});
```

**3. Log tracker activity**

Use the ScraperLog table to track live tracker activity:
```typescript
// When tracker starts
await prisma.scraperLog.create({
  data: {
    type: 'live_tracker',
    organization: 'New Organization',
    status: 'started',
    eventId: eventId,
    eventName: eventName,
    startedAt: new Date(),
  },
});

// When tracker completes
await prisma.scraperLog.create({
  data: {
    type: 'live_tracker',
    organization: 'New Organization',
    status: 'completed',
    eventId: eventId,
    eventName: eventName,
    fightsUpdated: updatedCount,
    startedAt: startTime,
    completedAt: new Date(),
    duration: Date.now() - startTime.getTime(),
  },
});
```

**4. Add email alerts on failure**

Import and use the email service to send alerts:
```typescript
import { EmailService } from '../utils/email';

try {
  // tracker logic
} catch (error) {
  await EmailService.sendScraperFailureAlert('New Organization', error.message);
}
```
