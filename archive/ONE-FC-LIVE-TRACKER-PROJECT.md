# ONE FC Live Event Tracker Project

**Date:** January 23, 2026
**Event:** ONE Fight Night 39: Rambolek vs. Dayakaev
**Start Time:** 9:00 AM Bangkok (ICT) = 2:00 AM UTC = 9:00 PM EST (Jan 23)
**URL:** https://www.onefc.com/events/onefightnight39/

---

## Project Overview

Build a live event tracker for ONE FC events that updates fight statuses in real-time as events progress.

### Current State (Before This Project)

- **Daily scraper exists:** `scrapeAllOneFCData.js` - scrapes events, fights, fighters
- **Parser exists:** `oneFCDataParser.ts` - imports scraped data to database
- **No live tracker:** ONE FC events use "time-based" fallback (marks all fights complete at once)
- **Missing start times:** Event start times were not being captured

### Goal

1. **Phase 1:** Add start time extraction to daily scraper (DONE)
2. **Phase 2:** Build live event tracker during ONE Fight Night 39
3. **Phase 3:** Add ONE FC to live tracker config for automatic scheduling

---

## Phase 1: Start Time Extraction (COMPLETED)

### Changes Made

**`scrapeAllOneFCData.js`** (lines 149-181)
- Added extraction of `startTime` from schema.org JSON-LD data on event pages
- Falls back to regex extraction from visible text (e.g., "9:00 AM ICT")
- Returns `startTime` field in scraped event data

**`oneFCDataParser.ts`**
- Added `startTime` field to `ScrapedOneFCEvent` interface
- Updated event create/update to store `mainStartTime` field

### Key Finding: ONE FC Timestamps Include Start Time

Unlike UFC events where we have separate date and start times, ONE FC's `timestamp` field already includes the exact start time (not just the date). For example:
- timestamp `1769220000` = `2026-01-24T02:00:00.000Z` = 9:00 PM EST on Jan 23

The `dateText` field confirms this: `"Jan 23 (Fri) 9:00PM EST"`

This means we can use the timestamp directly as `mainStartTime` without additional parsing.

### How to Test

```bash
# Run the scraper locally (will save to scraped-data/onefc/)
cd packages/backend
node src/services/scrapeAllOneFCData.js

# Check the output for start times
cat scraped-data/onefc/latest-events.json | grep -i startTime

# Or trigger on Render
curl "https://fightcrewapp-backend.onrender.com/api/admin/test-scraper/onefc?key=fightcrew-test-2026"
```

### Verify Database Update

After running scraper + parser:
```bash
curl -s "https://fightcrewapp-backend.onrender.com/api/events?limit=50" | \
  grep -A5 "ONE Fight Night 39"
```

Should show `mainStartTime` populated.

---

## Phase 2: Live Event Tracker (DURING EVENT)

### Research Tasks (Do These During the Event)

1. **Check for REST API**
   - Open browser DevTools > Network tab
   - Filter by XHR/Fetch requests
   - Look for `/api/` or JSON endpoints that return fight data
   - Note: Oktagon has `api.oktagonmma.com` - ONE FC might have similar

2. **Check for JSON-LD/Schema Data**
   - View page source, search for `application/ld+json`
   - This data updates as fights complete

3. **Check for __NEXT_DATA__**
   - ONE FC uses Next.js, so look for `<script id="__NEXT_DATA__">`
   - This JSON often contains full event state

4. **Document What Changes**
   - When fight goes LIVE: What field changes?
   - When fight COMPLETES: What fields change (winner, method, round, time)?

### Expected Data Structure (Discover During Event)

```javascript
// Document the structure you find here
{
  fights: [
    {
      // What fields indicate status?
      status?: "upcoming" | "live" | "complete",
      isLive?: boolean,

      // What fields contain results?
      winner?: string,  // Fighter ID or name?
      method?: string,  // "KO", "SUB", "DEC"?
      round?: number,
      time?: string,    // "2:34"?
    }
  ]
}
```

### Files to Create (After Research)

1. **`onefcLiveScraper.ts`** - Fetch and parse live data
2. **`onefcLiveParser.ts`** - Match to DB, update fights
3. **`onefcLiveTracker.ts`** - Polling loop, orchestration

### Template Structure

```typescript
// onefcLiveScraper.ts
export interface OneFCLiveData {
  eventName: string;
  fights: OneFCLiveFight[];
}

export interface OneFCLiveFight {
  fighter1Name: string;
  fighter2Name: string;
  status: 'upcoming' | 'live' | 'complete';
  winner?: string;
  method?: string;
  round?: number;
  time?: string;
}

export async function scrapeOneFCLiveData(eventUrl: string): Promise<OneFCLiveData> {
  // Implementation based on research
}
```

---

## Phase 3: Integration (AFTER EVENT)

### Add to Live Tracker Config

Update `liveTrackerConfig.ts`:
```typescript
export const PROMOTION_TRACKER_CONFIG: Record<string, LiveTrackerType> = {
  'UFC': 'ufc',
  'Matchroom': 'matchroom',
  'Matchroom Boxing': 'matchroom',
  'OKTAGON': 'oktagon',
  'OKTAGON MMA': 'oktagon',
  'ONE': 'onefc',           // ADD
  'ONE Championship': 'onefc', // ADD
};
```

### Add Admin Endpoints

Add to `admin.ts`:
```typescript
// Start ONE FC tracker
fastify.post('/admin/live-tracker/onefc/start', ...)

// Stop ONE FC tracker
fastify.post('/admin/live-tracker/onefc/stop', ...)

// Status
fastify.get('/admin/live-tracker/onefc/status', ...)
```

### Update Event Scheduler

Update `eventBasedScheduler.ts` to handle ONE FC events:
- Import `startOnefcLiveTracking`, `stopOnefcLiveTracking`, `getOnefcTrackingStatus`
- Add to `startEventTracking()` function
- Add to `safetyCheckEvents()` function

---

## Event Details: ONE Fight Night 39

**Database ID:** `b5448a0f-e959-4934-b594-5e50f7fe3b44`

### Fight Card (10 fights, 2 cancelled)

| Order | Fight | Weight Class | Status |
|-------|-------|--------------|--------|
| 1 | Rambolek vs Dayakaev | Bantamweight MT | Active |
| 2 | Kongthoranee vs Imangazaliev | Flyweight MT | Active |
| 3 | Fitikefu vs Mann | Welterweight MMA | Active |
| 4 | Sawada vs Salcedo | Strawweight MMA | Active |
| 5 | Siasarani vs Dantas | Featherweight MMA | Active |
| 5 | Gabriel vs Akaev | Lightweight MMA | CANCELLED |
| 6 | Crevar vs Noelani Alo | Bantamweight MMA | Active |
| 6 | Ghazali vs Climaco | Flyweight MT | CANCELLED |
| 7 | Masunyane vs Kurosawa | Strawweight MMA | Active |
| 8 | Kuzmin vs Battbootti | Featherweight MMA | Active |

---

## Commands Reference

### Trigger ONE FC Scraper on Render
```bash
curl "https://fightcrewapp-backend.onrender.com/api/admin/test-scraper/onefc?key=fightcrew-test-2026"
```

### Check Event in Database
```bash
curl -s "https://fightcrewapp-backend.onrender.com/api/events/b5448a0f-e959-4934-b594-5e50f7fe3b44"
```

### Manual Start Time Update (if scraper fails)
```bash
# Via admin API (if endpoint exists) or direct DB update
curl -X PATCH "https://fightcrewapp-backend.onrender.com/api/admin/events/b5448a0f-e959-4934-b594-5e50f7fe3b44?key=fightcrew-test-2026" \
  -H "Content-Type: application/json" \
  -d '{"mainStartTime": "2026-01-24T02:00:00.000Z"}'
```

---

## Progress Tracking

- [x] Phase 1: Start time extraction in daily scraper
- [x] Run scraper to update database with start time (mainStartTime: 2026-01-24T02:00:00.000Z)
- [ ] Phase 2: Research ONE FC live data during event
- [ ] Phase 2: Build live scraper
- [ ] Phase 2: Build live parser
- [ ] Phase 2: Build live tracker
- [ ] Phase 3: Add to config
- [ ] Phase 3: Add admin endpoints
- [ ] Phase 3: Update event scheduler
- [ ] Test with next ONE FC event

---

## Notes

_Add notes during the event here_

