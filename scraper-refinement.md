# Scraper Refinement Session

## Goal
Investigate all daily event scrapers to ensure they are working accurately.

## Important Context
- **All work happens on Render** - no local backend involvement
- Scrapers were previously running daily on Render and updating the live database
- They were disabled due to occasional memory issues, but **memory is NOT the concern today**
- Today's focus: **accuracy verification** of each scraper
- **R2 image storage IS configured on Render** - scrapers like UFC were using it effectively
- Running locally will show misleading errors (e.g., "R2 not configured") because local env lacks production secrets

## Why Local Testing is Problematic
| What's Missing Locally | Impact |
|------------------------|--------|
| R2 credentials | Images fallback to source URLs instead of uploading |
| Other production env vars | Behavior differs from real production |
| Render's filesystem | Scraped JSON files saved locally, not on Render |

**Bottom line:** To accurately test scrapers, trigger them ON Render.

## How to Test a Scraper on Render

**Use the test API endpoint** (added Jan 16, 2026).

After deploying, trigger any scraper with a simple curl command:

```bash
curl "https://fightcrewapp-backend.onrender.com/api/admin/test-scraper/SCRAPER_NAME?key=fightcrew-test-2026"
```

Replace `SCRAPER_NAME` with: `ufc`, `bkfc`, `pfl`, `onefc`, `matchroom`, `goldenboy`, `toprank`, `oktagon`

**Example:**
```bash
curl "https://fightcrewapp-backend.onrender.com/api/admin/test-scraper/bkfc?key=fightcrew-test-2026"
```

**Benefits over shell:**
- Reliable (no disconnects)
- Uses compiled code (no OOM from ts-node)
- Same flow as cron jobs
- Can run from anywhere (terminal, Postman, browser)

**View results:**
- Response JSON shows success/failure
- Full logs visible in Render dashboard → Logs tab

## Scrapers to Investigate

| # | Org | Test Command | Status | Issues |
|---|-----|--------------|--------|--------|
| 1 | UFC | GitHub Actions | ⚠️ RE-TEST | Early prelims fix pushed, needs re-run to verify |
| 2 | BKFC | GitHub Actions | ✅ FIXED | Was IP blocked - now runs via GitHub Actions |
| 3 | PFL | `curl ".../test-scraper/pfl?key=..."` | ✅ FIXED | "Fighter Headshot/Bodyshot" filter added |
| 4 | ONE FC | `curl ".../test-scraper/onefc?key=..."` | ✅ FIXED | Record parsing rewritten for ONE FC format |
| 5 | Matchroom | GitHub Actions | ✅ FIXED | Moved to GH Actions, VS-centric pairing algorithm |
| 6 | Golden Boy | GitHub Actions | ⚠️ RE-TEST | Workflow fixed to run from src/, needs re-run |
| 7 | Top Rank | `curl ".../test-scraper/toprank?key=..."` | ✅ FIXED | Record parsing added, may need event discovery adjustment |
| 8 | Oktagon | GitHub Actions | ✅ FIXED | Was IP blocked - now runs via GitHub Actions |

---

## Summary (Jan 17, 2026)

| Status | Count | Scrapers |
|--------|-------|----------|
| ✅ Fixed/Working | 6 | BKFC, PFL, ONE FC, Matchroom, Top Rank, Oktagon |
| ⚠️ Needs Re-test | 2 | UFC (early prelims), Golden Boy (sub-page filter) |

### Issues Fixed by Category

**IP Blocked by CDN (FIXED via GitHub Actions):** UFC, BKFC, Oktagon, Matchroom, Golden Boy

**Data Parsing Issues (FIXED):**
- **PFL:** "Fighter Headshot/Bodyshot" placeholder names filtered out
- **ONE FC:** Record parsing rewritten for "Wins - X, Losses - X" format
- **Top Rank:** Record extraction added for W-L-D patterns

### Pending Re-test (Jan 17)

**UFC - Early Prelims Detection:**
- Issue: Alex Perez vs Charles Johnson showing as "Prelims" instead of "Early Prelims"
- Fix: Added robust pattern matching for `fight-card-prelims-early` class
- Status: Code pushed, needs re-run to verify

**Golden Boy - Sub-page Filter:**
- Issue: "fight Week Schedule" sub-page being scraped as separate event
- Root cause: GitHub Actions workflow was running `dist/services/scrapeAllGoldenBoyData.js` but the scraper is a `.js` file in `src/` (not TypeScript that compiles to dist)
- Fix: Changed workflow to run `src/services/scrapeAllGoldenBoyData.js`
- Also added second-layer filter outside page.evaluate() for visible logging
- Status: Workflow fixed (commit 05137ab), needs re-run
- After re-run: Delete duplicate event via `curl -X DELETE ".../api/admin/delete-event/EVENT_ID?key=fightcrew-test-2026"`

---

## Organizations Without Scrapers (Future Work)

These organizations do not currently have scrapeable websites:

| Organization | Reason |
|--------------|--------|
| Zuffa Boxing | Website not scrapeable |
| Dirty Boxing | Events published as images, not HTML |
| Rizin | Website not scrapeable |
| Karate Combat | Only lists main fight, not full cards |

Will build solutions for these later when their websites improve or alternative data sources are found.

---

## Optimization Goals

While fixing broken scrapers, we will also:
1. **Optimize for memory usage** - Render's free tier has limited memory (512MB)
2. **Prevent server crashes** - Current Puppeteer scrapers use 300-400MB each
3. **Consider lighter-weight alternatives** - Replace Puppeteer with fetch + cheerio where possible

---

## Progress Log

### Session 1 - January 16, 2026

**Miscommunication clarified:**
- User wants to test scrapers ON RENDER, not locally
- No local backend work - Render only
- Focus is accuracy, not memory optimization
- R2 IS working on Render - local "not configured" messages are misleading

**Mistake made:**
- Ran BKFC scraper locally instead of on Render
- This caused confusion about R2 status

---

## Current Step

**Deploy and test using the new test endpoint.**

1. Commit and push the changes to deploy to Render
2. Wait for deploy to complete
3. Test the first scraper:
   ```bash
   curl "https://fightcrewapp-backend.onrender.com/api/admin/test-scraper/ufc?key=fightcrew-test-2026"
   ```
4. Check Render logs for detailed output
5. Verify data accuracy in database

---

## Current Cron Job Status (backgroundJobs.ts)

| Job | Status | Schedule |
|-----|--------|----------|
| UFC Scraper | ✅ ENABLED | 12pm EST daily |
| Event Scheduler | ✅ ENABLED | Every 15 min |
| Failsafe Cleanup | ✅ ENABLED | Every hour |
| BKFC, PFL, ONE, etc. | ❌ DISABLED | Memory issues |
| News Scraper | ❌ DISABLED | Memory issues |

---

## BKFC Test Results (Jan 16, 2026)

**Render shell (first run):** ✅ Scraper worked (707s, 3 events)
**Render shell (after redeploy):** ❌ Timeout - bkfc.com unreachable

**Lesson learned:** Don't test via shell. Test the actual cron flow.

---

## Testing Approach Going Forward

**DO:** Check Render logs for cron job results
**DO:** Re-enable cron jobs and let them run naturally
**DON'T:** Run scrapers manually in shell (unreliable, different environment)

---

## Matchroom Boxing Scraper Investigation (Jan 16, 2026)

### Summary
The Matchroom scraper has a **fighter pairing algorithm bug** that causes incorrect matchups. The scraper extracts individual boxer data correctly but pairs them incorrectly when creating fights.

### Issues Found

**1. Incorrect Fighter Pairings**

For the Feb 21 Muratalla vs Cruz event, the scraper produced wrong matchups:
- Sandy Ryan vs Dave Allen (WRONG - these are on different fights)
- Tiah Mai Ayton vs Junaid Bostan (WRONG - both have TBA opponents)

The correct pairings should be:
- Sandy Ryan vs Karla Ramos Zamora
- Tiah Mai Ayton vs TBA
- Junaid Bostan vs TBA

**2. Fight Order Issues**

Fights were imported in wrong order. Main event should be first (Muratalla vs Cruz), but appeared at bottom.

**3. TBA Opponents Not Detected**

Several fights have "TBA" opponents that appear as `VS W KO L D` in the HTML (stats without a name). The scraper didn't detect these.

### Root Cause Analysis

The scraper uses regex-based text parsing on unstructured HTML:
```javascript
// Pattern to find boxers: [NAME] W ## KO ## L ## D ##
const boxerPattern = /([A-Z][A-Za-z\s\-\'\.]+)\s+W\s*(\d+)\s*KO\s*(\d+)\s*L\s*(\d+)\s*D\s*(\d+)/g;
```

Problems:
1. Extracts all boxers from page text into flat array
2. Pairs them sequentially (boxer[0] vs boxer[1], boxer[2] vs boxer[3])
3. Does NOT anchor pairings to DOM structure or "VS" separators
4. Order depends on text extraction order, not fight card order

### Code Changes Made

**scrapeAllMatchroomData.js (~lines 505-582)**

Added TBA detection:
```javascript
const TBA_BOXER = {
  name: 'TBA',
  record: '0-0-0',
  wins: 0, losses: 0, draws: 0, kos: 0,
  imageUrl: null,
  country: '',
  isTBA: true
};

// TBA detection pattern - stats without name after VS
const tbaPattern = /^W\s*KO\s*L\s*D\s/i;
const isTBA = tbaPattern.test(afterVs.trim());
```

**matchroomDataParser.ts**

Added TBA fighter ID handling:
```typescript
const TBA_FIGHTER_ID = 'tba-fighter-global';

if (fightData.boxerB.name === 'TBA' || fightData.boxerB.name.toUpperCase() === 'TBA') {
  boxer2Id = TBA_FIGHTER_ID;
  console.log(`    Using TBA fighter for ${fightData.boxerA.name}'s opponent`);
}
```

### Manual Database Corrections

**Event: Muratalla vs Cruz (Feb 21, 2025)**
- Event ID: `e9f6c4a7-0c3b-42fc-b5c4-dfb19f5f93f8`
- Deleted all incorrectly paired fights
- Manually recreated 5 fights with correct pairings and order:
  1. Gabriel Muratalla vs Andy Cruz
  2. Sandy Ryan vs Karla Ramos Zamora
  3. Diego Pacheco vs Steve Rolls
  4. Tiah Mai Ayton vs TBA
  5. Junaid Bostan vs TBA

### Recommended Improvements

**Option A: DOM-Anchored Parsing**
Instead of regex on full page text, iterate through fight card DOM elements:
```javascript
// Find each fight container
const fightCards = await page.$$('.fight-card, .matchup');
for (const card of fightCards) {
  const boxerA = await card.$('.boxer-left');
  const boxerB = await card.$('.boxer-right');
  // Extract from structured DOM
}
```

**Option B: VS-Anchored Text Parsing**
Parse text around "VS" markers to ensure pairing:
```javascript
// Split text on VS separators
const segments = pageText.split(/\bVS\b/i);
// Each pair of segments forms a fight
```

**Option C: API Alternative**
Check if Matchroom has a data API or JSON feed that could be more reliable than HTML scraping.

### Events to Verify After Scraper Fix

| Event | Date | Key Fights |
|-------|------|------------|
| Wood vs Warrington 2 | TBD | Verify fighter pairings |
| Murtazaliev vs Kelly | TBD | Verify fighter pairings |
| Any new events | TBD | Full regression test |

### Status

| Component | Status |
|-----------|--------|
| TBA Detection | ✅ Implemented (untested on Render) |
| Pairing Algorithm | ❌ Still broken - needs rewrite |
| Fight Order | ❌ Still random - needs DOM traversal |
| Manual DB Fix | ✅ Complete for Muratalla vs Cruz |

---

## Session 2 - January 17, 2026

### Problem: IP Blocking by CDNs

**Discovery:** UFC, BKFC, and Oktagon scrapers were failing on Render with navigation timeouts. Investigation revealed these sites are blocking Render's IP ranges at the CDN level (Varnish for UFC).

**Symptoms:**
- UFC: 403 Forbidden from Varnish CDN
- BKFC: Navigation timeout (60s)
- Oktagon: Navigation timeout (60s)

**Root cause:** Render's shared hosting IPs are likely flagged/blocked by these CDNs as bot traffic.

### Solution: GitHub Actions

Moved these scrapers to run via GitHub Actions workflows, which use different IP ranges not blocked by the CDNs.

**Workflows created:**
- `.github/workflows/ufc-scraper.yml` - Runs daily at 5pm UTC (12pm EST)
- `.github/workflows/oktagon-scraper.yml` - Runs daily at 6pm UTC (1pm EST)
- `.github/workflows/bkfc-scraper.yml` - Runs daily at 7pm UTC (2pm EST)

**Required GitHub Secrets:**
- `DATABASE_URL` - External Render database URL (NOT internal)
- `R2_ENDPOINT`
- `R2_ACCESS_KEY`
- `R2_SECRET_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_URL`

**Important:** Must use Render's EXTERNAL database URL (starts with `postgres://...render.com:5432`) not the internal one (`dpg-xxx-a:5432`).

### Results

**UFC Scraper (Jan 17, 2026):**
- 11 events scraped
- 119 fights imported
- 231 fighters imported
- 206 athlete headshots uploaded to R2

**Oktagon Scraper (Jan 17, 2026):**
- 7 events scraped (4 skipped - no fight cards yet)
- 49 fights imported
- 90 fighters imported
- 25 athlete images uploaded to R2

**BKFC Scraper (Jan 17, 2026):**
- 3 events scraped
- 22 fights imported
- 44 fighters imported
- 32 athlete images uploaded to R2

### New Endpoint: Scraper Status

Added `/api/admin/scraper-status?key=fightcrew-test-2026` endpoint to check when scrapers last ran.

**Example response:**
```json
{
  "generatedAt": "2026-01-17T00:41:40.980Z",
  "scrapers": [
    {
      "organization": "UFC",
      "lastUpdated": "2026-01-17T00:31:53.379Z",
      "lastUpdatedEvent": "UFC 321: Aspinall vs. Gane",
      "totalEvents": 770,
      "timeSinceUpdate": "0 hours ago"
    }
  ]
}
```

### Architecture Change

| Scraper | Previous Host | New Host | Schedule |
|---------|--------------|----------|----------|
| UFC | Render cron | GitHub Actions | 5pm UTC daily |
| Oktagon | Render cron | GitHub Actions | 6pm UTC daily |
| BKFC | Render cron | GitHub Actions | 7pm UTC daily |
| Matchroom | Render cron | GitHub Actions | 8pm UTC daily |
| Golden Boy | Render cron | GitHub Actions | 9pm UTC daily |
| PFL | Render cron | Render cron | Unchanged |
| ONE FC | Render cron | Render cron | Unchanged |
| Top Rank | Render cron | Render cron | Unchanged |

### Remaining Issues

**ONE FC:** Fighter records parsing bug - all fighters show same values
**Top Rank:** Fighter records not parsed, very limited data (0-1 events)

---

## PFL Scraper Fix (Jan 17, 2026)

### Problem
PFL website contains placeholder/template URLs like `/fighter/fighter-headshot` and `/fighter/fighter-bodyshot` which were being parsed as real fighter names ("Fighter Headshot", "Fighter Bodyshot").

### Solution
Added new patterns to the `isValidFighterName()` filter function in `scrapeAllPFLData.js`:

```javascript
// Filter out placeholder/template names from PFL website
/^fighter\s*headshot/i, /^fighter\s*bodyshot/i,
/headshot$/i, /bodyshot$/i,
/^fighter$/i,  // Just "Fighter" alone
/placeholder/i, /default/i, /template/i,
```

These patterns catch any name starting with "Fighter Headshot", "Fighter Bodyshot", ending with "headshot"/"bodyshot", or containing placeholder-related words.

---

## Matchroom Scraper Fix (Jan 17, 2026)

### Problem
The original boxer-centric pairing algorithm was creating incorrect fight matchups. It extracted all boxers and paired them sequentially, ignoring the VS separators that indicate actual pairings.

**Example of incorrect pairings:**
- "Josh Warrington vs Sandy Ryan" (WRONG - these are different fights)
- "Campbell Hatton vs Junaid Bostan" (WRONG)

### Solution
Rewrote the pairing algorithm to be **VS-centric** instead of boxer-centric:

1. Find all "VS" positions in the text first
2. For each VS, find the boxer whose stats END just before it (boxer A)
3. Find the boxer whose name STARTS just after it (boxer B)
4. Pair them together

This ensures fighters are paired based on their proximity to VS separators, not their order in an array.

Also moved to GitHub Actions (8pm UTC) to avoid Render IP blocking.

---

## Golden Boy Scraper Fix (Jan 17, 2026)

### Problem
1. Puppeteer protocol timeouts on Render
2. Duplicate events created from sub-pages (e.g., "/fight-week-schedule")

### Solution
1. Moved to GitHub Actions (9pm UTC) to avoid Render issues
2. Added sub-page filtering to skip URLs like:
   - `/fight-week-schedule`
   - `/schedule`
   - `/tickets`
   - `/results`
   - Any slug containing `/` (indicates sub-page)

3. Added `/api/admin/delete-event/:id` endpoint for cleanup

### Cleanup Done
Deleted duplicate event "Golden Boy: Rocha vs. Curiel Flores vs. Chavez/fight Week Schedule" via API

---

## ONE FC Scraper Fix (Jan 17, 2026)

### Problem
Fighter records all showed the same wrong values because the scraper was using a generic `[class*="record"]` selector and looking for a "10-2-0" format that doesn't exist on ONE FC's website.

### Root Cause
ONE FC's athlete pages don't use a simple "10-2-0" record format. Instead, they have a "Breakdown" section that shows:
```
Wins - 7
Losses - 2
```

The old regex pattern `(\d+)[W-]*\s*-?\s*(\d+)[L-]*\s*-?\s*(\d+)[D-]*` was not matching this format.

### Solution
Rewrote the record parsing logic in `scrapeAllOneFCData.js` to:

1. Search the full page text for individual patterns:
   - `Wins - X`
   - `Losses - X`
   - `Draws - X`

2. Build the record from matched values: `${wins}-${losses}-${draws}`

3. Fallback to traditional "10-2-0" format if structured data not found

```javascript
// Look for "Wins - X" pattern
const winsMatch = pageText.match(/Wins\s*[-:]\s*(\d+)/i);
if (winsMatch) {
  wins = parseInt(winsMatch[1], 10);
}

// Look for "Losses - X" pattern
const lossesMatch = pageText.match(/Losses\s*[-:]\s*(\d+)/i);
if (lossesMatch) {
  losses = parseInt(lossesMatch[1], 10);
}

// Only set record if we found at least wins or losses
if (winsMatch || lossesMatch) {
  record = `${wins}-${losses}-${draws}`;
}
```

---

## Top Rank Scraper Fix (Jan 17, 2026)

### Problem
Fighter records were not being parsed - the scraper had `record: ''` hardcoded for all fighters.

### Solution
Added record extraction logic to `scrapeAllTopRankData.js` that:

1. Looks for common boxing record formats:
   - `(25-1-0)` or `(25-1)` - parenthesized format
   - `25-1-0` - dash-separated format
   - `25W-1L-0D` - labeled format

2. Splits the fight text at "vs" to find records for each fighter separately

3. Extracts wins, losses, draws and formats as `W-L-D`

```javascript
// Look for record patterns near fighter names
const recordPatterns = [
  /\((\d{1,3})\s*[-–]\s*(\d{1,3})\s*[-–]?\s*(\d{1,3})?\)/g,  // (25-1-0) or (25-1)
  /(\d{1,3})\s*[-–]\s*(\d{1,3})\s*[-–]\s*(\d{1,3})/g,        // 25-1-0
  /(\d{1,3})W\s*[-–]?\s*(\d{1,3})L\s*[-–]?\s*(\d{1,3})?D?/gi, // 25W-1L-0D
];

// Get text before and after "vs" to find records for each fighter
const textBeforeVs = vsIndex > 0 ? text.substring(0, vsIndex) : '';
const textAfterVs = vsIndex > 0 ? text.substring(vsIndex + 3) : '';
```

### Note
The "limited data (0-1 events)" issue may be due to Top Rank's website structure. The record parsing is now in place, but event discovery may need adjustment if the site changes.
