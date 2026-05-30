# Zuffa Boxing Live Tracker Development

**Created:** January 23, 2026
**Event:** Zuffa Boxing 01: Walsh vs. Ocampo
**Start Time:** 5:30 PM ET (first fight), 6:00 PM ET (broadcast start)
**Venue:** UFC META Apex, Las Vegas
**Broadcast:** Paramount+

---

## Event Context

Zuffa Boxing is UFC's new boxing promotion. They don't have a dedicated website yet, so we need secondary sources for live tracking.

---

## Fight Card (from Tapology)

| Order | Fighter 1 | Fighter 2 | Weight | Rounds | Card |
|-------|-----------|-----------|--------|--------|------|
| 1 | Troy Nash (5-0-1) | Jaycob Ramos (4-0) | 126 lbs | 6x3 | Prelim |
| 2 | Robert Meriwether III (9-0) | Cesar Correa (5-0) | 130 lbs | 6x3 | Prelim |
| 3 | Emiliano Cardenas (8-0) | Marcus Harris (7-1) | 118 lbs | 6x3 | Prelim |
| 4 | Floyd Diaz (13-0) | Guillermo Gutierrez (13-2) | 118 lbs | 8x3 | Prelim |
| 5 | Omar Trinidad (19-0-2) | Max Ornelas (17-2-1) | 126 lbs | 10x3 | Prelim |
| 6 | Julian Rodriguez (24-1) | Cain Sandoval (17-0) | 147 lbs | Main |
| 7 | Misael Rodriguez (15-0) | Austin DeAnda (17-0) | 160 lbs | Main |
| 8 | Callum Walsh (15-0) | Carlos Ocampo (38-3) | 160 lbs | Main Event |

**Cancelled:** Serhii Bohachuk vs Radzhab Butaev (originally on card)

---

## Data Source Research

### Primary Sources to Monitor During Event

| Source | URL | Access | Live Updates? | Notes |
|--------|-----|--------|---------------|-------|
| Tapology | https://www.tapology.com/fightcenter/events/137070-zuffa-boxing | Public | Yes | Best for round-by-round, methods |
| UFC.com News | https://www.ufc.com/news/zuffa-boxing-01-results-scorecards | 403 Error | Unknown | Blocked from Render, may work from browser |
| CBS Sports | https://www.cbssports.com/boxing/... | Public | Article only | Preview article, not live results |
| ESPN | https://www.espn.com/boxing/ | Public | TBD | Check during event |
| BoxRec | https://boxrec.com | Public | TBD | Official boxing records |

### Data Source Findings

**Tapology (Primary):**
- Updates fairly quickly during events
- Shows: winner, method (KO/TKO/UD/SD/etc), round, time
- Has fight order
- URL pattern: `/fightcenter/events/{id}-{slug}`

**UFC.com:**
- Returns 403 from server (CDN blocking)
- May need browser access or GitHub Actions
- Likely will have official results post-event

---

## Live Research Tasks (During Event)

### 1. Monitor Tapology Page (Every 5-10 min)
- Open: https://www.tapology.com/fightcenter/events/137070-zuffa-boxing
- Note what changes when a fight:
  - Starts (any "LIVE" indicator?)
  - Ends (how quickly does result appear?)
- Record the data format for results

### 2. Check ESPN Boxing
- URL: https://www.espn.com/boxing/
- Look for live fight tracker or results feed
- Note any API calls in browser dev tools (Network tab)

### 3. Check BoxRec
- URL: https://boxrec.com
- See if they have real-time updates
- Note data structure

### 4. Browser Dev Tools Investigation
- Open Tapology in Chrome
- F12 → Network tab
- Filter by XHR/Fetch
- Look for any API calls that return JSON data
- This would be ideal for scraping

---

## Existing Scraper

The daily Zuffa Boxing scraper already exists:
- **Parser**: `packages/backend/src/services/zuffaBoxingDataParser.ts`
- **Data source**: Tapology (scraped JSON files)

### Cancellation Detection (Added)

The parser now detects cancelled fights (commit e798947):
1. Tracks which fights are in the scraped Tapology data
2. Compares against fights in the database for this event
3. Marks DB fights missing from scraped data as `isCancelled: true`
4. Un-cancels previously cancelled fights if they reappear

This handles cases like Bohachuk vs Butaev being pulled from the card.

### Future: Live Event Tracker

A live tracker (polling during events) is not yet built. Research tasks during this event will inform whether it's feasible using Tapology as a near-real-time source.

---

## Bug Fix: Events Disappearing from Upcoming

### Problem Discovered (5:45 PM ET)
The Zuffa Boxing event existed in the database but wasn't showing in the "upcoming" events list.

### Root Cause
Events using time-based fallback (Zuffa Boxing, BKFC, PFL, etc.) would disappear from "upcoming" once their start time passed because:
1. The `hasStarted` flag on the **event** was never set to `true` during the event
2. The time-based updater only set `hasStarted: true` when the event **completed** (all fights done)
3. The upcoming filter requires either future start times OR `hasStarted: true`
4. The scheduler only looked for events with future start times, missing currently-live events after server restarts

### Fixes Deployed
1. **New endpoint**: `/admin/mark-event-started/:id` - manual override with key auth
2. **Time-based updater**: Now sets `event.hasStarted=true` when any section starts
3. **Scheduler**: Now catches events that started in the last 12 hours (handles server restarts)

### Command to Fix Immediately
```bash
curl -X POST "https://fightcrewapp-backend.onrender.com/api/admin/mark-event-started/3ce5be31-4d9c-4042-b7cb-97b6b440ad78?key=fightcrew-test-2026"
```

### Bug #2: Main Event Not Auto-Completed (FIXED)
The time-based updater only handled these card types:
- `Early Prelims`
- `Prelims`
- `Main Card`

But the main event fight has `cardType: "Main Event"` which wasn't handled, so Walsh vs Ocampo wasn't auto-completed at mainStartTime.

**Fix deployed**: Main Card section now also includes "Main Event" fights (commit 8ca0d89).

---

## Session Log

### Pre-Event

- **5:45 PM ET**: Discovered event missing from upcoming list (bug fixed - see above)
- **Event ID**: `3ce5be31-4d9c-4042-b7cb-97b6b440ad78`

### During Event

_[Record Tapology update observations here]_

---

## Questions to Answer

1. Does Tapology have any hidden API? (Check Network tab)
2. How quickly does Tapology update after fights?
3. What's the exact HTML structure for results?
4. Are there any other better data sources?
5. Can we scrape from GitHub Actions (avoid IP blocks)?

---

## Next Steps After Event

1. Review all observations from session log
2. Decide on best data source
3. Build initial scraper (fetch + cheerio on Tapology)
4. Test against recorded data
5. Add to admin dashboard
6. Ready for next Zuffa Boxing event
